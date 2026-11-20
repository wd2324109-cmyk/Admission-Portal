// The letters that go with a step: "Not Willing" and "Not Joined" need the HM letter and the student's unwilling letter (two letters),
// "TC request" needs the TC request letter (one letter).
// The files live in the uploads folder like the other uploads; a small record per letter says which file belongs to which student and step.
// A letter is FINAL once the step is submitted: nothing here edits or deletes one. (If the same step is submitted again later, e.g. after a
// reconsideration, the new letter becomes the current one and the earlier record is kept in `previous`; its file is never removed.)
import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS } from './paths.js';

export const KINDS = { HM: 'HM letter', STUDENT: 'Student unwilling letter', TC: 'TC request letter' };
export const STAGES = { NOT_WILLING: 'Not Willing', NOT_JOINED: 'Not Joined', TC_REQUEST: 'TC request' };
export const STAGE_KINDS = { NOT_WILLING: ['HM', 'STUDENT'], NOT_JOINED: ['HM', 'STUDENT'], TC_REQUEST: ['TC'] };

const DIR = path.join(UPLOADS, 'letters');
const fileOf = (cls, id, stage, kind) => path.join(DIR, `${+cls}-${+id}-${stage}-${kind}.json`);
const legacyFile = (cls, id) => path.join(DIR, `${+cls}-${+id}.json`);     // the single unwilling letter of the earlier version = Not Willing / student letter
const read = async f => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

export async function getLetter(cls, id, stage = 'NOT_WILLING', kind = 'STUDENT') {
  return (await read(fileOf(cls, id, stage, kind))) ?? (stage === 'NOT_WILLING' && kind === 'STUDENT' ? read(legacyFile(cls, id)) : null);
}

/** Every letter the student has: [{ stage, kind, label, fileName, by, at }]. */
export async function allLetters(cls, id) {
  const out = [];
  for (const stage of Object.keys(STAGES)) for (const kind of STAGE_KINDS[stage]) {
    const l = await getLetter(cls, id, stage, kind);
    if (l) out.push({ stage, kind, label: stage === 'TC_REQUEST' ? KINDS[kind] : `${STAGES[stage]} · ${KINDS[kind]}`, fileName: l.fileName, by: l.by, at: l.at });
  }
  return out;
}

export async function putLetter(cls, id, stage, kind, rec) {
  const old = await getLetter(cls, id, stage, kind);
  await fs.mkdir(DIR, { recursive: true });
  const f = fileOf(cls, id, stage, kind), tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(old ? { ...rec, previous: [...(old.previous || []), (({ previous, ...o }) => o)(old)] } : rec));
  await fs.rename(tmp, f);
}
