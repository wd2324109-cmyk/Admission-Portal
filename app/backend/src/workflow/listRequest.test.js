// "Request new list" rules (no database needed).
import assert from 'node:assert';
import { progress, readMeta, MIN_PERCENT } from './listRequest.js';

assert.equal(MIN_PERCENT, 80);
const ok = (t, w, min) => progress({ total: t, waiting: w }, min);

// nobody listed yet: no request
assert.equal(ok(0, 0).canRequest, false);
assert.match(ok(0, 0).reason, /No students/);
// exactly at the threshold is allowed, one short is not
assert.equal(ok(100, 20, 80).canRequest, true);
assert.equal(ok(100, 21, 80).canRequest, false);
assert.equal(ok(10, 2, 80).canRequest, true);           // 8 of 10
assert.equal(ok(7, 2, 80).canRequest, false);           // 5 of 7 = 71 %
// the figures
const p = ok(50, 4, 80);
assert.deepEqual([p.total, p.waiting, p.decided, p.percent, p.canRequest, p.reason], [50, 4, 46, 92, true, null]);
// 99.x % is shown as 99, never rounded up to 100
assert.equal(ok(300, 1, 80).percent, 99);
// all decided
assert.equal(ok(5, 0, 100).canRequest, true);
assert.equal(ok(5, 1, 100).canRequest, false);
// threshold 0 = always allowed once somebody is listed
assert.equal(ok(5, 5, 0).canRequest, true);
// bad input never produces NaN or negative numbers
const odd = progress({ total: 'x', waiting: -3 });
assert.deepEqual([odd.total, odd.waiting, odd.decided], [0, 0, 0]);
assert.equal(progress({ total: 3, waiting: 9 }).decided, 0);   // waiting can never exceed total

// the JSON kept in Student_LOG.remark2 is read safely
assert.deepEqual(readMeta('{"decided":4,"total":5}'), { decided: 4, total: 5 });
assert.deepEqual(readMeta(null), {});
assert.deepEqual(readMeta('not json'), {});
assert.deepEqual(readMeta('[1,2]'), {});

console.log('List request rules OK');
