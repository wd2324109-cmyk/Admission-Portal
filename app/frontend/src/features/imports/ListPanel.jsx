import { useState } from 'react';
import { api } from '../../api/index.js';
import { Alert, Table, useConfirm } from '../../components/ui/index.js';

// State Enrollment Team tools: overall rank, preview and generation of the next student list.
export default function ListPanel({ cls }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false), [res, setRes] = useState(null), [err, setErr] = useState('');
  const run = async (path, body, label) => {
    try { setBusy(true); setErr(''); setRes(null); const r = await api(path, { method: 'POST', body: { classLevel: cls, ...body } }); setRes({ label, r }); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const rank = async () => { if (await confirm({ title: 'Generate overall rank?', message: `Generate the overall rank for every Class ${cls} student?`, confirmLabel: 'Generate' })) run('/rank/generate', {}, 'rank'); };
  const list = async () => { if (await confirm({ title: 'Generate student list?', message: `Generate the next student list for Class ${cls} and send it to the DMS?`, confirmLabel: 'Generate list' })) run('/lists/generate', {}, 'list'); };

  return <section className="panel"><h3 className="panel__title">State Enrollment Team</h3>
    <p className="hint">1. Generate the overall rank (before any list). 2. Generate the student list: it fills the open balance of every seat group with the best-ranked eligible students and marks them Waiting. Repeat after the DMS has finished a list: seats freed by Not Willing, Not Joined - Approved and TC Issued are filled again, and students who are Waiting (reconsidered) are considered again.</p>
    <div className="toolbar">
      <button type="button" className="btn" disabled={busy} onClick={rank}>Generate overall rank</button>
      <button type="button" className="btn" disabled={busy} onClick={() => run('/lists/generate', { preview: true }, 'preview')}>Preview next list</button>
      <button type="button" className="btn btn--primary" disabled={busy} onClick={list}>Generate student list</button>
    </div>
    <Alert>{err}</Alert>
    {res?.label === 'rank' && <p><b>{res.r.ranked}</b> students ranked.</p>}
    {res && res.label !== 'rank' && <div className="result">
      <p>{res.label === 'preview' ? 'Preview: ' : `List ${res.r.listNumber ?? '—'}: `}<b>{res.r.listed}</b> students {res.label === 'preview' ? 'would be' : 'were'} listed; open seats {res.r.openSeats}, shortfall {res.r.shortfall}.</p>
      {res.r.cells?.length > 0 && <Table><thead><tr><th>District</th><th>School</th><th>Gender</th><th>Medium</th><th>Community</th><th className="num">Open</th><th className="num">Listed</th><th className="num">Shortfall</th></tr></thead>
        <tbody>{res.r.cells.map((c, i) => <tr key={i}><td>{c.district}</td><td>{c.school}</td><td>{c.gender}</td><td>{c.medium}</td><td>{c.community}</td><td className="num">{c.open}</td><td className="num">{c.listed}</td><td className="num">{c.shortfall}</td></tr>)}</tbody></Table>}
    </div>}
  </section>;
}
