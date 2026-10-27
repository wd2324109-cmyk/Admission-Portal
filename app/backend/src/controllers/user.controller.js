import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { userService } from '../services/index.js';

const router = Router();

router.get('/users', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await userService.list(ctx(req)))));
router.post('/users/:id/freeze', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await userService.freeze(ctx(req)))));
router.post('/users/:id/unfreeze', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await userService.unfreeze(ctx(req)))));

export default router;
