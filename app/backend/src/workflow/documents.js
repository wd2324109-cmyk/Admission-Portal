// Document Verification: the papers of a JOINED student (3A / 3B).
//
//   Mandatory for every student : Willing letter, Transfer Certificate (TC), Community certificate
//   Also mandatory for a PWD    : PWD letter
//
// The DMS user submits each document. The super admin verifies (or rejects, with a reason) each one.
//   PENDING  - submitted, waiting for the super admin.            The DMS may replace it, as often as it wants.
//   REJECTED - the super admin sent it back (reason given).       The DMS may resubmit, as often as it wants.
//   VERIFIED - the super admin accepted it.                        FINAL: nothing can change it any more.
import { HttpError } from '../common/http.js';

export const DOC_TYPES = { WILLING: 'Willing letter', TC: 'Transfer Certificate (TC)', COMMUNITY: 'Community certificate', PWD: 'PWD letter' };
export const BASE_DOCS = ['WILLING', 'TC', 'COMMUNITY'];
export const JOINED = ['3A', '3B'];

/** The documents this student must submit (the PWD letter only when the student is PWD). */
export const requiredFor = student => [...BASE_DOCS, ...(student?.disabilityStatus ? ['PWD'] : [])];

// Overall state of a student's documents. The first rule that fits wins.
export const STATES = {
  VERIFIED: 'Verified',
  PENDING: 'Awaiting verification',
  REJECTED: 'Rejected - resubmit',
  INCOMPLETE: 'Incomplete',
  NOT_SUBMITTED: 'Not submitted',
};

/** docs = { TYPE: record }, required = the types needed. Returns the counts and the overall state. */
export function summarize(docs = {}, required = BASE_DOCS) {
  const st = t => docs[t]?.status;
  const c = { total: required.length,
    verified: required.filter(t => st(t) === 'VERIFIED').length, pending: required.filter(t => st(t) === 'PENDING').length,
    rejected: required.filter(t => st(t) === 'REJECTED').length, missing: required.filter(t => !docs[t]).length };
  const state = c.verified === c.total ? 'VERIFIED' : c.pending ? 'PENDING' : c.rejected ? 'REJECTED' : c.missing === c.total ? 'NOT_SUBMITTED' : 'INCOMPLETE';
  return { ...c, state };
}

/** May the DMS submit (or replace / resubmit) this document now? Throws if not. */
export function planSubmit({ code, student, type, doc }) {
  if (!Object.hasOwn(DOC_TYPES, type)) throw new HttpError('Unknown document');
  if (!JOINED.includes(code)) throw new HttpError('Documents are submitted only for joined students', 409);
  if (!requiredFor(student).includes(type)) throw new HttpError(`${DOC_TYPES[type]} is needed only for a PWD student`, 400);
  if (doc?.status === 'VERIFIED') throw new HttpError(`The ${DOC_TYPES[type]} is verified and cannot be changed`, 409);
  return { resubmission: !!doc };
}

/** May the super admin verify / reject this document now? Throws if not. */
export function planReview({ doc, decision, remarks }) {
  if (!['VERIFIED', 'REJECTED'].includes(decision)) throw new HttpError('Choose Verify or Reject');
  if (!doc) throw new HttpError('This document has not been submitted', 404);
  if (doc.status === 'VERIFIED') throw new HttpError('This document is already verified and cannot be changed', 409);
  if (doc.status === 'REJECTED') throw new HttpError('This document was rejected; the DMS has to submit it again', 409);
  const note = String(remarks || '').trim();
  if (decision === 'REJECTED' && !note) throw new HttpError('Remarks are required to reject a document');
  return { note: note || null };
}
