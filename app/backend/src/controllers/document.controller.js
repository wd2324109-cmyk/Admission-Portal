import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { documentService } from '../services/index.js';

const router = Router();

router.get('/documents', auth, wrap(async (req, res) => res.json(await documentService.list(ctx(req)))));
router.get('/documents/students', auth, wrap(async (req, res) => res.json(await documentService.students(ctx(req)))));
router.get('/documents/progress', auth, wrap(async (req, res) => res.json(await documentService.progress(ctx(req)))));
router.post('/documents', auth, only('DISTRICT'), wrap(async (req, res) => res.json(await documentService.upload(ctx(req)))));
router.post('/documents/:id/replace', auth, only('DISTRICT'), wrap(async (req, res) => res.json(await documentService.replace(ctx(req)))));
router.get('/documents/:id/file', auth, wrap(async (req, res) => {
  const f = await documentService.file(ctx(req));
  res.download(f.file, f.name, e => e && !res.headersSent && res.status(404).json({ error: 'File is missing' }));
}));
router.post('/documents/:id/review', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await documentService.review(ctx(req)))));

export default router;
