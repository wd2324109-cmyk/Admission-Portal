// Access-control regression test: lists every API route and checks who may call it.
// If you add a route, add it to EXPECT below on purpose, so no endpoint is ever opened to the wrong people by accident.
import assert from 'node:assert';

process.env.NODE_ENV = 'test';
const { default: api } = await import('../controllers/index.js');
const { only } = await import('./auth.js');

const ANY = 'any signed-in user', PUBLIC = 'public', ADMIN = ['SUPER_ADMIN'], NOT_DMS = ['SUPER_ADMIN', 'STATE', 'REGION'];
const EXPECT = {
  'POST /auth/login': PUBLIC,
  'POST /auth/logout': ANY, 'GET /auth/session': ANY, 'POST /auth/change-password': ANY,
  'GET /dashboard': ANY,
  'GET /students': ANY, 'GET /students/:cls/:id': ANY,                // always limited to the caller's own classes and districts in the service
  'POST /students/:cls/:id/action': ANY,                               // which step a role may do is decided by workflow/transitions.js (tested in workflow.test.js)
  'POST /students/:cls/:id/override': ADMIN,
  'GET /vacancies': NOT_DMS, 'GET /seats': NOT_DMS, 'GET /tc': ANY,
  'POST /rank/generate': ADMIN, 'POST /lists/generate': ADMIN,
  'POST /import/students': ADMIN, 'POST /import/vacancies': ADMIN,
  'GET /logs/students': ADMIN, 'GET /logs/vacancies': ADMIN,
  'GET /export/master': ANY, 'GET /export/vacancies': NOT_DMS,
  'GET /users': ADMIN, 'POST /users': ADMIN, 'POST /users/:id/reset-password': ADMIN, 'PUT /users/:id/access': ADMIN,
};
const NO_STATE = new Set();

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

// The role guard itself: allows listed roles, refuses everyone else (and a missing user)
const run = (guard, user) => { let out = 'next'; guard({ user }, { status: c => ({ json: () => { out = c; } }) }, () => {}); return out; };
const guard = only('SUPER_ADMIN');
assert.equal(run(guard, { role: 'SUPER_ADMIN' }), 'next');
for (const role of ['DISTRICT', 'REGION', 'STATE', undefined, '']) assert.equal(run(guard, { role }), 403);
assert.equal(run(guard, undefined), 403);

console.log(`Route protection OK (${Object.keys(found).length} routes checked)`);
process.exit(0);
