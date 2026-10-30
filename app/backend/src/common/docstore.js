import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS } from './paths.js';

/*
 * Student document records.
 *
 * The database design has no table for the 5 student documents, so the record of each document (which
 * ones were uploaded, who uploaded and reviewed them, the review status and the stored file name) is NOT
 * kept in the database. It is kept as one small JSON file per student, next to the uploaded files:
 *
 *     <UPLOADS>/documents/<studentId>.json  ->  { "<docType>": { fileName, filePath, status, uploadedBy, uploadedAt,
 *                                                                 reviewedBy, reviewedAt, remarks } }
 *
 * Writers always hold the student's database row lock (see common/locks.js), so two people can never
 * change the same student's record at once.
 *
 * The rest of the application talks ONLY to the functions exported here. When the documents move to an
 * S3 bucket, replace the bodies of these functions (and saveUpload in common/upload.js) and nothing else changes.
 */
const DIR = path.join(UPLOADS, 'documents');
const fileOf = id => path.join(DIR, `${+id}.json`);
const LIMIT = 48;                                           // files read at the same time

/** The document record of one student: { [docType]: entry }. Empty object when nothing was uploaded. */
export async function getDocs(studentId) {
  try { return JSON.parse(await fs.readFile(fileOf(studentId), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}

/** Replaces the document record of one student. An empty record removes the file. */
export async function putDocs(studentId, docs) {
  if (!Object.keys(docs).length) { await fs.unlink(fileOf(studentId)).catch(e => { if (e.code !== 'ENOENT') throw e; }); return; }
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${fileOf(studentId)}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(docs));
  await fs.rename(tmp, fileOf(studentId));                  // atomic: a reader sees the old or the new record, never half of one
}

/** Ids of every student that has at least one document. */
export async function listDocIds() {
  try { return (await fs.readdir(DIR)).filter(n => /^\d+\.json$/.test(n)).map(n => parseInt(n, 10)); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}

/** Document records of many students at once: Map(studentId -> { [docType]: entry }). */
export async function getManyDocs(ids) {
  const out = new Map(); const list = [...ids];
  for (let i = 0; i < list.length; i += LIMIT)
    await Promise.all(list.slice(i, i + LIMIT).map(async id => { const d = await getDocs(id); if (Object.keys(d).length) out.set(id, d); }));
  return out;
}

/** Ids of the students whose every one of the given document types is VERIFIED. */
export async function idsAllVerified(types) {
  const all = await getManyDocs(await listDocIds());
  return [...all].filter(([, d]) => types.every(t => d[t]?.status === 'VERIFIED')).map(([id]) => id);
}
