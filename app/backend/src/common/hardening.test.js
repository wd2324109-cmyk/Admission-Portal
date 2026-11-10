import assert from 'node:assert';
import { rateLimit } from './rateLimit.js';
import { securityHeaders, apiHeaders, corsMiddleware } from './hardening.js';

// Minimal request/response stand-ins, enough for middleware that only sets headers or answers early.
const makeRes = () => {
  const h = {};
  const res = { statusCode: 200, body: undefined, ended: false, headers: h,
    set(k, v) { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) h[a.toLowerCase()] = String(b); else h[k.toLowerCase()] = String(v); return res; },
    setHeader(k, v) { h[k.toLowerCase()] = String(v); }, getHeader: k => h[k.toLowerCase()], removeHeader: k => { delete h[k.toLowerCase()]; },
    status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; res.ended = true; return res; }, end() { res.ended = true; } };
  return res;
};
const run = (mw, req) => { const res = makeRes(); let passed = false; mw(req, res, () => { passed = true; }); return { res, passed }; };

// ---- rateLimit: the (max+1)th request in a window is refused with 429 + Retry-After, per client IP
const lim = rateLimit({ max: 3, windowMs: 80 });
for (let i = 0; i < 3; i++) assert.equal(run(lim, { ip: '1.1.1.1' }).passed, true, `request ${i + 1} should pass`);
const blocked = run(lim, { ip: '1.1.1.1' });
assert.equal(blocked.passed, false);
assert.equal(blocked.res.statusCode, 429);
assert(+blocked.res.headers['retry-after'] >= 1);
assert(blocked.res.body.error && blocked.res.body.retryAfter >= 1);
assert.equal(run(lim, { ip: '2.2.2.2' }).passed, true, 'another IP has its own budget');
await new Promise(r => setTimeout(r, 120));
assert.equal(run(lim, { ip: '1.1.1.1' }).passed, true, 'the window resets');
assert.equal(run(rateLimit({ max: 1 }), {}).passed, true, 'a missing ip does not crash');

// ---- security headers
let { res, passed } = run(securityHeaders({}), {});
assert(passed);
for (const [k, v] of Object.entries({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin' })) assert.equal(res.headers[k], v, k);
assert(res.headers['permissions-policy'].includes('camera=()'));
assert.equal(res.headers['strict-transport-security'], undefined, 'no HSTS outside production');
({ res } = run(securityHeaders({ NODE_ENV: 'production' }), {}));
assert(/max-age=31536000/.test(res.headers['strict-transport-security']), 'HSTS in production');

// ---- API responses: never cached, never a page
({ res, passed } = run(apiHeaders, {}));
assert(passed);
assert.equal(res.headers['cache-control'], 'no-store');
assert.equal(res.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none'");

// ---- CORS: off by default, exact origins only
assert.equal(corsMiddleware({}), null, 'no CORS_ORIGIN means no CORS at all');
const cors = corsMiddleware({ CORS_ORIGIN: 'https://admissions.example.gov.in, https://www.example.gov.in' });
const preflight = origin => run(cors, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } }).res;
let r = preflight('https://admissions.example.gov.in');
assert.equal(r.headers['access-control-allow-origin'], 'https://admissions.example.gov.in');
assert(!/DELETE|PUT/.test(r.headers['access-control-allow-methods']), 'only the verbs the API uses');
assert(/Authorization/.test(r.headers['access-control-allow-headers']));
r = preflight('https://evil.example.com');
assert.equal(r.headers['access-control-allow-origin'], undefined, 'other origins get no CORS headers');
r = preflight('https://admissions.example.gov.in.evil.com');
assert.equal(r.headers['access-control-allow-origin'], undefined, 'look-alike origins are refused');

// ---- "*" must stop a production start, and only warn elsewhere
const realExit = process.exit, realErr = console.error, realWarn = console.warn;
let exited = null, warned = false;
process.exit = c => { exited = c; throw new Error('exit'); }; console.error = () => {}; console.warn = () => { warned = true; };
try { assert.throws(() => corsMiddleware({ NODE_ENV: 'production', CORS_ORIGIN: '*' }), /exit/); assert.equal(exited, 1);
  corsMiddleware({ NODE_ENV: 'development', CORS_ORIGIN: '*' }); assert(warned); }
finally { process.exit = realExit; console.error = realErr; console.warn = realWarn; }

console.log('Hardening helpers OK');
