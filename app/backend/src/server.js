import 'dotenv/config';
import fs from 'node:fs'; import path from 'node:path';
import express from 'express'; import cors from 'cors';
import { notFound, errorHandler } from './common/http.js';
import api from './controllers/index.js';
import { auth } from './common/auth.js';
import { securityHeaders, apiHeaders, corsMiddleware } from './common/hardening.js';
import { rateLimit } from './common/rateLimit.js';
import { pool } from './db/index.js';
import { describeProfile } from './db/profile.js';
import { stampAllSeatRefs } from './stampSeatRefs.js';

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

app.use(securityHeaders());
const corsMw = corsMiddleware();
if (corsMw) app.use(corsMw);
if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY)
  console.warn('WARNING: TRUST_PROXY is not set. Behind nginx/Render every visitor looks like the proxy, so the sign-in and rate limits would apply to everyone together. Set TRUST_PROXY=true.');

const WINDOW = 60 * 1000;
app.use('/api', rateLimit({ max: +process.env.API_RATE_LIMIT_PER_MIN || 2000, windowMs: WINDOW }));
const heavy = rateLimit({ max: +process.env.HEAVY_RATE_LIMIT_PER_MIN || 60, windowMs: WINDOW, message: 'Too many import, export or upload requests. Please wait a minute and try again.' });
const writesOnly = mw => (req, res, next) => (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' ? next() : mw(req, res, next));
app.use(['/api/export', '/api/import', '/api/lists', '/api/rank'], heavy);

const signedIn = writesOnly(auth);
app.use('/api/import', signedIn, express.json({ limit: '25mb' }));
app.use('/api/students', signedIn, express.json({ limit: '12mb' }));
app.use('/api/documents', signedIn, express.json({ limit: '20mb' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiHeaders);

app.get('/api/health', async (req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});
app.use('/api', api);
app.use('/api', notFound);

const WEB = path.resolve(process.env.FRONTEND_DIST || path.join(process.cwd(), '..', 'frontend', 'dist'));
if (fs.existsSync(path.join(WEB, 'index.html'))) {
  // Uploaded documents are served from the CloudFront address; the viewer shows them inline, so that one address is allowed for images and frames.
  let FILES = ''; try { FILES = ' ' + new URL(process.env.CLOUDFRONT_URL || 'https://d2n7f898nmjqsn.cloudfront.net').origin; } catch { /* no file host */ }
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:" + FILES + "; frame-src blob:" + FILES + "; "
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
const server = app.listen(port, () => {
  console.log('API on :' + port + '   database profile: ' + describeProfile());
  stampAllSeatRefs().catch(e => console.error('Seat reference check skipped:', e?.message || e)); // fills in missing seat references on existing data; a no-op once they are right
});

process.on('unhandledRejection', e => console.error('\n!! Unhandled error (the server keeps running):', e?.message || e, '\n', e?.stack || ''));
const stop = () => { server.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
