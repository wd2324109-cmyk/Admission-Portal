import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../api/index.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useFetch } from '../../hooks/useFetch.js';
import { usePage } from '../../hooks/usePage.js';
import { SEAT_TAG, firstClass } from '../../lib/status.js';
import { Alert, Badge, ClassTabs, Empty, Loading, PageHeader, Pager, Segmented, Table } from '../../components/ui/index.js';

const SEAT_FILTERS = [['', 'All'], ['RESERVED', 'Reserved'], ['JOINED', 'Joined'], ['VACANT', 'Vacant']];

export default function Vacancies({ user }) {
  const [cls, setCls] = useState(firstClass(user)), [mode, setMode] = useState('groups'), [tab, setTab] = useState(''), [search, setSearch] = useState(''), [dlErr, setDlErr] = useState(''), [district, setDistrict] = useState(''), [gsearch, setGsearch] = useState(''), [districts, setDistricts] = useState([]);
  const q = useDebounced(search), [page, setPage] = usePage(cls, tab, q, mode, district);
  const multiDistrict = user.role === 'STATE' || user.role === 'SUPER_ADMIN';
  const groups = mode === 'groups';
  const g = useFetch(() => (groups ? api(`/vacancies?class=${cls}`) : Promise.resolve([])), [cls, groups], []);
  const s = useFetch(() => (groups ? Promise.resolve(null) : api(`/seats?class=${cls}&status=${tab}&district=${encodeURIComponent(district)}&search=${encodeURIComponent(q)}&page=${page}`)), [cls, groups, tab, q, district, page], { rows: [], pages: 1, counts: {} });
  const allCells = g.data || [], cells = allCells.filter(x => (!district || String(x.district ?? '').trim().toUpperCase() === district) && (!gsearch.trim() || [x.district, x.school, x.udiseCode, x.gender, x.medium, x.community].join(' ').toLowerCase().includes(gsearch.trim().toLowerCase()))), seats = s.data || { rows: [], pages: 1, counts: {} }, c = seats.counts || {};
  useEffect(() => {
    const list = groups ? [...new Set((g.data || []).map(x => String(x.district ?? '').trim().toUpperCase()).filter(Boolean))].sort() : s.data?.districts;
    if (list?.length) setDistricts(list);
  }, [groups, g.data, s.data]);
  const err = (groups ? g.error : s.error) || dlErr;
  const total = (c.RESERVED || 0) + (c.JOINED || 0) + (c.VACANT || 0);

  return <>
    <PageHeader title="Vacancies"><button type="button" className="btn" onClick={() => downloadFile(`/export/vacancies?class=${cls}`).catch(e => setDlErr(e.message))}>Download Excel</button></PageHeader>
    <div className="filters">
      <ClassTabs user={user} cls={cls} onChange={setCls} />
      <Segmented label="View" items={[['groups', 'By seat group'], ['seats', 'Seat by seat']]} value={mode} onChange={setMode} />
      {multiDistrict && <select aria-label="District" value={district} onChange={e => setDistrict(e.target.value)}><option value="">All districts</option>{districts.map(d => <option key={d} value={d}>{d}</option>)}</select>}
    </div>
    {!groups && <div className="filters"><Segmented label="Seat status" items={SEAT_FILTERS.map(([k, l]) => [k, `${l} (${k ? c[k] || 0 : total})`])} value={tab} onChange={setTab} /></div>}
    <section className="panel">
      <Alert>{err}</Alert>
      {groups ? <>
        <div className="toolbar"><input className="grow" type="search" aria-label="Search seat groups" placeholder="Search district / school / community" value={gsearch} onChange={e => setGsearch(e.target.value)} /></div>
        <Table>
          <thead><tr><th>District</th><th>School</th><th>Gender</th><th>Medium</th><th>Community</th><th className="num">Seats</th><th className="num">Joined</th><th className="num">Held (listed / selected)</th><th className="num">Open balance</th></tr></thead>
          <tbody>{cells.map((x, i) => <tr key={i}><td>{x.district}</td><td>{x.school || x.udiseCode || '—'}</td><td>{x.gender}</td><td>{x.medium}</td><td>{x.community}</td><td className="num">{x.seats}</td><td className="num">{x.joined}</td><td className="num">{x.held}</td><td className="num"><b>{x.open}</b></td></tr>)}</tbody>
        </Table>
        {g.loading && !err && <Loading />}
        {!g.loading && !cells.length && !err && <Empty>No vacancies yet.</Empty>}
      </> : <>
        <div className="toolbar"><input className="grow" type="search" aria-label="Search student" placeholder="Search student name / EMIS" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Table>
          <thead><tr><th>Vacancy ref no</th><th>District</th><th>Gender</th><th>Medium</th><th>Community</th><th>Status</th><th>Student</th></tr></thead>
          <tbody>{seats.rows.map((r, i) => { const [label, tone] = SEAT_TAG[r.status] || [r.status || '—', 'neutral']; return <tr key={i}>
            <td>{r.refNo}</td><td>{r.district}</td><td>{r.gender}</td><td>{r.medium}</td><td>{r.community}</td><td><Badge tone={tone}>{label}</Badge></td>
            <td>{r.who ? <><b>{r.who.name}</b> · EMIS {r.who.emis}</> : r.remarks || '—'}</td></tr>; })}</tbody>
        </Table>
        {s.loading && !err && <Loading />}
        {!s.loading && !seats.rows.length && !err && <Empty>No seats in this view.</Empty>}
        <Pager page={page} pages={seats.pages} onPage={setPage} />
      </>}
    </section>
  </>;
}
