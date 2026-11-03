/**
 * HistoryService
 * Registro inmutable de cambios y modificaciones en evaluaciones académicas.
 */

import { dbService } from './db.js';

class HistoryService {
  async getAll() {
    return await dbService.getAll('history');
  }

  async logChange({ assignmentId, from, to, notes = '' }) {
    const entry = {
      id: crypto.randomUUID(),
      assignmentId,
      from: from || 'pending',
      to: to || 'pending',
      notes: notes || '',
      at: new Date().toISOString()
    };
    await dbService.put('history', entry);
    return entry;
  }

  async getDetailedHistory(query = '') {
    const [history, assignments, students, jobs] = await Promise.all([
      this.getAll(),
      dbService.getAll('assignments'),
      dbService.getAll('students'),
      dbService.getAll('jobs')
    ]);

    const studentMap = new Map(students.map(s => [s.id, s]));
    const jobMap = new Map(jobs.map(j => [j.id, j]));
    const assignmentMap = new Map(assignments.map(a => [a.id, a]));

    const q = query.toLowerCase().trim();

    return history
      .map(h => {
        const a = assignmentMap.get(h.assignmentId);
        const s = a ? studentMap.get(a.studentId) : null;
        const j = a ? jobMap.get(a.jobId) : null;
        return { ...h, assignment: a, student: s, job: j };
      })
      .filter(item => {
        if (!item.student || !item.job) return false;
        if (!q) return true;
        const searchTarget = `${item.student.last} ${item.student.name} ${item.job.title}`.toLowerCase();
        return searchTarget.includes(q);
      })
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }
}

export const historyService = new HistoryService();
