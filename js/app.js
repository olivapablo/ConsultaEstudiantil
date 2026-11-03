/**
 * App Controller (Orquestador principal de UI y navegación)
 */

import { dbService } from './services/db.js';
import { securityService } from './services/security.js';
import { studentService } from './services/students.js';
import { jobService } from './services/jobs.js';
import { assignmentService } from './services/assignments.js';
import { historyService } from './services/history.js';
import { backupService } from './services/backup.js';

class AppController {
  constructor() {
    this.currentPage = 'dashboard';
    this.selectedStudentId = null;
    this.modalCallback = null;
  }

  async init() {
    // Configurar seguridad y detector de inactividad
    securityService.setLockCallback(() => this.showLockScreen());
    securityService.setupActivityListeners();

    // Inicializar IndexedDB (y migrar si corresponde)
    await dbService.init();

    // Comprobar estado del PIN docente
    const hasPin = await securityService.hasPin();
    if (!hasPin) {
      document.getElementById('login').classList.remove('hidden');
      document.getElementById('setupPin').classList.remove('hidden');
      document.getElementById('enterPin').classList.add('hidden');
    } else {
      document.getElementById('login').classList.remove('hidden');
      document.getElementById('setupPin').classList.add('hidden');
      document.getElementById('enterPin').classList.remove('hidden');
    }

    this.bindEvents();
  }

