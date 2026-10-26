import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { tcService } from '../services/index.js';

const router = Router();

router.get('/tc', auth, wrap(async (req, res) => res.json(await tcService.list(ctx(req)))));
router.post('/tc', auth, only('DISTRICT'), wrap(async (req, res) => res.json(await tcService.raise(ctx(req)))));
router.get('/tc/:id/letter', auth, wrap(async (req, res) => {
  const f = await tcService.letter(ctx(req));
  res.download(f.file, f.name, e => e && !res.headersSent && res.status(404).json({ error: 'Letter file is missing' }));
}));
router.post('/tc/:id/review', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await tcService.review(ctx(req)))));

export default router;
