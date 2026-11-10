// Access-control regression test: lists every API route and checks who may call it.
// If you add a route, add it to EXPECT below on purpose, so no endpoint is ever opened to the wrong people by accident.
import assert from 'node:assert';

process.env.NODE_ENV = 'test';
delete process.env.ENABLE_TEST_PASSWORD_RESET;
const { default: api } = await import('../controllers/index.js');
const { only } = await import('./auth.js');

const ANY = 'any signed-in user', PUBLIC = 'public', ADMIN = ['SUPER_ADMIN'];
const EXPECT = {
  'POST /auth/login': PUBLIC,
  'GET /auth/test-reset-status': PUBLIC,                  // only reports whether the test-only reset is on
  'POST /auth/logout': ANY, 'GET /auth/session': ANY, 'POST /auth/change-password': ANY,
  'GET /dashboard': ANY,
  'GET /students': ANY, 'GET /students/:id': ANY,         // always limited to the caller's own district / region in the service
  'PATCH /students/:id': ['DISTRICT', 'SUPER_ADMIN'],
  'POST /students/:id/revert': ADMIN, 'POST /students/:id/revert-tc': ADMIN, 'POST /students/:id/revoke-admission': ADMIN,
  'GET /verification': ANY, 'POST /students/:id/verify': ADMIN,
  'GET /vacancies': ANY,
  'GET /seats': ['SUPER_ADMIN', 'REGION', 'DISTRICT'],
  'POST /selection/run': ADMIN,
  'GET /tc': ANY, 'GET /tc/:id/letter': ANY, 'POST /tc': ['DISTRICT'], 'POST /tc/:id/review': ['REGION', 'STATE', 'SUPER_ADMIN'],
  'POST /import/students': ADMIN, 'POST /import/vacancies': ADMIN,
  'GET /logs': ADMIN, 'POST /logs/:id/revoke': ADMIN,
  'GET /documents': ANY, 'GET /documents/students': ANY, 'GET /documents/progress': ANY, 'GET /documents/:id/file': ANY,   // these four also refuse STATE (noState)
  'POST /documents': ['DISTRICT'], 'POST /documents/:id/replace': ['DISTRICT'], 'POST /documents/:id/review': ADMIN,
  'GET /export/master': ANY, 'GET /export/vacancies': ANY,
  'GET /users': ADMIN, 'POST /users/:id/freeze': ADMIN, 'POST /users/:id/unfreeze': ADMIN,
};
const NO_STATE = new Set(['GET /documents', 'GET /documents/students', 'GET /documents/progress', 'GET /documents/:id/file']);

const found = {};
for (const layer of api.stack) {
  const routes = layer.route ? [layer] : (layer.handle?.stack || []);
  for (const l of routes) {
    if (!l.route) continue;
    for (const method of Object.keys(l.route.methods)) {
      const key = `${method.toUpperCase()} ${l.route.path}`;
      const names = l.route.stack.map(s => s.handle.name);
      const guards = l.route.stack.map(s => s.handle.roles).filter(Boolean);
      found[key] = { signedIn: names[0] === 'auth', roles: guards[0] || null, noState: names.includes('noState') };
    }
  }
}

for (const [key, f] of Object.entries(found)) {
  const want = EXPECT[key];
  assert(want, `Route "${key}" is not in EXPECT. Decide who may call it and add it to routes.test.js.`);
  if (want === PUBLIC) { assert(!f.signedIn, `${key} is expected to be public`); continue; }
  assert(f.signedIn, `${key} must require sign-in (auth must be its first handler)`);
  if (want === ANY) assert.equal(f.roles, null, `${key} should be open to any signed-in user but has a role guard ${f.roles}`);
  else assert.deepEqual(f.roles && [...f.roles].sort(), [...want].sort(), `${key} allows the wrong roles: ${f.roles}`);
  assert.equal(f.noState, NO_STATE.has(key), `${key}: the "not for STATE" guard is wrong`);
}
for (const key of Object.keys(EXPECT)) assert(found[key], `EXPECT lists "${key}" but no such route exists`);
assert(!found['POST /auth/test-reset-password'], 'the test-only password reset route must not be registered unless explicitly enabled');

// The role guard itself: allows listed roles, refuses everyone else (and a missing user)
const run = (guard, user) => { let out = 'next'; guard({ user }, { status: c => ({ json: () => { out = c; } }) }, () => {}); return out; };
const guard = only('SUPER_ADMIN');
assert.equal(run(guard, { role: 'SUPER_ADMIN' }), 'next');
for (const role of ['DISTRICT', 'REGION', 'STATE', undefined, '']) assert.equal(run(guard, { role }), 403);
assert.equal(run(guard, undefined), 403);

console.log(`Route protection OK (${Object.keys(found).length} routes checked)`);
process.exit(0);
