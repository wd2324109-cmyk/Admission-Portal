import 'dotenv/config';
import fs from 'node:fs'; import path from 'node:path';
import express from 'express'; import cors from 'cors';
import { notFound, errorHandler } from './common/http.js';
import api from './controllers/index.js';
import { verifyToken } from './common/auth.js';
import { db, pool } from './db/index.js';
import { audit } from './common/audit.js';

const VIEW = [
  [/^\/dashboard$/, () => 'Viewed the dashboard'],
  [/^\/students$/, q => (!q.search && (+q.page || 1) === 1 ? `Viewed Class ${q.class} students: ${q.view || 'all'}` : null)],
  [/^\/students\/\d+$/, () => 'Opened a student record'],
  [/^\/documents\/students$/, q => `Viewed document verification: ${q.status || 'all'}`],
  [/^\/documents\/\d+-\d+\/file$/, () => 'Opened a student document'],
  [/^\/tc$/, q => `Viewed TC requests: ${q.status || 'all'}`],
  [/^\/tc\/\d+\/letter$/, () => 'Opened a TC letter'],
];

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
const origins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
if (origins.length) app.use(cors({ origin: origins }));
app.use(['/api/import', '/api/documents', '/api/tc'], express.json({ limit: '25mb' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/health', async (req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});
app.use('/api', (req, res, next) => {
  res.on('finish', async () => {
    try {
      if (req.method !== 'GET' || res.statusCode >= 400) return;
      const hit = VIEW.find(([re]) => re.test(req.path)), msg = hit && hit[1](req.query);
      if (!msg) return;
      await audit(db, { user: verifyToken((req.headers.authorization || '').replace('Bearer ', '')) }, { action: 'VIEW', message: msg });
    } catch {}
  });
  next();
});
app.use('/api', api);
app.use('/api', notFound);

// HOSTING FIX (single-service mode): when the frontend has been built (frontend/dist), this server also serves it,
// so the site and the API share one address. No rewrite rules, no CORS, no second service are needed.
// Set FRONTEND_DIST to point elsewhere; if the folder is missing the API runs alone as before.
const WEB = path.resolve(process.env.FRONTEND_DIST || path.join(process.cwd(), '..', 'frontend', 'dist'));
if (fs.existsSync(path.join(WEB, 'index.html'))) {
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src blob:; "
    + "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
  app.use(express.static(WEB, { index: false, setHeaders: (res, file) =>
    res.set('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache') }));
  const page = (status, name) => (req, res) => { res.set({ 'Content-Security-Policy': CSP, 'Cache-Control': 'no-cache' }); res.status(status).sendFile(path.join(WEB, name)); };
  app.get(['/', '/index.html'], page(200, 'index.html'));
  app.get('*', fs.existsSync(path.join(WEB, '404.html')) ? page(404, '404.html') : page(404, 'index.html'));
  console.log('Serving the frontend from ' + WEB);
}
app.use(errorHandler);

const port = process.env.PORT || 4000;
const server = app.listen(port, () => console.log('API on :' + port));
const stop = () => { server.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
