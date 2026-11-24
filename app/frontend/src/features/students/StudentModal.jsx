import { useEffect, useState } from 'react';
import { api } from '../../api/index.js';
import { LETTER_KINDS, stageOf } from '../../lib/status.js';
import { toBase64 } from '../../lib/format.js';
import { Alert, Modal, useConfirm } from '../../components/ui/index.js';
import StatusBadge from './StatusBadge.jsx';
import StudentInfo from './StudentInfo.jsx';

const MAX_LETTER = 3 * 1024 * 1024, NO_LETTERS = { HM: null, STUDENT: null, TC: null };

const isTcStep = a => a.key.startsWith('TC_');

export default function StudentModal({ cls, id, user, onClose, onChange, mode = 'students' }) {
  const confirm = useConfirm();
  const [s, setS] = useState(null), [err, setErr] = useState(''), [remarks, setRemarks] = useState(''), [ov, setOv] = useState({ code: '', remarks: '' }), [busy, setBusy] = useState(false), [letters, setLetters] = useState(NO_LETTERS);

  const load = () => api(`/students/${cls}/${id}`).then(x => { setS(x); setOv(o => ({ ...o, code: '' })); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [cls, id]);

  if (!s) return <Modal title="Student record" onClose={onClose}>{err ? <Alert>{err}</Alert> : <p className="muted">Loading…</p>}</Modal>;

  // Always re-read the student afterwards: if another login changed it first, the screen shows the real status.
  const expect = () => ({ code: s.statusCode || '', tag2: s.state?.tag2 || '', tag1: s.state?.tag1 || '' });
  // After a step succeeds the dialog closes and the list behind it refreshes, so the next-step buttons (e.g. Joined after Selected) are never left under the cursor.
  const run = async (fn, { close = false } = {}) => { try { setBusy(true); await fn(); setErr(''); setRemarks(''); if (close) { onChange(); onClose(); return; } await load(); onChange(); } catch (e) { setErr(e.message); await load(); onChange(); } finally { setBusy(false); } };

  const pickLetter = async (kind, f) => {
    if (!f) return setLetters(x => ({ ...x, [kind]: null }));
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return setErr('The letter must be a PDF, JPG or PNG file');
    if (f.size > MAX_LETTER) return setErr('Each letter must be under 3 MB');
    try { const data = await toBase64(f); setErr(''); setLetters(x => ({ ...x, [kind]: { name: f.name, data } })); } catch (e) { setErr(e.message); }
  };

  const go = async a => {
    const need = a.letters || [], isTc = a.key === 'TC_REQUEST';
    if (a.needsLetter) {
      const miss = need.find(k => !letters[k]);
      if (miss) return setErr(`Upload the ${LETTER_KINDS[miss]} (PDF, JPG or PNG, under 3 MB) before submitting`);
    }
    if (isTc && !(await confirm({ title: 'Request a TC?', message: `Request a TC for ${s.name} with the TC request letter you added?\n\nThe request goes to the Regional Coordinator, then to the State Regional Coordinator. Once submitted, the letter cannot be edited.`, confirmLabel: 'Request TC' }))) return;
    if (a.key === 'JOINED_HM' && !(await confirm({ title: 'Mark as joined?', message: `Confirm that ${s.name} has been relieved and has joined your school. This takes the seat.`, confirmLabel: 'Joined' }))) return;
    if (a.needsLetter && !isTc && !(await confirm({ title: 'Submit with letters?', message: `Submit "${a.label}" with the two letters?\n\nOnce submitted, the letters cannot be edited.`, confirmLabel: 'Submit' }))) return;
    run(async () => {
      await api(`/students/${cls}/${id}/action`, { method: 'POST', body: { action: a.key, remarks, expect: expect(), ...(a.needsLetter ? { letters: Object.fromEntries(need.map(k => [k, { fileName: letters[k].name, fileData: letters[k].data }])) } : {}) } });
      setLetters(NO_LETTERS);
    }, { close: true });
  };

  const correct = async () => {
    if (!ov.code) return setErr('Choose the next status');
    if (!ov.remarks.trim()) return setErr('Enter the reason for the correction');
    if (!(await confirm({ title: 'Apply correction?', message: `Move ${s.name} to \"${stageOf(ov.code)}\"? The seat and the logs are updated.`, confirmLabel: 'Apply correction', danger: true }))) return;
    run(async () => { await api(`/students/${cls}/${id}/override`, { method: 'POST', body: { ...ov, expect: expect() } }); setOv(o => ({ ...o, remarks: '' })); }, { close: true });
  };

  const tcWait = a => a.key === 'TC_REQUEST' && !((a.letters || []).every(k => letters[k]) && remarks.trim());
  const tcMode = mode === 'tc', acts = s.actions.filter(a => tcMode === isTcStep(a)), needsRemarks = acts.some(a => a.needsRemarks), need = acts.find(a => a.needsLetter)?.letters || [], admin = user.role === 'SUPER_ADMIN' && !tcMode, next = s.nextStatuses || [];

  return <Modal title={s.name} titleExtra={<StatusBadge r={s} />} width={780} onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
    <StudentInfo s={s} cls={cls} id={id} onError={setErr} />

    {acts.length > 0 && <section className="dialog__section"><h3>{tcMode ? 'TC request' : 'Next step'}</h3>
      {need.length > 0 && <div className="letters">
        {need.map(k => <div className="letters__row" key={k}>
          <label>{LETTER_KINDS[k]} <span className="muted">(PDF, JPG or PNG, under 3 MB)</span>
            <input key={letters[k]?.name || 'none-' + k} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => pickLetter(k, e.target.files[0])} /></label>
          {letters[k] && <span className="letters__chosen">Chosen: <b>{letters[k].name}</b> <button type="button" className="btn btn--sm" onClick={() => pickLetter(k, null)}>Remove</button></span>}
        </div>)}
      </div>}
      {needsRemarks && <textarea rows="2" aria-label="Remarks" value={remarks} onChange={e => setRemarks(e.target.value)} />}
      {acts.some(tcWait) && <p className="hint">To request a TC, add a note and attach the TC letter.</p>}
      <div className="toolbar">{acts.map(a => <button key={a.key} type="button" className={`btn ${/^NOT_|REJECT/.test(a.key) ? 'btn--danger' : 'btn--primary'}`} disabled={busy || tcWait(a)} onClick={() => go(a)}>{a.label}</button>)}</div>
    </section>}


    {admin && next.length > 0 && <section className="dialog__section dialog__section--compact"><h3>Correction (super admin) <span className="muted">· only the next status is offered</span></h3>
      <textarea rows="1" aria-label="Reason for the correction (required)" placeholder="Reason for the correction (required)" value={ov.remarks} onChange={e => setOv({ ...ov, remarks: e.target.value })} />
      <div className="toolbar"><select aria-label="Next status" value={ov.code} onChange={e => setOv({ ...ov, code: e.target.value })}><option value="">Choose next status</option>{next.map(n => <option key={n.code} value={n.code}>{n.label}</option>)}</select>
        <button type="button" className="btn btn--danger" disabled={busy || !ov.code || !ov.remarks.trim()} title={!ov.remarks.trim() ? 'Enter the reason for the correction first' : undefined} onClick={correct}>Apply correction</button></div>
    </section>}

    <Alert>{err}</Alert>

    {admin && <section className="dialog__section"><h3>History</h3>
      {s.logs.length ? <ul className="history">{s.logs.map(l => <li key={l.id}>{new Date(l.at).toLocaleString()} · {l.by} · {stageOf(l.before)} → {l.after ? stageOf(l.after) : 'none'}{l.remarks ? ` · ${l.remarks}` : ''}</li>)}</ul> : <p className="muted">No changes recorded.</p>}
    </section>}
  </Modal>;
}
