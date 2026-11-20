import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { seatService } from '../services/index.js';

const router = Router();

router.get('/seats', auth, only('SUPER_ADMIN', 'REGION', 'DISTRICT'), wrap(async (req, res) => res.json(await seatService.list(ctx(req)))));

export default router;
