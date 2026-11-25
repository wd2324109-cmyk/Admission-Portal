import { downloadFile } from '../../api/index.js';
import { admitOf } from '../../lib/status.js';

export default function StudentInfo({ s, cls, id, onError = () => {}, showLetters = true }) {
  const rows = [
    ['EMIS', s.emis], ['Class', s.classLevel], ['Admit status', admitOf(s)], ['Gender / Medium', `${s.gender} / ${s.medium}`], ['Community', s.community + (s.disabilityStatus ? ' (PWD)' : '')],
    ['Father / Mother', `${s.fatherName || '—'} / ${s.motherName || '—'}`], ['District / Block', `${s.district || '—'} / ${s.block || '—'}`], ['School', s.schoolname], ['Phone', s.phone || '—'],
    ['Address', [s.address, s.pincode].filter(Boolean).join(' - ') || '—'], ['Quarterly / Half-yearly', `${s.mark1 ?? '—'} / ${s.mark2 ?? '—'}`],
    ['Overall rank', s.orank ?? '—'], ['Total (highest of two)', s.total ?? '—'], ['NMMS / TRUST / Other marks', [s.nmss, s.trust, s.otherMarks].map(v => v ?? '—').join(' / ')],
    ['Allotted to', s.newSchoolName ? `${s.newSchoolName} (${s.newDistcName})` : '—'], ['Seat category', s.selectedCategory || '—'], ['Vacancy ref', s.vacancyRef || '—'], ['Note', s.remark1 || '—'],
    ...(showLetters ? s.letters || [] : []).map(l => [`${l.label} (submitted, locked)`, <button type="button" className="btn btn--sm" onClick={() => downloadFile(`/students/${cls}/${id}/letter?stage=${l.stage}&kind=${l.kind}`).catch(e => onError(e.message))}>{l.fileName}</button>]),
  ];
  return <table className="kv"><tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>;
}
