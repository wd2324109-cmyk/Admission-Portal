import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { vacancyService } from '../services/index.js';

const router = Router();

router.get('/vacancies', auth, wrap(async (req, res) => res.json(await vacancyService.list(ctx(req)))));

export default router;
