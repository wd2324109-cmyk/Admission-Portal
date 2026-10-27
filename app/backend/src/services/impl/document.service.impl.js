import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { students as S } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { HttpError } from '../../common/http.js';
import { scope } from '../../common/query.js';
import { audit } from '../../common/audit.js';
import { UPLOADS } from '../../common/paths.js';
import { saveUpload } from '../../common/upload.js';
import { lockClass, lockStudent } from '../../common/locks.js';
import { DocumentService, DOC_TYPES, REQUIRED_DOCS } from '../document.service.js';

                                                                                                                  
                                                                                        
const did = (s, t) => `${s.id}-${DOC_TYPES.indexOf(t)}`;
const parse = id => { const [a, b] = String(id).split('-'); return [+a || 0, DOC_TYPES[+b]]; };
const okDoc = (docs, t) => docs[t] && docs[t].status !== 'REJECTED';
const hasDocs = sql`${S.documents} <> '{}'::jsonb`;
const summary = docs => {
  const req = REQUIRED_DOCS.map(t => docs[t]), all = Object.values(docs);
  return { submitted: req.filter(d => d && d.status !== 'REJECTED').length, verified: req.filter(d => d?.status === 'VERIFIED').length,
    pending: all.filter(d => d.status === 'PENDING').length, rejected: all.filter(d => d.status === 'REJECTED').length };
};
const entry = (name, stored, user) => ({ fileName: name, filePath: stored, status: 'PENDING', uploadedBy: user.username, uploadedAt: new Date().toISOString() });

export class DocumentServiceImpl extends DocumentService {
  async list({ user, query }) {
    const rows = await db.select().from(S).where(and(scope(user), hasDocs, +query.studentId ? eq(S.id, +query.studentId) : undefined));
    return rows.flatMap(s => Object.entries(s.documents).map(([t, d]) => ({ id: did(s, t), studentId: s.id, docType: t, fileName: d.fileName, status: d.status, uploadedBy: d.uploadedBy, uploadedAt: d.uploadedAt,
        reviewedBy: d.reviewedBy ?? null, reviewedAt: d.reviewedAt ?? null, remarks: d.remarks ?? null, regno: s.regno, name: s.name, classLevel: s.classLevel, district: s.district })))
      .filter(r => !query.status || r.status === query.status).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  }

  // Every write below re-reads the student row under a lock. The documents column is one JSON object,
  // so without the lock two uploads (or an upload and a review) would overwrite each other's changes.
  async upload({ user, body }) {
    const { studentId, docType, fileName, fileData } = body || {};
    const [pre] = await db.select().from(S).where(and(eq(S.id, +studentId || 0), scope(user)));
    if (!pre) throw new HttpError('Student not found in your district', 404);
    const check = s => {
      if (s.admitStatus !== 'Admitted') throw new HttpError('Documents can be uploaded only for admitted students');
      if (!DOC_TYPES.includes(docType)) throw new HttpError('Choose a valid document type');
      const old = s.documents[docType];
      if (old && old.status !== 'REJECTED') throw new HttpError(`${docType} is already uploaded and pending or verified`, 409);
      return old;
    };
    check(pre);
    const { stored, name } = await saveUpload(fileName, fileData);
    try {
      await db.transaction(async tx => {
        await lockClass(tx, pre.classLevel);
        const s = await lockStudent(tx, pre.id);
        const old = check(s);
        await tx.update(S).set({ documents: { ...s.documents, [docType]: entry(name, stored, user) } }).where(eq(S.id, s.id));
        await audit(tx, { user }, { action: old ? 'DOC_RESUBMIT' : 'DOC_UPLOAD', regno: s.regno, message: `${docType} ${old ? 'resubmitted' : 'uploaded'} for ${s.name}` });
      });
    } catch (e) { await fs.unlink(path.join(UPLOADS, stored)).catch(() => {}); throw e; }
    return { ok: true };
  }

