import { useEffect, useState } from 'react';
import { api, fileSource } from '../../api/index.js';
import { DOC_NAMES, DOC_STATES, DOC_STATUS } from '../../lib/status.js';
import { ts } from '../../lib/format.js';
import { Alert, Badge, Icon, Modal, useConfirm } from '../../components/ui/index.js';
import { FileDrop, FileViewer } from '../../components/files/index.js';
import StudentInfo from '../students/StudentInfo.jsx';

const status = d => DOC_STATUS[d.status] || [d.status, 'neutral'];
const TILE = { VERIFIED: ['ok', 'ok'], PENDING: ['warn', 'clock'], REJECTED: ['bad', 'no'] };

export default function DocumentsModal({ cls, id, user, onClose, onChange }) {
  const confirm = useConfirm();
  const [s, setS] = useState(null), [info, setInfo] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [pick, setPick] = useState({}), [note, setNote] = useState({}), [view, setView] = useState(null);
  const dms = user.role === 'DISTRICT', admin = user.role === 'SUPER_ADMIN';
  const load = () => api(`/documents/${cls}/${id}`).then(d => { setS(d); return d; }).catch(e => { setErr(e.message); return null; });
  const loadInfo = () => api(`/students/${cls}/${id}`).then(setInfo).catch(() => {});
  useEffect(() => { load(); loadInfo(); }, [cls, id]);

  if (!s) return <Modal title="Documents" onClose={onClose}>{err ? <Alert>{err}</Alert> : <p className="muted">Loading…</p>}</Modal>;

  const run = async fn => { try { setBusy(true); await fn(); setErr(''); const d = await load(); onChange(); return d; } catch (e) { setErr(e.message); return null; } finally { setBusy(false); } };
  const total = s.required.length, have = s.required.filter(t => s.docs[t]), verified = s.required.filter(t => s.docs[t]?.status === 'VERIFIED').length;
  const complete = t => !!pick[t] || (!!s.docs[t] && s.docs[t].status !== 'REJECTED');
  const done = s.required.filter(complete).length, ready = done === total;
  const changed = s.required.filter(t => pick[t]), canSubmit = ready && changed.length > 0;
  const allLocked = s.required.every(t => s.docs[t]?.locked);
  const submitting = dms && !allLocked, meterNow = submitting ? done : verified, meterText = submitting ? 'ready to submit' : 'verified';

  const submitAll = async () => {
    if (!canSubmit) return;
    if (!(await confirm({ title: 'Submit the documents?', message: `Submit ${changed.length} document${changed.length > 1 ? 's' : ''} of ${s.name} for verification?\n\nYou can still replace a document and submit again until it is verified.`, confirmLabel: 'Submit' }))) return;
    const docs = Object.fromEntries(changed.map(t => [t, { fileName: pick[t].name, fileData: pick[t].data }]));
    run(async () => { await api(`/documents/${cls}/${id}`, { method: 'POST', body: { docs } }); setPick({}); });
  };
  const review = async (t, decision) => {
    if (decision === 'REJECTED' && !(note[t] || '').trim()) return setErr('Write the reason for rejecting this document');
    if (decision === 'VERIFIED' && !(await confirm({ title: 'Verify this document?', message: `Verify the ${DOC_NAMES[t]} of ${s.name}?\n\nOnce verified, the document cannot be changed.`, confirmLabel: 'Verify' }))) return;
    const fresh = await run(async () => { await api(`/documents/${cls}/${id}/${t}/review`, { method: 'POST', body: { decision, remarks: note[t] || '' } }); setNote(x => ({ ...x, [t]: '' })); });
    const next = fresh?.required.find(x => fresh.docs[x]?.status === 'PENDING');
    if (next) setView(next); // keep reviewing: go straight to the next document that is waiting
  };

  const [sumLabel, sumTone] = DOC_STATES[s.state] || [s.state, 'neutral'];
  const items = have.map(t => { const d = s.docs[t], [label, tone] = status(d); return {
    key: t, title: DOC_NAMES[t], name: d.fileName, rev: `${d.submittedAt}|${d.fileName}`, subtitle: `${d.fileName} · ${ts(d.submittedAt)}`,
    badge: <Badge tone={tone}>{label}</Badge>, load: () => fileSource(`/documents/${cls}/${id}/${t}/file`),
  }; });

  // The panel next to the file in the viewer: what is known about it and, for the super admin, the verify / reject form.
  const side = item => {
    const t = item.key, d = s.docs[t];
    if (!d) return null;
    return <div className="reviewpane">
      <p className="reviewpane__who"><b>{s.name}</b><span>EMIS {s.emis} · {s.district || '—'}</span></p>
      <dl className="facts">
        <div><dt>Document</dt><dd>{DOC_NAMES[t]}</dd></div>
        <div><dt>File</dt><dd>{d.fileName}</dd></div>
        <div><dt>Submitted</dt><dd>{ts(d.submittedAt)} by {d.submittedBy}{d.submissions > 1 ? ` · ${d.submissions} times` : ''}</dd></div>
        {d.reviewedBy && <div><dt>Reviewed</dt><dd>{d.reviewedBy} · {ts(d.reviewedAt)}</dd></div>}
      </dl>
      {d.status === 'REJECTED' && <div className="callout callout--bad"><Icon n="alert" size={16} /><div><b>Rejected</b><p>{d.remarks || '—'}</p></div></div>}
      {d.status === 'VERIFIED' && <div className="callout callout--ok"><Icon n="ok" size={16} /><div><b>Verified</b>{d.remarks && <p>{d.remarks}</p>}</div></div>}
      {admin && d.status === 'PENDING' && <div className="reviewpane__form">
        <label htmlFor={`note-${t}`}>Remarks <span className="muted">(required to reject)</span></label>
        <textarea id={`note-${t}`} rows="3" value={note[t] || ''} onChange={e => setNote(x => ({ ...x, [t]: e.target.value }))} />
        <div className="toolbar">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => review(t, 'VERIFIED')}><Icon n="check" size={15} /> Verify</button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => review(t, 'REJECTED')}><Icon n="x" size={15} /> Reject</button>
        </div>
      </div>}
      {dms && !d.locked && <p className="hint">To change this file, close the viewer and add a new one on its card.</p>}
      <Alert>{err}</Alert>
    </div>;
  };

  const footer = <>
    <button type="button" className="btn" onClick={onClose}>Close</button>
    {submitting && <button type="button" className="btn btn--primary" disabled={busy || !canSubmit} onClick={submitAll}>{changed.length ? `Submit ${changed.length} document${changed.length > 1 ? 's' : ''}` : 'Submit documents'}</button>}
  </>;

  return <Modal title={s.name} titleExtra={<Badge tone={sumTone}>{sumLabel}</Badge>} width={860} onClose={onClose} footer={footer}>
    <details className="studentbar">
      <summary><span>EMIS {s.emis} · {s.district || '—'} · {s.community}{s.pwd ? ' (PWD)' : ''} · {s.school || '—'}</span><span className="studentbar__more">Student details</span></summary>
      {info ? <StudentInfo s={info} cls={cls} id={id} showLetters={false} /> : <p className="hint">Loading…</p>}
    </details>

    <div className="docsummary">
      <div className="docsummary__text"><b>{meterNow} of {total}</b> documents {meterText}
        {submitting && ready && <span className="muted">{changed.length ? ' · you can submit now' : ' · add a new file to replace one'}</span>}</div>
      <div className="meter" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={meterNow} aria-label={`Documents ${meterText}`}><span style={{ width: `${total ? (meterNow / total) * 100 : 0}%` }} /></div>
      {have.length > 0 && <button type="button" className="btn btn--sm" onClick={() => setView(have.find(t => admin && s.docs[t].status === 'PENDING') || have[0])}><Icon n="eye" size={14} /> {admin ? 'Review in viewer' : 'View all'}</button>}
    </div>

    <div className="doccards">
      {s.required.map(t => {
        const d = s.docs[t], p = pick[t], [tile, icon] = d ? TILE[d.status] || ['neutral', 'doc'] : ['neutral', 'doc'];
        const prompt = d ? (d.status === 'REJECTED' ? 'Add the corrected document' : 'Replace the document') : 'Upload the document';
        return <article className={`doccard doccard--${p ? 'info' : tile}`} key={t}>
          <header className="doccard__head">
            <span className="doccard__icon"><Icon n={p ? 'up' : icon} size={18} /></span>
            <div className="doccard__title"><b>{DOC_NAMES[t]}</b><small title={d?.fileName}>{d ? d.fileName : 'No file yet'}</small></div>
            {p ? <Badge tone="info">Ready to submit</Badge> : d ? <Badge tone={status(d)[1]}>{status(d)[0]}</Badge> : <Badge>{dms ? 'Not added' : 'Not submitted'}</Badge>}
          </header>
          {d && <p className="doccard__line">Submitted by {d.submittedBy} · {ts(d.submittedAt)}{d.submissions > 1 ? ` · ${d.submissions} times` : ''}</p>}
          {d?.status === 'REJECTED' && <div className="callout callout--bad"><Icon n="alert" size={16} /><div><b>Rejected{d.reviewedBy ? ` by ${d.reviewedBy}` : ''}</b><p>{d.remarks || '—'}</p></div></div>}
          {d?.status === 'VERIFIED' && <p className="doccard__line doccard__line--ok"><Icon n="ok" size={14} /> Verified by {d.reviewedBy} · {ts(d.reviewedAt)}{d.remarks ? ` · ${d.remarks}` : ''}</p>}
          {d && <div className="doccard__actions">
            <button type="button" className={`btn btn--sm${admin && d.status === 'PENDING' ? ' btn--primary' : ''}`} onClick={() => setView(t)}><Icon n="eye" size={14} /> {admin && d.status === 'PENDING' ? 'Review' : 'View'}</button>
          </div>}
          {dms && !d?.locked && <div className="doccard__drop">
            <span className="doccard__label">{prompt}</span>
            <FileDrop value={p} onChange={f => setPick(x => ({ ...x, [t]: f }))} onError={setErr} label={DOC_NAMES[t]} compact={!!d || !!p} />
          </div>}
          {admin && d?.history?.length > 0 && <details className="details"><summary>History ({d.history.length})</summary>
            <ul className="timeline">{d.history.map((h, i) => <li key={i}><b>{String(h.type).toLowerCase()}</b> · {h.by} · {ts(h.at)}{h.fileName ? ` · ${h.fileName}` : ''}{h.remarks ? <span className="muted"> — {h.remarks}</span> : null}</li>)}</ul></details>}
        </article>;
      })}
    </div>
    <Alert>{err}</Alert>
    {view && <FileViewer items={items} current={view} onCurrent={setView} onClose={() => setView(null)} side={side} />}
  </Modal>;
}
