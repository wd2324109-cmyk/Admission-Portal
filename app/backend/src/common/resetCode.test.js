import assert from 'node:assert';
import { generateCode, hashCode, codeMatches, normalizeCode } from './resetCode.js';
import { checkNewPassword } from './password.js';

const key = 'k'.repeat(48), a = generateCode(), b = generateCode();
assert(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/.test(a), 'code format');
assert.notEqual(a, b, 'codes are random');
const h = hashCode(a, key);
assert(codeMatches(a, h, key), 'right code matches');
assert(codeMatches(a.toLowerCase().replace('-', ' '), h, key), 'case, dash and spaces are ignored when typing');
assert(!codeMatches(b, h, key), 'another code does not match');
assert(!codeMatches(a, h, 'x'.repeat(48)), 'a different server key does not match');
assert(!codeMatches(a, null, key) && !codeMatches(a, '', key) && !codeMatches('', h, key), 'missing hash or code never matches');
assert(!h.includes(normalizeCode(a)), 'the hash does not contain the code');
assert.throws(() => checkNewPassword('short'), /at least 10/);
assert.throws(() => checkNewPassword('x'.repeat(73)), /too long/);
assert.throws(() => checkNewPassword('myBobSecret99', 'bob'), /username/);
assert.doesNotThrow(() => checkNewPassword('a-fine-password', 'bob'));
console.log('Reset code and password rules OK');
