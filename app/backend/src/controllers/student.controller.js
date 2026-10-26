import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { studentService } from '../services/index.js';

const router = Router();

router.get('/students', auth, wrap(async (req, res) => res.json(await studentService.list(ctx(req)))));
router.get('/students/:id', auth, wrap(async (req, res) => res.json(await studentService.getById(ctx(req)))));
router.patch('/students/:id', auth, only('DISTRICT', 'SUPER_ADMIN'), wrap(async (req, res) => res.json(await studentService.update(ctx(req)))));
router.post('/students/:id/revert', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await studentService.revert(ctx(req)))));
router.post('/students/:id/revert-tc', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await studentService.revertTc(ctx(req)))));
router.post('/students/:id/revoke-admission', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await studentService.revokeAdmission(ctx(req)))));

export default router;
