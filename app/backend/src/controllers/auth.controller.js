import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { authService, passwordResetService } from '../services/index.js';
import { TEST_RESET } from '../common/testReset.js';

const router = Router();

router.post('/auth/login', wrap(async (req, res) => res.json(await authService.login(ctx(req)))));

router.post('/auth/logout', auth, wrap(async (req, res) => res.json(await authService.logout(ctx(req)))));

router.get('/auth/session', auth, wrap(async (req, res) => res.json(await authService.session(ctx(req)))));

router.post('/auth/change-password', auth, wrap(async (req, res) => res.json(await authService.changePassword(ctx(req)))));

// Forgot password: the user asks, a super admin approves and hands over a one-time code, the user sets a new password with it.
router.post('/auth/password-reset/request', wrap(async (req, res) => res.json(await passwordResetService.request(ctx(req)))));
router.post('/auth/password-reset/complete', wrap(async (req, res) => res.json(await passwordResetService.complete(ctx(req)))));

// Test-only forgot password. The reset route is not even registered unless the flag is on (and never in production).
router.get('/auth/test-reset-status', (req, res) => res.json({ enabled: TEST_RESET }));
if (TEST_RESET) router.post('/auth/test-reset-password', wrap(async (req, res) => res.json(await authService.testResetPassword(ctx(req)))));

export default router;
