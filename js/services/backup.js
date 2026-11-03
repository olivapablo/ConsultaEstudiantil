/**
 * BackupService
 * Exportación, validación de esquemas y restauración de copias de seguridad.
 */

import { dbService } from './db.js';

class BackupService {
  /**
   * Genera y descarga el archivo JSON de respaldo
   */
  async exportBackup() {
    const payload = await dbService.exportAll();
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gestor-academico-backup-${dateStr}.json`;
    link.click();
    URL.revokeObjectURL(url);

    const lastBackup = new Date().toLocaleString('es-AR');
    await dbService.put('settings', {
      key: 'backupInfo',
      lastBackup
    });

    return lastBackup;
  }

  /**
   * Valida rigurosamente un objeto de respaldo antes de restaurarlo
   */
  validateBackup(obj) {
    if (!obj || typeof obj !== 'object') {
      return { valid: false, error: 'El archivo no contiene un JSON válido.' };
    }

    // Acepta formato v2 o formato prototipo v1
    const isV2 = obj.format === 'gestor-academico-backup-v2' && obj.data;
    const isV1 = obj.format === 'gestor-academico-backup-v1';

    if (!isV2 && !isV1) {
      return { valid: false, error: 'Formato de respaldo no reconocido o incompatible.' };
    }

    const payload = isV2 ? obj.data : obj;

    if (!Array.isArray(payload.students)) {
      return { valid: false, error: 'El archivo no contiene un padrón de alumnos válido.' };
    }
    if (!Array.isArray(payload.jobs)) {
      return { valid: false, error: 'El archivo no contiene una lista de trabajos válida.' };
    }
    if (!Array.isArray(payload.assignments)) {
      return { valid: false, error: 'El archivo no contiene la tabla de asignaciones.' };
    }

    return { valid: true, payload, version: isV2 ? 2 : 1 };
  }

  /**
   * Restaura la base de datos a partir del archivo seleccionado
   */
  async importBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const parsed = JSON.parse(reader.result);
          const validation = this.validateBackup(parsed);

          if (!validation.valid) {
            return reject(new Error(validation.error));
          }

          // Si es formato v1, normalizar para el importador
          let dataToImport = validation.payload;
          if (validation.version === 1) {
            dataToImport = {
              students: validation.payload.students || [],
              jobs: validation.payload.jobs || [],
              assignments: validation.payload.assignments || [],
              history: validation.payload.history || [],
              settings: [
                { key: 'teacherProfile', teacherName: validation.payload.settings?.teacherName || '', teacherEmail: validation.payload.settings?.teacherEmail || '' },
                { key: 'backupInfo', lastBackup: validation.payload.lastBackup || 'Restaurado desde v1' }
              ]
            };
            if (validation.payload.pinHash) {
              dataToImport.settings.push({
                key: 'security',
                pinHash: validation.payload.pinHash,
                algorithm: 'legacy-sha256'
              });
            }
          }

          await dbService.importAll({ data: dataToImport });
          resolve(true);
        } catch (err) {
          reject(new Error('No se pudo procesar el archivo: ' + err.message));
        }
      };

      reader.onerror = () => reject(new Error('Error de lectura del archivo.'));
      reader.readAsText(file);
    });
  }
}

export const backupService = new BackupService();
