import { useState } from 'react';
import { api } from '../../api/index.js';
import { useFetch } from '../../hooks/useFetch.js';
import { ROLE_NAME } from '../../lib/status.js';
import { Alert, Badge, PageHeader, Table, useConfirm } from '../../components/ui/index.js';

const CLASSES = [9, 10];
const toggle = (arr, c) => (arr.includes(c) ? arr.filter(x => x !== c) : [...arr, c].sort((a, b) => a - b));
const BLANK = { username: '', role: 'DISTRICT', district: '', region: '', classes: [9, 10] };

export default function Users({ me }) {
  const confirm = useConfirm();
  const { data, error, reload } = useFetch(() => api('/users'), [], []);
  const [err, setErr] = useState(''), [shown, setShown] = useState(null), [f, setF] = useState(BLANK), [busy, setBusy] = useState(false);
  const rows = data || [];
  const run = async fn => { try { setErr(''); setBusy(true); await fn(); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  const freeze = async u => { if (await confirm({ title: 'Freeze this login?', message: `Freeze ${u.username}? They are signed out now and cannot sign in until you unfreeze.`, confirmLabel: 'Freeze', danger: true })) run(() => api(`/users/${u.id}/freeze`, { method: 'POST' })); };
  const newPassword = async u => { if (await confirm({ title: 'Issue a new password?', message: `Give ${u.username} a new password? They are signed out.`, confirmLabel: 'Issue password' })) run(async () => setShown(await api(`/users/${u.id}/reset-password`, { method: 'POST' }))); };

  const missing = !f.username.trim() ? 'Enter a username.' : f.role === 'DISTRICT' && !f.district.trim() ? 'Enter the district.' : f.role === 'REGION' && !f.region.trim() ? 'Enter the district(s) of the region.' : '';
  const create = () => run(async () => { setShown(await api('/users', { method: 'POST', body: { ...f, username: f.username.trim() } })); setF({ ...f, username: '', district: '', region: '' }); });

  return <>
    <PageHeader title="Users & Access" />
    <Alert>{err || error}</Alert>
    {shown && <section className="panel panel--notice"><Alert kind="warning">Copy now, shown only once.</Alert>
      <p><b>{shown.username}</b> / <code>{shown.password}</code></p>
      <button type="button" className="btn" onClick={() => setShown(null)}>Done</button></section>}
    <section className="panel">
      <Table>
        <thead><tr><th>User</th><th>Role</th><th>District / region</th><th>Signed in</th><th>Login</th><th>Class access</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map(u => { const classes = u.classes || []; return <tr key={u.id}>
          <td>{u.username}{u.role !== 'SUPER_ADMIN' && !classes.length && <> <Badge tone="bad">No class access</Badge></>}</td><td>{ROLE_NAME[u.role] || u.role}</td><td>{u.district || u.region || '—'}</td><td>{u.signedIn ? 'Yes' : '—'}</td>
          <td>{u.role === 'DISTRICT' ? (u.frozen ? <Badge tone="bad">Frozen</Badge> : <Badge tone="ok">Active</Badge>) : '—'}</td>
          <td>{u.role === 'SUPER_ADMIN' ? 'All' : <div className="checks">{CLASSES.map(c => <label key={c} className="check"><input type="checkbox" checked={classes.includes(c)} disabled={busy} onChange={() => run(() => api(`/users/${u.id}/access`, { method: 'PUT', body: { classes: toggle(classes, c) } }))} /> Class {c}</label>)}</div>}</td>
          <td className="actions"><div className="toolbar toolbar--end">
            {u.role === 'DISTRICT' && (u.frozen
              ? <button type="button" className="btn btn--sm" disabled={busy} onClick={() => run(() => api(`/users/${u.id}/unfreeze`, { method: 'POST' }))}>Unfreeze</button>
              : <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => freeze(u)}>Freeze</button>)}
            {u.id !== me.id && <button type="button" className="btn btn--sm" disabled={busy} onClick={() => newPassword(u)}>New password</button>}
          </div></td></tr>; })}</tbody>
      </Table>
    </section>
    <section className="panel"><h3 className="panel__title">Add a user</h3>
      <div className="toolbar">
        <input aria-label="Username" placeholder="Username" maxLength={100} autoComplete="off" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} />
        <select aria-label="Role" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option value="DISTRICT">DMS (district)</option><option value="REGION">Regional Coordinator</option><option value="STATE">State Regional Coordinator</option><option value="SUPER_ADMIN">SE Team (super admin)</option></select>
        {f.role === 'DISTRICT' && <input aria-label="District" placeholder="District" value={f.district} onChange={e => setF({ ...f, district: e.target.value })} />}
        {f.role === 'REGION' && <input aria-label="Region" placeholder="District(s), comma separated" value={f.region} onChange={e => setF({ ...f, region: e.target.value })} />}
      </div>
      <div className="toolbar">
        {f.role === 'SUPER_ADMIN' ? <span className="muted">Super admins can open all classes.</span> : CLASSES.map(c => <label key={c} className="check"><input type="checkbox" checked={f.classes.includes(c)} onChange={() => setF({ ...f, classes: toggle(f.classes, c) })} /> Class {c}</label>)}
        <button type="button" className="btn btn--primary" disabled={busy || !!missing} title={missing || undefined} onClick={create}>Create user</button>
      </div>
      {missing && f.username && <p className="hint">{missing}</p>}
    </section>
  </>;
}
