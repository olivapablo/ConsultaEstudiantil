/**
 * SecurityService
 * Gestión de autenticación por PIN, hash criptográfico PBKDF2 (Web Crypto API),
 * bloqueo por intentos fallidos y bloqueo automático por inactividad.
 */

import { dbService } from './db.js';

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const MAX_FAILED_ATTEMPTS = 4;
const LOCKOUT_SECONDS = 30;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos de inactividad

class SecurityService {
  constructor() {
    this.isAuthenticated = false;
    this.inactivityTimer = null;
    this.failedAttempts = 0;
    this.lockoutUntil = 0;
    this.onLockCallback = null;
  }

  setLockCallback(fn) {
    this.onLockCallback = fn;
  }

  /**
   * Genera un Salt aleatorio criptográfico
   */
  _generateSalt() {
    const salt = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(salt);
    return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Deriva una clave segura usando PBKDF2 con SHA-256
   */
  async _hashPinPBKDF2(pin, saltHex) {
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(pin);
    const saltBuffer = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    const baseKey = await crypto.subtle.importKey(
      'raw',
      pinBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      256
    );

    return Array.from(new Uint8Array(derivedBits))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Hash SHA-256 simple solo para verificar retrocompatibilidad con el prototipo inicial
   */
  async _legacyHash(pin) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verifica si ya existe un PIN configurado
   */
  async hasPin() {
    const sec = await dbService.get('settings', 'security');
    return !!(sec && (sec.pinHash || sec.hash));
  }

  /**
   * Establece un nuevo PIN seguro con PBKDF2
   */
  async setPin(pin) {
    if (!/^\d{4,8}$/.test(pin)) {
      throw new Error('El PIN debe contener entre 4 y 8 dígitos numéricos.');
    }
    const salt = this._generateSalt();
    const hash = await this._hashPinPBKDF2(pin, salt);

    await dbService.put('settings', {
      key: 'security',
      algorithm: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: salt,
      hash: hash,
      updatedAt: new Date().toISOString()
    });

    this.failedAttempts = 0;
    this.lockoutUntil = 0;
    return true;
  }

  /**
   * Valida el PIN ingresado por el docente
   */
  async verifyPin(pin) {
    const now = Date.now();
    if (this.lockoutUntil > now) {
      const waitSec = Math.ceil((this.lockoutUntil - now) / 1000);
      throw new Error(`Acceso temporalmente bloqueado por intentos fallidos. Esperá ${waitSec} segundos.`);
    }

    const sec = await dbService.get('settings', 'security');
    if (!sec) {
      throw new Error('No hay PIN configurado en el sistema.');
    }

    let isValid = false;

    // Si es hash moderno PBKDF2
    if (sec.algorithm === 'PBKDF2-SHA256' && sec.salt && sec.hash) {
      const candidateHash = await this._hashPinPBKDF2(pin, sec.salt);
      isValid = candidateHash === sec.hash;
    } else if (sec.pinHash || sec.algorithm === 'legacy-sha256') {
      // Compatibilidad con el prototipo: SHA-256 plano
      const legacyCandidate = await this._legacyHash(pin);
      const target = sec.pinHash || sec.hash;
      if (legacyCandidate === target) {
        isValid = true;
        // Actualizar automáticamente a PBKDF2
        await this.setPin(pin);
        console.info('PIN actualizado transparentemente de SHA-256 simple a PBKDF2.');
      }
    }

    if (isValid) {
      this.failedAttempts = 0;
      this.lockoutUntil = 0;
      this.isAuthenticated = true;
      this.resetInactivityTimer();
      return true;
    } else {
      this.failedAttempts++;
      if (this.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        this.lockoutUntil = Date.now() + LOCKOUT_SECONDS * 1000;
        throw new Error(`Demasiados intentos fallidos. Panel bloqueado por ${LOCKOUT_SECONDS} segundos.`);
      }
      const remaining = MAX_FAILED_ATTEMPTS - this.failedAttempts;
      throw new Error(`PIN incorrecto. ${remaining} intento(s) restante(s).`);
    }
  }

  /**
   * Retorna los segundos restantes de bloqueo, o 0 si está desbloqueado
   */
  getLockoutRemaining() {
    const now = Date.now();
    if (this.lockoutUntil > now) {
      return Math.ceil((this.lockoutUntil - now) / 1000);
    }
    return 0;
  }

  /**
   * Inicia o reinicia el monitor de inactividad
   */
  resetInactivityTimer() {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (!this.isAuthenticated) return;

    this.inactivityTimer = setTimeout(() => {
      this.lock();
    }, INACTIVITY_TIMEOUT_MS);
  }

  /**
   * Bloquea la sesión actual
   */
  lock() {
    this.isAuthenticated = false;
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (typeof this.onLockCallback === 'function') {
      this.onLockCallback();
    }
  }

  /**
   * Escucha eventos de actividad en el documento
   */
  setupActivityListeners() {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => {
      if (this.isAuthenticated) {
        this.resetInactivityTimer();
      }
    };
    events.forEach(ev => window.addEventListener(ev, handler, { passive: true }));
  }
}

export const securityService = new SecurityService();
