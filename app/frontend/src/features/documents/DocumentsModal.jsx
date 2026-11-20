import { useEffect, useState } from 'react';
import { api, openFile } from '../../api/index.js';
import { DOC_NAMES, DOC_STATES, DOC_STATUS } from '../../lib/status.js';
import { toBase64, ts } from '../../lib/format.js';
import { Alert, Badge, Modal, useConfirm } from '../../components/ui/index.js';

const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png', DOC_MAX = 3 * 1024 * 1024;
const status = d => DOC_STATUS[d.status] || [d.status, 'neutral'];

// One student's mandatory documents. The DMS submits (and may replace until verified); the super admin verifies or rejects.
export default function DocumentsModal({ cls, id, user, onClose, onChange }) {
  const confirm = useConfirm();
  const [s, setS] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [pick, setPick] = useState({}), [note, setNote] = useState({});
  const dms = user.role === 'DISTRICT', admin = user.role === 'SUPER_ADMIN';
  const load = () => api(`/documents/${cls}/${id}`).then(setS).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [cls, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Modal title="Documents" onClose={onClose}>{err ? <Alert>{err}</Alert> : <p className="muted">Loading…</p>}</Modal>;

  const run = async fn => { try { setBusy(true); await fn(); setErr(''); await load(); onChange(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const choose = async (t, f) => {
    if (!f) return setPick(x => ({ ...x, [t]: null }));
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return setErr('The document must be a PDF, JPG or PNG file');
    if (f.size > DOC_MAX) return setErr('Each document must be under 3 MB');
    try { const data = await toBase64(f); setErr(''); setPick(x => ({ ...x, [t]: { name: f.name, data } })); } catch (e) { setErr(e.message); }
  };
  const submit = t => run(async () => { await api(`/documents/${cls}/${id}/${t}`, { method: 'POST', body: { fileName: pick[t].name, fileData: pick[t].data } }); setPick(x => ({ ...x, [t]: null })); });
  const review = async (t, decision) => {
    if (decision === 'REJECTED' && !(note[t] || '').trim()) return setErr('Write the reason for rejecting this document');
    if (decision === 'VERIFIED' && !(await confirm({ title: 'Verify this document?', message: `Verify the ${DOC_NAMES[t]} of ${s.name}?\n\nOnce verified, the document cannot be changed.`, confirmLabel: 'Verify' }))) return;
    run(async () => { await api(`/documents/${cls}/${id}/${t}/review`, { method: 'POST', body: { decision, remarks: note[t] || '' } }); setNote(x => ({ ...x, [t]: '' })); });
  };
  const [sumLabel, sumTone] = DOC_STATES[s.state] || [s.state, 'neutral'];

  return <Modal title={s.name} titleExtra={<Badge tone={sumTone}>{sumLabel}</Badge>} width={720} onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
    <p className="hint">EMIS {s.emis} · {s.district || '—'} · {s.community}{s.pwd ? ' (PWD)' : ''} · {s.school || '—'}</p>
    <p className="hint">{s.pwd ? 'Willing letter, TC, Community certificate and PWD letter are mandatory.' : 'Willing letter, TC and Community certificate are mandatory.'} {dms ? 'You can change a document and submit it again until it is verified.' : 'A verified document cannot be changed.'}</p>
    {s.required.map(t => { const d = s.docs[t]; return <section className="docrow" key={t}>
      <div className="toolbar toolbar--between"><b>{DOC_NAMES[t]}</b>{d ? <Badge tone={status(d)[1]}>{status(d)[0]}</Badge> : <Badge>Not submitted</Badge>}</div>
      {d && <>
        <p className="hint">{d.fileName} · submitted by {d.submittedBy} · {ts(d.submittedAt)}{d.submissions > 1 ? ` · submitted ${d.submissions} times` : ''}</p>
        <div className="toolbar"><button type="button" className="btn btn--sm" onClick={() => openFile(`/documents/${cls}/${id}/${t}/file`).catch(e => setErr(e.message))}>View file</button></div>
        {d.status === 'REJECTED' && <p className="text-bad">Rejected{d.reviewedBy ? ` by ${d.reviewedBy}` : ''}: {d.remarks || '—'}</p>}
        {d.status === 'VERIFIED' && <p className="hint">Verified by {d.reviewedBy} · {ts(d.reviewedAt)}{d.remarks ? ` · ${d.remarks}` : ''}</p>}
      </>}
      {dms && (d?.locked
        ? <p className="hint">Verified: this document is final and cannot be changed.</p>
        : <div className="docpick"><label>{d ? 'Replace and submit again' : 'Choose the document'} <span className="muted">(PDF, JPG or PNG, under 3 MB)</span>
          <input key={pick[t]?.name || 'none-' + t} type="file" accept={DOC_ACCEPT} onChange={e => choose(t, e.target.files[0])} /></label>
          <div className="toolbar"><button type="button" className="btn btn--primary" disabled={busy || !pick[t]} onClick={() => submit(t)}>{d ? 'Submit again' : 'Submit'}</button>{pick[t] && <button type="button" className="btn" onClick={() => choose(t, null)}>Remove</button>}</div></div>)}
      {admin && !d && <p className="hint">The DMS has not submitted this document yet.</p>}
      {admin && d?.status === 'PENDING' && <div className="docpick"><textarea rows="2" aria-label={`Remarks for ${DOC_NAMES[t]}`} placeholder="Reason (required to reject)" value={note[t] || ''} onChange={e => setNote(x => ({ ...x, [t]: e.target.value }))} />
        <div className="toolbar"><button type="button" className="btn btn--primary" disabled={busy} onClick={() => review(t, 'VERIFIED')}>Verify</button><button type="button" className="btn btn--danger" disabled={busy} onClick={() => review(t, 'REJECTED')}>Reject</button></div></div>}
      {admin && d?.status === 'REJECTED' && <p className="hint">Waiting for the DMS to submit it again.</p>}
      {admin && d?.history?.length > 0 && <details className="details"><summary>History ({d.history.length})</summary>{d.history.map((h, i) => <p className="hint" key={i}>{ts(h.at)} · {h.by} · {String(h.type).toLowerCase()}{h.fileName ? ` · ${h.fileName}` : ''}{h.remarks ? ` · ${h.remarks}` : ''}</p>)}</details>}
    </section>; })}
    <Alert>{err}</Alert>
  </Modal>;
}
