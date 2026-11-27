import { useEffect, useState } from 'react';
import { api } from '../../api/index.js';
import { LETTER_KINDS, TC_OUTCOME, TC_REJECTED_BY, stageOf } from '../../lib/status.js';
import { Alert, Badge, Icon, Loading, Modal, useConfirm } from '../../components/ui/index.js';
import { FileDrop } from '../../components/files/index.js';
import StatusBadge from './StatusBadge.jsx';
import StudentProfile from './StudentProfile.jsx';

const NO_LETTERS = { HM: null, STUDENT: null, REASON: null, TC: null };

const isTcStep = a => a.key.startsWith('TC_');
const isTcSubmit = a => a.key === 'TC_REQUEST' || a.key === 'TC_RESUBMIT';
const isApprove = a => /_APPROVE$/.test(a.key), isReject = a => /_REJECT$/.test(a.key);

// What the approver is told before a TC decision is final. The text follows the step: RC -> SC -> super admin.
const APPROVE_TEXT = {
  TC_RC_APPROVE: 'The request goes to the State Coordinator (SC).',
  TC_SC_APPROVE: 'The request goes to the Super Admin for the final approval.',
  TC_ADMIN_APPROVE: 'This issues the TC and releases the student\'s seat.',
};

// Every remark given on the TC request, newest request first. Read only: a remark is changed only by its owner, from the box under "TC request", while the request is with him.
function TcRemarks({ t }) {
  const rounds = [...t.rounds].reverse();
  return <section className="sheet"><h3 className="sheet__title">TC request remarks</h3>
    {rounds.map((r, i) => <div key={r.n} className={`tcround${i ? ' tcround--old' : ''}`}>
      <h4>{i === 0 ? (r.n > 1 ? `Current request · resubmission ${r.n - 1}` : 'Current request') : `Earlier request ${r.n}`}</h4>
      <ul className="tcremarks">{r.entries.map(e => <li key={e.stage}>
        <div className="tcremarks__head"><strong>{e.label}</strong><span className="muted">{e.by} · {new Date(e.at).toLocaleString()}</span>{TC_OUTCOME[e.outcome] && <Badge tone={TC_OUTCOME[e.outcome][1]}>{TC_OUTCOME[e.outcome][0]}</Badge>}</div>
        <p>{e.text || <span className="muted">No remark</span>}</p>
      </li>)}</ul>
    </div>)}
  </section>;
}

