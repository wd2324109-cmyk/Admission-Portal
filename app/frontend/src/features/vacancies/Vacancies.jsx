import { useState } from 'react';
import { api, downloadFile } from '../../api/index.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useFetch } from '../../hooks/useFetch.js';
import { usePage } from '../../hooks/usePage.js';
import { SEAT_TAG, firstClass } from '../../lib/status.js';
import { Alert, Badge, ClassTabs, Empty, PageHeader, Pager, Segmented, Table } from '../../components/ui/index.js';

const SEAT_FILTERS = [['', 'All'], ['RESERVED', 'Reserved'], ['JOINED', 'Joined'], ['VACANT', 'Vacant']];

// Seat groups (district / school / gender / medium / community) and the seat-by-seat register.
export default function Vacancies({ user }) {
  const [cls, setCls] = useState(firstClass(user)), [mode, setMode] = useState('groups'), [tab, setTab] = useState(''), [search, setSearch] = useState(''), [dlErr, setDlErr] = useState('');
  const q = useDebounced(search), [page, setPage] = usePage(cls, tab, q, mode);
  const groups = mode === 'groups';
  const g = useFetch(() => (groups ? api(`/vacancies?class=${cls}`) : Promise.resolve([])), [cls, groups], []);
  const s = useFetch(() => (groups ? Promise.resolve(null) : api(`/seats?class=${cls}&status=${tab}&search=${encodeURIComponent(q)}&page=${page}`)), [cls, groups, tab, q, page], { rows: [], pages: 1, counts: {} });
  const cells = g.data || [], seats = s.data || { rows: [], pages: 1, counts: {} }, c = seats.counts || {};
  const err = (groups ? g.error : s.error) || dlErr;
  const total = (c.RESERVED || 0) + (c.JOINED || 0) + (c.VACANT || 0);

  return <>
    <PageHeader title="Vacancies"><button type="button" className="btn" onClick={() => downloadFile(`/export/vacancies?class=${cls}`).catch(e => setDlErr(e.message))}>Download Excel</button></PageHeader>
    <div className="filters">
      <ClassTabs user={user} cls={cls} onChange={setCls} />
      <Segmented label="View" items={[['groups', 'By seat group'], ['seats', 'Seat by seat']]} value={mode} onChange={setMode} />
    </div>
    {!groups && <div className="filters"><Segmented label="Seat status" items={SEAT_FILTERS.map(([k, l]) => [k, `${l} (${k ? c[k] || 0 : total})`])} value={tab} onChange={setTab} /></div>}
    <section className="panel">
      <Alert>{err}</Alert>
      {groups ? <>
        <Table>
          <thead><tr><th>District</th><th>School</th><th>Gender</th><th>Medium</th><th>Community</th><th className="num">Seats</th><th className="num">Joined</th><th className="num">Held (listed / selected)</th><th className="num">Open balance</th></tr></thead>
          <tbody>{cells.map((x, i) => <tr key={i}><td>{x.district}</td><td>{x.school || x.udiseCode || '—'}</td><td>{x.gender}</td><td>{x.medium}</td><td>{x.community}</td><td className="num">{x.seats}</td><td className="num">{x.joined}</td><td className="num">{x.held}</td><td className="num"><b>{x.open}</b></td></tr>)}</tbody>
        </Table>
        {!cells.length && !err && <Empty>No vacancies yet.</Empty>}
      </> : <>
        <div className="toolbar"><input className="grow" type="search" aria-label="Search student" placeholder="Search student name / EMIS" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Table>
          <thead><tr><th>Vacancy ref no</th><th>District</th><th>Gender</th><th>Medium</th><th>Community</th><th>Status</th><th>Student</th></tr></thead>
          <tbody>{seats.rows.map((r, i) => { const [label, tone] = SEAT_TAG[r.status] || [r.status || '—', 'neutral']; return <tr key={i}>
            <td>{r.refNo}</td><td>{r.district}</td><td>{r.gender}</td><td>{r.medium}</td><td>{r.community}</td><td><Badge tone={tone}>{label}</Badge></td>
            <td>{r.who ? <><b>{r.who.name}</b> · EMIS {r.who.emis}</> : r.remarks || '—'}</td></tr>; })}</tbody>
        </Table>
        {!seats.rows.length && !err && <Empty>No seats in this view.</Empty>}
        <Pager page={page} pages={seats.pages} onPage={setPage} />
      </>}
    </section>
  </>;
}
