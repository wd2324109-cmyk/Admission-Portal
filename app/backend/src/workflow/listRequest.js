// "Request a new list": when a DMS has decided most of the students on its lists, it may ask the super admin to revise the list.
// A student is DECIDED once the DMS has acted on him; he is still PENDING while he is Waiting (1A) or Waiting (reconsidered, 1B).
export const TAG = 'LIST_REQUEST', OPEN = 'OPEN', DONE = 'DONE';
export const PENDING_CODES = ['1A', '1B'];

const envPercent = process.env.LIST_REQUEST_MIN_PERCENT;
/** Share of the DMS's listed students that must be decided before it may raise a request (default 80, set LIST_REQUEST_MIN_PERCENT to change). */
export const MIN_PERCENT = envPercent !== undefined && envPercent !== '' && Number.isFinite(+envPercent) ? Math.min(100, Math.max(0, +envPercent)) : 80;

/** total = students on the DMS's lists, waiting = those still Waiting. Returns the progress and whether a request may be raised. */
export function progress({ total, waiting }, minPercent = MIN_PERCENT) {
  const t = Math.max(0, +total || 0), w = Math.min(t, Math.max(0, +waiting || 0)), decided = t - w, percent = t ? Math.floor((decided * 100) / t) : 0;
  let reason = null;
  if (!t) reason = 'No students have been listed for your school yet.';
  else if (decided * 100 < minPercent * t) reason = `A new list can be requested once at least ${minPercent}% of your listed students are decided. Now ${decided} of ${t} (${percent}%).`;
  return { total: t, waiting: w, decided, percent, minPercent, canRequest: !reason, reason };
}

/** The request row keeps its figures as JSON in remark2 of Student_LOG. Never throws on odd text. */
export const readMeta = text => { try { const m = JSON.parse(text || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; } };
