import assert from 'node:assert';
import { freezeStates, issuedBeforeFreeze } from './freeze.js';
import { parseProfile } from './sessionStore.js';

const row = (user, tag, classLevel) => ({ user, tag, classLevel });
const at = (rows, u) => freezeStates(rows).get(u) || { frozen: false, since: 0 };

// nothing recorded: not frozen
assert.equal(at([], 'a').frozen, false);
// freeze, unfreeze, freeze again: the newest row wins, rows are only ever added
const log = [row('a', 'FROZEN', '1000'), row('a', 'UNFROZEN', '2000')];
assert.equal(at(log, 'a').frozen, false);
log.push(row('a', 'FROZEN', '3000'));
assert.deepEqual(at(log, 'a'), { frozen: true, since: 3000 });
log.push(row('a', 'UNFROZEN', '4000'));
assert.equal(at(log, 'a').frozen, false);
assert.equal(at(log, 'a').since, 3000);
// one login does not affect another
assert.equal(at([...log, row('b', 'FROZEN', '5000')], 'a').frozen, false);
assert.equal(at([row('b', 'FROZEN', '5000')], 'b').frozen, true);
// a login frozen the old way (row stamped "*") is frozen until an UNFROZEN row is added
assert.equal(at([row('c', 'FROZEN', '*')], 'c').frozen, true);
assert.equal(at([row('c', 'FROZEN', '*'), row('c', 'UNFROZEN', '1500')], 'c').frozen, false);
// other tags are ignored
assert.equal(at([row('d', 'ACTIVE', '9'), row('d', 'SESSION', 'x')], 'd').frozen, false);

// a sign-in from before the freeze stays dead after unfreezing; a newer one works
assert.equal(issuedBeforeFreeze(1000, { frozen: false, since: 60000 }), true);
assert.equal(issuedBeforeFreeze(70000, { frozen: false, since: 60000 }), false);
assert.equal(issuedBeforeFreeze(57000, { frozen: false, since: 60000 }), false); // inside the clock tolerance
assert.equal(issuedBeforeFreeze(1000, { frozen: false, since: 0 }), false);

// the profile is added, never changed: the newest "at" wins, and an old row without "at" still reads
const p = (o) => row('u', 'PROFILE', JSON.stringify(o));
assert.equal(parseProfile([p({ role: 'DISTRICT', district: 'X' })]).role, 'DISTRICT');
assert.equal(parseProfile([p({ role: 'DISTRICT', at: 10 }), p({ role: 'REGION', at: 20 })]).role, 'REGION');
assert.equal(parseProfile([p({ role: 'REGION', at: 20 }), p({ role: 'DISTRICT', at: 30 })]).role, 'DISTRICT');
assert.deepEqual(parseProfile([]), {});
console.log('freeze tests passed');
