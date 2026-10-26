import { Router } from 'express';
import { auth, only } from '../common/auth.js';
import { wrap, ctx } from '../common/http.js';
import { importService } from '../services/index.js';

const router = Router();

router.post('/import/students', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await importService.students(ctx(req)))));
router.post('/import/vacancies', auth, only('SUPER_ADMIN'), wrap(async (req, res) => res.json(await importService.vacancies(ctx(req)))));

export default router;
