import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { userService, passwordResetService } from '../services/index.js';

const router = Router();

router.get('/users', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await userService.list(ctx(req)))));
router.post('/users/:id/freeze', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await userService.freeze(ctx(req)))));
router.post('/users/:id/unfreeze', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await userService.unfreeze(ctx(req)))));


router.get('/password-resets', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await passwordResetService.list(ctx(req)))));
router.post('/password-resets/:id/approve', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await passwordResetService.approve(ctx(req)))));
router.post('/password-resets/:id/reject', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await passwordResetService.reject(ctx(req)))));

export default router;
