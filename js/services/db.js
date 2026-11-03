/**
 * DatabaseService (IndexedDB + Migrador automático de LocalStorage)
 * Base de datos local: GestorAcademicoDB
 */

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
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Tienda de Alumnos
        if (!db.objectStoreNames.contains('students')) {
          const studentStore = db.createObjectStore('students', { keyPath: 'id' });
          studentStore.createIndex('active', 'active', { unique: false });
          studentStore.createIndex('last', 'last', { unique: false });
        }

        // Tienda de Trabajos Prácticos
        if (!db.objectStoreNames.contains('jobs')) {
          const jobStore = db.createObjectStore('jobs', { keyPath: 'id' });
          jobStore.createIndex('active', 'active', { unique: false });
          jobStore.createIndex('dueDate', 'dueDate', { unique: false });
        }

        // Tienda de Asignaciones
        if (!db.objectStoreNames.contains('assignments')) {
          const assignmentStore = db.createObjectStore('assignments', { keyPath: 'id' });
          assignmentStore.createIndex('studentId', 'studentId', { unique: false });
          assignmentStore.createIndex('jobId', 'jobId', { unique: false });
          assignmentStore.createIndex('status', 'status', { unique: false });
          assignmentStore.createIndex('student_job', ['studentId', 'jobId'], { unique: false });
        }

        // Tienda de Historial de cambios
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('assignmentId', 'assignmentId', { unique: false });
          historyStore.createIndex('at', 'at', { unique: false });
        }

        // Tienda de Ajustes y Configuración
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        try {
          await this._checkAndMigrateLegacyData();
          resolve(this.db);
        } catch (err) {
          console.error('Error durante la verificación de migración:', err);
          resolve(this.db);
        }
      };

      request.onerror = (event) => {
        console.error('Error al abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Migración segura y sin pérdida de datos desde LocalStorage hacia IndexedDB
   */
  async _checkAndMigrateLegacyData() {
    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!rawLegacy) return;

    // Verificar si IndexedDB ya tiene datos para no duplicar
    const studentsCount = await this.count('students');
    const jobsCount = await this.count('jobs');

    if (studentsCount > 0 || jobsCount > 0) {
      // Ya fue migrado previamente o ya contiene información
      return;
    }

    try {
      const legacyData = JSON.parse(rawLegacy);
      console.info('Iniciando migración automática de datos desde LocalStorage hacia IndexedDB...');

      // Respaldar copia intacta en localStorage por seguridad preventiva
      localStorage.setItem(LEGACY_BACKUP_KEY, rawLegacy);

      // Migrar Alumnos
      if (Array.isArray(legacyData.students) && legacyData.students.length > 0) {
        for (const s of legacyData.students) {
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

      // Migrar Trabajos
      if (Array.isArray(legacyData.jobs) && legacyData.jobs.length > 0) {
        for (const j of legacyData.jobs) {
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

      // Migrar Asignaciones
      if (Array.isArray(legacyData.assignments) && legacyData.assignments.length > 0) {
        for (const a of legacyData.assignments) {
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

      // Migrar Historial
      if (Array.isArray(legacyData.history) && legacyData.history.length > 0) {
        for (const h of legacyData.history) {
          await this.put('history', {
            id: h.id || crypto.randomUUID(),
            assignmentId: h.assignmentId,
            from: h.from || '',
            to: h.to || '',
            at: h.at || new Date().toISOString()
          });
        }
      }

      // Migrar Configuración y Seguridad
      if (legacyData.pinHash) {
        await this.put('settings', {
          key: 'security',
          pinHash: legacyData.pinHash,
          algorithm: 'legacy-sha256',
          migratedAt: new Date().toISOString()
        });
      }

      await this.put('settings', {
        key: 'teacherProfile',
        teacherName: legacyData.settings?.teacherName || '',
        teacherEmail: legacyData.settings?.teacherEmail || ''
      });

      if (legacyData.lastBackup) {
        await this.put('settings', {
          key: 'backupInfo',
          lastBackup: legacyData.lastBackup
        });
      }

      await this.put('settings', {
        key: 'migrationStatus',
        migrated: true,
        migratedAt: new Date().toISOString(),
        source: 'localStorage.gestorAcademico_v1'
      });

      console.info('Migración a IndexedDB completada exitosamente. Se preservó copia en localStorage.');
    } catch (e) {
      console.error('Error al procesar la migración de LocalStorage:', e);
    }
  }

  // Operaciones CRUD genéricas
  async getAll(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async get(storeName, key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, item) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName, key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async count(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  }

  async clearStore(storeName) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Vuelca toda la base de datos a un objeto exportable
   */
  async exportAll() {
    await this.init();
    const students = await this.getAll('students');
    const jobs = await this.getAll('jobs');
    const assignments = await this.getAll('assignments');
    const history = await this.getAll('history');
    const settings = await this.getAll('settings');

    return {
      format: 'gestor-academico-backup-v2',
      exportedAt: new Date().toISOString(),
      schemaVersion: 2,
      data: {
        students,
        jobs,
        assignments,
        history,
        settings
      }
    };
  }

  /**
   * Restaura datos desde un objeto verificado
   */
  async importAll(backupObj) {
    await this.init();
    const { students = [], jobs = [], assignments = [], history = [], settings = [] } = backupObj.data || backupObj;

    const tx = this.db.transaction(['students', 'jobs', 'assignments', 'history', 'settings'], 'readwrite');
    const sStore = tx.objectStore('students');
    const jStore = tx.objectStore('jobs');
    const aStore = tx.objectStore('assignments');
    const hStore = tx.objectStore('history');
    const setStore = tx.objectStore('settings');

    sStore.clear();
    jStore.clear();
    aStore.clear();
    hStore.clear();
    setStore.clear();

    students.forEach(s => sStore.put(s));
    jobs.forEach(j => jStore.put(j));
    assignments.forEach(a => aStore.put(a));
    history.forEach(h => hStore.put(h));
    settings.forEach(st => setStore.put(st));

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const dbService = new DatabaseService();
