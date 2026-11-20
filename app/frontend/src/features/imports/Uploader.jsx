import { useState } from 'react';
import { api } from '../../api/index.js';
import { toBase64 } from '../../lib/format.js';
import { Alert, Table, useConfirm } from '../../components/ui/index.js';

// One spreadsheet import (students or vacancies) with its result report and any new logins created.
export default function Uploader({ title, hint, columns, path, cls, canReplace, modes }) {
  const confirm = useConfirm();
  const [file, setFile] = useState(null), [replace, setReplace] = useState(false), [mode, setMode] = useState('replace'), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [err, setErr] = useState('');

  const go = async () => {
    if (!file) return setErr('Choose an Excel (.xlsx) file first');
    if (replace && !(await confirm({ title: 'Replace existing students?', message: `This deletes ALL existing Class ${cls} students before importing. Continue?`, confirmLabel: 'Delete and import', danger: true }))) return;
    try {
      setBusy(true); setErr(''); setRes(null);
      setRes(await api(path, { method: 'POST', body: { classLevel: cls, replace, mode, fileData: await toBase64(file) } }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return <section className="panel"><h3 className="panel__title">{title}</h3>
    <p className="hint">{hint}</p>
    {columns && <details className="details"><summary>Expected columns</summary><p>{columns}</p></details>}
    <div className="toolbar"><input type="file" accept=".xlsx,.xls" aria-label={`${title} file`} onChange={e => { setFile(e.target.files[0] || null); setRes(null); }} /></div>
    {canReplace && <label className="check"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} /> Replace existing Class {cls} students (start fresh)</label>}
    {modes && <div className="toolbar"><select aria-label="Mode" value={mode} onChange={e => setMode(e.target.value)}><option value="replace">Replace this class's vacancies</option><option value="append">Add seats (a later round)</option></select></div>}
    <div className="toolbar"><button type="button" className="btn btn--primary" disabled={busy} onClick={go}>{busy ? 'Importing…' : `Import for Class ${cls}`}</button></div>
    <Alert>{err}</Alert>
    {res && <div className="result">
      <p><b>{res.imported}</b> {res.seats ? `rows imported as ${res.seats} seats` : 'imported'}{res.skippedExisting ? <>, {res.skippedExisting} skipped (already exist)</> : ''}{res.rejectedCount ? <>, <span className="text-bad">{res.rejectedCount} rejected</span></> : ''}.{res.listNumber ? <> The students with a status were added as <b>List {res.listNumber}</b>, after the earlier lists.</> : ''}</p>
      {res.rejected?.length > 0 && <Table><thead><tr><th>Excel row</th><th>Problem</th></tr></thead><tbody>{res.rejected.map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.reason}</td></tr>)}</tbody></Table>}
      {res.newUsers?.length > 0 && <><h4>New logins created</h4><Alert kind="warning">Copy these now. Passwords are shown only once.</Alert>
        <Table><thead><tr><th>Role</th><th>For</th><th>Username</th><th>Password</th></tr></thead><tbody>{res.newUsers.map(u => <tr key={u.username}><td>{u.role}</td><td>{u.scope}</td><td>{u.username}</td><td><code>{u.password}</code></td></tr>)}</tbody></Table></>}
    </div>}
  </section>;
}
