import { useState } from 'react';
import { api } from '../../api/index.js';
import { useFetch } from '../../hooks/useFetch.js';
import { ts } from '../../lib/format.js';
import { Alert, Badge, Empty, PageHeader, Segmented, Table, useConfirm } from '../../components/ui/index.js';
import ReconsiderRequests from './ReconsiderRequests.jsx';

export default function ListRequests({ user }) {
  const confirm = useConfirm();
  const [kind, setKind] = useState('list'), [tab, setTab] = useState('OPEN'), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const { data, error, loading, reload } = useFetch(() => api(`/list-requests?status=${tab === 'ALL' ? '' : tab}`), [tab]);
  const rows = data?.rows || [];
  const run = async fn => { try { setBusy(true); setErr(''); await fn(); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const freeze = async r => { if (await confirm({ title: 'Freeze this login?', message: `Freeze ${r.requestedBy}? They are signed out now and cannot sign in until you unfreeze.`, confirmLabel: 'Freeze', danger: true })) run(() => api(`/users/${r.userId}/freeze`, { method: 'POST' })); };
  const done = async r => { if (await confirm({ title: 'Mark as done?', message: 'Mark this request as done? The DMS will see it as completed.', confirmLabel: 'Mark done' })) run(() => api(`/list-requests/${r.id}/done`, { method: 'POST', body: {} })); };

  return <>
    <PageHeader title="List Requests" note="A DMS can ask for a new list once most of its students are decided. Revise the list (Import Data & Lists: a new sheet is added after the earlier students), then mark the request done. Freeze a DMS login to stop it signing in while you work; Unfreeze lets it back in." />
    <div className="filters"><Segmented label="Request type" items={[['list', 'New list requests'], ['reconsider', 'Reconsider requests']]} value={kind} onChange={setKind} /></div>
    {kind === 'reconsider' ? <ReconsiderRequests user={user} /> : <>
    <div className="filters"><Segmented label="Requests" items={[['OPEN', 'Waiting'], ['DONE', 'Done'], ['ALL', 'All']]} value={tab} onChange={setTab} /></div>
    <section className="panel">
      <Alert>{err || error}</Alert>
      <Table>
        <thead><tr><th>Requested</th><th>DMS login</th><th>District</th><th>Class</th><th>Students decided</th><th>Status</th><th>DMS login state</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}>
          <td>{ts(r.requestedAt)}</td><td>{r.requestedBy}</td><td>{r.district}</td><td>{r.classLevel}</td>
          <td>{r.total != null ? `${r.decided} of ${r.total} (${r.percent}%)` : '—'}</td>
          <td>{r.status === 'OPEN' ? <Badge tone="warn">Waiting</Badge> : <><Badge tone="ok">Done</Badge><small className="cell-note">{r.doneBy} · {ts(r.doneAt)}</small></>}</td>
          <td>{r.userId ? (r.frozen ? <Badge tone="bad">Frozen</Badge> : <Badge tone="ok">Active</Badge>) : '—'}</td>
          <td className="actions"><div className="toolbar toolbar--end">
            {r.userId && (r.frozen
              ? <button type="button" className="btn btn--sm" disabled={busy} onClick={() => run(() => api(`/users/${r.userId}/unfreeze`, { method: 'POST' }))}>Unfreeze</button>
              : <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => freeze(r)}>Freeze</button>)}
            {r.status === 'OPEN' && <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => done(r)}>Mark done</button>}
          </div></td></tr>)}</tbody>
      </Table>
      {!loading && !rows.length && !error && <Empty>No requests in this view.</Empty>}
    </section>
    </>}
  </>;
}
