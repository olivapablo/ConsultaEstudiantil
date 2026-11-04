/**
 * Gestor Académico - Core Bundle (Vanilla JS compatible con file:// y http://)
 * No requiere imports/exports para máxima portabilidad en tablets y PCs sin servidor.
 */

(function(window) {
  'use strict';

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
    async getAll() { return await this.db.getAll('jobs'); }
    async getById(id) { return await this.db.get('jobs', id); }

    async create({ title, description = '', type = 'Práctico', dueDate = '' }) {
      if (!title?.trim()) throw new Error('El título del trabajo es obligatorio.');
      const job = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        title: title.trim(),
        description: description.trim(),
        type: type === 'Teórico' ? 'Teórico' : 'Práctico',
        dueDate: dueDate || '',
        active: true,
        createdAt: new Date().toISOString()
      };
      await this.db.put('jobs', job);
      return job;
    }

    async update(id, { title, description, type, dueDate, active }) {
      const job = await this.getById(id);
      if (!job) throw new Error('Trabajo no encontrado.');
      if (title !== undefined) job.title = title.trim();
      if (description !== undefined) job.description = description.trim();
      if (type !== undefined) job.type = type === 'Teórico' ? 'Teórico' : 'Práctico';
      if (dueDate !== undefined) job.dueDate = dueDate;
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
      return jobs.filter(j => j.active && !assignedSet.has(j.id));
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
  // 8. QR SERVICE (Autónomo sin CDNs)
  // ==========================================
  class QRService {
    static generateDataURL(text, size = 260) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      const qr = this._createQRCode(text);
      const count = qr.getModuleCount();
      const padding = 18;
      const cellSize = (size - padding * 2) / count;

      ctx.fillStyle = '#10111a';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              Math.round(padding + c * cellSize),
              Math.round(padding + r * cellSize),
              Math.ceil(cellSize),
              Math.ceil(cellSize)
            );
          }
        }
      }
      return canvas.toDataURL('image/png');
    }

    static _createQRCode(text) {
      const typeNumber = text.length > 80 ? 6 : (text.length > 40 ? 4 : 2);
      const qr = {
        typeNumber,
        modules: null,
        moduleCount: 0,
        addData(data) { this.data = data; },
        isDark(row, col) { return this.modules[row][col]; },
        getModuleCount() { return this.moduleCount; },
        make() {
          this.moduleCount = this.typeNumber * 4 + 17;
          this.modules = new Array(this.moduleCount);
          for (let r = 0; r < this.moduleCount; r++) this.modules[r] = new Array(this.moduleCount).fill(null);
          this.setupPositionProbe(0, 0);
          this.setupPositionProbe(this.moduleCount - 7, 0);
          this.setupPositionProbe(0, this.moduleCount - 7);
          this.setupTiming();
          this.mapData(this.createData());
        },
        setupPositionProbe(row, col) {
          for (let r = -1; r <= 7; r++) {
            if (row + r < 0 || this.moduleCount <= row + r) continue;
            for (let c = -1; c <= 7; c++) {
              if (col + c < 0 || this.moduleCount <= col + c) continue;
              const isDark = (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
                             (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
                             (2 <= r && r <= 4 && 2 <= c && c <= 4);
              this.modules[row + r][col + c] = isDark;
            }
          }
        },
        setupTiming() {
          for (let r = 8; r < this.moduleCount - 8; r++) {
            if (this.modules[r][6] === null) this.modules[r][6] = (r % 2 === 0);
          }
          for (let c = 8; c < this.moduleCount - 8; c++) {
            if (this.modules[6][c] === null) this.modules[6][c] = (c % 2 === 0);
          }
        },
        createData() {
          const buffer = [4];
          const bytes = new TextEncoder().encode(this.data);
          buffer.push(bytes.length);
          for (let i = 0; i < bytes.length; i++) buffer.push(bytes[i]);
          return buffer;
        },
        mapData(data) {
          let inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
          for (let col = this.moduleCount - 1; col > 0; col -= 2) {
            if (col === 6) col--;
            while (true) {
              for (let c = 0; c < 2; c++) {
                if (this.modules[row][col - c] === null) {
                  let dark = false;
                  if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
                  const mask = ((row + (col - c)) % 2 === 0);
                  this.modules[row][col - c] = mask ? !dark : dark;
                  bitIndex--;
                  if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
                }
              }
              row += inc;
              if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
            }
          }
        }
      };
      qr.addData(text);
      qr.make();
      return qr;
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
    static prepareMailtoLink({ studentEmail, studentName, jobTitle, driveUrl, teacherName }) {
      if (!studentEmail || !studentEmail.trim()) {
        return { ready: false, error: 'El alumno no tiene correo registrado.' };
      }
      const subject = `Recuperación: ${jobTitle} - Educación Física`;
      const body = `Hola ${studentName},\n\nTe adjunto la consigna de recuperación correspondiente al trabajo práctico "${jobTitle}".\n\nPodés consultar el documento en Google Drive desde el siguiente enlace:\n${driveUrl}\n\nAnte cualquier duda podés consultarme durante las clases.\n\nSaludos,\n${teacherName || 'Docente'}`;
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
        alert('Ocurrió un error al cargar la aplicación local: ' + err.message);
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
        alert(err.message);
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
      const teacherName = profile?.teacherName || 'Docente';
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
          <tr>
            <td><b>${this.esc(s.last)}, ${this.esc(s.name)}</b></td>
            <td>${this.esc(s.email || '—')}</td>
            <td>${assignedCount}</td>
            <td>${s.active ? '<span class="badge approved">Activo</span>' : '<span class="badge neutral">Inactivo</span>'}</td>
            <td>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.openStudentModal('${s.id}')">Editar</button>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.toggleStudentActive('${s.id}')">${s.active ? 'Desactivar' : 'Activar'}</button>
            </td>
          </tr>
        `;
      }).join('');
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

        if (!name || !last) return alert('Nombre y apellido son campos obligatorios.');

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
        if (!raw) return alert('Por favor pegá al menos un alumno en la lista.');
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
        alert(`Se cargaron exitosamente ${count} alumnos como ${isActive ? 'Activos' : 'Inactivos'}.`);
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
            <td><b>${this.esc(j.title)}</b><br><small>${this.esc(j.description || '')}</small></td>
            <td>${this.esc(j.type)}</td>
            <td>${j.dueDate || '—'}</td>
            <td><span class="badge ${assignedCount > 0 ? 'approved' : 'neutral'}">${assignedCount} asignado(s)</span></td>
            <td>${j.active ? '<span class="badge approved">Activo</span>' : '<span class="badge neutral">Archivado</span>'}</td>
            <td>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.openJobAssignmentsModal('${j.id}')">Asignaciones (${assignedCount})</button>
              <button class="secondary rowbtn" onclick="GestorAcademico.app.openJobModal('${j.id}')">Editar</button>
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
      const title = id ? 'Editar trabajo' : 'Nuevo trabajo práctico / teórico';

      const bodyHtml = `
        <div class="notice" style="margin-bottom:14px;font-size:12px;line-height:1.5">
          💡 <b>Criterio de Cátedra:</b> Las notas impares (TP 1, TP 3, TP 5...) corresponden a la <b>parte práctica</b>, y las notas pares (TP 2, TP 4, TP 6...) a la <b>parte teórica</b>. Se aprueba con <b>7 o más</b>.
        </div>
        <div class="formgrid">
          <div class="field full"><label>TÍTULO DEL TRABAJO</label><input id="jTitle" value="${this.esc(defaultTitle || '')}" placeholder="Ej. TP 1 - Vóley"></div>
          <div class="field full"><label>DESCRIPCIÓN</label><textarea id="jDesc" rows="3" placeholder="Pautas, material de lectura o consignas...">${this.esc(j.description || '')}</textarea></div>
          <div class="field"><label>TIPO DE TRABAJO</label>
            <select id="jType">
              <option value="Práctico" ${(j.type || defaultType) === 'Práctico' ? 'selected' : ''}>Práctico (Nota impar)</option>
              <option value="Teórico" ${(j.type || defaultType) === 'Teórico' ? 'selected' : ''}>Teórico (Nota par)</option>
            </select>
          </div>
          <div class="field"><label>FECHA LÍMITE</label><input id="jDue" type="date" value="${j.dueDate || ''}"></div>
          ${!id ? `
          <div class="field full">
            <label>ASIGNACIÓN INICIAL</label>
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

        if (!titleVal) return alert('El título del trabajo es obligatorio.');

        if (id) {
          await this.jobs.update(id, { title: titleVal, description: descVal, type: typeVal, dueDate: dueVal });
          this.closeModal();
        } else {
          const createdJob = await this.jobs.create({ title: titleVal, description: descVal, type: typeVal, dueDate: dueVal });
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

        <!-- SECCIÓN DE RECUPERACIÓN AUTOMÁTICA AL DESAPROBAR -->
        <div id="recoveryPanel" style="display:${a.status === 'failed' ? 'block' : 'none'};margin-top:16px;border:1px solid #4a2838;background:#17121b;border-radius:14px;padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label style="color:#f2aab7;font-size:12px;margin:0">
              ${isPractical ? '📋 Formulario de Consigna Práctica para Recuperación' : '📄 Material Teórico de Recuperación'}
            </label>
            <a href="https://drive.google.com/" target="_blank" class="secondary rowbtn" style="text-decoration:none;font-size:11px">
              Abrir mi Drive ↗
            </a>
          </div>

          <p class="muted" style="font-size:12px;margin:0 0 12px">
            ${isPractical 
              ? 'Al ser una evaluación práctica desaprobada, redactá aquí los ejercicios, circuito o test que el alumno debe realizar.' 
              : 'Al ser una evaluación teórica desaprobada, pegá el enlace del PDF en Google Drive con la consigna o cuestionario.'}
          </p>

          ${isPractical ? `
            <div class="field">
              <label>CONSIGNA O RUTINA PRÁCTICA DE RECUPERACIÓN</label>
              <textarea id="ePracticalPrompt" rows="4" placeholder="Ejemplo: Realizar circuito de 3 series: 10 flexiones de brazos, 15 sentadillas, salto en largo y registro de tiempo en test de resistencia.">${this.esc(a.practicalPrompt || '')}</textarea>
            </div>
            <div class="field" style="margin-top:10px">
              <label>ENLACE COMPARTIDO DE GOOGLE DRIVE (OPCIONAL, EJ. VIDEO DEMOSTRATIVO)</label>
              <input id="eDriveUrl" value="${this.esc(a.driveViewLink || '')}" placeholder="https://drive.google.com/file/d/... (opcional)">
            </div>
          ` : `
            <div class="field">
              <label>ENLACE COMPARTIDO DEL PDF EN GOOGLE DRIVE</label>
              <input id="eDriveUrl" value="${this.esc(a.driveViewLink || '')}" placeholder="https://drive.google.com/file/d/.../view">
            </div>
            <div class="field" style="margin-top:10px">
              <label>CONSIGNA O PAUTAS TEÓRICAS PUNTUALES</label>
              <textarea id="ePracticalPrompt" rows="3" placeholder="Puntos específicos a responder o reforzar...">${this.esc(a.practicalPrompt || '')}</textarea>
            </div>
          `}

          <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="secondary rowbtn" onclick="GestorAcademico.app.previewCurrentQR('${this.esc(job.title)}', '${this.esc(student.name)}')">📱 Ver Código QR</button>
            <button type="button" class="secondary rowbtn" onclick="GestorAcademico.app.sendRecoveryEmail('${a.id}')">✉️ Preparar Correo</button>
          </div>
        </div>

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
      if (!file) return alert('Por favor seleccioná un archivo PDF local primero.');
      if (msg) msg.textContent = 'Subiendo archivo a Google Drive...';

      try {
        const uploaded = await this.fileHosting.uploadPDF(file);
        const driveInp = document.getElementById('eDriveUrl');
        if (driveInp) driveInp.value = uploaded.viewLink;
        if (msg) msg.textContent = `✓ Subido exitosamente: "${uploaded.fileName}"`;
        alert('Archivo PDF subido exitosamente a Google Drive.');
      } catch (err) {
        if (msg) msg.textContent = 'Error: ' + err.message;
        alert('Error al subir a Google Drive: ' + err.message);
      }
    }

    previewCurrentQR(jobTitle, studentName) {
      const url = document.getElementById('eDriveUrl')?.value.trim();
      const prompt = document.getElementById('ePracticalPrompt')?.value.trim();
      const content = url || prompt;
      if (!content) {
        alert('Por favor ingresá un enlace de Google Drive o redactá la consigna de recuperación.');
        return;
      }
      this.showQRModal(content, jobTitle, studentName);
    }

    showQRModal(content, jobTitle, studentName) {
      if (!content) return alert('No hay un enlace ni consigna registrada para generar el código QR.');
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

    async sendRecoveryEmail(assignmentId) {
      const a = await this.assignments.getById(assignmentId);
      if (!a) return;

      const [student, job, profile] = await Promise.all([
        this.students.getById(a.studentId),
        this.jobs.getById(a.jobId),
        this.db.get('settings', 'teacherProfile')
      ]);

      const recoveryContent = a.driveViewLink || a.practicalPrompt;
      if (!recoveryContent) return alert('Este trabajo no tiene consigna ni enlace de recuperación cargado.');

      if (!student.email) {
        const entered = prompt(`El alumno ${student.last}, ${student.name} no tiene correo registrado.\nIngresá su correo electrónico:`);
        if (!entered || !entered.trim()) return;
        student.email = entered.trim();
        await this.students.update(student.id, { email: student.email });
      }

      const driveUrlOrPrompt = a.driveViewLink 
        ? a.driveViewLink 
        : `Consigna de recuperación práctica:\n${a.practicalPrompt}`;

      const res = EmailService.prepareMailtoLink({
        studentEmail: student.email,
        studentName: `${student.name} ${student.last}`,
        jobTitle: job.title,
        driveUrl: driveUrlOrPrompt,
        teacherName: profile?.teacherName || 'Docente de Educación Física'
      });

      if (!res.ready) return alert(res.error);
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
      const [student, assignments, jobs] = await Promise.all([
        this.students.getById(id),
        this.assignments.getByStudentId(id),
        this.jobs.getAll()
      ]);

      if (!student) return;
      const jobMap = new Map(jobs.map(j => [j.id, j]));
      const studentAssignments = assignments.map(a => ({ ...a, job: jobMap.get(a.jobId) })).filter(a => a.job);

      const counts = { approved: 0, pending: 0, failed: 0 };
      studentAssignments.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

      const total = counts.approved + counts.pending + counts.failed;
      const approvalPct = total ? Math.round((counts.approved / total) * 100) : 0;

      const resultsContainer = document.getElementById('lookupResults');
      if (resultsContainer) resultsContainer.innerHTML = '';

      const viewContainer = document.getElementById('studentView');
      if (!viewContainer) return;

      viewContainer.innerHTML = `
        <div class="studenthero" style="margin-top:16px">
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

        <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px">
          <h2 style="margin:0">Detalle de trabajos asignados</h2>
          <button class="secondary rowbtn" onclick="GestorAcademico.app.openAssignJobToStudentModal('${student.id}')">+ Asignar trabajo individual</button>
        </div>

        ${studentAssignments.map(a => {
          const isOverdue = a.status === 'pending' && this.jobs.isOverdue(a.job);
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

              <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="secondary rowbtn" onclick="GestorAcademico.app.openEvaluationModal('${a.id}')">Calificar / Consigna</button>
                ${a.status === 'pending' ? `<button class="danger rowbtn" onclick="GestorAcademico.app.removeAssignmentFromStudent('${a.id}', '${student.id}')">Desasignar</button>` : ''}
              </div>

              ${a.status === 'failed' ? `
                <div class="notice warn" style="margin:12px 0 0;padding:14px;border-radius:12px;border:1px solid #654e26">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
                    <div style="flex:1;min-width:240px">
                      <b style="color:#e8b86d">
                        ${a.job.type === 'Práctico' ? '📋 Recuperación Práctica Asignada:' : '📄 Recuperación Teórica (Drive):'}
                      </b>
                      ${a.practicalPrompt ? `
                        <div style="background:#1e1822;padding:9px 12px;border-radius:8px;margin:6px 0;font-size:13px;color:#f5f3ff;border-left:3px solid var(--amber)">
                          ${this.esc(a.practicalPrompt)}
                        </div>
                      ` : ''}
                      ${a.driveViewLink ? `
                        <div style="font-size:12px;margin-top:4px">
                          <a href="${a.driveViewLink}" target="_blank" style="color:var(--primary);text-decoration:underline">Abrir archivo de consigna en Google Drive ↗</a>
                        </div>
                      ` : (!a.practicalPrompt ? '<div style="font-size:12px;color:var(--muted);margin-top:3px">Sin consigna redactada todavía. Hacé clic en "Calificar / Consigna".</div>' : '')}
                    </div>

                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      ${(a.driveViewLink || a.practicalPrompt) ? `
                        <button class="primary rowbtn" onclick="GestorAcademico.app.showQRModal('${this.esc(a.driveViewLink || a.practicalPrompt)}', '${this.esc(a.job.title)}', '${this.esc(student.name)}')">📱 Ver QR</button>
                        <button class="secondary rowbtn" onclick="GestorAcademico.app.sendRecoveryEmail('${a.id}')">✉️ Correo</button>
                      ` : ''}
                    </div>
                  </div>
                </div>` : ''}
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

      if (unassignedJobs.length === 0) {
        alert('Este alumno ya tiene asignados todos los trabajos prácticos activos disponibles.');
        return;
      }

      const bodyHtml = `
        <p style="margin-bottom:14px">Asignar trabajo individual a <b>${this.esc(student.last)}, ${this.esc(student.name)}</b></p>
        <div class="field">
          <label>SELECCIONAR TRABAJO PRÁCTICO</label>
          <select id="singleAssignJobId">
            ${unassignedJobs.map(j => `<option value="${j.id}">${this.esc(j.title)} (${this.esc(j.type)}) - Vence: ${j.dueDate || 'Sin fecha'}</option>`).join('')}
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
      if (!confirm('¿Deseás remover esta asignación de trabajo para el alumno?')) return;
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
        alert('Copia de seguridad generada y descargada exitosamente.');
        await this.renderBackupInfo();
      } catch (err) {
        alert('Error al exportar la copia: ' + err.message);
      }
    }

    async handleImportBackup() {
      const fileInput = document.getElementById('importFile');
      const file = fileInput?.files?.[0];
      if (!file) return alert('Por favor, seleccioná un archivo JSON de respaldo.');
      if (!confirm('⚠️ ATENCIÓN: La restauración reemplazará todos los datos actuales con la información del archivo de respaldo. ¿Deseás continuar?')) return;

      try {
        await this.backup.importBackupFile(file);
        alert('Copia de seguridad restaurada correctamente.');
        if (fileInput) fileInput.value = '';
        await this.loadInitialData();
      } catch (err) {
        alert('Error en la restauración: ' + err.message);
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
      alert('Configuración guardada correctamente.');
    }

    async handleSaveDriveSettings() {
      const clientId = document.getElementById('googleClientId')?.value.trim();
      const privacyDefault = document.getElementById('googleDrivePrivacy')?.value;
      await this.fileHosting.saveConfig({ clientId, privacyDefault });
      alert('Configuración de Google Drive guardada exitosamente.');
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
          alert('El PIN actual es incorrecto.');
          return;
        }

        if (newPin !== repeatPin) return alert('El nuevo PIN y su repetición no coinciden.');

        try {
          await this.security.setPin(newPin);
          this.closeModal();
          alert('El PIN docente ha sido actualizado con cifrado seguro PBKDF2.');
        } catch (err) {
          alert(err.message);
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
          const job = { id: uid(), title: j.title, type: j.type, description: '', dueDate: '', active: true, createdAt: now };
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
