import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS } from './paths.js';

















const DIR = path.join(UPLOADS, 'documents');
const fileOf = id => path.join(DIR, `${+id}.json`);
const LIMIT = 48;


export async function getDocs(studentId) {
  try { return JSON.parse(await fs.readFile(fileOf(studentId), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}


export async function putDocs(studentId, docs) {
  if (!Object.keys(docs).length) { await fs.unlink(fileOf(studentId)).catch(e => { if (e.code !== 'ENOENT') throw e; }); return; }
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${fileOf(studentId)}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(docs));
  await fs.rename(tmp, fileOf(studentId));
}


export async function listDocIds() {
  try { return (await fs.readdir(DIR)).filter(n => /^\d+\.json$/.test(n)).map(n => parseInt(n, 10)); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}


export async function getManyDocs(ids) {
  const out = new Map(); const list = [...ids];
  for (let i = 0; i < list.length; i += LIMIT)
    await Promise.all(list.slice(i, i + LIMIT).map(async id => { const d = await getDocs(id); if (Object.keys(d).length) out.set(id, d); }));
  return out;
}


export async function idsAllVerified(types) {
  const all = await getManyDocs(await listDocIds());
  return [...all].filter(([, d]) => types.every(t => d[t]?.status === 'VERIFIED')).map(([id]) => id);
}
