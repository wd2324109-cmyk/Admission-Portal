import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { authService } from '../services/index.js';

const router = Router();

router.post('/auth/login', wrap(async (req, res) => res.json(await authService.login(ctx(req)))));

router.post('/auth/logout', auth, wrap(async (req, res) => res.json(await authService.logout(ctx(req)))));

router.post('/auth/change-password', auth, wrap(async (req, res) => res.json(await authService.changePassword(ctx(req)))));

export default router;
