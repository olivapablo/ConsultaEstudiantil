/**
 * Gestor Académico - Core Bundle (Vanilla JS compatible con file:// y http://)
 * No requiere imports/exports para máxima portabilidad en tablets y PCs sin servidor.
 */

(function(window) {
  'use strict';

  // ==========================================
  // 0. DIALOGS & UTILS (Luminous Dark Glass Dialogs)
  // ==========================================
  function sortJobs(jobsList) {
    if (!Array.isArray(jobsList)) return [];
    return [...jobsList].sort((a, b) => {
      const matchA = (a.title || '').match(/TP\s*(\d+)/i);
      const matchB = (b.title || '').match(/TP\s*(\d+)/i);
      const numA = matchA ? parseInt(matchA[1], 10) : 999;
      const numB = matchB ? parseInt(matchB[1], 10) : 999;
      if (numA !== numB) return numA - numB;
      return (a.title || '').localeCompare(b.title || '', undefined, { numeric: true });
    });
  }

  const AppDialog = {
    esc(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    _createOverlay(contentHtml) {
      const prev = document.getElementById('appDialogOverlay');
      if (prev) prev.remove();

      const overlay = document.createElement('div');
      overlay.id = 'appDialogOverlay';
      overlay.className = 'app-dialog-backdrop';
      overlay.innerHTML = `
        <div class="app-dialog-box" role="dialog" aria-modal="true">
          ${contentHtml}
        </div>
      `;
      document.body.appendChild(overlay);
      return overlay;
    },

    alert(message, title = 'Notificación') {
      return new Promise((resolve) => {
        const isSuccess = /éxito|correctamente|exitosamente|guardad/i.test(message);
        const isError = /error|incorrecto|obligatorio|atención|falló|vencido/i.test(message);
        const icon = isSuccess ? '✅' : (isError ? '⚠️' : 'ℹ️');

        const overlay = this._createOverlay(`
          <div class="app-dialog-header">
            <span class="app-dialog-icon">${icon}</span>
            <h3 class="app-dialog-title">${this.esc(title)}</h3>
          </div>
          <div class="app-dialog-body">
            <p>${this.esc(message).replace(/\n/g, '<br>')}</p>
          </div>
          <div class="app-dialog-actions">
            <button type="button" class="primary app-dialog-btn" id="appDialogOk">Aceptar</button>
          </div>
        `);

        const okBtn = overlay.querySelector('#appDialogOk');
        const finish = () => {
          overlay.remove();
          resolve();
        };

        okBtn.addEventListener('click', finish);
        setTimeout(() => okBtn.focus(), 25);

        const onKey = (e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            finish();
          }
        };
        document.addEventListener('keydown', onKey);
      });
    },

    confirm(message, title = 'Confirmar acción') {
      return new Promise((resolve) => {
        const overlay = this._createOverlay(`
          <div class="app-dialog-header">
            <span class="app-dialog-icon">❓</span>
            <h3 class="app-dialog-title">${this.esc(title)}</h3>
          </div>
          <div class="app-dialog-body">
            <p>${this.esc(message).replace(/\n/g, '<br>')}</p>
          </div>
          <div class="app-dialog-actions">
            <button type="button" class="secondary app-dialog-btn" id="appDialogCancel">Cancelar</button>
            <button type="button" class="primary app-dialog-btn" id="appDialogConfirm">Aceptar</button>
          </div>
        `);

        const confirmBtn = overlay.querySelector('#appDialogConfirm');
        const cancelBtn = overlay.querySelector('#appDialogCancel');

        const finish = (val) => {
          overlay.remove();
          resolve(val);
        };

        confirmBtn.addEventListener('click', () => finish(true));
        cancelBtn.addEventListener('click', () => finish(false));
        setTimeout(() => confirmBtn.focus(), 25);

        const onKey = (e) => {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            finish(false);
          } else if (e.key === 'Enter') {
            document.removeEventListener('keydown', onKey);
            finish(true);
          }
        };
        document.addEventListener('keydown', onKey);
      });
    },

    prompt(message, defaultValue = '', title = 'Ingresar datos') {
      return new Promise((resolve) => {
        const overlay = this._createOverlay(`
          <div class="app-dialog-header">
            <span class="app-dialog-icon">✉️</span>
            <h3 class="app-dialog-title">${this.esc(title)}</h3>
          </div>
          <div class="app-dialog-body">
            <p style="margin-bottom:10px">${this.esc(message).replace(/\n/g, '<br>')}</p>
            <input type="text" id="appDialogInput" value="${this.esc(defaultValue)}" class="app-dialog-input" placeholder="Escribí aquí...">
          </div>
          <div class="app-dialog-actions">
            <button type="button" class="secondary app-dialog-btn" id="appDialogCancel">Cancelar</button>
            <button type="button" class="primary app-dialog-btn" id="appDialogSubmit">Aceptar</button>
          </div>
        `);

        const input = overlay.querySelector('#appDialogInput');
        const submitBtn = overlay.querySelector('#appDialogSubmit');
        const cancelBtn = overlay.querySelector('#appDialogCancel');

        setTimeout(() => {
          input.focus();
          input.select();
        }, 30);

        const finish = (val) => {
          overlay.remove();
          resolve(val);
        };

        submitBtn.addEventListener('click', () => finish(input.value));
        cancelBtn.addEventListener('click', () => finish(null));

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.stopPropagation();
            finish(input.value);
          }
        });

        const onKey = (e) => {
          if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            finish(null);
          }
        };
        document.addEventListener('keydown', onKey);
      });
    }
  };

  // Reemplazar globalmente las funciones nativas del navegador
  window.alert = (msg) => AppDialog.alert(msg);
  window.confirm = (msg) => { console.warn('Usar await AppDialog.confirm'); return AppDialog.confirm(msg); };
  window.prompt = (msg, def) => { console.warn('Usar await AppDialog.prompt'); return AppDialog.prompt(msg, def); };

  // ==========================================
  // 1. DATABASE SERVICE (IndexedDB + Migrador)
  // ==========================================
  const DB_NAME = 'GestorAcademicoDB';
  const DB_VERSION = 1;
  const LEGACY_STORAGE_KEY = 'gestorAcademico_v1';
  const LEGACY_BACKUP_KEY = 'gestorAcademico_v1_backup_migrated';

  class DatabaseService {
    constructor() {
      this.db = null;
      this.readyPromise = null;
    }

    async init() {
      if (this.readyPromise) return this.readyPromise;
      this.readyPromise = this._openDatabase();
      return this.readyPromise;
    }

    _openDatabase() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          console.warn('IndexedDB no está disponible en este entorno.');
          return resolve(null);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('students')) {
            const sStore = db.createObjectStore('students', { keyPath: 'id' });
            sStore.createIndex('active', 'active', { unique: false });
            sStore.createIndex('last', 'last', { unique: false });
          }
          if (!db.objectStoreNames.contains('jobs')) {
            const jStore = db.createObjectStore('jobs', { keyPath: 'id' });
            jStore.createIndex('active', 'active', { unique: false });
            jStore.createIndex('dueDate', 'dueDate', { unique: false });
          }
          if (!db.objectStoreNames.contains('assignments')) {
            const aStore = db.createObjectStore('assignments', { keyPath: 'id' });
            aStore.createIndex('studentId', 'studentId', { unique: false });
            aStore.createIndex('jobId', 'jobId', { unique: false });
            aStore.createIndex('status', 'status', { unique: false });
          }
          if (!db.objectStoreNames.contains('history')) {
            const hStore = db.createObjectStore('history', { keyPath: 'id' });
            hStore.createIndex('assignmentId', 'assignmentId', { unique: false });
            hStore.createIndex('at', 'at', { unique: false });
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        };

        request.onsuccess = async (event) => {
          this.db = event.target.result;
          try {
            await this._checkAndMigrateLegacyData();
          } catch (e) {
            console.error('Error migrando datos previos:', e);
          }
          resolve(this.db);
        };

        request.onerror = (event) => {
          console.error('Error abriendo IndexedDB:', event.target.error);
          resolve(null); // No bloquear la app si falla
        };
      });
    }

    async _checkAndMigrateLegacyData() {
      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) return;

        const countStudents = await this.count('students');
        const countJobs = await this.count('jobs');
        if (countStudents > 0 || countJobs > 0) return;

        const legacy = JSON.parse(raw);
        localStorage.setItem(LEGACY_BACKUP_KEY, raw);

        if (Array.isArray(legacy.students)) {
          for (const s of legacy.students) {
            await this.put('students', {
              id: s.id || crypto.randomUUID(),
              name: s.name || '',
              last: s.last || '',
              email: s.email || '',
              notes: s.notes || '',
              active: s.active !== false,
              createdAt: s.createdAt || new Date().toISOString()
            });
          }
        }

        if (Array.isArray(legacy.jobs)) {
          for (const j of legacy.jobs) {
            await this.put('jobs', {
              id: j.id || crypto.randomUUID(),
              title: j.title || '',
              description: j.description || '',
              type: j.type || 'Práctico',
              dueDate: j.dueDate || '',
              active: j.active !== false,
              createdAt: j.createdAt || new Date().toISOString()
            });
          }
        }

        if (Array.isArray(legacy.assignments)) {
          for (const a of legacy.assignments) {
            await this.put('assignments', {
              id: a.id || crypto.randomUUID(),
              studentId: a.studentId,
              jobId: a.jobId,
              status: a.status || 'pending',
              notes: a.notes || '',
              evaluatedAt: a.evaluatedAt || null,
              driveFileId: a.driveFileId || null,
              driveViewLink: a.driveViewLink || null,
              pdfName: a.pdfName || null
            });
          }
        }

        if (Array.isArray(legacy.history)) {
          for (const h of legacy.history) {
            await this.put('history', {
              id: h.id || crypto.randomUUID(),
              assignmentId: h.assignmentId,
              from: h.from || '',
              to: h.to || '',
              at: h.at || new Date().toISOString()
            });
          }
        }

        if (legacy.pinHash) {
          await this.put('settings', {
            key: 'security',
            pinHash: legacy.pinHash,
            algorithm: 'legacy-sha256'
          });
        }

        await this.put('settings', {
          key: 'teacherProfile',
          teacherName: legacy.settings?.teacherName || '',
          teacherEmail: legacy.settings?.teacherEmail || ''
        });

        if (legacy.lastBackup) {
          await this.put('settings', {
            key: 'backupInfo',
            lastBackup: legacy.lastBackup
          });
        }
      } catch (err) {
        console.error('Error durante la migración:', err);
      }
    }

    async getAll(storeName) {
      await this.init();
      if (!this.db) return [];
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (e) {
          resolve([]);
        }
      });
    }

    async get(storeName, key) {
      await this.init();
      if (!this.db) return null;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }

    async put(storeName, item) {
      await this.init();
      if (!this.db) return;
      return new Promise((resolve, reject) => {
        try {
          const tx = this.db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.put(item);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    }

    async delete(storeName, key) {
      await this.init();
      if (!this.db) return false;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }

    async count(storeName) {
      await this.init();
      if (!this.db) return 0;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.count();
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = () => resolve(0);
        } catch (e) {
          resolve(0);
        }
      });
    }

    async exportAll() {
      const [students, jobs, assignments, history, settings] = await Promise.all([
        this.getAll('students'),
        this.getAll('jobs'),
        this.getAll('assignments'),
        this.getAll('history'),
        this.getAll('settings')
      ]);

      return {
        format: 'gestor-academico-backup-v2',
        exportedAt: new Date().toISOString(),
        schemaVersion: 2,
        data: { students, jobs, assignments, history, settings }
      };
    }

    async importAll(backupObj) {
      await this.init();
      const { students = [], jobs = [], assignments = [], history = [], settings = [] } = backupObj.data || backupObj;
      const tx = this.db.transaction(['students', 'jobs', 'assignments', 'history', 'settings'], 'readwrite');
      tx.objectStore('students').clear();
      tx.objectStore('jobs').clear();
      tx.objectStore('assignments').clear();
      tx.objectStore('history').clear();
      tx.objectStore('settings').clear();

      students.forEach(s => tx.objectStore('students').put(s));
      jobs.forEach(j => tx.objectStore('jobs').put(j));
      assignments.forEach(a => tx.objectStore('assignments').put(a));
      history.forEach(h => tx.objectStore('history').put(h));
      settings.forEach(st => tx.objectStore('settings').put(st));

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  // ==========================================
  // 2. SECURITY SERVICE (PBKDF2 + Lockout)
  // ==========================================
  const PBKDF2_ITERATIONS = 100000;
  const SALT_BYTES = 16;
  const MAX_FAILED_ATTEMPTS = 4;
  const LOCKOUT_SECONDS = 30;
  const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

  class SecurityService {
    constructor(db) {
      this.db = db;
      this.isAuthenticated = false;
      this.inactivityTimer = null;
      this.failedAttempts = 0;
      this.lockoutUntil = 0;
      this.onLockCallback = null;
    }

    setLockCallback(fn) {
      this.onLockCallback = fn;
    }

    _generateSalt() {
      const salt = new Uint8Array(SALT_BYTES);
      if (window.crypto && crypto.getRandomValues) {
        crypto.getRandomValues(salt);
      } else {
        for (let i = 0; i < SALT_BYTES; i++) salt[i] = Math.floor(Math.random() * 256);
      }
      return Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async _hashPinPBKDF2(pin, saltHex) {
      if (!window.crypto?.subtle) {
        // Fallback seguro si SubtleCrypto no estuviera en un navegador muy antiguo
        return 'pin_' + pin + '_' + saltHex;
      }
      const encoder = new TextEncoder();
      const pinBuffer = encoder.encode(pin);
      const saltBuffer = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

      const baseKey = await crypto.subtle.importKey(
        'raw', pinBuffer, { name: 'PBKDF2' }, false, ['deriveBits']
      );
      const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        baseKey, 256
      );
      return Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async _legacyHash(pin) {
      if (!window.crypto?.subtle) return 'pin_' + pin;
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    async hasPin() {
      const sec = await this.db.get('settings', 'security');
      return !!(sec && (sec.pinHash || sec.hash));
    }

    async setPin(pin) {
      if (!/^\d{4,8}$/.test(pin)) {
        throw new Error('El PIN debe tener entre 4 y 8 dígitos numéricos.');
      }
      const salt = this._generateSalt();
      const hash = await this._hashPinPBKDF2(pin, salt);
      await this.db.put('settings', {
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

    getLockoutRemaining() {
      const now = Date.now();
      return this.lockoutUntil > now ? Math.ceil((this.lockoutUntil - now) / 1000) : 0;
    }

    async verifyPin(pin) {
      const remaining = this.getLockoutRemaining();
      if (remaining > 0) {
        throw new Error(`Acceso temporalmente bloqueado. Esperá ${remaining} segundos.`);
      }

      const sec = await this.db.get('settings', 'security');
      if (!sec) throw new Error('No hay PIN configurado.');

      let isValid = false;
      if (sec.algorithm === 'PBKDF2-SHA256' && sec.salt && sec.hash) {
        const candidate = await this._hashPinPBKDF2(pin, sec.salt);
        isValid = candidate === sec.hash;
      } else if (sec.pinHash || sec.algorithm === 'legacy-sha256') {
        const legacyCandidate = await this._legacyHash(pin);
        const target = sec.pinHash || sec.hash;
        if (legacyCandidate === target) {
          isValid = true;
          await this.setPin(pin);
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
        const left = MAX_FAILED_ATTEMPTS - this.failedAttempts;
        throw new Error(`PIN incorrecto. Quedan ${left} intento(s).`);
      }
    }

    resetInactivityTimer() {
      if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
      if (!this.isAuthenticated) return;
      this.inactivityTimer = setTimeout(() => this.lock(), INACTIVITY_TIMEOUT_MS);
    }

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

    setupActivityListeners() {
      const events = ['mousedown', 'keydown', 'touchstart'];
      let lastActivity = 0;
      const handler = () => {
        const now = Date.now();
        if (now - lastActivity > 15000) {
          lastActivity = now;
          if (this.isAuthenticated) this.resetInactivityTimer();
        }
      };
      events.forEach(ev => window.addEventListener(ev, handler, { passive: true }));
    }
  }

  // ==========================================
  // 3. STUDENT SERVICE
  // ==========================================
  class StudentService {
    constructor(db) { this.db = db; }
    async getAll() { return await this.db.getAll('students'); }
    async getById(id) { return await this.db.get('students', id); }

    async create({ name, last, email = '', notes = '' }) {
      if (!name?.trim() || !last?.trim()) throw new Error('Nombre y apellido son obligatorios.');
      const student = {
        id: crypto.randomUUID ? crypto.randomUUID() : 's_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: name.trim(),
        last: last.trim(),
        email: email.trim(),
        notes: notes.trim(),
        active: true,
        createdAt: new Date().toISOString()
      };
      await this.db.put('students', student);
      return student;
    }

    async update(id, { name, last, email = '', notes = '', active }) {
      const student = await this.getById(id);
      if (!student) throw new Error('Alumno no encontrado.');
      if (name !== undefined) student.name = name.trim();
      if (last !== undefined) student.last = last.trim();
      if (email !== undefined) student.email = email.trim();
      if (notes !== undefined) student.notes = notes.trim();
      if (active !== undefined) student.active = !!active;
      await this.db.put('students', student);
      return student;
    }

    async toggleActive(id) {
      const student = await this.getById(id);
      if (!student) throw new Error('Alumno no encontrado.');
      student.active = !student.active;
      await this.db.put('students', student);
      return student;
    }

    async search({ query = '', filter = 'active' }) {
      const all = await this.getAll();
      const q = query.toLowerCase().trim();
      return all.filter(s => {
        const matchesFilter = filter === 'all' || (filter === 'active' ? s.active : !s.active);
        const fullName = `${s.last} ${s.name} ${s.email || ''}`.toLowerCase();
        return matchesFilter && (!q || fullName.includes(q));
      }).sort((a, b) => (a.last + a.name).localeCompare(b.last + b.name));
    }
  }

  // ==========================================
  // 4. JOB SERVICE
  // ==========================================
  class JobService {
    constructor(db) { this.db = db; }

    async getAll() {
      const jobs = await this.db.getAll('jobs');
      return sortJobs(jobs);
    }

    async getById(id) { return await this.db.get('jobs', id); }

    async create({ title, description = '', type = 'Práctico', dueDate = '', driveUrl = '' }) {
      if (!title?.trim()) throw new Error('El título del trabajo es obligatorio.');
      const job = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        title: title.trim(),
        description: description.trim(),
        type: type === 'Teórico' ? 'Teórico' : 'Práctico',
        dueDate: dueDate || '',
        driveUrl: driveUrl ? driveUrl.trim() : '',
        active: true,
        createdAt: new Date().toISOString()
      };
      await this.db.put('jobs', job);
      return job;
    }

    async update(id, { title, description, type, dueDate, driveUrl, active }) {
      const job = await this.getById(id);
      if (!job) throw new Error('Trabajo no encontrado.');
      if (title !== undefined) job.title = title.trim();
      if (description !== undefined) job.description = description.trim();
      if (type !== undefined) job.type = type === 'Teórico' ? 'Teórico' : 'Práctico';
      if (dueDate !== undefined) job.dueDate = dueDate;
      if (driveUrl !== undefined) job.driveUrl = driveUrl ? driveUrl.trim() : '';
      if (active !== undefined) job.active = !!active;
      await this.db.put('jobs', job);
      return job;
    }

    async toggleActive(id) {
      const job = await this.getById(id);
      if (!job) throw new Error('Trabajo no encontrado.');
      job.active = !job.active;
      await this.db.put('jobs', job);
      return job;
    }

    isOverdue(job) {
      if (!job || !job.dueDate) return false;
      const today = new Date().toISOString().slice(0, 10);
      return job.dueDate < today;
    }
  }

  // ==========================================
  // 5. HISTORY SERVICE
  // ==========================================
  class HistoryService {
    constructor(db) { this.db = db; }
    async getAll() { return await this.db.getAll('history'); }

    async logChange({ assignmentId, from, to, notes = '' }) {
      const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        assignmentId,
        from: from || 'pending',
        to: to || 'pending',
        notes: notes || '',
        at: new Date().toISOString()
      };
      await this.db.put('history', entry);
      return entry;
    }

    async getDetailedHistory(query = '') {
      const [history, assignments, students, jobs] = await Promise.all([
        this.getAll(),
        this.db.getAll('assignments'),
        this.db.getAll('students'),
        this.db.getAll('jobs')
      ]);
      const sMap = new Map(students.map(s => [s.id, s]));
      const jMap = new Map(jobs.map(j => [j.id, j]));
      const aMap = new Map(assignments.map(a => [a.id, a]));
      const q = query.toLowerCase().trim();

      return history
        .map(h => {
          const a = aMap.get(h.assignmentId);
          return { ...h, assignment: a, student: a ? sMap.get(a.studentId) : null, job: a ? jMap.get(a.jobId) : null };
        })
        .filter(item => {
          if (!item.student || !item.job) return false;
          if (!q) return true;
          return `${item.student.last} ${item.student.name} ${item.job.title}`.toLowerCase().includes(q);
        })
        .sort((a, b) => new Date(b.at) - new Date(a.at));
    }
  }

  // ==========================================
  // 6. ASSIGNMENT SERVICE
  // ==========================================
  class AssignmentService {
    constructor(db, history) {
      this.db = db;
      this.history = history;
    }

    async getAll() { return await this.db.getAll('assignments'); }
    async getById(id) { return await this.db.get('assignments', id); }

    async getByStudentId(studentId) {
      const all = await this.getAll();
      return all.filter(a => a.studentId === studentId);
    }

    async getByJobId(jobId) {
      const all = await this.getAll();
      return all.filter(a => a.jobId === jobId);
    }

    async assignToStudent(studentId, jobId) {
      const all = await this.getAll();
      const existing = all.find(a => a.studentId === studentId && a.jobId === jobId);
      if (existing) return existing;

      const assignment = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        studentId,
        jobId,
        status: 'pending',
        notes: '',
        evaluatedAt: null,
        driveFileId: null,
        driveViewLink: null,
        pdfName: null,
        createdAt: new Date().toISOString()
      };
      await this.db.put('assignments', assignment);
      return assignment;
    }

    async assignToAllActive(jobId, excludedStudentIds = []) {
      const students = await this.db.getAll('students');
      const activeStudents = students.filter(s => s.active && !excludedStudentIds.includes(s.id));
      const allAssignments = await this.getAll();

      for (const student of activeStudents) {
        if (!allAssignments.some(a => a.studentId === student.id && a.jobId === jobId)) {
          await this.assignToStudent(student.id, jobId);
        }
      }
    }

    async deleteAssignment(id) {
      return await this.db.delete('assignments', id);
    }

    async getUnassignedJobsForStudent(studentId) {
      const [jobs, assignments] = await Promise.all([
        this.db.getAll('jobs'),
        this.getByStudentId(studentId)
      ]);
      const assignedSet = new Set(assignments.map(a => a.jobId));
      const unassigned = jobs.filter(j => j.active && !assignedSet.has(j.id));
      return sortJobs(unassigned);
    }

    async syncJobAssignments(jobId, targetStudentIds) {
      const existing = await this.getByJobId(jobId);
      const existingMap = new Map(existing.map(a => [a.studentId, a]));
      const targetSet = new Set(targetStudentIds);

      for (const sId of targetStudentIds) {
        if (!existingMap.has(sId)) {
          await this.assignToStudent(sId, jobId);
        }
      }

      for (const a of existing) {
        if (!targetSet.has(a.studentId) && a.status === 'pending' && !a.evaluatedAt) {
          await this.deleteAssignment(a.id);
        }
      }
    }

    async evaluate(assignmentId, { status, grade = null, notes = '', practicalPrompt = null, driveFileId = null, driveViewLink = null, pdfName = null }) {
      const assignment = await this.getById(assignmentId);
      if (!assignment) throw new Error('Asignación no encontrada.');

      const previousStatus = assignment.status;
      assignment.status = status;
      if (grade !== undefined) assignment.grade = grade;
      if (notes !== undefined) assignment.notes = notes.trim();
      if (practicalPrompt !== null) assignment.practicalPrompt = practicalPrompt.trim();
      assignment.evaluatedAt = new Date().toISOString();

      if (driveFileId !== null) assignment.driveFileId = driveFileId;
      if (driveViewLink !== null) assignment.driveViewLink = driveViewLink;
      if (pdfName !== null) assignment.pdfName = pdfName;

      await this.db.put('assignments', assignment);

      if (previousStatus !== status || notes || grade !== null) {
        await this.history.logChange({
          assignmentId,
          from: previousStatus,
          to: status,
          notes: (grade !== null ? `Nota: ${grade}. ` : '') + (notes || assignment.notes || '')
        });
      }
      return assignment;
    }
  }

  // ==========================================
  // 7. BACKUP SERVICE
  // ==========================================
  class BackupService {
    constructor(db) { this.db = db; }

    async exportBackup() {
      const payload = await this.db.exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gestor-academico-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      const lastBackup = new Date().toLocaleString('es-AR');
      const lastBackupTimestamp = new Date().toISOString();
      await this.db.put('settings', { key: 'backupInfo', lastBackup, lastBackupTimestamp });
      return lastBackup;
    }

    validateBackup(obj) {
      if (!obj || typeof obj !== 'object') return { valid: false, error: 'Archivo JSON inválido.' };
      const isV2 = obj.format === 'gestor-academico-backup-v2' && obj.data;
      const isV1 = obj.format === 'gestor-academico-backup-v1';
      if (!isV2 && !isV1) return { valid: false, error: 'Formato de respaldo no reconocido.' };
      const payload = isV2 ? obj.data : obj;
      if (!Array.isArray(payload.students) || !Array.isArray(payload.jobs) || !Array.isArray(payload.assignments)) {
        return { valid: false, error: 'La copia no contiene la estructura requerida.' };
      }
      return { valid: true, payload, version: isV2 ? 2 : 1 };
    }

    async importBackupFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const parsed = JSON.parse(reader.result);
            const val = this.validateBackup(parsed);
            if (!val.valid) return reject(new Error(val.error));

            // Resguardo de seguridad previo automático
            try {
              const currentData = await this.db.exportAll();
              localStorage.setItem('gestor_snapshot_before_restore', JSON.stringify(currentData));
            } catch (snapErr) {
              console.warn('Snapshot preventivo fallido:', snapErr);
            }

            let dataToImport = val.payload;
            if (val.version === 1) {
              dataToImport = {
                students: val.payload.students || [],
                jobs: val.payload.jobs || [],
                assignments: val.payload.assignments || [],
                history: val.payload.history || [],
                settings: [
                  { key: 'teacherProfile', teacherName: val.payload.settings?.teacherName || '', teacherEmail: val.payload.settings?.teacherEmail || '' },
                  { key: 'backupInfo', lastBackup: val.payload.lastBackup || 'Restaurado desde v1' }
                ]
              };
              if (val.payload.pinHash) {
                dataToImport.settings.push({ key: 'security', pinHash: val.payload.pinHash, algorithm: 'legacy-sha256' });
              }
            }
            await this.db.importAll({ data: dataToImport });
            resolve(true);
          } catch (e) {
            reject(new Error('Error al procesar el archivo: ' + e.message));
          }
        };
        reader.onerror = () => reject(new Error('Error al leer el archivo.'));
        reader.readAsText(file);
      });
    }
  }

  // ==========================================
  // 8. QR SERVICE (usa qrcode-generator v1.4.4)
  // ==========================================
  class QRService {
    /**
     * Genera un QR code real (con Reed-Solomon) como data URL PNG.
     * Depende de la librería qrcode-generator cargada en qrcode.min.js
     * @param {string} text  - texto/URL a codificar
     * @param {number} size  - tamaño del canvas en px (por defecto 400)
     */
    static generateDataURL(text, size = 400) {
      try {
        // Usar la librería qrcode-generator si está disponible
        if (typeof window.qrcode === 'function') {
          return this._generateWithLib(text, size);
        }
      } catch (e) {
        console.warn('qrcode-generator falló, usando fallback:', e);
      }
      // Fallback: SVG simple con mensaje de error legible
      return this._fallbackDataURL(size);
    }

    static _generateWithLib(text, size) {
      // typeNumber 0 = automático, corrección M para buen balance
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Fondo blanco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      const count = qr.getModuleCount();
      const padding = Math.round(size * 0.055);
      const usable = size - padding * 2;
      const cell = usable / count;

      ctx.fillStyle = '#000000';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            // Coordenadas redondeadas para bordes nítidos
            const x = Math.round(padding + c * cell);
            const y = Math.round(padding + r * cell);
            const w = Math.round(padding + (c + 1) * cell) - x;
            const h = Math.round(padding + (r + 1) * cell) - y;
            ctx.fillRect(x, y, w, h);
          }
        }
      }

      return canvas.toDataURL('image/png');
    }

    static _fallbackDataURL(size) {
      // Canvas con texto de error si la librería no cargó
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#cc0000';
      ctx.font = `bold ${Math.round(size * 0.07)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('QR no disponible', size / 2, size / 2);
      ctx.font = `${Math.round(size * 0.055)}px sans-serif`;
      ctx.fillStyle = '#555';
      ctx.fillText('(librería no cargó)', size / 2, size / 2 + size * 0.1);
      return canvas.toDataURL('image/png');
    }
  }

  // ==========================================
  // 9. FILE HOSTING SERVICE (Google Drive API)
  // ==========================================
  class FileHostingService {
    constructor(db) {
      this.db = db;
      this.accessToken = null;
      this.tokenExpiresAt = 0;
    }

    async getConfig() {
      const cfg = await this.db.get('settings', 'googleDriveConfig');
      return cfg || { clientId: '', privacyDefault: 'anyoneWithLink' };
    }

    async saveConfig(cfg) {
      await this.db.put('settings', {
        key: 'googleDriveConfig',
        clientId: (cfg.clientId || '').trim(),
        privacyDefault: cfg.privacyDefault || 'anyoneWithLink',
        updatedAt: new Date().toISOString()
      });
    }

    async requestAccessToken() {
      const config = await this.getConfig();
      if (!config.clientId) {
        throw new Error('Configurá primero tu ID de cliente OAuth de Google Cloud en la sección Configuración.');
      }
      if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
        return this.accessToken;
      }
      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services no está disponible. Comprobá tu conexión a internet.');
      }

      return new Promise((resolve, reject) => {
        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: config.clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (res) => {
              if (res.error) return reject(new Error('Autenticación con Google cancelada o fallida: ' + res.error));
              this.accessToken = res.access_token;
              this.tokenExpiresAt = Date.now() + (parseInt(res.expires_in, 10) * 1000);
              resolve(this.accessToken);
            }
          });
          client.requestAccessToken({ prompt: '' });
        } catch (e) {
          reject(e);
        }
      });
    }

    async uploadPDF(file, customPrivacy = null) {
      const token = await this.requestAccessToken();
      const config = await this.getConfig();
      const privacy = customPrivacy || config.privacyDefault;

      const metadata = {
        name: file.name,
        mimeType: 'application/pdf',
        description: 'Consigna de recuperación - Gestor Académico'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error('Error al subir a Google Drive: ' + (err.error?.message || res.statusText));
      }

      const fileData = await res.json();

      if (privacy === 'anyoneWithLink') {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        }).catch(err => console.warn('No se pudo aplicar permiso público automático:', err));
      }

      return {
        fileId: fileData.id,
        fileName: fileData.name,
        viewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`
      };
    }
  }

  // ==========================================
  // 10. EMAIL SERVICE (Mailto preparador)
  // ==========================================
  class EmailService {
    static prepareMailtoLink({ studentEmail, studentName, jobTitle, jobType = 'Práctico', promptText = '', driveUrl = '', teacherName }) {
      if (!studentEmail || !studentEmail.trim()) {
        return { ready: false, error: 'El alumno no tiene correo registrado.' };
      }
      const isTheoretical = jobType === 'Teórico';
      const subject = `Consigna de recuperación: ${jobTitle} - Educación Física`;

      let body = '';
      if (isTheoretical) {
        // PARTE TEÓRICA: Se mantiene como trabajamos (archivo en Google Drive con link y QR)
        body = `Hola ${studentName},

Te adjunto la consigna de recuperación correspondiente al trabajo práctico "${jobTitle}".

Podés consultar el documento en Google Drive desde el siguiente enlace: ${driveUrl}

Ante cualquier duda podés consultarme durante las clases, recuerda las fechas de entrega.

Saludos, Prof. Pablo Oliva González.`;
      } else {
        // PARTE PRÁCTICA: Consigna cargada directamente en la página (rutinas / ejercicios)
        const consigna = promptText ? promptText.trim() : (driveUrl ? `Enlace de consulta: ${driveUrl}` : 'Consultar ejercicios de recuperación con el docente en clase.');
        body = `Hola ${studentName},

Te adjunto la consigna de recuperación correspondiente al trabajo práctico "${jobTitle}".

Consigna práctica:
${consigna}

Ante cualquier duda podés consultarme durante las clases, recuerda las fechas de entrega.

Saludos, Prof. Pablo Oliva González.`;
      }

      return {
        ready: true,
        url: `mailto:${encodeURIComponent(studentEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      };
    }

    static prepareConsolidatedTheoreticalMail({ studentEmail, studentName, theoreticalJobs, teacherName }) {
      if (!studentEmail || !studentEmail.trim()) {
        return { ready: false, error: 'El alumno no tiene correo registrado.' };
      }

      const subject = `Consignas de recuperación teórica pendientes - Educación Física`;
      
      const listado = theoreticalJobs.map(j => {
        const link = j.driveUrl ? `Enlace Drive: ${j.driveUrl}` : '(Consultar documento con el docente)';
        return `• ${j.title}:\n${link}`;
      }).join('\n\n');

      const body = `Hola ${studentName},

Te adjunto las consignas de recuperación correspondientes a los trabajos prácticos teóricos que adeudás en Educación Física:

${listado}

Podés consultar cada documento en Google Drive desde los enlaces indicados.

Ante cualquier duda podés consultarme durante las clases, recuerda las fechas de entrega.

Saludos, Prof. Pablo Oliva González.`;

      return {
        ready: true,
        url: `mailto:${encodeURIComponent(studentEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      };
    }

    static openClient(url) {
      if (url) window.location.href = url;
    }
  }

  // ==========================================
  // 11. APP CONTROLLER (Orquestador UI)
  // ==========================================
  class AppController {
    constructor() {
      this.db = new DatabaseService();
      this.security = new SecurityService(this.db);
      this.students = new StudentService(this.db);
      this.jobs = new JobService(this.db);
      this.history = new HistoryService(this.db);
      this.assignments = new AssignmentService(this.db, this.history);
      this.backup = new BackupService(this.db);
      this.fileHosting = new FileHostingService(this.db);

      this.currentPage = 'dashboard';
      this.selectedStudentId = null;
      // Cache temporal de QR data URLs para referencias seguras desde onclick HTML
      this._qrCache = new Map();
      this._qrCacheCounter = 0;
    }

    async init() {
      try {
        this.security.setLockCallback(() => this.showLockScreen());
        this.security.setupActivityListeners();

        await this.db.init();
        await this.seedInitialData();

        const hasPin = await this.security.hasPin();
        const loginEl = document.getElementById('login');
        const setupPinEl = document.getElementById('setupPin');
        const enterPinEl = document.getElementById('enterPin');
        const appEl = document.getElementById('app');

        if (loginEl) loginEl.classList.remove('hidden');
        if (appEl) appEl.classList.add('hidden');

        if (!hasPin) {
          if (setupPinEl) setupPinEl.classList.remove('hidden');
          if (enterPinEl) enterPinEl.classList.add('hidden');
        } else {
          if (setupPinEl) setupPinEl.classList.add('hidden');
          if (enterPinEl) enterPinEl.classList.remove('hidden');
        }

        this.bindEvents();
      } catch (err) {
        console.error('Error al inicializar la aplicación:', err);
        await AppDialog.alert('Ocurrió un error al cargar la aplicación local: ' + err.message, 'Error de inicio');
      }
    }

    bindEvents() {
      document.querySelectorAll('.nav').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = btn.dataset.page;
          if (page) this.navigate(page);
        });
      });

      document.getElementById('pinInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleLogin();
      });
      document.getElementById('newPin')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleCreatePin();
      });
    }

    showLockScreen() {
      document.getElementById('app')?.classList.add('hidden');
      document.getElementById('login')?.classList.remove('hidden');
      document.getElementById('setupPin')?.classList.add('hidden');
      document.getElementById('enterPin')?.classList.remove('hidden');
      const pinInp = document.getElementById('pinInput');
      if (pinInp) pinInp.value = '';
      const err = document.getElementById('loginError');
      if (err) err.textContent = 'Panel bloqueado por seguridad o inactividad.';
    }

    async handleCreatePin() {
      const pin = document.getElementById('newPin')?.value.trim();
      try {
        await this.security.setPin(pin);
        document.getElementById('login')?.classList.add('hidden');
        document.getElementById('app')?.classList.remove('hidden');
        this.security.isAuthenticated = true;
        this.security.resetInactivityTimer();
        await this.loadInitialData();
      } catch (err) {
        await AppDialog.alert(err.message, 'Configuración de PIN');
      }
    }

    async handleLogin() {
      const pin = document.getElementById('pinInput')?.value.trim();
      const errorEl = document.getElementById('loginError');

      const remainingSec = this.security.getLockoutRemaining();
      if (remainingSec > 0) {
        this.startLockoutCountdown(remainingSec);
        return;
      }

      try {
        await this.security.verifyPin(pin);
        if (errorEl) errorEl.textContent = '';
        document.getElementById('login')?.classList.add('hidden');
        document.getElementById('app')?.classList.remove('hidden');
        await this.loadInitialData();
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message;
        const lockoutLeft = this.security.getLockoutRemaining();
        if (lockoutLeft > 0) {
          this.startLockoutCountdown(lockoutLeft);
        }
      }
    }

    startLockoutCountdown(seconds) {
      const errorEl = document.getElementById('loginError');
      const pinInput = document.getElementById('pinInput');
      const loginBtn = document.querySelector('#enterPin button.primary');

      if (pinInput) pinInput.disabled = true;
      if (loginBtn) loginBtn.disabled = true;

      let current = seconds;
      if (errorEl) errorEl.textContent = `Panel bloqueado por seguridad. Esperá ${current} segundo(s)...`;

      const timer = setInterval(() => {
        current--;
        if (current <= 0) {
          clearInterval(timer);
          if (pinInput) pinInput.disabled = false;
          if (loginBtn) loginBtn.disabled = false;
          if (errorEl) errorEl.textContent = 'Ya podés intentar ingresar tu PIN.';
        } else {
          if (errorEl) errorEl.textContent = `Panel bloqueado por seguridad. Esperá ${current} segundo(s)...`;
        }
      }, 1000);
    }

    logout() {
      this.security.lock();
    }

    async loadInitialData() {
      await this.renderTeacherWelcome();
      await this.renderCurrentView();
    }

    async renderTeacherWelcome() {
      const profile = await this.db.get('settings', 'teacherProfile');
      const teacherName = profile?.teacherName || 'Prof. Pablo Oliva González';
      const welcomeEl = document.getElementById('teacherWelcome');
      if (welcomeEl) welcomeEl.textContent = teacherName;
    }

    navigate(pageId) {
      this.currentPage = pageId;
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('page-' + pageId)?.classList.add('active');

      document.querySelectorAll('.nav').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === pageId);
      });

      const titles = {
        dashboard: 'Dashboard',
        students: 'Alumnos',
        jobs: 'Trabajos prácticos',
        evaluations: 'Evaluaciones',
        history: 'Historial',
        lookup: 'Consulta individual',
        backup: 'Copias de seguridad',
        settings: 'Configuración'
      };
      const crumb = document.getElementById('currentSection');
      if (crumb) crumb.textContent = titles[pageId] || pageId;

      this.renderCurrentView();
    }

    async renderCurrentView() {
      switch (this.currentPage) {
        case 'dashboard': await this.renderDashboard(); break;
        case 'students': await this.renderStudents(); break;
        case 'jobs': await this.renderJobs(); break;
        case 'evaluations': await this.renderEvaluations(); break;
        case 'history': await this.renderHistory(); break;
        case 'lookup':
          if (this.selectedStudentId) await this.showStudent(this.selectedStudentId);
          break;
        case 'backup': await this.renderBackupInfo(); break;
        case 'settings': await this.renderSettings(); break;
      }
    }

    // --- DASHBOARD ---
    async renderDashboard() {
      const [students, jobs, assignments] = await Promise.all([
        this.students.getAll(),
        this.jobs.getAll(),
        this.assignments.getAll()
      ]);

      const activeStudents = students.filter(s => s.active).length;
      const activeJobs = jobs.filter(j => j.active).length;

      const counts = { pending: 0, approved: 0, failed: 0 };
      assignments.forEach(a => {
        if (counts[a.status] !== undefined) counts[a.status]++;
      });

      const overdueCount = assignments.filter(a => {
        if (a.status !== 'pending') return false;
        const job = jobs.find(j => j.id === a.jobId);
        return this.jobs.isOverdue(job);
      }).length;

      const statsEl = document.getElementById('stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div class="card"><div class="staticon">♙</div><div class="stat">${activeStudents}</div><div class="statlabel">Alumnos activos</div></div>
          <div class="card"><div class="staticon">▤</div><div class="stat">${activeJobs}</div><div class="statlabel">Trabajos creados</div></div>
          <div class="card"><div class="staticon">◷</div><div class="stat">${counts.pending}</div><div class="statlabel">Pendientes (${overdueCount} vencidos)</div></div>
          <div class="card"><div class="staticon">!</div><div class="stat">${counts.failed}</div><div class="statlabel">Desaprobados</div></div>
        `;
      }

      const total = counts.approved + counts.pending + counts.failed;
      const pct = total ? Math.round((counts.approved / total) * 100) : 0;
      const overviewEl = document.getElementById('overview');
      if (overviewEl) {
        overviewEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span class="muted">Aprobación general</span><b>${pct}%</b>
          </div>
          <div style="height:9px;background:#252936;border-radius:20px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--primary);transition:width 0.3s ease"></div>
          </div>
          <p class="muted" style="margin:12px 0 0">
            ${counts.approved} aprobados · ${counts.pending} pendientes · ${counts.failed} desaprobados
          </p>
        `;
      }
    }

    // --- ALUMNOS ---
    async renderStudents() {
      const q = document.getElementById('studentSearch')?.value || '';
      const filter = document.getElementById('studentFilter')?.value || 'active';
      const students = await this.students.search({ query: q, filter });
      const assignments = await this.assignments.getAll();
      const countMap = Object.create(null);
      for (let i = 0; i < assignments.length; i++) {
        const sId = assignments[i].studentId;
        countMap[sId] = (countMap[sId] || 0) + 1;
      }
      const tbody = document.getElementById('studentsBody');
      if (!tbody) return;

      if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">No se encontraron alumnos con los criterios seleccionados.</td></tr>`;
        return;
      }

      tbody.innerHTML = students.map(s => {
        const assignedCount = countMap[s.id] || 0;
        return `
          <tr style="cursor:pointer" onclick="GestorAcademico.app.viewStudentDetail('${s.id}', event)">
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:16px;color:var(--accent-2)">👤</span>
                <div>
                  <b style="color:var(--accent-2);font-size:14.5px">${this.esc(s.last)}, ${this.esc(s.name)}</b>
                  <small style="display:block;color:var(--text-3);font-size:11px">Clic para ver situación, notas y TP</small>
                </div>
              </div>
            </td>
            <td>${this.esc(s.email || '—')}</td>
            <td><span class="badge neutral">${assignedCount} trabajos</span></td>
            <td>${s.active ? '<span class="badge approved">Activo</span>' : '<span class="badge neutral">Inactivo</span>'}</td>
            <td onclick="event.stopPropagation()">
              <button class="primary rowbtn" onclick="GestorAcademico.app.viewStudentDetail('${s.id}')">Ver ficha</button>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.openStudentModal('${s.id}')">Editar</button>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.toggleStudentActive('${s.id}')">${s.active ? 'Desactivar' : 'Activar'}</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    viewStudentDetail(studentId, event) {
      if (event && event.target && (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT')) {
        return;
      }
      this.navigate('lookup');
      this.showStudent(studentId);
    }

    async openStudentModal(id = null) {
      const s = id ? await this.students.getById(id) : {};
      const title = id ? 'Editar alumno' : 'Agregar alumno';
      const bodyHtml = `
        <div class="formgrid">
          <div class="field"><label>NOMBRE</label><input id="fName" value="${this.esc(s.name || '')}" placeholder="Ej. Juan"></div>
          <div class="field"><label>APELLIDO</label><input id="fLast" value="${this.esc(s.last || '')}" placeholder="Ej. Pérez"></div>
          <div class="field full"><label>CORREO ELECTRÓNICO (OPCIONAL)</label><input id="fEmail" type="email" value="${this.esc(s.email || '')}" placeholder="alumno@correo.com"></div>
          <div class="field full"><label>OBSERVACIONES</label><textarea id="fNotes" rows="2" placeholder="Alergias, aptitud física, notas personales...">${this.esc(s.notes || '')}</textarea></div>
          <div class="field full" style="margin-top:4px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;text-transform:none">
              <input type="checkbox" id="fActive" ${s.active !== false ? 'checked' : ''} style="width:18px;height:18px">
              <span><b>Alumno activo (asiste a clase regularmente)</b><br><small class="muted">Desmarcalo si el alumno no vino nunca o no lo conocés para ocultarlo de la lista activa.</small></span>
            </label>
          </div>
        </div>
      `;

      this.showModal(title, bodyHtml, async () => {
        const name = document.getElementById('fName')?.value.trim();
        const last = document.getElementById('fLast')?.value.trim();
        const email = document.getElementById('fEmail')?.value.trim();
        const notes = document.getElementById('fNotes')?.value.trim();
        const active = document.getElementById('fActive')?.checked;

        if (!name || !last) return await AppDialog.alert('Nombre y apellido son campos obligatorios.', 'Datos incompletos');

        if (id) {
          await this.students.update(id, { name, last, email, notes, active });
        } else {
          const created = await this.students.create({ name, last, email, notes });
          if (!active) {
            await this.students.update(created.id, { active: false });
          }
        }
        this.closeModal();
        await this.renderStudents();
        await this.renderDashboard();
      });
    }

    openBulkStudentModal() {
      const bodyHtml = `
        <p class="muted" style="margin-bottom:12px;font-size:13px">
          Pegá tu lista de alumnos (un nombre por renglón). Formatos aceptados: <code>Pérez, Juan</code> o <code>Juan Pérez</code>.
        </p>
        <div class="field">
          <label>LISTA DE ALUMNOS A CARGAR</label>
          <textarea id="bulkStudentsList" rows="8" placeholder="Pérez, Juan&#10;García, Sofía&#10;López, Martín..."></textarea>
        </div>
        <div class="field" style="margin-top:12px">
          <label>ESTADO INICIAL DE ESTOS ALUMNOS</label>
          <select id="bulkActiveStatus">
            <option value="active">Activos (asisten habitualmente)</option>
            <option value="inactive">Inactivos (no vinieron nunca / no los conozco todavía)</option>
          </select>
          <small class="muted">Los inactivos quedan ocultos y no figuran en la lista de clase a menos que los actives.</small>
        </div>
      `;

      this.showModal('Carga rápida de lista de alumnos', bodyHtml, async () => {
        const raw = document.getElementById('bulkStudentsList')?.value.trim();
        if (!raw) return await AppDialog.alert('Por favor pegá al menos un alumno en la lista.', 'Lista vacía');
        const isActive = document.getElementById('bulkActiveStatus')?.value === 'active';

        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        let count = 0;

        for (const line of lines) {
          let name = '', last = '';
          if (line.includes(',')) {
            const parts = line.split(',');
            last = parts[0].trim();
            name = parts.slice(1).join(' ').trim();
          } else {
            const parts = line.split(/\s+/);
            if (parts.length === 1) {
              last = parts[0];
              name = '-';
            } else {
              name = parts.pop();
              last = parts.join(' ');
            }
          }

          if (last || name) {
            const s = await this.students.create({
              name: name || '-',
              last: last || '-',
              notes: isActive ? '' : 'No asistió nunca / Desconocido'
            });
            if (!isActive) {
              await this.students.update(s.id, { active: false });
            }
            count++;
          }
        }

        this.closeModal();
        await this.renderStudents();
        await this.renderDashboard();
        await AppDialog.alert(`Se cargaron exitosamente ${count} alumnos como ${isActive ? 'Activos' : 'Inactivos'}.`, 'Carga completada');
      });
    }

    async toggleStudentActive(id) {
      await this.students.toggleActive(id);
      await this.renderStudents();
      await this.renderDashboard();
    }

    // --- TRABAJOS PRÁCTICOS ---
    async renderJobs() {
      const [jobs, assignments] = await Promise.all([
        this.jobs.getAll(),
        this.assignments.getAll()
      ]);
      const tbody = document.getElementById('jobsBody');
      if (!tbody) return;

      if (jobs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">Todavía no creaste trabajos prácticos.</td></tr>`;
        return;
      }

      tbody.innerHTML = jobs.map(j => {
        const assignedCount = assignments.filter(a => a.jobId === j.id).length;
        return `
          <tr>
            <td>
              <b>${this.esc(j.title)}</b>
              ${j.driveUrl ? `<br><a href="${this.esc(j.driveUrl)}" target="_blank" style="color:var(--accent-2);font-size:12px;text-decoration:underline">📄 Material Google Drive ↗</a>` : ''}
              ${j.description ? `<br><small class="muted">${this.esc(j.description)}</small>` : ''}
            </td>
            <td><span class="badge ${j.type === 'Práctico' ? 'neutral' : 'approved'}">${this.esc(j.type)}</span></td>
            <td>${j.dueDate || '—'}</td>
            <td><span class="badge ${assignedCount > 0 ? 'approved' : 'neutral'}">${assignedCount} asignado(s)</span></td>
            <td>${j.active ? '<span class="badge approved">Activo</span>' : '<span class="badge neutral">Archivado</span>'}</td>
            <td>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.openJobAssignmentsModal('${j.id}')">Asignaciones (${assignedCount})</button>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.openJobModal('${j.id}')">Editar / Drive</button>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.toggleJobActive('${j.id}')">${j.active ? 'Archivar' : 'Activar'}</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    async openJobModal(id = null) {
      const j = id ? await this.jobs.getById(id) : {};
      const allJobs = await this.jobs.getAll();
      const nextNum = allJobs.length + 1;
      const isOdd = nextNum % 2 !== 0;
      const defaultType = isOdd ? 'Práctico' : 'Teórico';
      const defaultTitle = id ? j.title : `TP ${nextNum} - ${defaultType}`;
      const title = id ? 'Editar trabajo' : 'Nuevo trabajo';

      const currentType = j.type || defaultType;
      const bodyHtml = `
        <div class="formgrid" style="gap:15px">
          <div class="field full">
            <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span>TÍTULO DEL TRABAJO</span>
              <span class="muted" style="font-size:11px;text-transform:none">Ej: TP 3 - Vóley</span>
            </label>
            <input id="jTitle" value="${this.esc(defaultTitle || '')}" placeholder="Nombre del trabajo">
          </div>

          <div class="field">
            <label>TIPO DE TRABAJO</label>
            <select id="jType" onchange="GestorAcademico.app.onJobTypeChange(this.value)">
              <option value="Práctico" ${currentType === 'Práctico' ? 'selected' : ''}>Práctico</option>
              <option value="Teórico" ${currentType === 'Teórico' ? 'selected' : ''}>Teórico</option>
            </select>
          </div>

          <div class="field">
            <label>FECHA LÍMITE</label>
            <input id="jDue" type="date" value="${j.dueDate || ''}">
          </div>

          <div class="field full">
            <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span id="descFieldLabel">CONSIGNAS Y DESCRIPCIÓN DEL TRABAJO</span>
              <span class="muted" style="font-size:11px;text-transform:none">Visible para el alumno</span>
            </label>
            <textarea id="jDesc" rows="5" style="min-height:120px;line-height:1.55;resize:vertical;" placeholder="Escribí aquí las consignas, ejercicios a evaluar o temas de estudio...">${this.esc(j.description || '')}</textarea>
          </div>
          
          <div class="field full" id="driveBox" style="border:1px solid rgba(109, 91, 255, 0.32);background:#141522;border-radius:14px;padding:15px;margin-top:2px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
              <label id="driveBoxTitle" style="color:var(--accent-2);font-size:11.5px;font-weight:700;margin:0">
                📄 ARCHIVO O DOCUMENTO EN GOOGLE DRIVE
              </label>
              <a href="https://drive.google.com/" target="_blank" class="secondary rowbtn" style="text-decoration:none;font-size:11px;padding:4px 11px">Abrir mi Drive ↗</a>
            </div>
            <input id="jDriveUrl" value="${this.esc(j.driveUrl || '')}" placeholder="https://drive.google.com/file/d/... o enlace a carpeta">
            <small class="muted" id="driveBoxHint" style="display:block;margin-top:7px;font-size:11.5px;line-height:1.45">
              ${currentType === 'Teórico' 
                ? 'Para trabajos <b>Teóricos</b>: este enlace genera el Código QR para escanear en clase y se envía por mail en la recuperación.' 
                : 'Opcional para trabajos <b>Prácticos</b> (videos demostrativos, reglamentos o material extra).'}
            </small>
          </div>

          ${!id ? `
          <div class="field full" style="margin-top:2px">
            <label>ASIGNACIÓN INICIAL A ALUMNOS</label>
            <select id="jAssign">
              <option value="all">Asignar a todos los alumnos activos</option>
              <option value="custom">Elegir alumnos / Excluir manualmente</option>
              <option value="none">Crear sin asignar</option>
            </select>
          </div>` : ''}
        </div>
      `;

      this.showModal(title, bodyHtml, async () => {
        const titleVal = document.getElementById('jTitle')?.value.trim();
        const descVal = document.getElementById('jDesc')?.value.trim();
        const typeVal = document.getElementById('jType')?.value;
        const dueVal = document.getElementById('jDue')?.value;
        const driveUrlVal = document.getElementById('jDriveUrl')?.value.trim() || '';

        if (!titleVal) return await AppDialog.alert('El título del trabajo es obligatorio.', 'Campo obligatorio');

        if (id) {
          await this.jobs.update(id, { title: titleVal, description: descVal, type: typeVal, dueDate: dueVal, driveUrl: driveUrlVal });
          this.closeModal();
        } else {
          const createdJob = await this.jobs.create({ title: titleVal, description: descVal, type: typeVal, dueDate: dueVal, driveUrl: driveUrlVal });
          const assignMode = document.getElementById('jAssign')?.value;
          this.closeModal();

          if (assignMode === 'all') {
            await this.assignments.assignToAllActive(createdJob.id);
          } else if (assignMode === 'custom') {
            await this.openJobAssignmentsModal(createdJob.id);
            return;
          }
        }
        await this.renderJobs();
        await this.renderDashboard();
      });
    }

    onJobTypeChange(val) {
      const isTheo = val === 'Teórico';
      const hint = document.getElementById('driveBoxHint');
      const label = document.getElementById('descFieldLabel');
      if (hint) {
        hint.innerHTML = isTheo
          ? 'Para trabajos <b>Teóricos</b>: este enlace genera el Código QR para escanear en clase y se envía por mail en la recuperación.'
          : 'Opcional para trabajos <b>Prácticos</b> (videos demostrativos, reglamentos o material extra).';
      }
      if (label) {
        label.textContent = isTheo ? 'TEMAS Y CONSIGNAS TEÓRICAS' : 'CONSIGNAS Y PAUTAS DEL TRABAJO';
      }
    }

    async openJobAssignmentsModal(jobId) {
      const [job, students, assignments] = await Promise.all([
        this.jobs.getById(jobId),
        this.students.search({ query: '', filter: 'active' }),
        this.assignments.getByJobId(jobId)
      ]);
      if (!job) return;

      const assignedStudentIds = new Set(assignments.map(a => a.studentId));
      const bodyHtml = `
        <p style="margin-bottom:12px"><b>${this.esc(job.title)}</b> (${this.esc(job.type)})<br><span class="muted">Marcá los alumnos asignados o desmarcá para excluirlos.</span></p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span class="muted" style="font-size:12px" id="jobAssignCounter">${assignedStudentIds.size} de ${students.length} alumnos asignados</span>
          <div style="display:flex;gap:6px">
            <button type="button" class="secondary rowbtn" onclick="GestorAcademico.app.toggleAllJobCheckboxes(true)">Marcar todos</button>
            <button type="button" class="secondary rowbtn" onclick="GestorAcademico.app.toggleAllJobCheckboxes(false)">Desmarcar todos</button>
          </div>
        </div>
        <div style="max-height:300px;overflow-y:auto;border:1px solid #2b2e3c;border-radius:12px;padding:10px;background:#0d0f15">
          ${students.map(s => {
            const isAssigned = assignedStudentIds.has(s.id);
            return `
              <label style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid #1a1e28;cursor:pointer;font-size:13px;text-transform:none">
                <input type="checkbox" class="job-assign-cb" value="${s.id}" ${isAssigned ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
                <span><b>${this.esc(s.last)}, ${this.esc(s.name)}</b> <span class="muted">${s.email ? `(${this.esc(s.email)})` : ''}</span></span>
              </label>
            `;
          }).join('') || '<p class="empty">No hay alumnos activos disponibles.</p>'}
        </div>
      `;

      this.showModal(`Asignación de alumnos: ${job.title}`, bodyHtml, async () => {
        const checkboxes = document.querySelectorAll('.job-assign-cb');
        const selectedStudentIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        await this.assignments.syncJobAssignments(jobId, selectedStudentIds);
        this.closeModal();
        await this.renderJobs();
        await this.renderDashboard();
      });
    }

    toggleAllJobCheckboxes(check) {
      document.querySelectorAll('.job-assign-cb').forEach(cb => { cb.checked = !!check; });
      const total = document.querySelectorAll('.job-assign-cb').length;
      const checked = check ? total : 0;
      const counter = document.getElementById('jobAssignCounter');
      if (counter) counter.textContent = `${checked} de ${total} alumnos asignados`;
    }

    async toggleJobActive(id) {
      await this.jobs.toggleActive(id);
      await this.renderJobs();
      await this.renderDashboard();
    }

    // --- EVALUACIONES ---
    async renderEvaluations() {
      const [jobs, assignments, students] = await Promise.all([
        this.jobs.getAll(),
        this.assignments.getAll(),
        this.students.getAll()
      ]);

      const jobSelect = document.getElementById('evalJob');
      if (jobSelect && jobSelect.options.length <= 1) {
        const currentVal = jobSelect.value;
        jobSelect.innerHTML = '<option value="">Todos los trabajos</option>' +
          jobs.map(j => `<option value="${j.id}" ${j.id === currentVal ? 'selected' : ''}>${this.esc(j.title)}</option>`).join('');
      }

      const selectedJobId = document.getElementById('evalJob')?.value || '';
      const selectedStatus = document.getElementById('evalStatus')?.value || '';
      const searchVal = (document.getElementById('evalSearch')?.value || '').toLowerCase().trim();

      const studentMap = new Map(students.map(s => [s.id, s]));
      const jobMap = new Map(jobs.map(j => [j.id, j]));

      const filtered = assignments
        .map(a => ({ ...a, student: studentMap.get(a.studentId), job: jobMap.get(a.jobId) }))
        .filter(x => {
          if (!x.student || !x.job) return false;
          if (selectedJobId && x.jobId !== selectedJobId) return false;
          if (selectedStatus && x.status !== selectedStatus) return false;
          if (searchVal && !`${x.student.last} ${x.student.name}`.toLowerCase().includes(searchVal)) return false;
          return true;
        })
        .sort((a, b) => (a.student.last + a.student.name).localeCompare(b.student.last + b.student.name));

      const tbody = document.getElementById('evalBody');
      if (!tbody) return;

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">No hay asignaciones que coincidan con los filtros.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(a => {
        const isOverdue = a.status === 'pending' && this.jobs.isOverdue(a.job);
        const gradeText = a.grade !== undefined && a.grade !== null 
          ? `<b style="font-size:14px;color:${a.grade >= 7 ? 'var(--green)' : 'var(--red)'}">${a.grade}</b>` 
          : '<span class="muted">—</span>';
        return `
          <tr>
            <td><b>${this.esc(a.student.last)}, ${this.esc(a.student.name)}</b></td>
            <td>${this.esc(a.job.title)} <span class="badge ${a.job.type === 'Práctico' ? 'neutral' : 'approved'}" style="font-size:10px;margin-left:4px">${this.esc(a.job.type)}</span></td>
            <td>${gradeText}</td>
            <td>${this.getBadge(a.status)}${isOverdue ? ' <span class="badge expired">Vencido</span>' : ''}</td>
            <td>${a.job.dueDate || '—'}</td>
            <td><button class="secondary rowbtn" onclick="GestorAcademico.app.openEvaluationModal('${a.id}')">Calificar</button></td>
          </tr>
        `;
      }).join('');
    }

    async openEvaluationModal(assignmentId) {
      const a = await this.assignments.getById(assignmentId);
      if (!a) return;

      const [student, job] = await Promise.all([
        this.students.getById(a.studentId),
        this.jobs.getById(a.jobId)
      ]);

      const isPractical = job.type === 'Práctico';
      const title = `Calificar: ${job.title}`;
      const bodyHtml = `
        <p style="margin-bottom:14px">
          <b>${this.esc(student.last)}, ${this.esc(student.name)}</b><br>
          <span class="muted">${this.esc(job.title)} — <b>${this.esc(job.type)}</b></span>
        </p>

        <div class="formgrid">
          <div class="field">
            <label>CALIFICACIÓN NUMÉRICA (1 AL 10)</label>
            <input type="number" id="eGrade" min="1" max="10" step="0.5" value="${a.grade !== undefined && a.grade !== null ? a.grade : ''}" placeholder="Ej. 7" oninput="GestorAcademico.app.onGradeInput(this.value, '${job.type}')">
            <small class="muted">Se aprueba con nota 7 o superior.</small>
          </div>
          <div class="field">
            <label>ESTADO ACADÉMICO</label>
            <select id="eStatus" onchange="GestorAcademico.app.toggleRecoveryPanel(this.value, '${job.type}')">
              <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>Pendiente</option>
              <option value="approved" ${a.status === 'approved' ? 'selected' : ''}>Aprobado (7 a 10)</option>
              <option value="failed" ${a.status === 'failed' ? 'selected' : ''}>Desaprobado (&lt; 7)</option>
            </select>
          </div>
        </div>

        <div class="field" style="margin-top:14px">
          <label>OBSERVACIONES DEL DOCENTE</label>
          <textarea id="eNotes" rows="2" placeholder="Comentarios de desempeño o refuerzo...">${this.esc(a.notes || '')}</textarea>
        </div>

        ${!isPractical ? `
        <!-- TRABAJO TEÓRICO: MATERIAL EN GOOGLE DRIVE (PDF) + QR -->
        <div style="margin-top:16px;border:1px solid rgba(109, 91, 255, 0.35);background:#171825;border-radius:14px;padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label style="color:var(--accent-2);font-size:12px;margin:0">📄 Archivo o Consigna en Google Drive (Trabajo Teórico PDF)</label>
            <a href="https://drive.google.com/" target="_blank" class="secondary rowbtn" style="text-decoration:none;font-size:11px">Abrir mi Drive ↗</a>
          </div>
          <p class="muted" style="font-size:12px;margin:0 0 10px">
            Pegá aquí el enlace de Google Drive al archivo PDF del trabajo teórico. Se incluirá en el mail y generará el QR:
          </p>
          <div class="field">
            <input id="eDriveUrl" value="${this.esc(a.driveViewLink || job.driveUrl || '')}" placeholder="https://drive.google.com/file/d/.../view">
          </div>
          <div class="field" style="margin-top:10px">
            <label>OBSERVACIONES O PAUTAS ESCRITAS (OPCIONAL)</label>
            <textarea id="ePracticalPrompt" rows="2" placeholder="Puntos específicos o aclaraciones complementarias...">${this.esc(a.practicalPrompt || '')}</textarea>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="primary rowbtn" onclick="GestorAcademico.app.sendRecoveryEmail('${a.id}')">✉️ Enviar por correo</button>
            <button type="button" class="secondary rowbtn" onclick="GestorAcademico.app.previewCurrentQR('${this.esc(job.title)}', '${this.esc(student.name)}')">📱 Ver Código QR</button>
          </div>
        </div>
        ` : `
        <!-- TRABAJO PRÁCTICO: SECCIÓN DE RECUPERACIÓN (SE DESPLIEGA AL DESAPROBAR) -->
        <div id="recoveryPanel" style="display:${a.status === 'failed' ? 'block' : 'none'};margin-top:16px;border:1px solid #4a2838;background:#17121b;border-radius:14px;padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label style="color:#f2aab7;font-size:12px;margin:0">📋 Formulario de Consigna Práctica para Recuperación</label>
            <a href="https://drive.google.com/" target="_blank" class="secondary rowbtn" style="text-decoration:none;font-size:11px">Abrir mi Drive ↗</a>
          </div>
          <p class="muted" style="font-size:12px;margin:0 0 10px">
            Al ser una evaluación práctica desaprobada, redactá aquí la rutina o ejercicios que debe realizar el alumno:
          </p>
          <div class="field">
            <label>CONSIGNA O RUTINA PRÁCTICA</label>
            <textarea id="ePracticalPrompt" rows="3" placeholder="Ejemplo: Realizar circuito de 3 series: 10 flexiones, 15 sentadillas, salto en largo...">${this.esc(a.practicalPrompt || '')}</textarea>
          </div>
          <div class="field" style="margin-top:10px">
            <label>ENLACE COMPARTIDO DE GOOGLE DRIVE (OPCIONAL, EJ. VIDEO DEMO)</label>
            <input id="eDriveUrl" value="${this.esc(a.driveViewLink || job.driveUrl || '')}" placeholder="https://drive.google.com/file/d/... (opcional)">
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="secondary rowbtn" onclick="GestorAcademico.app.previewCurrentQR('${this.esc(job.title)}', '${this.esc(student.name)}')">📱 Ver Código QR</button>
            <button type="button" class="secondary rowbtn" onclick="GestorAcademico.app.sendRecoveryEmail('${a.id}')">✉️ Preparar Correo</button>
          </div>
        </div>
        `}

        <div class="notice" style="margin-top:14px">ℹ️ Los cambios de calificación quedan registrados en el historial con fecha y hora.</div>
      `;

      this.showModal(title, bodyHtml, async () => {
        const gradeVal = document.getElementById('eGrade')?.value;
        const grade = gradeVal !== '' && !isNaN(gradeVal) ? parseFloat(gradeVal) : null;
        const status = document.getElementById('eStatus')?.value;
        const notes = document.getElementById('eNotes')?.value.trim();
        const driveViewLink = document.getElementById('eDriveUrl')?.value.trim() || null;
        const practicalPrompt = document.getElementById('ePracticalPrompt')?.value.trim() || null;

        await this.assignments.evaluate(assignmentId, { status, grade, notes, driveViewLink, practicalPrompt });
        this.closeModal();
        await this.renderEvaluations();
        await this.renderDashboard();
        if (this.currentPage === 'lookup' && this.selectedStudentId) {
          await this.showStudent(this.selectedStudentId);
        }

        // Si debe la parte teórica (desaprobado), ofrecer enviarle las consignas por mail de inmediato
        if (job.type === 'Teórico' && status === 'failed') {
          const sendNow = await AppDialog.confirm(
            `El alumno ${student.last}, ${student.name} adeuda la parte teórica de "${job.title}".\n\n¿Deseás enviarle las consignas por correo electrónico ahora?`,
            'Enviar consigna teórica'
          );
          if (sendNow) {
            await this.sendRecoveryEmail(assignmentId);
          }
        }
      });
    }

    onGradeInput(val, jobType) {
      const statusSel = document.getElementById('eStatus');
      const recoveryPanel = document.getElementById('recoveryPanel');
      if (!statusSel) return;

      if (val !== '' && !isNaN(val)) {
        const num = parseFloat(val);
        if (num >= 7) {
          statusSel.value = 'approved';
          if (recoveryPanel) recoveryPanel.style.display = 'none';
        } else {
          statusSel.value = 'failed';
          if (recoveryPanel) recoveryPanel.style.display = 'block';
        }
      } else {
        statusSel.value = 'pending';
        if (recoveryPanel) recoveryPanel.style.display = 'none';
      }
    }

    toggleRecoveryPanel(status, jobType) {
      const panel = document.getElementById('recoveryPanel');
      if (panel) panel.style.display = status === 'failed' ? 'block' : 'none';
    }

    async handleUploadToDrive(assignmentId) {
      const fileInput = document.getElementById('ePdfFile');
      const file = fileInput?.files?.[0];
      const msg = document.getElementById('driveUploadMsg');
      if (!file) return await AppDialog.alert('Por favor seleccioná un archivo PDF local primero.', 'Archivo requerido');
      if (msg) msg.textContent = 'Subiendo archivo a Google Drive...';

      try {
        const uploaded = await this.fileHosting.uploadPDF(file);
        const driveInp = document.getElementById('eDriveUrl');
        if (driveInp) driveInp.value = uploaded.viewLink;
        if (msg) msg.textContent = `✓ Subido exitosamente: "${uploaded.fileName}"`;
        await AppDialog.alert('Archivo PDF subido exitosamente a Google Drive.', 'Subida exitosa');
      } catch (err) {
        if (msg) msg.textContent = 'Error: ' + err.message;
        await AppDialog.alert('Error al subir a Google Drive: ' + err.message, 'Error de Google Drive');
      }
    }

    async previewCurrentQR(jobTitle, studentName) {
      const url = document.getElementById('eDriveUrl')?.value.trim();
      const prompt = document.getElementById('ePracticalPrompt')?.value.trim();
      const content = url || prompt;
      if (!content) {
        await AppDialog.alert('Por favor ingresá un enlace de Google Drive o redactá la consigna de recuperación.', 'Contenido QR faltante');
        return;
      }
      this.showQRModal(content, jobTitle, studentName);
    }

    async showQRModal(content, jobTitle, studentName) {
      if (!content) return await AppDialog.alert('No hay un enlace ni consigna registrada para generar el código QR.', 'QR no disponible');
      const qrDataUrl = QRService.generateDataURL(content, 260);
      const isUrl = content.startsWith('http://') || content.startsWith('https://');

      const bodyHtml = `
        <div style="text-align:center;padding:10px 0">
          <p style="margin:0 0 14px;font-size:14px">
            <b>${this.esc(jobTitle)}</b><br>
            <span class="muted">Consigna de recuperación para: ${this.esc(studentName)}</span>
          </p>

          <div style="background:#ffffff;padding:16px;border-radius:18px;display:inline-block;box-shadow:0 12px 36px rgba(0,0,0,0.6)">
            <img src="${qrDataUrl}" alt="Código QR" style="display:block;width:240px;height:240px;margin:0 auto">
          </div>

          <p style="margin:16px 0 6px;font-size:12px;color:var(--muted)">
            El alumno puede escanear este código con la cámara de su celular para abrir la consigna en clase.
          </p>
          ${isUrl ? `
            <p style="margin:0 0 16px;word-break:break-all;font-size:12px">
              <a href="${content}" target="_blank" style="color:var(--primary)">${content}</a>
            </p>
          ` : `
            <div style="margin:8px auto 14px;max-width:380px;background:#1b151f;padding:10px;border-radius:8px;font-size:12px;color:#f0f0ff;text-align:left">
              <b>Contenido del código QR:</b><br>${this.esc(content)}
            </div>
          `}

          <div style="display:flex;justify-content:center;gap:10px;margin-top:14px;flex-wrap:wrap">
            <a href="${qrDataUrl}" download="qr-recuperacion.png" class="primary button" style="text-decoration:none;display:inline-flex;align-items:center;padding:10px 16px;border-radius:11px;color:#11121a;font-weight:600">
              ⬇️ Descargar imagen QR (PNG)
            </a>
            <button class="secondary" onclick="GestorAcademico.app.closeModal()">Cerrar</button>
          </div>
        </div>
      `;

      this.showModal('Código QR de Recuperación', bodyHtml, () => this.closeModal());
      const saveBtn = document.getElementById('modalSave');
      if (saveBtn) saveBtn.style.display = 'none';
    }

    openQRLightboxById(cacheId) {
      const entry = this._qrCache.get(cacheId);
      if (!entry) return;
      this.openQRLightbox(entry.dataUrl, entry.title);
    }

    openQRLightbox(dataUrl, title) {
      // Remover lightbox anterior si existe
      const prev = document.getElementById('qrLightboxOverlay');
      if (prev) prev.remove();

      const overlay = document.createElement('div');
      overlay.id = 'qrLightboxOverlay';
      overlay.className = 'qr-lightbox';
      overlay.innerHTML = `
        <div class="qr-lightbox-inner">
          <button class="qr-lightbox-close" title="Cerrar">✕</button>
          <div class="qr-lightbox-title">${this.esc(title)}</div>
          <img src="${dataUrl}" alt="Código QR ampliado">
          <p class="qr-lightbox-hint">📱 Escaneá con la cámara del celular</p>
        </div>
      `;

      // Cerrar al hacer click en el fondo o en el botón X
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('qr-lightbox-close')) {
          overlay.remove();
        }
      });

      // Cerrar con Escape
      const escHandler = (e) => {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
      };
      document.addEventListener('keydown', escHandler);

      document.body.appendChild(overlay);
    }

    async sendRecoveryEmail(assignmentId) {
      const a = await this.assignments.getById(assignmentId);
      if (!a) return;

      const [student, job, profile] = await Promise.all([
        this.students.getById(a.studentId),
        this.jobs.getById(a.jobId),
        this.db.get('settings', 'teacherProfile')
      ]);

      let promptText = a.practicalPrompt || job.description || '';
      let driveUrl = a.driveViewLink || job.driveUrl || '';

      if (job.type === 'Teórico') {
        // En TEÓRICO se utiliza el enlace a Google Drive (PDF)
        if (!driveUrl) {
          const enteredUrl = await AppDialog.prompt(
            `El trabajo teórico "${job.title}" aún no tiene cargado el enlace de Google Drive.\n\nIngresá el enlace de Google Drive para generar el QR y enviarlo por correo:`,
            '',
            'Enlace Google Drive (Teórico)'
          );
          if (!enteredUrl || !enteredUrl.trim()) return;
          driveUrl = enteredUrl.trim();
          await this.assignments.evaluate(assignmentId, {
            status: a.status,
            grade: a.grade,
            notes: a.notes,
            driveViewLink: driveUrl,
            practicalPrompt: a.practicalPrompt
          });
        }
      } else {
        // En PRÁCTICO se utiliza la consigna cargada dentro de la página
        if (!promptText) {
          const enteredPrompt = await AppDialog.prompt(
            `El trabajo práctico "${job.title}" no tiene consignas redactadas en la página todavía.\n\nEscribí la rutina o consigna física de recuperación:`,
            '',
            'Redactar consigna práctica'
          );
          if (!enteredPrompt || !enteredPrompt.trim()) return;
          promptText = enteredPrompt.trim();
          await this.assignments.evaluate(assignmentId, {
            status: a.status,
            grade: a.grade,
            notes: a.notes,
            practicalPrompt: promptText,
            driveViewLink: a.driveViewLink
          });
        }
      }

      if (!student.email) {
        const entered = await AppDialog.prompt(
          `El alumno ${student.last}, ${student.name} no tiene correo registrado.\nIngresá su correo electrónico:`,
          '',
          'Enviar consigna por correo'
        );
        if (!entered || !entered.trim()) return;
        student.email = entered.trim();
        await this.students.update(student.id, { email: student.email });
      }

      const res = EmailService.prepareMailtoLink({
        studentEmail: student.email,
        studentName: `${student.name}`,
        jobTitle: job.title,
        jobType: job.type,
        promptText: promptText,
        driveUrl: driveUrl,
        teacherName: profile?.teacherName || 'Prof. Pablo Oliva González'
      });

      if (!res.ready) return await AppDialog.alert(res.error, 'Aviso de correo');
      EmailService.openClient(res.url);
    }

    async sendAllPendingTheoreticalEmails(studentId) {
      const [student, assignments, jobs, profile] = await Promise.all([
        this.students.getById(studentId),
        this.assignments.getByStudentId(studentId),
        this.jobs.getAll(),
        this.db.get('settings', 'teacherProfile')
      ]);
      if (!student) return;

      const jobMap = new Map(jobs.map(j => [j.id, j]));
      const theoreticalOwed = assignments
        .map(a => ({ ...a, job: jobMap.get(a.jobId) }))
        .filter(a => a.job && a.job.type === 'Teórico' && (a.status === 'failed' || a.status === 'pending'));

      if (theoreticalOwed.length === 0) {
        return await AppDialog.alert('Este alumno no adeuda ningún trabajo práctico teórico.', 'Sin pendientes teóricos');
      }

      if (!student.email) {
        const entered = await AppDialog.prompt(
          `El alumno ${student.last}, ${student.name} no tiene correo registrado.\nIngresá su correo electrónico:`,
          '',
          'Enviar consignas teóricas por correo'
        );
        if (!entered || !entered.trim()) return;
        student.email = entered.trim();
        await this.students.update(student.id, { email: student.email });
      }

      const theoreticalJobsData = theoreticalOwed.map(a => ({
        title: a.job.title,
        promptText: a.practicalPrompt || a.job.description || '',
        driveUrl: a.driveViewLink || a.job.driveUrl || ''
      }));

      const res = EmailService.prepareConsolidatedTheoreticalMail({
        studentEmail: student.email,
        studentName: `${student.name}`,
        theoreticalJobs: theoreticalJobsData,
        teacherName: profile?.teacherName || 'Prof. Pablo Oliva González'
      });

      if (!res.ready) return await AppDialog.alert(res.error, 'Aviso de correo');
      EmailService.openClient(res.url);
    }

    // --- HISTORIAL ---
    async renderHistory() {
      const q = document.getElementById('historySearch')?.value || '';
      const historyList = await this.history.getDetailedHistory(q);
      const tbody = document.getElementById('historyBody');
      if (!tbody) return;

      if (historyList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty">Todavía no hay modificaciones registradas.</td></tr>`;
        return;
      }

      const stateLabels = { pending: 'Pendiente', approved: 'Aprobado', failed: 'Desaprobado' };
      tbody.innerHTML = historyList.map(h => {
        const dateFormatted = new Date(h.at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
        return `
          <tr>
            <td><small>${dateFormatted}</small></td>
            <td><b>${this.esc(h.student.last)}, ${this.esc(h.student.name)}</b></td>
            <td>${this.esc(h.job.title)}</td>
            <td>${stateLabels[h.from] || h.from} → <b>${stateLabels[h.to] || h.to}</b>${h.notes ? `<br><small class="muted">${this.esc(h.notes)}</small>` : ''}</td>
          </tr>
        `;
      }).join('');
    }

    // --- CONSULTA INDIVIDUAL ---
    async searchLookup() {
      const q = (document.getElementById('lookupSearch')?.value || '').toLowerCase().trim();
      const resultsContainer = document.getElementById('lookupResults');
      if (!resultsContainer) return;

      if (!q) {
        resultsContainer.innerHTML = '';
        return;
      }

      const students = await this.students.search({ query: q, filter: 'active' });
      const limited = students.slice(0, 8);

      if (limited.length === 0) {
        resultsContainer.innerHTML = '<p class="muted" style="padding:10px 0">No se encontraron alumnos activos coincidentes.</p>';
        return;
      }

      resultsContainer.innerHTML = limited.map(s => `
        <button class="secondary" style="display:block;width:100%;text-align:left;margin-top:7px;padding:12px 14px" onclick="GestorAcademico.app.showStudent('${s.id}')">
          <b>${this.esc(s.last)}, ${this.esc(s.name)}</b>
          ${s.email ? `<span class="muted" style="font-size:12px;margin-left:8px">(${this.esc(s.email)})</span>` : ''}
        </button>
      `).join('');
    }

    async showStudent(id) {
      this.selectedStudentId = id;
      // Limpiar cache de QR para liberar memoria de la vista anterior
      this._qrCache.clear();
      this._qrCacheCounter = 0;
      const [student, assignments, jobs] = await Promise.all([
        this.students.getById(id),
        this.assignments.getByStudentId(id),
        this.jobs.getAll()
      ]);

      if (!student) return;
      const jobMap = new Map(jobs.map(j => [j.id, j]));
      const studentAssignments = assignments.map(a => ({ ...a, job: jobMap.get(a.jobId) })).filter(a => a.job);

      // Ordenar estrictamente del TP 1 al TP 8
      studentAssignments.sort((a, b) => {
        const numA = (a.job.title.match(/TP\s*(\d+)/i) ? parseInt(a.job.title.match(/TP\s*(\d+)/i)[1], 10) : 999);
        const numB = (b.job.title.match(/TP\s*(\d+)/i) ? parseInt(b.job.title.match(/TP\s*(\d+)/i)[1], 10) : 999);
        if (numA !== numB) return numA - numB;
        return a.job.title.localeCompare(b.job.title, undefined, { numeric: true });
      });

      const counts = { approved: 0, pending: 0, failed: 0 };
      studentAssignments.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

      const total = counts.approved + counts.pending + counts.failed;
      const approvalPct = total ? Math.round((counts.approved / total) * 100) : 0;

      const resultsContainer = document.getElementById('lookupResults');
      if (resultsContainer) resultsContainer.innerHTML = '';

      const viewContainer = document.getElementById('studentView');
      if (!viewContainer) return;

      viewContainer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;margin-bottom:6px;flex-wrap:wrap;gap:8px">
          <button class="secondary rowbtn" onclick="GestorAcademico.app.navigate('students')">← Volver a lista de alumnos</button>
          <button class="secondary rowbtn" onclick="GestorAcademico.app.clearLookup()">Buscar otro alumno</button>
        </div>

        <div class="studenthero" style="margin-top:10px">
          <small style="color:var(--primary);letter-spacing:1px;font-weight:700">SITUACIÓN ACADÉMICA INDIVIDUAL</small>
          <h2>${this.esc(student.last)}, ${this.esc(student.name)}</h2>
          <span class="muted">${student.email || 'Sin correo registrado'}</span>
          ${student.notes ? `<p style="margin:8px 0 0;font-size:13px;color:#d0ccff">Observación: ${this.esc(student.notes)}</p>` : ''}
        </div>

        <div class="studentstats">
          <div class="card"><strong style="color:var(--primary)">${approvalPct}%</strong><small>Aprobación</small></div>
          <div class="card"><strong style="color:var(--green)">${counts.approved}</strong><small>Aprobados</small></div>
          <div class="card"><strong style="color:var(--amber)">${counts.pending}</strong><small>Pendientes</small></div>
          <div class="card"><strong style="color:var(--red)">${counts.failed}</strong><small>Desaprobados</small></div>
        </div>

        ${(() => {
          const owedTheoretical = studentAssignments.filter(a => a.job && a.job.type === 'Teórico' && (a.status === 'failed' || a.status === 'pending'));
          if (owedTheoretical.length === 0) return '';
          return `
            <div style="margin:16px 0;padding:14px 18px;background:rgba(255, 77, 79, 0.12);border:1px solid rgba(255, 77, 79, 0.35);border-radius:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
              <div>
                <b style="color:var(--red);font-size:14px">⚠️ Debe la parte teórica (${owedTheoretical.length} trabajo${owedTheoretical.length > 1 ? 's' : ''}):</b>
                <span style="color:#ffffff;font-size:13px;margin-left:6px">${owedTheoretical.map(t => this.esc(t.job.title)).join(', ')}</span>
                <p class="muted" style="margin:4px 0 0;font-size:12px">Podés enviarle las consignas por correo con un clic para su recuperación.</p>
              </div>
              <button type="button" class="primary rowbtn" style="background:#ff4d4f;border-color:#ff4d4f;color:#fff;padding:9px 16px;font-size:12.5px;box-shadow:0 0 15px rgba(255,77,79,0.3)" onclick="GestorAcademico.app.sendAllPendingTheoreticalEmails('${student.id}')">
                ✉️ Enviar consignas teóricas por mail
              </button>
            </div>
          `;
        })()}

        <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px">
          <h2 style="margin:0">Detalle de trabajos asignados (TP 1 al 8)</h2>
          <button class="secondary rowbtn" onclick="GestorAcademico.app.openAssignJobToStudentModal('${student.id}')">+ Asignar trabajo individual</button>
        </div>

        ${studentAssignments.map(a => {
          const isOverdue = a.status === 'pending' && this.jobs.isOverdue(a.job);
          const activeDriveUrl = a.driveViewLink || a.job.driveUrl || '';
          const qrContent = activeDriveUrl || a.practicalPrompt || '';
          const hasQr = !!qrContent;
          // Generar QR a alta resolución y guardarlo en cache con ID corto
          let qrDataUrl = null, qrCacheId = null;
          if (hasQr) {
            qrDataUrl = QRService.generateDataURL(qrContent, 400);
            qrCacheId = 'qr_' + (++this._qrCacheCounter);
            this._qrCache.set(qrCacheId, { dataUrl: qrDataUrl, title: a.job.title });
          }
          const qrJobTitle = this.esc(a.job.title);
          return `
            <div class="card" style="margin:10px 0;padding:16px">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                <div>
                  <b style="font-size:16px">${this.esc(a.job.title)}</b>
                  <span class="badge ${a.job.type === 'Práctico' ? 'neutral' : 'approved'}" style="margin-left:6px;font-size:10px">${this.esc(a.job.type)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  ${a.grade !== undefined && a.grade !== null 
                    ? `<span style="font-size:15px;font-weight:700;color:${a.grade >= 7 ? 'var(--green)' : 'var(--red)'}">Nota: ${a.grade}</span>` 
                    : ''}
                  ${this.getBadge(a.status)}
                  ${isOverdue ? '<span class="badge expired">Vencido</span>' : ''}
                </div>
              </div>

              ${a.job.description ? `<p class="muted" style="margin:7px 0;font-size:13px">${this.esc(a.job.description)}</p>` : ''}
              <small class="muted">Fecha límite: ${a.job.dueDate || 'Sin fecha'}</small>
              ${a.notes ? `<p style="margin:8px 0 0;font-size:13px;color:#f0f0ff"><b>Observación docente:</b> ${this.esc(a.notes)}</p>` : ''}

              ${hasQr ? `
                <div style="margin-top:14px;padding:12px 14px;background:#151622;border:1px solid rgba(109, 91, 255, 0.28);border-radius:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
                  <div style="display:flex;align-items:center;gap:14px">
                    <div style="background:#ffffff;padding:5px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.45);flex-shrink:0;cursor:pointer" title="Tocá para ampliar el QR" onclick="GestorAcademico.app.openQRLightboxById('${qrCacheId}')">
                      <img src="${qrDataUrl}" alt="Código QR" style="display:block;width:90px;height:90px;border-radius:4px;image-rendering:pixelated;pointer-events:none">
                    </div>
                    <div>
                      <b style="color:var(--text);font-size:13px">
                        ${a.job.type === 'Teórico' && (a.status === 'failed' || a.status === 'pending')
                          ? '⚠️ Recuperación Teórica (Debe el Teórico)'
                          : (a.status === 'failed' ? '⚠️ Material / Recuperación' : '📱 Acceso con Código QR')}
                      </b>
                      <p class="muted" style="margin:3px 0 0;font-size:11.5px">
                        ${a.job.type === 'Teórico' && (a.status === 'failed' || a.status === 'pending')
                          ? 'Material teórico de estudio y consignas. Escaneá con el celular o envialo por correo.'
                          : 'Escaneá este código con la cámara del celular para abrir el documento.'}
                      </p>
                      ${a.practicalPrompt && a.job.type === 'Práctico' ? `
                        <div style="margin-top:5px;font-size:12px;color:#f0eeff;background:rgba(255,255,255,0.04);padding:6px 10px;border-radius:6px">
                          <b>Consigna:</b> ${this.esc(a.practicalPrompt)}
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <div>
                    <button type="button" class="primary rowbtn" style="padding:8px 14px;font-size:12px;${a.status === 'failed' ? 'background:var(--red);border-color:var(--red);' : ''}" onclick="GestorAcademico.app.sendRecoveryEmail('${a.id}')">
                      ${a.job.type === 'Teórico' ? '✉️ Enviar enlace Drive por correo' : '✉️ Enviar consigna práctica por correo'}
                    </button>
                  </div>
                </div>
              ` : (a.status === 'failed' ? `
                <div class="notice warn" style="margin-top:12px;padding:10px 14px;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                  <span>⚠️ <b>Trabajo desaprobado:</b> Sin enlace de Drive o consigna cargada aún.</span>
                  <button class="secondary rowbtn" onclick="GestorAcademico.app.openEvaluationModal('${a.id}')">Cargar enlace Drive</button>
                </div>
              ` : '')}

              <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="secondary rowbtn" onclick="GestorAcademico.app.openEvaluationModal('${a.id}')">Calificar / Consigna</button>
                ${a.status === 'pending' ? `<button class="danger rowbtn" onclick="GestorAcademico.app.removeAssignmentFromStudent('${a.id}', '${student.id}')">Desasignar</button>` : ''}
              </div>
            </div>
          `;
        }).join('') || '<p class="empty">Este alumno todavía no tiene trabajos asignados.</p>'}

        <div style="margin-top:22px;display:flex;gap:10px">
          <button class="primary" onclick="GestorAcademico.app.clearLookup()">Finalizar consulta</button>
          <button class="secondary" onclick="GestorAcademico.app.openAssignJobToStudentModal('${student.id}')">+ Asignar otro trabajo</button>
        </div>
      `;
    }

    async openAssignJobToStudentModal(studentId) {
      const [student, unassignedJobs] = await Promise.all([
        this.students.getById(studentId),
        this.assignments.getUnassignedJobsForStudent(studentId)
      ]);
      if (!student) return;

      const sortedUnassigned = sortJobs(unassignedJobs);
      if (sortedUnassigned.length === 0) {
        await AppDialog.alert('Este alumno ya tiene asignados todos los trabajos prácticos activos disponibles.', 'Asignación individual');
        return;
      }

      const bodyHtml = `
        <p style="margin-bottom:14px">Asignar trabajo individual a <b>${this.esc(student.last)}, ${this.esc(student.name)}</b></p>
        <div class="field">
          <label>SELECCIONAR TRABAJO PRÁCTICO</label>
          <select id="singleAssignJobId">
            ${sortedUnassigned.map(j => `<option value="${j.id}">${this.esc(j.title)} (${this.esc(j.type)}) - Vence: ${j.dueDate || 'Sin fecha'}</option>`).join('')}
          </select>
        </div>
      `;

      this.showModal(`Asignación individual`, bodyHtml, async () => {
        const jobId = document.getElementById('singleAssignJobId')?.value;
        if (!jobId) return;
        await this.assignments.assignToStudent(studentId, jobId);
        this.closeModal();
        await this.showStudent(studentId);
        await this.renderDashboard();
      });
    }

    async removeAssignmentFromStudent(assignmentId, studentId) {
      const ok = await AppDialog.confirm('¿Deseás remover esta asignación de trabajo para el alumno?', 'Remover asignación');
      if (!ok) return;
      await this.assignments.deleteAssignment(assignmentId);
      await this.showStudent(studentId);
      await this.renderDashboard();
    }

    clearLookup() {
      this.selectedStudentId = null;
      const inp = document.getElementById('lookupSearch');
      if (inp) inp.value = '';
      const res = document.getElementById('lookupResults');
      if (res) res.innerHTML = '';
      const view = document.getElementById('studentView');
      if (view) view.innerHTML = '';
    }

    // --- COPIAS DE SEGURIDAD ---
    async renderBackupInfo() {
      const [students, jobs, assignments, history, backupSetting, freqSetting] = await Promise.all([
        this.students.getAll(),
        this.jobs.getAll(),
        this.assignments.getAll(),
        this.history.getAll(),
        this.db.get('settings', 'backupInfo'),
        this.db.get('settings', 'backupFrequency')
      ]);

      const infoEl = document.getElementById('backupInfo');
      if (infoEl) {
        infoEl.textContent = `${students.length} alumnos · ${jobs.length} trabajos · ${assignments.length} asignaciones · ${history.length} cambios · Última copia: ${backupSetting?.lastBackup || 'No registrada'}`;
      }

      const freqSel = document.getElementById('backupFreq');
      const freqDays = freqSetting?.days !== undefined ? freqSetting.days : 7;
      if (freqSel) freqSel.value = String(freqDays);

      const overdueNotice = document.getElementById('backupOverdueNotice');
      if (overdueNotice) {
        if (freqDays > 0) {
          const lastDateStr = backupSetting?.lastBackupTimestamp;
          if (!lastDateStr) {
            overdueNotice.classList.remove('hidden');
          } else {
            const diffDays = (Date.now() - new Date(lastDateStr).getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays > freqDays) {
              overdueNotice.classList.remove('hidden');
            } else {
              overdueNotice.classList.add('hidden');
            }
          }
        } else {
          overdueNotice.classList.add('hidden');
        }
      }
    }

    async handleSaveBackupFrequency() {
      const freqVal = parseInt(document.getElementById('backupFreq')?.value || '7', 10);
      await this.db.put('settings', { key: 'backupFrequency', days: freqVal });
      await this.renderBackupInfo();
    }

    async handleExportBackup() {
      try {
        await this.backup.exportBackup();
        await AppDialog.alert('Copia de seguridad generada y descargada exitosamente.', 'Copia de seguridad');
        await this.renderBackupInfo();
      } catch (err) {
        await AppDialog.alert('Error al exportar la copia: ' + err.message, 'Error de copia');
      }
    }

    async handleImportBackup() {
      const fileInput = document.getElementById('importFile');
      const file = fileInput?.files?.[0];
      if (!file) return await AppDialog.alert('Por favor, seleccioná un archivo JSON de respaldo.', 'Archivo requerido');
      const ok = await AppDialog.confirm('⚠️ ATENCIÓN: La restauración reemplazará todos los datos actuales con la información del archivo de respaldo. ¿Deseás continuar?', 'Restaurar datos');
      if (!ok) return;

      try {
        await this.backup.importBackupFile(file);
        await AppDialog.alert('Copia de seguridad restaurada correctamente.', 'Restauración completada');
        if (fileInput) fileInput.value = '';
        await this.loadInitialData();
      } catch (err) {
        await AppDialog.alert('Error en la restauración: ' + err.message, 'Error de restauración');
      }
    }

    // --- CONFIGURACIÓN ---
    async renderSettings() {
      const [profile, driveCfg] = await Promise.all([
        this.db.get('settings', 'teacherProfile'),
        this.fileHosting.getConfig()
      ]);
      const nameInp = document.getElementById('teacherName');
      const emailInp = document.getElementById('teacherEmail');
      const driveClientInp = document.getElementById('googleClientId');
      const drivePrivacySel = document.getElementById('googleDrivePrivacy');

      if (nameInp) nameInp.value = profile?.teacherName || '';
      if (emailInp) emailInp.value = profile?.teacherEmail || '';
      if (driveClientInp) driveClientInp.value = driveCfg?.clientId || '';
      if (drivePrivacySel) drivePrivacySel.value = driveCfg?.privacyDefault || 'anyoneWithLink';
    }

    async handleSaveSettings() {
      const teacherName = document.getElementById('teacherName')?.value.trim() || '';
      const teacherEmail = document.getElementById('teacherEmail')?.value.trim() || '';
      await this.db.put('settings', { key: 'teacherProfile', teacherName, teacherEmail });
      await this.renderTeacherWelcome();
      await AppDialog.alert('Configuración guardada correctamente.', 'Configuración');
    }

    async handleSaveDriveSettings() {
      const clientId = document.getElementById('googleClientId')?.value.trim();
      const privacyDefault = document.getElementById('googleDrivePrivacy')?.value;
      await this.fileHosting.saveConfig({ clientId, privacyDefault });
      await AppDialog.alert('Configuración de Google Drive guardada exitosamente.', 'Google Drive');
    }

    openChangePinModal() {
      const bodyHtml = `
        <div class="formgrid">
          <div class="field full"><label>PIN ACTUAL</label><input id="currentPin" type="password" inputmode="numeric" maxlength="8" placeholder="Ingresá tu PIN actual"></div>
          <div class="field full"><label>NUEVO PIN (4 A 8 DÍGITOS NUMÉRICOS)</label><input id="newPinVal" type="password" inputmode="numeric" maxlength="8" placeholder="Nuevo PIN"></div>
          <div class="field full"><label>REPETIR NUEVO PIN</label><input id="repeatPinVal" type="password" inputmode="numeric" maxlength="8" placeholder="Repetí el nuevo PIN"></div>
        </div>
      `;

      this.showModal('Cambiar PIN docente', bodyHtml, async () => {
        const currentPin = document.getElementById('currentPin')?.value.trim();
        const newPin = document.getElementById('newPinVal')?.value.trim();
        const repeatPin = document.getElementById('repeatPinVal')?.value.trim();

        try {
          await this.security.verifyPin(currentPin);
        } catch (err) {
          await AppDialog.alert('El PIN actual es incorrecto.', 'PIN incorrecto');
          return;
        }

        if (newPin !== repeatPin) return await AppDialog.alert('El nuevo PIN y su repetición no coinciden.', 'PIN no coincide');

        try {
          await this.security.setPin(newPin);
          this.closeModal();
          await AppDialog.alert('El PIN docente ha sido actualizado con cifrado seguro PBKDF2.', 'PIN actualizado');
        } catch (err) {
          await AppDialog.alert(err.message, 'Error al cambiar PIN');
        }
      });
    }

    // --- MODALES & HELPERS ---
    showModal(title, bodyHtml, onSaveFn) {
      const titleEl = document.getElementById('modalTitle');
      const bodyEl = document.getElementById('modalBody');
      const saveBtn = document.getElementById('modalSave');
      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.innerHTML = bodyHtml;
      if (saveBtn) {
        saveBtn.style.display = '';
        saveBtn.onclick = onSaveFn;
      }
      document.getElementById('modal')?.classList.add('show');
    }

    closeModal() {
      document.getElementById('modal')?.classList.remove('show');
    }

    getBadge(status) {
      const map = {
        approved: '<span class="badge approved">Aprobado</span>',
        pending: '<span class="badge pending">Pendiente</span>',
        failed: '<span class="badge failed">Desaprobado</span>'
      };
      return map[status] || `<span class="badge neutral">${this.esc(status)}</span>`;
    }

    // ==========================================
    // TOGGLE SIDEBAR
    // ==========================================
    toggleSidebar() {
      const app = document.getElementById('app');
      const openBtn = document.getElementById('sidebarOpenBtn');
      const toggleBtn = document.getElementById('sidebarToggle');
      const isCollapsed = app.classList.toggle('sidebar-collapsed');
      if (openBtn) openBtn.style.display = isCollapsed ? 'flex' : 'none';
      if (toggleBtn) toggleBtn.textContent = isCollapsed ? '›' : '‹';
    }

    // ==========================================
    // SEED DE DATOS INICIALES
    // ==========================================
    async seedInitialData() {
      try {
        const countStudents = await this.db.count('students');
        const countJobs = await this.db.count('jobs');
        if (countStudents > 0 || countJobs > 0) return; // ya tiene datos

        const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'x_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const now = new Date().toISOString();

        // --- TRABAJOS ---
        const jobsData = [
          { title: 'TP 1 - Entrenamiento', type: 'Práctico' },
          { title: 'TP 2 - Entrenamiento', type: 'Teórico' },
          { title: 'TP 3 - Voley',         type: 'Práctico' },
          { title: 'TP 4 - Voley',         type: 'Teórico' },
          { title: 'TP 5 - Handball',      type: 'Práctico' },
          { title: 'TP 6 - Handball',      type: 'Teórico' },
          { title: 'TP 7 - Basquet',       type: 'Práctico' },
          { title: 'TP 8 - Basquet',       type: 'Teórico' }
        ];

        const jobs = [];
        for (const j of jobsData) {
          const job = { id: uid(), title: j.title, type: j.type, description: '', dueDate: '', driveUrl: '', active: true, createdAt: now };
          await this.db.put('jobs', job);
          jobs.push(job);
        }

        // Alias cortos para los IDs de trabajos
        const [j1, j2, j3, j4, j5, j6, j7, j8] = jobs.map(j => j.id);

        // --- ALUMNOS Y NOTAS ---
        // Formato: [last, name, active, [n1,n2,n3,n4,n5,n6,n7,n8]]
        // null = sin nota (pending), número = nota (approved>=7, failed<7)
        const studentsData = [
          ['Acosta',              'Tiziana Janet',             true,  [7, 1,    7,    7,    null, 1,    null, null]],
          ['Aguirre',             'Wanda Belen',               true,  [7, 7,    7,    8,    null, 7,    null, 8   ]],
          ['Alerzia Onoren',      'Thiago',                    false, [null,null,null,null,null,null,null,null]],
          ['Ayunta',              'Thiago Nahuel',             true,  [4, 7,    7,    7,    null, 9,    null, 7   ]],
          ['Bazan Bustos',        'Alma Azul',                 true,  [7, 7,    7,    7,    null, 8,    null, 7   ]],
          ['Bravo',               'Bautista Alexander',        true,  [8, 7,    8,    4,    null, null, null, null]],
          ['Brondo',              'Francisco Lionel',          true,  [4, 8,    9,    7,    null, 8,    null, null]],
          ['Bulacio',             'Emiliano Adriel',           true,  [1, 1,    1,    1,    null, null, null, null]],
          ['Bustos',              'Valentina',                 true,  [9, 9,    9,    10,   null, 9,    null, 9   ]],
          ['Camaño',              'Hector Benjamin',           true,  [9, 8,    9,    8,    null, null, null, 8   ]],
          ['Carranza',            'Martina',                   false, [null,null,null,null,null,null,null,null]],
          ['Carrizo Sanchez',     'Diego Lautaro',             false, [null,null,null,null,null,null,null,null]],
          ['Cuttab',              'Brisa Ayelen',              true,  [5, 7,    4,    10,   null, 10,   null, null]],
          ['De La Mata',          'Gino',                      true,  [null,null,null,null,null,1,    null, null]],
          ['Decima',              'Jesus Ignacio',             true,  [null,null,7,    7,    null, 9,    null, null]],
          ['Dellavedova Chavez',  'Isaias Emanuel',            true,  [3, 9,    9,    8,    null, 9,    null, null]],
          ['Diaz',                'Maximiliano Leandro',       true,  [1, 3,    1,    1,    null, null, null, null]],
          ['Ferreyra',            'Maximiliano Alexis Radamel',true,  [3, 3,    1,    1,    null, null, null, null]],
          ['Funes',               'Estefano',                  true,  [1, 3,    1,    1,    null, null, null, null]],
          ['Guzman',              'Renzo Emiliano',            true,  [9, 8,    9,    7,    null, 8,    null, null]],
          ['Ledesma',             'Jazmin Candela',            false, [null,null,null,null,null,null,null,null]],
          ['Ledesma',             'Maximo Daniel',             true,  [1, 3,    8,    4,    null, null, null, null]],
          ['Lujan Colrat',        'Thiago Sebastian',          true,  [9, 10,   9,    7,    null, null, null, 10  ]],
          ['Luna Naretto',        'Joaquin',                   false, [null,null,null,null,null,null,null,null]],
          ['Malvar',              'Giuliana Valentina',        false, [null,null,null,null,null,null,null,null]],
          ['Malvar',              'Martin Maximiliano',        false, [null,null,null,null,null,null,null,null]],
          ['Martinez',            'Julian',                    false, [null,null,null,null,null,null,null,null]],
          ['Martinez',            'Thiago Elisandro',          false, [null,null,null,null,null,null,null,null]],
          ['Molina Sosa',         'Naira Azul',                true,  [7, 7,    8,    7,    null, null, null, 7   ]],
          ['Morante',             'Lautaro',                   false, [8, null, null, null, null, null, null, null]],
          ['Mosquera Pajares',    'Alexis Gabriel',            true,  [null,8,  7,    4,    null, 8,    null, null]],
          ['Niffeler',            'Miqueas Josue',             true,  [9, 10,   9,    9,    null, 9,    null, 7   ]],
          ['Ochoa Salazar',       'Thiago',                    false, [null,null,null,null,null,null,null,null]],
          ['Quiroga',             'Serena Abigail',            true,  [8, 9,    8,    8,    null, 7,    null, null]],
          ['Rodriguez',           'Roman',                     false, [8, null, null, null, null, null, null, null]],
          ['Ross',                'Mayco Leon',                true,  [8, 8,    8,    7,    null, null, null, null]],
          ['Saldis Galleguillo',  'Alma Guadalupe',            true,  [4, 7,    4,    7,    null, 7,    null, null]],
          ['Sanchez Almada',      'Karen Milagros',            true,  [7, 7,    8,    7,    null, 7,    null, 10  ]],
          ['Sanchez',             'Tomas Benjamin',            true,  [1, 4,    9,    1,    null, 8,    null, null]],
          ['Silva',               'Fabricio Leonel',           true,  [7, 8,    9,    10,   null, 8,    null, 9   ]],
          ['Toledo',              'Ezequiel Matias',           true,  [9, 7,    8,    10,   null, 9,    null, null]],
          ['Urbano Puebla',       'Brandon Ayrton',            true,  [9, 9,    8,    8,    null, 10,   null, 9   ]],
          ['Villega',             'Estefania Ximena',          false, [null,null,null,null,null,null,null,null]],
          ['Zalazar Fajardo',     'Lautaro Ezequiel',          true,  [1, 1,    1,    1,    null, null, null, null]]
        ];

        const jobIds = [j1, j2, j3, j4, j5, j6, j7, j8];

        for (const [last, name, active, grades] of studentsData) {
          const student = {
            id: uid(),
            last,
            name,
            email: '',
            notes: '',
            active,
            createdAt: now
          };
          await this.db.put('students', student);

          // Crear asignaciones con notas
          for (let i = 0; i < 8; i++) {
            const grade = grades[i];
            // Solo crear assignment si hay nota registrada O si el alumno está activo
            if (grade === null && !active) continue; // inactivo sin nota: no crear
            const status = grade === null ? 'pending' : (grade >= 7 ? 'approved' : 'failed');
            const assignment = {
              id: uid(),
              studentId: student.id,
              jobId: jobIds[i],
              status,
              grade: grade !== null ? grade : null,
              notes: '',
              evaluatedAt: grade !== null ? now : null,
              driveFileId: null,
              driveViewLink: null,
              pdfName: null,
              createdAt: now
            };
            await this.db.put('assignments', assignment);
          }
        }

        console.log('[Gestor] Datos iniciales cargados correctamente.');
      } catch (err) {
        console.error('[Gestor] Error al cargar datos iniciales:', err);
      }
    }

    esc(s = '') {
      return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }
  }

  // Exponer al objeto global GestorAcademico
  const app = new AppController();
  window.app = app;
  window.GestorAcademico = {
    app,
    DatabaseService,
    SecurityService,
    StudentService,
    JobService,
    AssignmentService,
    HistoryService,
    BackupService
  };

  // Auto-iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }

})(window);
