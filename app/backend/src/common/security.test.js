import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeLimiter } from './rateLimit.js';

const lim = makeLimiter({ max: 3, windowMs: 60000 });
for (let i = 0; i < 2; i++) lim.fail('a');
assert.equal(lim.blocked('a'), false);
lim.fail('a');
assert.equal(lim.blocked('a'), true);
assert(lim.retryAfter('a') >= 1);
assert.equal(lim.blocked('b'), false);
lim.clear('a');
assert.equal(lim.blocked('a'), false);

console.log('Security helpers OK');
