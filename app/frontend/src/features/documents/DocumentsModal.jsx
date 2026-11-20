import { useEffect, useState } from 'react';
import { api, openFile } from '../../api/index.js';
import { DOC_NAMES, DOC_STATES, DOC_STATUS } from '../../lib/status.js';
import { toBase64, ts } from '../../lib/format.js';
import { Alert, Badge, Modal, useConfirm } from '../../components/ui/index.js';
import StudentInfo from '../students/StudentInfo.jsx';

const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png', DOC_MAX = 3 * 1024 * 1024;
const status = d => DOC_STATUS[d.status] || [d.status, 'neutral'];

export default function DocumentsModal({ cls, id, user, onClose, onChange }) {
  const confirm = useConfirm();
  const [s, setS] = useState(null), [info, setInfo] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [pick, setPick] = useState({}), [note, setNote] = useState({});
  const dms = user.role === 'DISTRICT', admin = user.role === 'SUPER_ADMIN';
  const load = () => api(`/documents/${cls}/${id}`).then(setS).catch(e => setErr(e.message));
  const loadInfo = () => api(`/students/${cls}/${id}`).then(setInfo).catch(() => {});
  useEffect(() => { load(); loadInfo(); }, [cls, id]);

  if (!s) return <Modal title="Documents" onClose={onClose}>{err ? <Alert>{err}</Alert> : <p className="muted">Loading…</p>}</Modal>;

  const run = async fn => { try { setBusy(true); await fn(); setErr(''); await load(); onChange(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const choose = async (t, f) => {
    if (!f) return setPick(x => ({ ...x, [t]: null }));
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return setErr('The document must be a PDF, JPG or PNG file');
    if (f.size > DOC_MAX) return setErr('Each document must be under 3 MB');
    try { const data = await toBase64(f); setErr(''); setPick(x => ({ ...x, [t]: { name: f.name, data } })); } catch (e) { setErr(e.message); }
  };

  const complete = t => !!pick[t] || (!!s.docs[t] && s.docs[t].status !== 'REJECTED');
  const done = s.required.filter(complete).length, ready = done === s.required.length;
  const changed = s.required.filter(t => pick[t]), canSubmit = ready && changed.length > 0;
  const allLocked = s.required.every(t => s.docs[t]?.locked);

  const submitAll = async () => {
    if (!canSubmit) return;
    if (!(await confirm({ title: 'Submit the documents?', message: `Submit ${changed.length} document${changed.length > 1 ? 's' : ''} of ${s.name} for verification?\n\nYou can still replace a document and submit again until it is verified.`, confirmLabel: 'Submit' }))) return;
    const docs = Object.fromEntries(changed.map(t => [t, { fileName: pick[t].name, fileData: pick[t].data }]));
    run(async () => { await api(`/documents/${cls}/${id}`, { method: 'POST', body: { docs } }); setPick({}); });
  };
  const review = async (t, decision) => {
    if (decision === 'REJECTED' && !(note[t] || '').trim()) return setErr('Write the reason for rejecting this document');
    if (decision === 'VERIFIED' && !(await confirm({ title: 'Verify this document?', message: `Verify the ${DOC_NAMES[t]} of ${s.name}?\n\nOnce verified, the document cannot be changed.`, confirmLabel: 'Verify' }))) return;
    run(async () => { await api(`/documents/${cls}/${id}/${t}/review`, { method: 'POST', body: { decision, remarks: note[t] || '' } }); setNote(x => ({ ...x, [t]: '' })); });
  };
  const [sumLabel, sumTone] = DOC_STATES[s.state] || [s.state, 'neutral'];
  const footer = <>
    <button type="button" className="btn" onClick={onClose}>Close</button>
    {dms && !allLocked && <button type="button" className="btn btn--primary" disabled={busy || !canSubmit} onClick={submitAll}>Submit documents</button>}
  </>;

  return <Modal title={s.name} titleExtra={<Badge tone={sumTone}>{sumLabel}</Badge>} width={780} onClose={onClose} footer={footer}>
    <section className="dialog__section dialog__section--first"><h3>Student details</h3>
      {info ? <StudentInfo s={info} cls={cls} id={id} showLetters={false} onError={setErr} />
        : <p className="hint">EMIS {s.emis} · {s.district || '—'} · {s.community}{s.pwd ? ' (PWD)' : ''} · {s.school || '—'}</p>}
    </section>

    <section className="dialog__section"><h3>Documents</h3>
      {dms && !allLocked && <p className={`docprogress ${ready ? 'docprogress--ready' : ''}`} role="status"><b>{done} of {s.required.length}</b> documents ready{ready ? (changed.length ? ' · you can submit now.' : ' · all are submitted; choose a new file to replace one.') : '.'}</p>}
      {s.required.map(t => { const d = s.docs[t]; return <section className="docrow" key={t}>
        <div className="toolbar toolbar--between"><b>{DOC_NAMES[t]}</b>{pick[t] ? <Badge tone="info">Ready to submit</Badge> : d ? <Badge tone={status(d)[1]}>{status(d)[0]}</Badge> : <Badge>{dms ? 'Not added' : 'Not submitted'}</Badge>}</div>
        {d && <>
          <p className="hint">{d.fileName} · submitted by {d.submittedBy} · {ts(d.submittedAt)}{d.submissions > 1 ? ` · submitted ${d.submissions} times` : ''}</p>
          <div className="toolbar"><button type="button" className="btn btn--sm" onClick={() => openFile(`/documents/${cls}/${id}/${t}/file`).catch(e => setErr(e.message))}>View file</button></div>
          {d.status === 'REJECTED' && <p className="text-bad">Rejected{d.reviewedBy ? ` by ${d.reviewedBy}` : ''}: {d.remarks || '—'}</p>}
          {d.status === 'VERIFIED' && <p className="hint">Verified by {d.reviewedBy} · {ts(d.reviewedAt)}{d.remarks ? ` · ${d.remarks}` : ''}</p>}
        </>}
        {dms && (d?.locked ? null
          : <div className="docpick"><label>{d ? (d.status === 'REJECTED' ? 'Add the corrected document' : 'Replace the document') : 'Choose the document'} <span className="muted">(PDF, JPG or PNG, under 3 MB)</span>
            <input key={pick[t]?.name || 'none-' + t} type="file" accept={DOC_ACCEPT} onChange={e => choose(t, e.target.files[0])} /></label>
            {pick[t] && <span className="letters__chosen">Chosen: <b>{pick[t].name}</b> <button type="button" className="btn btn--sm" onClick={() => choose(t, null)}>Remove</button></span>}</div>)}
        {admin && d?.status === 'PENDING' && <div className="docpick"><textarea rows="2" aria-label={`Remarks for ${DOC_NAMES[t]}`} value={note[t] || ''} onChange={e => setNote(x => ({ ...x, [t]: e.target.value }))} />
          <div className="toolbar"><button type="button" className="btn btn--primary" disabled={busy} onClick={() => review(t, 'VERIFIED')}>Verify</button><button type="button" className="btn btn--danger" disabled={busy} onClick={() => review(t, 'REJECTED')}>Reject</button></div></div>}
        {admin && d?.history?.length > 0 && <details className="details"><summary>History ({d.history.length})</summary>{d.history.map((h, i) => <p className="hint" key={i}>{ts(h.at)} · {h.by} · {String(h.type).toLowerCase()}{h.fileName ? ` · ${h.fileName}` : ''}{h.remarks ? ` · ${h.remarks}` : ''}</p>)}</details>}
      </section>; })}
      <Alert>{err}</Alert>
    </section>
  </Modal>;
}
