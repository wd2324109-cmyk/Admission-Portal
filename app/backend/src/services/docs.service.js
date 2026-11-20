// Document Verification (see workflow/documents.js for the rules).
//   DISTRICT (DMS)  : sees its own joined students, submits / replaces / resubmits their documents.
//   SUPER_ADMIN     : sees every joined student, opens the documents, verifies or rejects each one.
// Nobody else uses this screen.
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { HttpError } from '../common/http.js';
import { likeEsc } from '../common/query.js';
import { requireClass, scope, inScope } from '../common/access.js';
import { studentTable, parseClass } from '../common/studentStore.js';
import { lockClass } from '../common/locks.js';
import { saveUpload } from '../common/upload.js';
import { getDocs, putDocs, getManyDocs, removeStored, storedPath } from '../common/studentDocs.js';
import { GROUP_SQL, stateOf, primary } from '../workflow/statuses.js';
import { DOC_TYPES, STATES, requiredFor, summarize, planSubmit, planReview } from '../workflow/documents.js';

const SIZE = 25;
const typeOf = v => { const t = String(v || '').toUpperCase(); if (!Object.hasOwn(DOC_TYPES, t)) throw new HttpError('Unknown document'); return t; };

// What the screen may see of one record (never the stored file name). Only the super admin sees the full history.
const shapeDoc = (d, admin) => d && ({ status: d.status, fileName: d.fileName, submittedBy: d.submittedBy, submittedAt: d.submittedAt, submissions: d.submissions || 1,
  reviewedBy: d.reviewedBy ?? null, reviewedAt: d.reviewedAt ?? null, remarks: d.remarks ?? null, locked: d.status === 'VERIFIED', ...(admin ? { history: d.history || [] } : {}) });

function shapeStudent(row, docs, user, detail = false) {
  const required = requiredFor(row), sum = summarize(docs, required), admin = user.role === 'SUPER_ADMIN';
  return { id: row.id, classLevel: +row.classLevel, emis: row.emis, name: row.name, district: row.district, community: row.community, pwd: !!row.disabilityStatus,
    school: row.newSchoolName || row.schoolname || null, statusCode: primary(stateOf(row)), required, ...sum, stateLabel: STATES[sum.state],
    ...(detail ? { docs: Object.fromEntries(required.map(t => [t, shapeDoc(docs[t], admin) ?? null])), names: DOC_TYPES } : { docs: Object.fromEntries(required.map(t => [t, docs[t] ? { status: docs[t].status } : null])) }) };
}

async function loadStudent(x, user, cls, id, lock = false) {
  const T = studentTable(cls), q = x.select().from(T).where(eq(T.id, +id || 0)), [row] = await (lock ? q.for('update') : q);
  if (!row || !inScope(user, row)) throw new HttpError('Student not found', 404);
  return { ...row, classLevel: +cls };
}
const event = (type, user, extra = {}) => ({ at: new Date().toISOString(), by: user.username, type, ...extra });

