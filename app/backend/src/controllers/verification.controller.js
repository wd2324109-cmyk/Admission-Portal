import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { verificationService } from '../services/index.js';

const router = Router();

router.get('/verification', auth, wrap(async (req, res) => res.json(await verificationService.list(ctx(req)))));
router.post('/students/:id/verify', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await verificationService.verify(ctx(req)))));

export default router;
