// The unwilling letter of a student (uploaded by the DMS when it marks him Not Willing).
// The file is kept in the uploads folder like the other uploads; this small record says which file belongs to which student.
import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS } from './paths.js';

const DIR = path.join(UPLOADS, 'letters');
const fileOf = (cls, id) => path.join(DIR, `${+cls}-${+id}.json`);

export async function getLetter(cls, id) {
  try { return JSON.parse(await fs.readFile(fileOf(cls, id), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

/** Saves the record and removes the file of an earlier letter of the same student. */
export async function putLetter(cls, id, rec) {
  const old = await getLetter(cls, id);
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${fileOf(cls, id)}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rec));
  await fs.rename(tmp, fileOf(cls, id));
  if (old?.stored && old.stored !== rec.stored) await fs.unlink(path.join(UPLOADS, old.stored)).catch(() => {});
}
