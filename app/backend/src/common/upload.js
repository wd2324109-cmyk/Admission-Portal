import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { UPLOADS } from './paths.js';

const SIGNATURE = { '.pdf': [0x25, 0x50, 0x44, 0x46], '.png': [0x89, 0x50, 0x4e, 0x47], '.jpg': [0xff, 0xd8, 0xff], '.jpeg': [0xff, 0xd8, 0xff] };

export async function saveUpload(fileName = '', fileData = '') {
  const ext = path.extname(String(fileName)).toLowerCase();
  if (!SIGNATURE[ext]) throw new HttpError('File must be a PDF, JPG or PNG');
  const buf = Buffer.from(String(fileData), 'base64');
  if (!buf.length) throw new HttpError('Choose a file to upload');
  if (buf.length > 3 * 1024 * 1024) throw new HttpError('File must be under 3 MB');
  if (!SIGNATURE[ext].every((b, i) => buf[i] === b)) throw new HttpError('The file content does not match its type');
  await fs.mkdir(UPLOADS, { recursive: true });
  const stored = crypto.randomUUID() + ext;
  await fs.writeFile(path.join(UPLOADS, stored), buf);
  return { stored, name: path.basename(String(fileName)).slice(0, 200) };
}
