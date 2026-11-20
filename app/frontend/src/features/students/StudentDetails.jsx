import { useState } from 'react';
import { api, downloadFile } from '../../api/index.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useFetch } from '../../hooks/useFetch.js';
import { usePage } from '../../hooks/usePage.js';
import { ALL_CODES, CODE, DMS_TABS, TABS, firstClass } from '../../lib/status.js';
import { Alert, ClassTabs, Empty, PageHeader, Pager, Segmented, Table } from '../../components/ui/index.js';
import RequestNewList from '../listRequests/RequestNewList.jsx';
import StatusBadge from './StatusBadge.jsx';
import StudentModal from './StudentModal.jsx';

const EMPTY = { rows: [], pages: 1 };

export default function StudentDetails({ user }) {
  const dms = user.role === 'DISTRICT';
  const [cls, setCls] = useState(firstClass(user)), [tab, setTab] = useState(dms ? 'waiting' : 'notlisted'), [status, setStatus] = useState(''), [search, setSearch] = useState('');
  const [open, setOpen] = useState(null), [dlErr, setDlErr] = useState('');
  const q = useDebounced(search), [page, setPage] = usePage(cls, tab, q, status);
  const { data, error, reload } = useFetch(() => api(`/students?class=${cls}&view=${tab}&status=${status}&search=${encodeURIComponent(q)}&page=${page}`), [cls, tab, q, status, page], EMPTY);
  const tabs = dms ? DMS_TABS : TABS;

  return <>
    <PageHeader title="Student Details" />
    <div className="filters"><ClassTabs user={user} cls={cls} onChange={setCls} /></div>
    {dms && <RequestNewList key={cls} cls={cls} />}
    <div className="filters"><Segmented label="Status group" items={tabs} value={tab} onChange={setTab} /></div>
    <section className="panel">
      <div className="toolbar">
        <input className="grow" type="search" aria-label="Search name / EMIS" placeholder="Search name / EMIS" value={search} onChange={e => setSearch(e.target.value)} />
        {!dms && <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{ALL_CODES.filter(Boolean).map(c => <option key={c} value={c}>{CODE[c]}</option>)}</select>}
        <button type="button" className="btn" onClick={() => downloadFile(`/export/master?class=${cls}`).catch(e => setDlErr(e.message))}>Download Excel</button>
      </div>
      <Alert>{error || dlErr}</Alert>
      <Table>
        <thead><tr><th>EMIS</th><th>Name</th><th>District</th><th>Comm.</th><th>Rank</th><th>Seat</th><th>Admit status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data.rows.map(r => <tr key={r.id}>
          <td>{r.emis}</td><td>{r.name}</td><td>{r.district}</td><td>{r.community}</td><td>{r.orank ?? '—'}</td><td>{r.selectedCategory || '—'}</td>
          <td><StatusBadge r={r} /></td>
          <td className="actions"><button type="button" className="btn btn--sm" aria-label={`View ${r.name}`} onClick={() => setOpen(r.id)}>View</button></td>
        </tr>)}</tbody>
      </Table>
      {!data.rows.length && !error && <Empty>No students in this view.</Empty>}
      <Pager page={page} pages={data.pages} onPage={setPage} />
    </section>
    {open && <StudentModal cls={cls} id={open} user={user} onClose={() => setOpen(null)} onChange={reload} />}
  </>;
}
