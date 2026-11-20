import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../api/index.js';
import { ALL_CODES, CODE, LETTER_KINDS, admitOf, stageOf } from '../../lib/status.js';
import { toBase64 } from '../../lib/format.js';
import { Alert, Modal, useConfirm } from '../../components/ui/index.js';
import StatusBadge from './StatusBadge.jsx';

const MAX_LETTER = 3 * 1024 * 1024;
// mode 'tc' (TC Requests screen): only the TC steps are offered. Otherwise (Student Details): every step except the TC ones,
// so "Request TC" exists in the TC Requests screen alone.
const isTcStep = a => a.key.startsWith('TC_');

// One student's record: details, the next allowed steps, the super admin's correction tool and the history.
export default function StudentModal({ cls, id, user, onClose, onChange, mode = 'students' }) {
  const confirm = useConfirm();
  const [s, setS] = useState(null), [err, setErr] = useState(''), [remarks, setRemarks] = useState(''), [ov, setOv] = useState({ code: '', remarks: '' }), [busy, setBusy] = useState(false), [letters, setLetters] = useState({ HM: null, STUDENT: null });

  const load = () => api(`/students/${cls}/${id}`).then(x => { setS(x); setOv(o => ({ ...o, code: x.state.code })); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [cls, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Modal title="Student record" onClose={onClose}>{err ? <Alert>{err}</Alert> : <p className="muted">Loading…</p>}</Modal>;

  const run = async fn => { try { setBusy(true); await fn(); setErr(''); setRemarks(''); await load(); onChange(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  const pickLetter = async (kind, f) => {
    if (!f) return setLetters(x => ({ ...x, [kind]: null }));
    if (f.size > MAX_LETTER) return setErr('Each letter must be under 3 MB');
    try { const data = await toBase64(f); setErr(''); setLetters(x => ({ ...x, [kind]: { name: f.name, data } })); } catch (e) { setErr(e.message); }
  };

  const go = async a => {
    if (a.key === 'TC_REQUEST' && !(await confirm({ title: 'Request a TC?', message: `Request a TC for ${s.name}?\n\nThe request goes to the Regional Coordinator, then to the State Regional Coordinator.`, confirmLabel: 'Request TC' }))) return;
    if (a.needsLetter) {
      const miss = Object.entries(LETTER_KINDS).find(([k]) => !letters[k]);
      if (miss) return setErr(`Upload the ${miss[1]} (PDF, JPG or PNG, under 3 MB) before submitting`);
      if (!(await confirm({ title: 'Submit with letters?', message: `Submit "${a.label}" with the two letters?\n\nOnce submitted, the letters cannot be edited.`, confirmLabel: 'Submit' }))) return;
    }
    run(async () => {
      await api(`/students/${cls}/${id}/action`, { method: 'POST', body: { action: a.key, remarks, ...(a.needsLetter ? { letters: Object.fromEntries(Object.keys(LETTER_KINDS).map(k => [k, { fileName: letters[k].name, fileData: letters[k].data }])) } : {}) } });
      setLetters({ HM: null, STUDENT: null });
    });
  };

  const correct = async () => {
    if (!(await confirm({ title: 'Apply correction?', message: 'Force this status? The seat and the logs are updated.', confirmLabel: 'Apply correction', danger: true }))) return;
    run(async () => { await api(`/students/${cls}/${id}/override`, { method: 'POST', body: ov }); setOv(o => ({ ...o, remarks: '' })); });
  };

  const tcMode = mode === 'tc', acts = s.actions.filter(a => tcMode === isTcStep(a)), needsRemarks = acts.some(a => a.needsRemarks), needsLetter = acts.some(a => a.needsLetter), admin = user.role === 'SUPER_ADMIN' && !tcMode;
  const rows = [
    ['EMIS', s.emis], ['Class', s.classLevel], ['Admit status', admitOf(s)], ['Gender / Medium', `${s.gender} / ${s.medium}`], ['Community', s.community + (s.disabilityStatus ? ' (PWD)' : '')],
    ['Father / Mother', `${s.fatherName || '—'} / ${s.motherName || '—'}`], ['District / Block', `${s.district || '—'} / ${s.block || '—'}`], ['School', s.schoolname], ['Phone', s.phone || '—'],
    ['Address', [s.address, s.pincode].filter(Boolean).join(' - ') || '—'], ['Quarterly / Half-yearly', `${s.mark1 ?? '—'} / ${s.mark2 ?? '—'}`],
    ['Overall rank', s.orank ?? '—'], ['Total (highest of two)', s.total ?? '—'], ['NMMS / TRUST / Other marks', [s.nmss, s.trust, s.otherMarks].map(v => v ?? '—').join(' / ')],
    ['Allotted to', s.newSchoolName ? `${s.newSchoolName} (${s.newDistcName})` : '—'], ['Seat category', s.selectedCategory || '—'], ['Note', s.remark1 || '—'],
    ...(s.letters || []).map(l => [`${l.label} (submitted, locked)`, <button type="button" className="btn btn--sm" onClick={() => downloadFile(`/students/${cls}/${id}/letter?stage=${l.stage}&kind=${l.kind}`).catch(e => setErr(e.message))}>{l.fileName}</button>]),
  ];

  return <Modal title={s.name} titleExtra={<StatusBadge r={s} />} width={780} onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
    <table className="kv"><tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>

    {acts.length > 0 && <section className="dialog__section"><h3>{tcMode ? 'TC request' : 'Next step'}</h3>
      {needsLetter && <div className="letters">
        <p className="hint">Both letters are needed. You can change or remove a letter until you submit; after submitting it cannot be edited.</p>
        {Object.entries(LETTER_KINDS).map(([k, label]) => <div className="letters__row" key={k}>
          <label>{label} <span className="muted">(PDF, JPG or PNG, under 3 MB)</span>
            <input key={letters[k]?.name || 'none-' + k} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => pickLetter(k, e.target.files[0])} /></label>
          {letters[k] && <span className="letters__chosen">Chosen: <b>{letters[k].name}</b> <button type="button" className="btn btn--sm" onClick={() => pickLetter(k, null)}>Remove</button></span>}
        </div>)}
      </div>}
      {needsRemarks && <textarea rows="2" aria-label="Remarks" placeholder={tcMode ? 'Reason for the TC / remarks' : 'Remarks / reason'} value={remarks} onChange={e => setRemarks(e.target.value)} />}
      <div className="toolbar">{acts.map(a => <button key={a.key} type="button" className={`btn ${/^NOT_|REJECT/.test(a.key) ? 'btn--danger' : 'btn--primary'}`} disabled={busy} onClick={() => go(a)}>{a.label}</button>)}</div>
    </section>}

    {tcMode && !acts.length && <p className="hint">{['3A', '3B'].includes(s.statusCode) ? 'Only the DMS can request a TC for a joined student.' : 'No TC step is waiting for you on this student.'}</p>}

    {admin && <section className="dialog__section"><h3>Correction (super admin)</h3>
      <div className="toolbar"><select aria-label="Status" value={ov.code} onChange={e => setOv({ ...ov, code: e.target.value })}>{ALL_CODES.map(c => <option key={c} value={c}>{c ? CODE[c] : 'Not listed (clear)'}</option>)}</select></div>
      <textarea rows="2" aria-label="Reason for the correction (required)" placeholder="Reason for the correction (required)" value={ov.remarks} onChange={e => setOv({ ...ov, remarks: e.target.value })} />
      <div className="toolbar"><button type="button" className="btn btn--danger" disabled={busy} onClick={correct}>Apply correction</button></div>
    </section>}

    <Alert>{err}</Alert>

    {admin && <section className="dialog__section"><h3>History</h3>
      {s.logs.length ? <ul className="history">{s.logs.map(l => <li key={l.id}>{new Date(l.at).toLocaleString()} · {l.by} · {stageOf(l.before)} → {l.after ? stageOf(l.after) : 'none'}{l.remarks ? ` · ${l.remarks}` : ''}</li>)}</ul> : <p className="muted">No changes recorded.</p>}
    </section>}
  </Modal>;
}
