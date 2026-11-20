import { useState } from 'react';
import { api } from '../../api/index.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useFetch } from '../../hooks/useFetch.js';
import { usePage } from '../../hooks/usePage.js';
import { TC_STAGE, TC_TABS, firstClass } from '../../lib/status.js';
import { Alert, Badge, ClassTabs, Empty, PageHeader, Pager, Segmented, Table } from '../../components/ui/index.js';
import StudentModal from '../students/StudentModal.jsx';

const EMPTY = { rows: [], pages: 1, total: 0 };
const firstTab = user => (user.role === 'REGION' ? 'REGION' : user.role === 'STATE' ? 'STATE' : '');

// The ONLY place where a TC is requested. Every joined student is listed; the DMS opens one and requests the TC.
// Then the Regional Coordinator approves, then the State Regional Coordinator.
export default function TcRequests({ user }) {
  const [cls, setCls] = useState(firstClass(user)), [tab, setTab] = useState(firstTab(user)), [search, setSearch] = useState(''), [open, setOpen] = useState(null);
  const q = useDebounced(search), [page, setPage] = usePage(cls, tab, q);
  const { data, error, reload } = useFetch(() => api(`/tc?class=${cls}&stage=${tab}&search=${encodeURIComponent(q)}&page=${page}`), [cls, tab, q, page], EMPTY);
  const note = `${user.role === 'DISTRICT' ? 'All joined students are listed here. Select View on a student to request a TC.' : 'Joined students and their TC requests.'} A request is approved (or rejected, with a reason) by the Regional Coordinator and then by the State Regional Coordinator; a rejected request returns the student to Joined; the seat is released only when the TC is issued.`;
  return <>
    <PageHeader title="TC Requests" note={note} />
    <div className="filters"><ClassTabs user={user} cls={cls} onChange={setCls} /></div>
    <div className="filters"><Segmented label="TC stage" items={TC_TABS} value={tab} onChange={setTab} /></div>
    <section className="panel">
      <div className="toolbar"><input className="grow" type="search" aria-label="Search name / EMIS" placeholder="Search name / EMIS" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Alert>{error}</Alert>
      <Table>
        <thead><tr><th>EMIS</th><th>Name</th><th>District</th><th>School</th><th>Reason</th><th>Stage</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data.rows.map(r => { const [label, tone] = TC_STAGE[r.tcStage] || [r.tcStage || '—', 'neutral']; return <tr key={r.id}>
          <td>{r.emis}</td><td>{r.name}</td><td>{r.district}</td><td>{r.newSchoolName || r.schoolname || '—'}</td><td>{r.reason || '—'}</td><td><Badge tone={tone}>{label}</Badge></td>
          <td className="actions"><button type="button" className="btn btn--sm" aria-label={`View ${r.name}`} onClick={() => setOpen(r.id)}>View</button></td></tr>; })}</tbody>
      </Table>
      {!data.rows.length && !error && <Empty>No students in this view.</Empty>}
      <Pager page={page} pages={data.pages} onPage={setPage} />
    </section>
    {open && <StudentModal mode="tc" cls={cls} id={open} user={user} onClose={() => setOpen(null)} onChange={reload} />}
  </>;
}
