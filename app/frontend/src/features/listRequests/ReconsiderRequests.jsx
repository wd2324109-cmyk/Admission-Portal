import { useState } from 'react';
import { api } from '../../api/index.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useFetch } from '../../hooks/useFetch.js';
import { usePage } from '../../hooks/usePage.js';
import { firstClass } from '../../lib/status.js';
import { Alert, ClassTabs, Empty, Loading, Pager, Table } from '../../components/ui/index.js';
import StatusBadge from '../students/StatusBadge.jsx';
import StudentModal from '../students/StudentModal.jsx';

const EMPTY = { rows: [], pages: 1 };

// Students the DMS asked to reconsider (select status stays empty). The super admin decides: Approve (student returns to the next list) or Not Selected.
export default function ReconsiderRequests({ user }) {
  const [cls, setCls] = useState(firstClass(user)), [search, setSearch] = useState(''), [open, setOpen] = useState(null);
  const q = useDebounced(search), [page, setPage] = usePage(cls, q);
  const { data, error, loading, reload } = useFetch(() => api(`/students?class=${cls}&view=reconsider&search=${encodeURIComponent(q)}&page=${page}`), [cls, q, page], EMPTY);

  return <>
    <div className="filters"><ClassTabs user={user} cls={cls} onChange={setCls} /></div>
    <section className="panel">
      <div className="toolbar">
        <input className="grow" type="search" aria-label="Search name / EMIS" placeholder="Search name / EMIS" value={search} onChange={e => setSearch(e.target.value)} />
        <span className="muted">{loading ? 'Loading…' : `${data.total ?? 0} waiting for your decision`}</span>
      </div>
      <Alert>{error}</Alert>
      <Table>
        <thead><tr><th>EMIS</th><th>Name</th><th>District</th><th>Comm.</th><th>Rank</th><th>DMS</th><th>Reason</th><th>Admit status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data.rows.map(r => <tr key={r.id}>
          <td>{r.emis}</td><td>{r.name}</td><td>{r.district}</td><td>{r.community}</td><td>{r.orank ?? '—'}</td><td>{r.newDistcName || '—'}</td>
          <td>{r.tag1 === 'RECONSIDER' ? r.remark1 || '—' : '—'}</td>
          <td><StatusBadge r={r} /></td>
          <td className="actions"><button type="button" className="btn btn--sm btn--primary" aria-label={`Decide for ${r.name}`} onClick={() => setOpen(r.id)}>Decide</button></td>
        </tr>)}</tbody>
      </Table>
      {loading && !error && <Loading />}
      {!loading && !data.rows.length && !error && <Empty>No reconsideration requests are waiting.</Empty>}
      <Pager page={page} pages={data.pages} onPage={setPage} />
    </section>
    {open && <StudentModal cls={cls} id={open} user={user} onClose={() => setOpen(null)} onChange={reload} />}
  </>;
}