export default function StudentModal({ cls, id, user, onClose, onChange, mode = 'students' }) {
  const confirm = useConfirm();
  const [s, setS] = useState(null), [err, setErr] = useState(''), [remarks, setRemarks] = useState(''), [ov, setOv] = useState({ code: '', remarks: '' }), [busy, setBusy] = useState(false), [letters, setLetters] = useState(NO_LETTERS);

  // An approver whose turn it is starts from his own latest remark (this request's, or the one he gave before a resubmission), so he edits it instead of retyping it.
  const load = () => api(`/students/${cls}/${id}`).then(x => { setS(x); setOv(o => ({ ...o, code: '' })); setRemarks(x.actions.some(a => a.note) ? x.tcRemarks?.draft || '' : ''); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [cls, id]);

  if (!s) return <Modal rich className="modal--record" title="Student record" onClose={onClose}>{err ? <Alert>{err}</Alert> : <Loading />}</Modal>;

  // Always re-read the student afterwards: if another login changed it first, the screen shows the real status.
  const expect = () => ({ code: s.statusCode || '', tag2: s.state?.tag2 || '', tag1: s.state?.tag1 || '' });
  // After a step succeeds the dialog closes and the list behind it refreshes, so the next-step buttons (e.g. Joined after Selected) are never left under the cursor.
  const run = async (fn, { close = false } = {}) => { try { setBusy(true); await fn(); setErr(''); setRemarks(''); if (close) { onChange(); onClose(); return; } await load(); onChange(); } catch (e) { setErr(e.message); await load(); onChange(); } finally { setBusy(false); } };

  // A letter that is already on file for the TC request (a resubmission may keep it).
  const onFile = k => (s.letters || []).find(l => l.stage === 'TC_REQUEST' && l.kind === k);
  const lacks = a => (a.letters || []).find(k => !letters[k] && !(a.keepLetters && onFile(k)));

  const go = async a => {
    const need = a.letters || [], tcSubmit = isTcSubmit(a);
    if (a.needsLetter) {
      const miss = lacks(a);
      if (miss) return setErr(`Upload the ${LETTER_KINDS[miss]} (PDF, JPG or PNG, under 3 MB) before submitting`);
    }
    if (a.key === 'TC_REQUEST' && !(await confirm({ title: 'Request a TC?', message: `Request a TC for ${s.name} with the three files you added (student unwilling letter, HM letter, reason letter)?\n\nThe request goes to the Regional Coordinator, then the State Coordinator, then the Super Admin. Once submitted, the files cannot be edited.`, confirmLabel: 'Request TC' }))) return;
    if (a.key === 'TC_RESUBMIT' && !(await confirm({ title: 'Resubmit the TC request?', message: `Resubmit the TC request for ${s.name}?\n\nIt goes through the Regional Coordinator, the State Coordinator and the Super Admin again. All the earlier remarks stay visible to them.`, confirmLabel: 'Resubmit' }))) return;
    if (a.key === 'TC_WITHDRAW' && !(await confirm({ title: 'Withdraw the TC request?', message: `Withdraw the rejected TC request for ${s.name}? The student goes back to Joined.`, confirmLabel: 'Withdraw', danger: true }))) return;
    if (isTcStep(a) && isApprove(a) && !(await confirm({ title: 'Approve the TC request?', message: `${APPROVE_TEXT[a.key] || ''}\n\nYour remark is saved with the approval and cannot be changed afterwards.`, confirmLabel: 'Approve' }))) return;
    if (isTcStep(a) && isReject(a) && !(await confirm({ title: 'Reject the TC request?', message: `The request goes back to the HM as "Rejected - resubmit" with all the remarks. The HM can resubmit it, and it then goes through the same approvals again.`, confirmLabel: 'Reject', danger: true }))) return;
    if (a.key === 'JOINED_HM' && !(await confirm({ title: 'Mark as joined?', message: `Confirm that ${s.name} has been relieved and has joined your school. This takes the seat.`, confirmLabel: 'Joined' }))) return;
    if (a.needsLetter && !tcSubmit && !(await confirm({ title: 'Submit with letters?', message: `Submit "${a.label}" with the two letters?\n\nOnce submitted, the letters cannot be edited.`, confirmLabel: 'Submit' }))) return;
    const sent = need.filter(k => letters[k]);
    run(async () => {
      await api(`/students/${cls}/${id}/action`, { method: 'POST', body: { action: a.key, remarks, expect: expect(), ...(a.needsLetter ? { letters: Object.fromEntries(sent.map(k => [k, { fileName: letters[k].name, fileData: letters[k].data }])) } : {}) } });
      setLetters(NO_LETTERS);
    }, { close: !a.note });
  };

  const correct = async () => {
    if (!ov.code) return setErr('Choose the next status');
    if (!ov.remarks.trim()) return setErr('Enter the reason for the correction');
    if (!(await confirm({ title: 'Apply correction?', message: `Move ${s.name} to \"${stageOf(ov.code)}\"? The seat and the logs are updated.`, confirmLabel: 'Apply correction', danger: true }))) return;
    run(async () => { await api(`/students/${cls}/${id}/override`, { method: 'POST', body: { ...ov, expect: expect() } }); setOv(o => ({ ...o, remarks: '' })); }, { close: true });
  };

  const tcWait = a => isTcSubmit(a) && (!!lacks(a) || !remarks.trim());
  const tcMode = mode === 'tc', acts = s.actions.filter(a => tcMode === isTcStep(a)), needsRemarks = acts.some(a => a.needsRemarks), need = acts.find(a => a.needsLetter)?.letters || [], admin = user.role === 'SUPER_ADMIN' && !tcMode, next = s.nextStatuses || [];
  const keeps = acts.some(a => a.keepLetters), approving = acts.some(a => a.note), resubmitting = acts.some(isTcSubmit);
  const rejectedBy = s.statusCode === '8Z' ? String(s.state?.tag2 || '').replace('TC-REJ-', '') : '';

  const hasRemarks = s.tcRemarks?.rounds?.length > 0;
  const subtitle = [`EMIS ${s.emis}`, `Class ${s.classLevel ?? cls}`, s.district].filter(Boolean).join('  ·  ');

  // One page, no tabs: the student's details in full, then the TC remarks, the step to take, and for the super admin the correction and history.
  return <Modal rich className="modal--record" title={s.name} titleExtra={<StatusBadge r={s} />} subtitle={subtitle} leading={<span className="dialog__avatar" aria-hidden="true">{(s.name || '?')[0]}</span>} onClose={onClose}>
    <Alert>{err}</Alert>
    <div className="record">
      <StudentProfile s={s} cls={cls} id={id} />

      {hasRemarks && <TcRemarks t={s.tcRemarks} />}

      {acts.length > 0 && <section className="sheet"><h3 className="sheet__title">{tcMode ? 'TC request' : 'Action'}</h3>
          {rejectedBy && acts.some(isTcSubmit) && <p className="hint">This request was rejected by {TC_REJECTED_BY[rejectedBy] || 'an approver'}. Read the remarks above, then resubmit it (add your remark, and a new file wherever one needs correcting) or withdraw it.</p>}
          {need.length > 0 && <div className="letters">
            {need.map(k => <div className="letters__row" key={k}>
              <span className="doccard__label">{LETTER_KINDS[k]}</span>
              {keeps && onFile(k) && <span className="muted"> · on file: {onFile(k).fileName}; choose a new file only to replace it</span>}
              <FileDrop value={letters[k]} onChange={f => setLetters(x => ({ ...x, [k]: f }))} onError={setErr} label={LETTER_KINDS[k]} compact />
            </div>)}
          </div>}
          {needsRemarks && <>
            {approving && <p className="hint">Your remark is visible to everyone on this request. Only you can change it while the request is with you; the other remarks are read only.</p>}
            <textarea rows="2" aria-label="Remarks" placeholder={approving ? 'Your remark (required to reject)' : resubmitting ? 'Your remark for the resubmission' : undefined} value={remarks} onChange={e => setRemarks(e.target.value)} />
          </>}
          {acts.some(tcWait) && <p className="hint">To {acts.some(a => a.key === 'TC_RESUBMIT') ? 'resubmit' : 'request'} a TC, add your remark and attach the student unwilling letter, the HM letter and the reason letter.</p>}
          <div className="toolbar">{acts.map(a => <button key={a.key} type="button" className={`btn ${a.note ? '' : /^NOT_|REJECT|WITHDRAW/.test(a.key) ? 'btn--danger' : 'btn--primary'}`} disabled={busy || tcWait(a) || ((a.note || (isTcStep(a) && isReject(a))) && !remarks.trim())} onClick={() => go(a)}>{a.label}</button>)}</div>
      </section>}

      {admin && next.length > 0 && <section className="sheet sheet--danger"><h3 className="sheet__title">Correction (super admin) <span className="muted">· only the next status is offered</span></h3>
        <textarea rows="1" aria-label="Reason for the correction (required)" placeholder="Reason for the correction (required)" value={ov.remarks} onChange={e => setOv({ ...ov, remarks: e.target.value })} />
        <div className="toolbar"><select aria-label="Next status" value={ov.code} onChange={e => setOv({ ...ov, code: e.target.value })}><option value="">Choose next status</option>{next.map(n => <option key={n.code} value={n.code}>{n.label}</option>)}</select>
          <button type="button" className="btn btn--danger" disabled={busy || !ov.code || !ov.remarks.trim()} title={!ov.remarks.trim() ? 'Enter the reason for the correction first' : undefined} onClick={correct}>Apply correction</button></div>
      </section>}

      {admin && <section className="sheet"><h3 className="sheet__title">History</h3>
        {s.logs.length ? <ol className="hist">{s.logs.map(l => <li key={l.id}>
          <div className="hist__change">{stageOf(l.before)}<Icon n="chevR" size={14} />{l.after ? stageOf(l.after) : 'none'}</div>
          <div className="hist__meta">{l.by} · {new Date(l.at).toLocaleString()}</div>
          {l.remarks && <p className="hist__note">{l.remarks}</p>}
        </li>)}</ol> : <p className="muted">No changes recorded.</p>}
      </section>}
    </div>
  </Modal>;
}
