import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { selectionService } from '../services/index.js';

const router = Router();

router.post('/selection/run', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await selectionService.run(ctx(req)))));

export default router;
