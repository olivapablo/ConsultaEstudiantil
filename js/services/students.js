/**
 * StudentService
 * Manejo de alumnos: alta, edición, estado activo/inactivo, búsquedas y filtros.
 */

import { dbService } from './db.js';

class StudentService {
  async getAll() {
    return await dbService.getAll('students');
  }

  async getById(id) {
    return await dbService.get('students', id);
  }

  async create({ name, last, email = '', notes = '' }) {
    if (!name?.trim() || !last?.trim()) {
      throw new Error('El nombre y el apellido son obligatorios.');
    }
    const student = {
      id: crypto.randomUUID(),
      name: name.trim(),
      last: last.trim(),
      email: email.trim(),
      notes: notes.trim(),
      active: true,
      createdAt: new Date().toISOString()
    };
    await dbService.put('students', student);
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

    await dbService.put('students', student);
    return student;
  }

  async toggleActive(id) {
    const student = await this.getById(id);
    if (!student) throw new Error('Alumno no encontrado.');
    student.active = !student.active;
    await dbService.put('students', student);
    return student;
  }

  async search({ query = '', filter = 'active' }) {
    const all = await this.getAll();
    const q = query.toLowerCase().trim();

    return all.filter(s => {
      const matchesFilter = filter === 'all' || (filter === 'active' ? s.active : !s.active);
      const fullName = `${s.last} ${s.name} ${s.email || ''}`.toLowerCase();
      const matchesQuery = !q || fullName.includes(q);
      return matchesFilter && matchesQuery;
    }).sort((a, b) => (a.last + a.name).localeCompare(b.last + b.name));
  }
}

export const studentService = new StudentService();