  bindEvents() {
    // Navegación en sidebar
    document.querySelectorAll('.nav').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page) this.navigate(page);
      });
    });

    // Enter en inputs de login
    document.getElementById('pinInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    document.getElementById('newPin')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleCreatePin();
    });
  }

  showLockScreen() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('setupPin').classList.add('hidden');
    document.getElementById('enterPin').classList.remove('hidden');
    const pinInp = document.getElementById('pinInput');
    if (pinInp) pinInp.value = '';
    const err = document.getElementById('loginError');
    if (err) err.textContent = 'Panel bloqueado por seguridad o inactividad.';
  }

  async handleCreatePin() {
    const pin = document.getElementById('newPin').value.trim();
    try {
      await securityService.setPin(pin);
      document.getElementById('login').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      securityService.isAuthenticated = true;
      securityService.resetInactivityTimer();
      await this.loadInitialData();
    } catch (err) {
      alert(err.message);
    }
  }

  async handleLogin() {
    const pin = document.getElementById('pinInput').value.trim();
    const errorEl = document.getElementById('loginError');
    const pinInput = document.getElementById('pinInput');

    const remainingSec = securityService.getLockoutRemaining();
    if (remainingSec > 0) {
      this.startLockoutCountdown(remainingSec);
      return;
    }

    try {
      await securityService.verifyPin(pin);
      errorEl.textContent = '';
      document.getElementById('login').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      await this.loadInitialData();
    } catch (err) {
      errorEl.textContent = err.message;
      const lockoutLeft = securityService.getLockoutRemaining();
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
        if (errorEl) errorEl.textContent = 'Ya podés volver a intentar ingresar tu PIN.';
      } else {
        if (errorEl) errorEl.textContent = `Panel bloqueado por seguridad. Esperá ${current} segundo(s)...`;
      }
    }, 1000);
  }

  logout() {
    securityService.lock();
  }

  async loadInitialData() {
    await this.renderTeacherWelcome();
    await this.renderCurrentView();
  }

  async renderTeacherWelcome() {
    const profile = await dbService.get('settings', 'teacherProfile');
    const teacherName = profile?.teacherName || 'Docente';
    const welcomeEl = document.getElementById('teacherWelcome');
    if (welcomeEl) welcomeEl.textContent = teacherName;
  }

  navigate(pageId) {
    this.currentPage = pageId;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageId);
    });

    const crumb = document.getElementById('currentSection');
    if (crumb) {
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
      crumb.textContent = titles[pageId] || pageId;
    }

    this.renderCurrentView();
  }

  async renderCurrentView() {
    switch (this.currentPage) {
      case 'dashboard':
        await this.renderDashboard();
        break;
      case 'students':
        await this.renderStudents();
        break;
      case 'jobs':
        await this.renderJobs();
        break;
      case 'evaluations':
        await this.renderEvaluations();
        break;
      case 'history':
        await this.renderHistory();
        break;
      case 'lookup':
        if (this.selectedStudentId) {
          await this.showStudent(this.selectedStudentId);
        }
        break;
      case 'backup':
        await this.renderBackupInfo();
        break;
      case 'settings':
        await this.renderSettings();
        break;
    }
  }

  // --- DASHBOARD ---
  async renderDashboard() {
    const [students, jobs, assignments] = await Promise.all([
      studentService.getAll(),
      jobService.getAll(),
      assignmentService.getAll()
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
      return jobService.isOverdue(job);
    }).length;

    const statsEl = document.getElementById('stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="card">
          <div class="staticon">♙</div>
          <div class="stat">${activeStudents}</div>
          <div class="statlabel">Alumnos activos</div>
        </div>
        <div class="card">
          <div class="staticon">▤</div>
          <div class="stat">${activeJobs}</div>
          <div class="statlabel">Trabajos creados</div>
        </div>
        <div class="card">
          <div class="staticon">◷</div>
          <div class="stat">${counts.pending}</div>
          <div class="statlabel">Pendientes (${overdueCount} vencidos)</div>
        </div>
        <div class="card">
          <div class="staticon">!</div>
          <div class="stat">${counts.failed}</div>
          <div class="statlabel">Desaprobados</div>
        </div>
      `;
    }

    const total = counts.approved + counts.pending + counts.failed;
    const pct = total ? Math.round((counts.approved / total) * 100) : 0;

    const overviewEl = document.getElementById('overview');
    if (overviewEl) {
      overviewEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span class="muted">Aprobación general</span>
          <b>${pct}%</b>
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
    const students = await studentService.search({ query: q, filter });
    const assignments = await assignmentService.getAll();

    const tbody = document.getElementById('studentsBody');
    if (!tbody) return;

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">No se encontraron alumnos con los criterios seleccionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = students.map(s => {
      const assignedCount = assignments.filter(a => a.studentId === s.id).length;
      return `
        <tr>
          <td><b>${this.esc(s.last)}, ${this.esc(s.name)}</b></td>
          <td>${this.esc(s.email || '—')}</td>
          <td>${assignedCount}</td>
          <td>${s.active ? '<span class="badge approved">Activo</span>' : '<span class="badge neutral">Inactivo</span>'}</td>
          <td>
            <button class="secondary rowbtn" onclick="app.openStudentModal('${s.id}')">Editar</button>
            <button class="secondary rowbtn" onclick="app.toggleStudentActive('${s.id}')">${s.active ? 'Desactivar' : 'Activar'}</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async openStudentModal(id = null) {
    const s = id ? await studentService.getById(id) : {};
    const title = id ? 'Editar alumno' : 'Agregar alumno';

    const bodyHtml = `
      <div class="formgrid">
        <div class="field">
          <label>NOMBRE</label>
          <input id="fName" value="${this.esc(s.name || '')}" placeholder="Ej. Juan">
        </div>
        <div class="field">
          <label>APELLIDO</label>
          <input id="fLast" value="${this.esc(s.last || '')}" placeholder="Ej. Pérez">
        </div>
        <div class="field full">
          <label>CORREO ELECTRÓNICO (OPCIONAL)</label>
          <input id="fEmail" type="email" value="${this.esc(s.email || '')}" placeholder="alumno@correo.com">
        </div>
        <div class="field full">
          <label>OBSERVACIONES</label>
          <textarea id="fNotes" rows="3" placeholder="Alergias, aptitud física, notas personales...">${this.esc(s.notes || '')}</textarea>
        </div>
      </div>
    `;

    this.showModal(title, bodyHtml, async () => {
      const name = document.getElementById('fName').value.trim();
      const last = document.getElementById('fLast').value.trim();
      const email = document.getElementById('fEmail').value.trim();
      const notes = document.getElementById('fNotes').value.trim();

      if (!name || !last) {
        alert('Nombre y apellido son campos obligatorios.');
        return;
      }

      if (id) {
        await studentService.update(id, { name, last, email, notes });
      } else {
        await studentService.create({ name, last, email, notes });
      }

      this.closeModal();
      await this.renderStudents();
      await this.renderDashboard();
    });
  }

  async toggleStudentActive(id) {
    await studentService.toggleActive(id);
    await this.renderStudents();
    await this.renderDashboard();
  }

  // --- TRABAJOS PRÁCTICOS ---
  async renderJobs() {
    const [jobs, assignments] = await Promise.all([
      jobService.getAll(),
      assignmentService.getAll()
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
            <b>${this.esc(j.title)}</b><br>
            <small>${this.esc(j.description || '')}</small>
          </td>
          <td>${this.esc(j.type)}</td>
          <td>${j.dueDate || '—'}</td>
          <td><span class="badge ${assignedCount > 0 ? 'approved' : 'neutral'}">${assignedCount} asignado(s)</span></td>
          <td>${j.active ? '<span class="badge approved">Activo</span>' : '<span class="badge neutral">Archivado</span>'}</td>
          <td>
            <button class="secondary rowbtn" onclick="app.openJobAssignmentsModal('${j.id}')">Asignaciones (${assignedCount})</button>
            <button class="secondary rowbtn" onclick="app.openJobModal('${j.id}')">Editar</button>
            <button class="secondary rowbtn" onclick="app.toggleJobActive('${j.id}')">${j.active ? 'Archivar' : 'Activar'}</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async openJobModal(id = null) {
    const j = id ? await jobService.getById(id) : {};
    const title = id ? 'Editar trabajo' : 'Nuevo trabajo práctico';

    const bodyHtml = `
      <div class="formgrid">
        <div class="field full">
          <label>TÍTULO</label>
          <input id="jTitle" value="${this.esc(j.title || '')}" placeholder="Ej. Reglamento de Vóley">
        </div>
        <div class="field full">
          <label>DESCRIPCIÓN</label>
          <textarea id="jDesc" rows="3" placeholder="Pautas, material de lectura o consignas...">${this.esc(j.description || '')}</textarea>
        </div>
        <div class="field">
          <label>TIPO</label>
          <select id="jType">
            <option value="Teórico" ${j.type === 'Teórico' ? 'selected' : ''}>Teórico</option>
            <option value="Práctico" ${j.type !== 'Teórico' ? 'selected' : ''}>Práctico</option>
          </select>
        </div>
        <div class="field">
          <label>FECHA LÍMITE</label>
          <input id="jDue" type="date" value="${j.dueDate || ''}">
        </div>
        ${!id ? `
        <div class="field full">
          <label>ASIGNACIÓN INICIAL</label>
          <select id="jAssign">
            <option value="all">Asignar a todos los alumnos activos</option>
            <option value="custom">Elegir alumnos / Excluir manualmente</option>
            <option value="none">Crear sin asignar</option>
          </select>
          <small class="muted">Podrás personalizar o excluir alumnos en cualquier momento con el botón Asignaciones.</small>
        </div>` : ''}
      </div>
    `;

    this.showModal(title, bodyHtml, async () => {
      const titleVal = document.getElementById('jTitle').value.trim();
      const descVal = document.getElementById('jDesc').value.trim();
      const typeVal = document.getElementById('jType').value;
      const dueVal = document.getElementById('jDue').value;

      if (!titleVal) {
        alert('El título del trabajo es obligatorio.');
        return;
      }

      if (id) {
        await jobService.update(id, { title: titleVal, description: descVal, type: typeVal, dueDate: dueVal });
        this.closeModal();
      } else {
        const createdJob = await jobService.create({ title: titleVal, description: descVal, type: typeVal, dueDate: dueVal });
        const assignMode = document.getElementById('jAssign')?.value;
        this.closeModal();

        if (assignMode === 'all') {
          await assignmentService.assignToAllActive(createdJob.id);
        } else if (assignMode === 'custom') {
          // Abrir inmediatamente modal de selección y exclusión
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
      jobService.getById(jobId),
      studentService.search({ query: '', filter: 'active' }),
      assignmentService.getByJobId(jobId)
    ]);

    if (!job) return;

    const assignedStudentIds = new Set(assignments.map(a => a.studentId));

    const bodyHtml = `
      <p style="margin-bottom:12px">
        <b>${this.esc(job.title)}</b> (${this.esc(job.type)})<br>
        <span class="muted">Marcá los alumnos asignados o desmarcá para excluirlos de este trabajo.</span>
      </p>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="muted" style="font-size:12px" id="jobAssignCounter">
          ${assignedStudentIds.size} de ${students.length} alumnos asignados
        </span>
        <div style="display:flex;gap:6px">
          <button type="button" class="secondary rowbtn" onclick="app.toggleAllJobCheckboxes(true)">Marcar todos</button>
          <button type="button" class="secondary rowbtn" onclick="app.toggleAllJobCheckboxes(false)">Desmarcar todos</button>
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

      await assignmentService.syncJobAssignments(jobId, selectedStudentIds);
      this.closeModal();
      await this.renderJobs();
      await this.renderDashboard();
    });
  }

  toggleAllJobCheckboxes(check) {
    document.querySelectorAll('.job-assign-cb').forEach(cb => {
      cb.checked = !!check;
    });
    const total = document.querySelectorAll('.job-assign-cb').length;
    const checked = check ? total : 0;
    const counter = document.getElementById('jobAssignCounter');
    if (counter) counter.textContent = `${checked} de ${total} alumnos asignados`;
  }

  async toggleJobActive(id) {
    await jobService.toggleActive(id);
    await this.renderJobs();
    await this.renderDashboard();
  }

  // --- EVALUACIONES ---
  async renderEvaluations() {
    const [jobs, assignments, students] = await Promise.all([
      jobService.getAll(),
      assignmentService.getAll(),
      studentService.getAll()
    ]);

    // Rellenar selector de trabajos
    const jobSelect = document.getElementById('evalJob');
    if (jobSelect) {
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
        if (searchVal) {
          const fullName = `${x.student.last} ${x.student.name}`.toLowerCase();
          if (!fullName.includes(searchVal)) return false;
        }
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
      const isOverdue = a.status === 'pending' && jobService.isOverdue(a.job);
      return `
        <tr>
          <td><b>${this.esc(a.student.last)}, ${this.esc(a.student.name)}</b></td>
          <td>${this.esc(a.job.title)}</td>
          <td>
            ${this.getBadge(a.status)}
            ${isOverdue ? ' <span class="badge expired">Vencido</span>' : ''}
          </td>
          <td>${a.job.dueDate || '—'}</td>
          <td>
            <button class="secondary rowbtn" onclick="app.openEvaluationModal('${a.id}')">Evaluar</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async openEvaluationModal(assignmentId) {
    const a = await assignmentService.getById(assignmentId);
    if (!a) return;

    const [student, job] = await Promise.all([
      studentService.getById(a.studentId),
      jobService.getById(a.jobId)
    ]);

    const title = 'Evaluar trabajo práctico';
    const bodyHtml = `
      <p style="margin-bottom:14px">
        <b>${this.esc(student.last)}, ${this.esc(student.name)}</b><br>
        <span class="muted">${this.esc(job.title)}</span>
      </p>
      <div class="field">
        <label>ESTADO ACADÉMICO</label>
        <select id="eStatus">
          <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>Pendiente</option>
          <option value="approved" ${a.status === 'approved' ? 'selected' : ''}>Aprobado</option>
          <option value="failed" ${a.status === 'failed' ? 'selected' : ''}>Desaprobado</option>
        </select>
      </div>
      <div class="field" style="margin-top:14px">
        <label>OBSERVACIONES DEL DOCENTE</label>
        <textarea id="eNotes" rows="3" placeholder="Comentarios de corrección o temas a reforzar...">${this.esc(a.notes || '')}</textarea>
      </div>
      <div class="notice">
        ℹ️ Los cambios de calificación se registran automáticamente en el historial de auditoría con fecha y hora.
      </div>
    `;

    this.showModal(title, bodyHtml, async () => {
      const status = document.getElementById('eStatus').value;
      const notes = document.getElementById('eNotes').value.trim();

      await assignmentService.evaluate(assignmentId, { status, notes });
      this.closeModal();
      await this.renderEvaluations();
      await this.renderDashboard();
      if (this.currentPage === 'lookup' && this.selectedStudentId) {
        await this.showStudent(this.selectedStudentId);
      }
    });
  }

  // --- HISTORIAL ---
  async renderHistory() {
    const q = document.getElementById('historySearch')?.value || '';
    const historyList = await historyService.getDetailedHistory(q);

    const tbody = document.getElementById('historyBody');
    if (!tbody) return;

    if (historyList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty">Todavía no hay modificaciones registradas.</td></tr>`;
      return;
    }

    const stateLabels = { pending: 'Pendiente', approved: 'Aprobado', failed: 'Desaprobado' };

    tbody.innerHTML = historyList.map(h => {
      const dateFormatted = new Date(h.at).toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      return `
        <tr>
          <td><small>${dateFormatted}</small></td>
          <td><b>${this.esc(h.student.last)}, ${this.esc(h.student.name)}</b></td>
          <td>${this.esc(h.job.title)}</td>
          <td>
            ${stateLabels[h.from] || h.from} → <b>${stateLabels[h.to] || h.to}</b>
            ${h.notes ? `<br><small class="muted">${this.esc(h.notes)}</small>` : ''}
          </td>
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

    const students = await studentService.search({ query: q, filter: 'active' });
    const limited = students.slice(0, 8);

    if (limited.length === 0) {
      resultsContainer.innerHTML = '<p class="muted" style="padding:10px 0">No se encontraron alumnos activos coincidentes.</p>';
      return;
    }

    resultsContainer.innerHTML = limited.map(s => `
      <button class="secondary" style="display:block;width:100%;text-align:left;margin-top:7px;padding:12px 14px" onclick="app.showStudent('${s.id}')">
        <b>${this.esc(s.last)}, ${this.esc(s.name)}</b>
        ${s.email ? `<span class="muted" style="font-size:12px;margin-left:8px">(${this.esc(s.email)})</span>` : ''}
      </button>
    `).join('');
  }

  async showStudent(id) {
    this.selectedStudentId = id;
    const [student, assignments, jobs] = await Promise.all([
      studentService.getById(id),
      assignmentService.getByStudentId(id),
      jobService.getAll()
    ]);

    if (!student) return;

    const jobMap = new Map(jobs.map(j => [j.id, j]));
    const studentAssignments = assignments
      .map(a => ({ ...a, job: jobMap.get(a.jobId) }))
      .filter(a => a.job);

    const counts = { approved: 0, pending: 0, failed: 0 };
    studentAssignments.forEach(a => {
      if (counts[a.status] !== undefined) counts[a.status]++;
    });

    const total = counts.approved + counts.pending + counts.failed;
    const approvalPct = total ? Math.round((counts.approved / total) * 100) : 0;

    // Ocultar buscador rápido para focalizarse en el alumno
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
        <div class="card">
          <strong style="color:var(--primary)">${approvalPct}%</strong>
          <small>Aprobación</small>
        </div>
        <div class="card">
          <strong style="color:var(--green)">${counts.approved}</strong>
          <small>Aprobados</small>
        </div>
        <div class="card">
          <strong style="color:var(--amber)">${counts.pending}</strong>
          <small>Pendientes</small>
        </div>
        <div class="card">
          <strong style="color:var(--red)">${counts.failed}</strong>
          <small>Desaprobados</small>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px">
        <h2 style="margin:0">Detalle de trabajos asignados</h2>
        <button class="secondary rowbtn" onclick="app.openAssignJobToStudentModal('${student.id}')">+ Asignar trabajo individual</button>
      </div>

      ${studentAssignments.map(a => {
        const isOverdue = a.status === 'pending' && jobService.isOverdue(a.job);
        return `
          <div class="card" style="margin:10px 0;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <b>${this.esc(a.job.title)}</b>
              <div>
                ${this.getBadge(a.status)}
                ${isOverdue ? ' <span class="badge expired">Vencido</span>' : ''}
              </div>
            </div>
            ${a.job.description ? `<p class="muted" style="margin:7px 0;font-size:13px">${this.esc(a.job.description)}</p>` : ''}
            <small class="muted">Fecha límite: ${a.job.dueDate || 'Sin fecha'} · Tipo: ${a.job.type}</small>
            ${a.notes ? `<p style="margin:8px 0 0;font-size:13px;color:#f0f0ff"><b>Observación docente:</b> ${this.esc(a.notes)}</p>` : ''}
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="secondary rowbtn" onclick="app.openEvaluationModal('${a.id}')">Calificar / Observación</button>
              ${a.status === 'pending' ? `<button class="danger rowbtn" onclick="app.removeAssignmentFromStudent('${a.id}', '${student.id}')">Desasignar</button>` : ''}
            </div>
            ${a.status === 'failed' ? `
              <div class="notice warn" style="margin:10px 0 0;padding:10px 12px;font-size:12px">
                📄 <b>Consigna de recuperación:</b> Preparación de PDF en Google Drive programada para la etapa de integración.
              </div>` : ''}
          </div>
        `;
      }).join('') || '<p class="empty">Este alumno todavía no tiene trabajos asignados.</p>'}

      <div style="margin-top:22px;display:flex;gap:10px">
        <button class="primary" onclick="app.clearLookup()">Finalizar consulta</button>
        <button class="secondary" onclick="app.openAssignJobToStudentModal('${student.id}')">+ Asignar otro trabajo</button>
      </div>
    `;
  }

  async openAssignJobToStudentModal(studentId) {
    const [student, unassignedJobs] = await Promise.all([
      studentService.getById(studentId),
      assignmentService.getUnassignedJobsForStudent(studentId)
    ]);

    if (!student) return;

    if (unassignedJobs.length === 0) {
      alert('Este alumno ya tiene asignados todos los trabajos prácticos activos disponibles.');
      return;
    }

    const bodyHtml = `
      <p style="margin-bottom:14px">
        Asignar trabajo individual a <b>${this.esc(student.last)}, ${this.esc(student.name)}</b>
      </p>
      <div class="field">
        <label>SELECCIONAR TRABAJO PRÁCTICO</label>
        <select id="singleAssignJobId">
          ${unassignedJobs.map(j => `
            <option value="${j.id}">${this.esc(j.title)} (${this.esc(j.type)}) - Vence: ${j.dueDate || 'Sin fecha'}</option>
          `).join('')}
        </select>
      </div>
    `;

    this.showModal(`Asignación individual`, bodyHtml, async () => {
      const jobId = document.getElementById('singleAssignJobId')?.value;
      if (!jobId) return;

      await assignmentService.assignToStudent(studentId, jobId);
      this.closeModal();
      await this.showStudent(studentId);
      await this.renderDashboard();
    });
  }

  async removeAssignmentFromStudent(assignmentId, studentId) {
    if (!confirm('¿Deseás remover esta asignación de trabajo para el alumno?')) return;
    await assignmentService.deleteAssignment(assignmentId);
    await this.showStudent(studentId);
    await this.renderDashboard();
  }
    `;
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
    const [students, jobs, assignments, history, backupSetting] = await Promise.all([
      studentService.getAll(),
      jobService.getAll(),
      assignmentService.getAll(),
      historyService.getAll(),
      dbService.get('settings', 'backupInfo')
    ]);

    const infoEl = document.getElementById('backupInfo');
    if (infoEl) {
      infoEl.textContent = `${students.length} alumnos · ${jobs.length} trabajos · ${assignments.length} asignaciones · ${history.length} cambios · Última copia: ${backupSetting?.lastBackup || 'No registrada'}`;
    }
  }

  async handleExportBackup() {
    try {
      const last = await backupService.exportBackup();
      alert('Copia de seguridad generada y descargada exitosamente.');
      await this.renderBackupInfo();
    } catch (err) {
      alert('Error al exportar la copia: ' + err.message);
    }
  }

  async handleImportBackup() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput?.files?.[0];
    if (!file) {
      alert('Por favor, seleccioná un archivo JSON de respaldo.');
      return;
    }

    if (!confirm('⚠️ ATENCIÓN: La restauración reemplazará todos los datos actuales con la información del archivo de respaldo. ¿Deseás continuar?')) {
      return;
    }

    try {
      await backupService.importBackupFile(file);
      alert('Copia de seguridad restaurada correctamente.');
      if (fileInput) fileInput.value = '';
      await this.loadInitialData();
    } catch (err) {
      alert('Error en la restauración: ' + err.message);
    }
  }

  // --- CONFIGURACIÓN ---
  async renderSettings() {
    const profile = await dbService.get('settings', 'teacherProfile');
    const nameInp = document.getElementById('teacherName');
    const emailInp = document.getElementById('teacherEmail');
    if (nameInp) nameInp.value = profile?.teacherName || '';
    if (emailInp) emailInp.value = profile?.teacherEmail || '';
  }

  async handleSaveSettings() {
    const teacherName = document.getElementById('teacherName')?.value.trim() || '';
    const teacherEmail = document.getElementById('teacherEmail')?.value.trim() || '';

    await dbService.put('settings', {
      key: 'teacherProfile',
      teacherName,
      teacherEmail
    });

    await this.renderTeacherWelcome();
    alert('Configuración guardada correctamente.');
  }

  openChangePinModal() {
    const bodyHtml = `
      <div class="formgrid">
        <div class="field full">
          <label>PIN ACTUAL</label>
          <input id="currentPin" type="password" inputmode="numeric" maxlength="8" placeholder="Ingresá tu PIN actual">
        </div>
        <div class="field full">
          <label>NUEVO PIN (4 A 8 DÍGITOS NUMÉRICOS)</label>
          <input id="newPinVal" type="password" inputmode="numeric" maxlength="8" placeholder="Nuevo PIN">
        </div>
        <div class="field full">
          <label>REPETIR NUEVO PIN</label>
          <input id="repeatPinVal" type="password" inputmode="numeric" maxlength="8" placeholder="Repetí el nuevo PIN">
        </div>
      </div>
    `;

    this.showModal('Cambiar PIN docente', bodyHtml, async () => {
      const currentPin = document.getElementById('currentPin').value.trim();
      const newPin = document.getElementById('newPinVal').value.trim();
      const repeatPin = document.getElementById('repeatPinVal').value.trim();

      try {
        await securityService.verifyPin(currentPin);
      } catch (err) {
        alert('El PIN actual es incorrecto.');
        return;
      }

      if (newPin !== repeatPin) {
        alert('El nuevo PIN y su repetición no coinciden.');
        return;
      }

      try {
        await securityService.setPin(newPin);
        this.closeModal();
        alert('El PIN docente ha sido actualizado con cifrado seguro PBKDF2.');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // --- MODALES & UTILIDADES ---
  showModal(title, bodyHtml, onSaveFn) {
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const saveBtn = document.getElementById('modalSave');

    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;

    if (saveBtn) {
      saveBtn.onclick = onSaveFn;
    }

    const modalBack = document.getElementById('modal');
    if (modalBack) modalBack.classList.add('show');
  }

  closeModal() {
    const modalBack = document.getElementById('modal');
    if (modalBack) modalBack.classList.remove('show');
  }

  getBadge(status) {
    const map = {
      approved: '<span class="badge approved">Aprobado</span>',
      pending: '<span class="badge pending">Pendiente</span>',
      failed: '<span class="badge failed">Desaprobado</span>'
    };
    return map[status] || `<span class="badge neutral">${this.esc(status)}</span>`;
  }

  esc(s = '') {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }
}

export const app = new AppController();
window.app = app; // Exponer a contexto global para bindings de HTML inline
