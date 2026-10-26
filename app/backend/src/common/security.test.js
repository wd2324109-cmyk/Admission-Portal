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

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'up-')));
const { saveUpload } = await import('./upload.js');
const b64 = bytes => Buffer.from(bytes).toString('base64');
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
await assert.rejects(saveUpload('letter.pdf', b64(PNG)), /does not match/);
await assert.rejects(saveUpload('page.html', b64([0x3c, 0x68, 0x74, 0x6d, 0x6c])), /PDF, JPG or PNG/);
await assert.rejects(saveUpload('empty.png', ''), /Choose a file/);
const ok = await saveUpload('Birth Certificate.pdf', b64(PDF));
assert(/^[0-9a-f-]{36}\.pdf$/.test(ok.stored) && ok.name === 'Birth Certificate.pdf');
assert(fs.existsSync(path.join('uploads', ok.stored)));
console.log('Security helpers OK');
