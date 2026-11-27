import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { readUpload } from './upload.js';

const PRESIGN_API = () => process.env.PRESIGN_API_URL || 'https://n07agelk4l.execute-api.ap-south-1.amazonaws.com/uploadsv1';
const VIEW_BASE = () => (process.env.CLOUDFRONT_URL || 'https://d2n7f898nmjqsn.cloudfront.net').replace(/\/+$/, '');
const TYPE = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const TIMEOUT = 20000;
const RETRIES = 3;                                    // 503 / 502 / 504 and network errors from AWS are usually momentary (cold start, throttling)
const wait = ms => new Promise(r => setTimeout(r, ms));
const snippet = async r => { try { return (await r.text()).replace(/\s+/g, ' ').slice(0, 200); } catch { return ''; } };

// fetch that tries again on a temporary failure, and says what AWS answered (status and the start of its body) when it gives up.
async function fetchAws(label, url, init) {
  let last;
  for (let i = 1; i <= RETRIES; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
      if (r.ok) return r;
      last = new Error(`${label} answered ${r.status} ${r.statusText} ${await snippet(r)}`.trim());
      if (![429, 500, 502, 503, 504].includes(r.status)) throw last;   // a 4xx will not get better by trying again
    } catch (e) {
      if (e === last) throw e;
      last = new Error(`${label} could not be reached: ${e.cause?.code || e.name || ''} ${e.message}`.trim());
    }
    if (i < RETRIES) await wait(400 * i * i);
  }
  throw last;
}
const fail = (msg, e) => { if (e) console.error(msg, e.message || e); return new HttpError('The file could not be uploaded. Please try again.', 502); };

const presignedUrlOf = body => {
  let j = body;
  try { j = JSON.parse(body); } catch { /* plain text */ }
  const u = typeof j === 'string' ? j : j?.presigned_url ?? j?.url ?? j?.uploadUrl ?? j?.presignedUrl ?? j?.signedUrl ?? j?.data?.url ?? j?.body?.url;
  return typeof u === 'string' ? u.trim().replace(/^"|"$/g, '') : '';
};

export async function uploadFile(fileName, fileData) {
  const { buf, ext, name } = readUpload(fileName, fileData);
  let presigned;
  try {
    const q = new URLSearchParams({ filename: crypto.randomUUID(), extension: ext.slice(1) });
    const r = await fetchAws('presign API', `${PRESIGN_API()}?${q}`, {});
    presigned = presignedUrlOf(await r.text());
  } catch (e) { throw fail('Presigned URL request failed:', e); }
  let key;
  try { key = new URL(presigned).pathname.replace(/^\/+/, ''); } catch { /* not an absolute URL */ }
  if (!key) throw fail('Presign API did not return a usable URL:', presigned);
  try {
    await fetchAws('bucket', presigned, { method: 'PUT', headers: { 'Content-Type': TYPE[ext] }, body: buf });
  } catch (e) { throw fail('Bucket upload failed:', e); }
  return { name, url: `${VIEW_BASE()}/${key}` };
}