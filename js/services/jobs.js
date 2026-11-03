/**
 * JobService
 * Manejo de trabajos prácticos y teóricos, fechas límite y estado de archivado.
 */

import { dbService } from './db.js';

class JobService {
  async getAll() {
    return await dbService.getAll('jobs');
  }

  async getById(id) {
    return await dbService.get('jobs', id);
  }

  async create({ title, description = '', type = 'Práctico', dueDate = '' }) {
    if (!title?.trim()) {
      throw new Error('El título del trabajo es obligatorio.');
    }
    const job = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      type: type === 'Teórico' ? 'Teórico' : 'Práctico',
      dueDate: dueDate || '',
      active: true,
      createdAt: new Date().toISOString()
    };
    await dbService.put('jobs', job);
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

    await dbService.put('jobs', job);
    return job;
  }

  async toggleActive(id) {
    const job = await this.getById(id);
    if (!job) throw new Error('Trabajo no encontrado.');
    job.active = !job.active;
    await dbService.put('jobs', job);
    return job;
  }

  isOverdue(job) {
    if (!job || !job.dueDate) return false;
    const today = new Date().toISOString().slice(0, 10);
    return job.dueDate < today;
  }
}

export const jobService = new JobService();
