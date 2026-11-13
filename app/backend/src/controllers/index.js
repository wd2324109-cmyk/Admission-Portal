import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { studentService } from '../services/student.service.js';
import { listService } from '../services/list.service.js';
import { vacancyService } from '../services/vacancy.service.js';
import { importService } from '../services/import.service.js';
import { dashboardService } from '../services/dashboard.service.js';
import { tcService } from '../services/tc.service.js';
import { logService } from '../services/log.service.js';
import { exportService } from '../services/export.service.js';

const api = Router(), ADMIN = only('SUPER_ADMIN'), NOT_DMS = only('SUPER_ADMIN', 'STATE', 'REGION');   // the DMS (DISTRICT) sees Dashboard, Student Details and TC Requests only
const json = fn => wrap(async (req, res) => res.json(await fn(ctx(req))));
const sheet = fn => wrap(async (req, res) => { const f = await fn(ctx(req)); res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${f.filename}"` }); res.send(f.buffer); });

api.post('/auth/login', json(authService.login));
api.post('/auth/logout', auth, json(authService.logout));
api.get('/auth/session', auth, json(authService.session));
api.post('/auth/change-password', auth, json(authService.changePassword));

api.get('/dashboard', auth, json(dashboardService.summary));
api.get('/students', auth, json(studentService.list));
api.get('/students/:cls/:id', auth, json(studentService.getById));
api.post('/students/:cls/:id/action', auth, json(studentService.act));                  // who may do which step is decided by workflow/transitions.js
api.post('/students/:cls/:id/override', auth, ADMIN, json(studentService.override));

api.get('/vacancies', auth, NOT_DMS, json(vacancyService.cells));
api.get('/seats', auth, NOT_DMS, json(vacancyService.seats));
api.get('/tc', auth, json(tcService.list));

api.post('/rank/generate', auth, ADMIN, json(listService.rank));
api.post('/lists/generate', auth, ADMIN, json(listService.generate));

api.post('/import/students', auth, ADMIN, json(importService.students));
api.post('/import/vacancies', auth, ADMIN, json(importService.vacancies));

api.get('/logs/students', auth, ADMIN, json(logService.students));
api.get('/logs/vacancies', auth, ADMIN, json(logService.vacancies));
api.get('/export/master', auth, sheet(exportService.master));
api.get('/export/vacancies', auth, NOT_DMS, sheet(exportService.vacancies));

api.get('/users', auth, ADMIN, json(userService.list));
api.post('/users', auth, ADMIN, json(userService.create));
api.post('/users/:id/reset-password', auth, ADMIN, json(userService.resetPassword));
api.put('/users/:id/access', auth, ADMIN, json(userService.setAccess));
export default api;