export const docsService = {
  // The joined students of the caller's scope, with the state of their documents. ?state= filters by the overall document state.
  async list({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), T = studentTable(cls), term = String(query.search || '').trim();
    const page = Math.max(1, parseInt(query.page, 10) || 1), state = String(query.state || '').toUpperCase();
    const q = term ? or(ilike(T.name, `%${likeEsc(term)}%`), sql`${T.emis}::text like ${likeEsc(term) + '%'}`) : undefined;
    const where = and(scope(user, cls), sql.raw(GROUP_SQL.joined), q), order = [sql`${T.orank} asc nulls last`, asc(T.id)];
    let rows, total;
    if (!Object.hasOwn(STATES, state)) {
      [rows, [{ n: total }]] = await Promise.all([db.select().from(T).where(where).orderBy(...order).limit(SIZE).offset((page - 1) * SIZE), db.select({ n: sql`count(*)::int` }).from(T).where(where)]);
    } else {                                                  // the state lives in the record files, so look at every joined student of the scope, then page
      const all = await db.select().from(T).where(where).orderBy(...order), docs = await getManyDocs(cls, all.map(r => r.id));
      const hit = all.filter(r => summarize(docs.get(r.id), requiredFor(r)).state === state);
      total = hit.length; rows = hit.slice((page - 1) * SIZE, page * SIZE);
    }
    const docs = await getManyDocs(cls, rows.map(r => r.id));
    return { rows: rows.map(r => shapeStudent({ ...r, classLevel: cls }, docs.get(r.id), user)), total, pages: Math.max(1, Math.ceil(total / SIZE)) };
  },

  // One student with the full state of every required document.
  async get({ user, params }) {
    const cls = await requireClass(user, parseClass(params.cls)), row = await loadStudent(db, user, cls, params.id);
    return shapeStudent(row, await getDocs(cls, row.id), user, true);
  },

  // DMS: submit a document, replace a pending one, or resubmit a rejected one. Only a VERIFIED document is locked.
  async submit({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls)), type = typeOf(params.type), pre = await loadStudent(db, user, cls, params.id);
    planSubmit({ code: primary(stateOf(pre)), student: pre, type, doc: (await getDocs(cls, pre.id))[type] });          // fail early, before the file is stored
    const up = await saveUpload(body?.fileName, body?.fileData);
    let old;
    try {
      await db.transaction(async tx => {
        await lockClass(tx, cls);
        const row = await loadStudent(tx, user, cls, params.id, true), docs = await getDocs(cls, row.id);
        planSubmit({ code: primary(stateOf(row)), student: row, type, doc: docs[type] });                              // again, now that the student row is locked
        old = docs[type];
        const now = new Date().toISOString(), n = (old?.submissions || 0) + 1;
        await putDocs(cls, row.id, { ...docs, [type]: { fileName: up.name, stored: up.stored, status: 'PENDING', submittedBy: user.username, submittedAt: now, submissions: n,
          reviewedBy: null, reviewedAt: null, remarks: null, history: [...(old?.history || []), event(old ? 'RESUBMITTED' : 'SUBMITTED', user, { fileName: up.name, attempt: n })] } });
      });
    } catch (e) { await removeStored(up.stored); throw e; }
    await removeStored(old?.stored);                                                                                    // the replaced file is no longer needed
    return { ok: true };
  },

  // DMS: submit the documents of one student TOGETHER (the screen enables Submit only when every mandatory document is there).
  // body.docs = { TYPE: { fileName, fileData } } for the documents that are new or replaced. After this call every mandatory document must exist and none may still be
  // rejected; a verified document can not be replaced. All or nothing: if anything fails, no document is changed and no file is kept.
  async submitAll({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls));
    const files = new Map(Object.entries(body?.docs || {}).filter(([, v]) => v?.fileData).map(([t, v]) => [typeOf(t), v]));
    if (!files.size) throw new HttpError('Choose the documents to submit');
    const types = [...files.keys()];
    const check = (row, docs) => {
      for (const type of types) planSubmit({ code: primary(stateOf(row)), student: row, type, doc: docs[type] });
      const missing = requiredFor(row).filter(t => !files.has(t) && (!docs[t] || docs[t].status === 'REJECTED'));
      if (missing.length) throw new HttpError(`Add ${missing.map(t => DOC_TYPES[t]).join(', ')} before submitting`, 400);
    };
    const pre = await loadStudent(db, user, cls, params.id);
    check(pre, await getDocs(cls, pre.id));                                                                              // fail early, before any file is stored
    const saved = [], replaced = [];
    try {
      for (const [type, f] of files) saved.push({ type, ...(await saveUpload(f.fileName, f.fileData)) });
      await db.transaction(async tx => {
        await lockClass(tx, cls);
        const row = await loadStudent(tx, user, cls, params.id, true), docs = await getDocs(cls, row.id);
        check(row, docs);                                                                                                 // again, now that the student row is locked
        const now = new Date().toISOString(), next = { ...docs };
        for (const up of saved) {
          const old = docs[up.type], n = (old?.submissions || 0) + 1;
          if (old?.stored) replaced.push(old.stored);
          next[up.type] = { fileName: up.name, stored: up.stored, status: 'PENDING', submittedBy: user.username, submittedAt: now, submissions: n,
            reviewedBy: null, reviewedAt: null, remarks: null, history: [...(old?.history || []), event(old ? 'RESUBMITTED' : 'SUBMITTED', user, { fileName: up.name, attempt: n })] };
        }
        await putDocs(cls, row.id, next);
      });
    } catch (e) { for (const up of saved) await removeStored(up.stored); throw e; }
    for (const stored of replaced) await removeStored(stored);                                                           // the replaced files are no longer needed
    return { ok: true, submitted: saved.length };
  },

  // Super admin: verify (final) or reject (with a reason; the DMS submits again).
  async review({ user, params, body }) {
    const cls = await requireClass(user, parseClass(params.cls)), type = typeOf(params.type);
    await db.transaction(async tx => {
      await lockClass(tx, cls);
      const row = await loadStudent(tx, user, cls, params.id, true), docs = await getDocs(cls, row.id), d = docs[type];
      const decision = String(body?.decision || '').toUpperCase(), { note } = planReview({ doc: d, decision, remarks: body?.remarks });
      await putDocs(cls, row.id, { ...docs, [type]: { ...d, status: decision, reviewedBy: user.username, reviewedAt: new Date().toISOString(), remarks: note,
        history: [...(d.history || []), event(decision, user, { remarks: note })] } });
    });
    return { ok: true };
  },

  // The submitted file (PDF / image), for the DMS of that student and for the super admin.
  async file({ user, params }) {
    const cls = await requireClass(user, parseClass(params.cls)), type = typeOf(params.type), row = await loadStudent(db, user, cls, params.id), d = (await getDocs(cls, row.id))[type];
    if (!d) throw new HttpError('This document has not been submitted', 404);
    return { file: storedPath(d.stored), name: d.fileName };
  },
};
