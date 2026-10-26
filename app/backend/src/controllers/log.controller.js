import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { logService } from '../services/index.js';

const router = Router();

router.get('/logs', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await logService.list(ctx(req)))));
router.post('/logs/:id/revoke', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await logService.revoke(ctx(req)))));

export default router;
