import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { seatService } from '../services/index.js';

const router = Router();

// Seat by seat: who each seat is reserved for. Read-only. (Not available to the state coordinator.)
router.get('/seats', auth, only('SUPER_ADMIN', 'REGION', 'DISTRICT'), wrap(async (req, res) => res.json(await seatService.list(ctx(req)))));

export default router;
