import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS } from './paths.js';

const DIR = path.join(UPLOADS, 'docs');
const fileOf = (cls, id) => path.join(DIR, `${+cls}-${+id}.json`);
const LIMIT = 48;

export async function getDocs(cls, id) {
  try { return JSON.parse(await fs.readFile(fileOf(cls, id), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}

export async function putDocs(cls, id, docs) {
  await fs.mkdir(DIR, { recursive: true });
  const f = fileOf(cls, id), tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(docs));
  await fs.rename(tmp, f);
}

export async function getManyDocs(cls, ids) {
  const out = new Map(), list = [...ids];
  for (let i = 0; i < list.length; i += LIMIT)
    await Promise.all(list.slice(i, i + LIMIT).map(async id => out.set(id, await getDocs(cls, id))));
  return out;
}

export const removeStored = stored => stored ? fs.unlink(path.join(UPLOADS, stored)).catch(() => {}) : Promise.resolve();
export const storedPath = stored => path.join(UPLOADS, stored);
