import { useState } from 'react';
import { fileSource } from '../../api/index.js';
import { Icon } from '../../components/ui/index.js';
import { FileViewer } from '../../components/files/index.js';

const dash = v => (v === null || v === undefined || v === '' ? '—' : v);

function Sheet({ title, rows }) {
  return <section className="sheet">
    <h3 className="sheet__title">{title}</h3>
    <dl className="sheet__grid">{rows.map(([k, v, wide]) => <div key={k} className={wide ? 'sheet__wide' : undefined}><dt>{k}</dt><dd>{dash(v)}</dd></div>)}</dl>
  </section>;
}

export default function StudentProfile({ s, cls, id }) {
  const [view, setView] = useState(null), letters = s.letters || [];
  const items = letters.map(l => ({ key: `${l.stage}-${l.kind}`, title: l.label, name: l.fileName, subtitle: `${l.fileName} · submitted, locked`, load: () => fileSource(`/students/${cls}/${id}/letter?stage=${l.stage}&kind=${l.kind}`) }));
  const figures = [['Overall rank', s.orank], ['Total marks', s.total], ['Seat category', s.selectedCategory], ['Community', s.community + (s.disabilityStatus ? ' (PWD)' : '')]];
  return <>
    <div className="figures">{figures.map(([k, v]) => <div key={k}><span>{k}</span><b>{dash(v)}</b></div>)}</div>
    <Sheet title="Student" rows={[['EMIS', s.emis], ['Class', s.classLevel], ['Gender', s.gender], ['Medium', s.medium], ['Community', s.community + (s.disabilityStatus ? ' (PWD)' : '')], ['School', s.schoolname, true]]} />
    <Sheet title="Family and contact" rows={[['Father', s.fatherName], ['Mother', s.motherName], ['Phone', s.phone], ['District', s.district], ['Block', s.block], ['Address', [s.address, s.pincode].filter(Boolean).join(' - '), true]]} />
    <Sheet title="Marks" rows={[['Quarterly', s.mark1], ['Half-yearly', s.mark2], ['Total (highest of two)', s.total], ['NMMS', s.nmss], ['TRUST', s.trust], ['Other marks', s.otherMarks]]} />
    <Sheet title="Allotment" rows={[['Allotted to', s.newSchoolName ? `${s.newSchoolName} (${s.newDistcName})` : '', true], ['Seat category', s.selectedCategory], ['Vacancy ref', s.vacancyRef], ['Note', s.remark1, true]]} />
    {letters.length > 0 && <section className="sheet">
      <h3 className="sheet__title">Letters on file</h3>
      <ul className="sheet__files">{letters.map((l, i) => <li key={items[i].key}>
        <span><b>{l.label}</b><small>Submitted, locked</small></span>
        <button type="button" className="btn btn--sm" onClick={() => setView(items[i].key)}><Icon n="eye" size={14} /> {l.fileName}</button>
      </li>)}</ul>
    </section>}
    {view && <FileViewer items={items} current={view} onCurrent={setView} onClose={() => setView(null)} />}
  </>;
}