  async replace({ user, params, body }) {
    const [sid, type] = parse(params.id);
    const [pre] = await db.select().from(S).where(and(eq(S.id, sid), scope(user)));
    if (!pre?.documents[type]) throw new HttpError('Document not found in your district', 404);
    const check = s => {
      const d = s?.documents[type];
      if (!d) throw new HttpError('Document not found in your district', 404);
      if (d.status === 'VERIFIED') throw new HttpError('A verified document cannot be edited', 409);
      if (d.status === 'PENDING' && REQUIRED_DOCS.every(t => okDoc(s.documents, t))) throw new HttpError('All 5 documents are submitted and under verification, so editing is locked', 409);
      return d;
    };
    check(pre);
    const { stored, name } = await saveUpload(body?.fileName, body?.fileData);
    let d;
    try {
      await db.transaction(async tx => {
        await lockClass(tx, pre.classLevel);
        const s = await lockStudent(tx, pre.id);
        d = check(s);                                        // a reviewer may have verified it a moment ago
        await tx.update(S).set({ documents: { ...s.documents, [type]: entry(name, stored, user) } }).where(eq(S.id, s.id));
        const edit = d.status === 'PENDING';
        await audit(tx, { user }, { action: edit ? 'DOC_EDIT' : 'DOC_RESUBMIT', regno: s.regno, message: `${type} ${edit ? 'replaced' : 'resubmitted after rejection'} for ${s.name}` });
      });
    } catch (e) { await fs.unlink(path.join(UPLOADS, stored)).catch(() => {}); throw e; }
    await fs.unlink(path.join(UPLOADS, d.filePath)).catch(() => {});      // old file removed only after the new one is committed
    return { ok: true };
  }

  async file({ user, params }) {
    const [sid, type] = parse(params.id);
    const [s] = await db.select().from(S).where(and(eq(S.id, sid), scope(user)));
    const d = s?.documents[type];
    if (!d) throw new HttpError('Not found', 404);
    return { file: path.join(UPLOADS, d.filePath), name: d.fileName };
  }

  async review({ user, params, body }) {
    const { decision, remarks = '' } = body || {};
    if (!['VERIFIED', 'REJECTED'].includes(decision)) throw new HttpError('Invalid decision');
    const note = String(remarks).trim();
    if (decision === 'REJECTED' && !note) throw new HttpError('Remarks are required to reject a document');
    const [sid, type] = parse(params.id);
    const [pre] = await db.select({ classLevel: S.classLevel }).from(S).where(eq(S.id, sid));
    if (!pre) throw new HttpError('Not found', 404);
    await db.transaction(async tx => {
      await lockClass(tx, pre.classLevel);
      const s = await lockStudent(tx, sid);
      const d = s?.documents[type];
      if (!d) throw new HttpError('Not found', 404);
      if (d.status !== 'PENDING') throw new HttpError('This document was already reviewed');
      if (decision === 'VERIFIED') {
        const missing = REQUIRED_DOCS.filter(t => !okDoc(s.documents, t));
        if (missing.length) throw new HttpError(`Cannot verify until all 5 required documents are submitted. Missing: ${missing.join(', ')}`, 409);
      }
      await tx.update(S).set({ documents: { ...s.documents, [type]: { ...d, status: decision, reviewedBy: user.username, reviewedAt: new Date().toISOString(), remarks: note || null } } }).where(eq(S.id, s.id));
      await audit(tx, { user }, { action: `DOC_${decision}`, regno: s.regno, message: `${type} of ${s.name}: ${decision.toLowerCase()}${note ? ' - ' + note : ''}`, undo: { docs: [{ id: s.id, type, before: d }] } });
    });
    return { ok: true };
  }

                                                                                                                                                                  
  async students({ user, query }) {
    const rows = await db.select().from(S).where(and(scope(user), hasDocs));
    return rows.map(s => {
      const sm = summary(s.documents), last = Object.values(s.documents).map(d => d.uploadedAt).sort().pop();
      return { studentId: s.id, regno: s.regno, name: s.name, classLevel: s.classLevel, district: s.district, ...sm, lastUploadedAt: last,
        state: sm.pending ? 'PENDING' : sm.verified === REQUIRED_DOCS.length ? 'VERIFIED' : 'REJECTED' };
    }).filter(r => !query.status || r.state === query.status).sort((a, b) => String(b.lastUploadedAt).localeCompare(String(a.lastUploadedAt)));
  }

                                                                       
  async progress({ user }) {
    const rows = await db.select().from(S).where(and(scope(user), hasDocs));
    return Object.fromEntries(rows.map(s => { const { submitted, verified } = summary(s.documents); return [s.id, { submitted, verified }]; }));
  }
}
