import { Router } from 'express';
import { auth } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { exportService } from '../services/index.js';

const router = Router();
const sheet = (res, f) => {
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${f.filename}"` });
  res.send(f.buffer);
};

router.get('/export/master', auth, wrap(async (req, res) => sheet(res, await exportService.master(ctx(req)))));
router.get('/export/vacancies', auth, wrap(async (req, res) => sheet(res, await exportService.vacancies(ctx(req)))));

export default router;
