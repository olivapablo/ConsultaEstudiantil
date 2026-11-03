/**
 * AssignmentService
 * Gestión de asignaciones de trabajos a alumnos, registro de evaluaciones,
 * soporte de exclusión en asignaciones masivas y metadatos de PDF/Drive.
 */

import { dbService } from './db.js';
import { historyService } from './history.js';

class AssignmentService {
  async getAll() {
    return await dbService.getAll('assignments');
  }

  async getById(id) {
    return await dbService.get('assignments', id);
  }

  async getByStudentId(studentId) {
    const all = await this.getAll();
    return all.filter(a => a.studentId === studentId);
  }

  async getByJobId(jobId) {
    const all = await this.getAll();
    return all.filter(a => a.jobId === jobId);
  }

  /**
   * Asignación individual de un trabajo a un alumno
   */
  async assignToStudent(studentId, jobId) {
    const all = await this.getAll();
    const existing = all.find(a => a.studentId === studentId && a.jobId === jobId);
    if (existing) {
      return existing; // Ya está asignado
    }

    const assignment = {
      id: crypto.randomUUID(),
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
    await dbService.put('assignments', assignment);
    return assignment;
  }

  /**
   * Asignación masiva a alumnos activos con lista opcional de IDs excluidos
   */
  async assignToAllActive(jobId, excludedStudentIds = []) {
    const students = await dbService.getAll('students');
    const activeStudents = students.filter(s => s.active && !excludedStudentIds.includes(s.id));
    const allAssignments = await this.getAll();

    const created = [];
    for (const student of activeStudents) {
      const alreadyAssigned = allAssignments.some(a => a.studentId === student.id && a.jobId === jobId);
      if (!alreadyAssigned) {
        const item = {
          id: crypto.randomUUID(),
          studentId: student.id,
          jobId,
          status: 'pending',
          notes: '',
          evaluatedAt: null,
          driveFileId: null,
          driveViewLink: null,
          pdfName: null,
          createdAt: new Date().toISOString()
        };
        await dbService.put('assignments', item);
        created.push(item);
      }
    }
    return created;
  }

  /**
   * Elimina una asignación si fue creada por error
   */
  async deleteAssignment(id) {
    return await dbService.delete('assignments', id);
  }

  /**
   * Obtiene los trabajos activos que aún NO fueron asignados a un alumno
   */
  async getUnassignedJobsForStudent(studentId) {
    const [jobs, assignments] = await Promise.all([
      dbService.getAll('jobs'),
      this.getByStudentId(studentId)
    ]);
    const assignedJobIds = new Set(assignments.map(a => a.jobId));
    return jobs.filter(j => j.active && !assignedJobIds.has(j.id));
  }

  /**
   * Sincroniza las asignaciones de un trabajo con una lista de alumnos seleccionados
   */
  async syncJobAssignments(jobId, targetStudentIds) {
    const existing = await this.getByJobId(jobId);
    const existingMap = new Map(existing.map(a => [a.studentId, a]));
    const targetSet = new Set(targetStudentIds);

    // Agregar nuevos
    for (const studentId of targetStudentIds) {
      if (!existingMap.has(studentId)) {
        await this.assignToStudent(studentId, jobId);
      }
    }

    // Opcionalmente desasignar a los que se desmarcaron (solo si están pendientes sin evaluar)
    for (const a of existing) {
      if (!targetSet.has(a.studentId) && a.status === 'pending' && !a.evaluatedAt) {
        await this.deleteAssignment(a.id);
      }
    }
  }

  /**
   * Actualiza el estado académico y observaciones de una evaluación
   */
  async evaluate(assignmentId, { status, notes = '', driveFileId = null, driveViewLink = null, pdfName = null }) {
    const assignment = await this.getById(assignmentId);
    if (!assignment) throw new Error('Asignación no encontrada.');

    const previousStatus = assignment.status;
    assignment.status = status;
    if (notes !== undefined) assignment.notes = notes.trim();
    assignment.evaluatedAt = new Date().toISOString();

    if (driveFileId !== null) assignment.driveFileId = driveFileId;
    if (driveViewLink !== null) assignment.driveViewLink = driveViewLink;
    if (pdfName !== null) assignment.pdfName = pdfName;

    await dbService.put('assignments', assignment);

    // Registrar en el historial si cambió el estado o se evaluó
    if (previousStatus !== status || notes) {
      await historyService.logChange({
        assignmentId,
        from: previousStatus,
        to: status,
        notes: notes || assignment.notes
      });
    }

    return assignment;
  }
}

export const assignmentService = new AssignmentService();
