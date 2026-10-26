import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { dashboardService } from '../services/index.js';

const router = Router();

router.get('/dashboard', auth, wrap(async (req, res) => res.json(await dashboardService.summary(ctx(req)))));

export default router;
