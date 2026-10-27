import { Router } from 'express';
import auth from './auth.controller.js';
import dashboard from './dashboard.controller.js';
import student from './student.controller.js';
import verification from './verification.controller.js';
import vacancy from './vacancy.controller.js';
import selection from './selection.controller.js';
import tc from './tc.controller.js';
import documents from './document.controller.js';
import exporter from './export.controller.js';
import importer from './import.controller.js';
import log from './log.controller.js';
import users from './user.controller.js';

const api = Router();
[auth, dashboard, student, verification, vacancy, selection, tc, importer, log, documents, exporter, users].forEach(r => api.use(r));
export default api;
