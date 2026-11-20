import { useState } from 'react';
import { api } from '../../api/index.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useFetch } from '../../hooks/useFetch.js';
import { ts } from '../../lib/format.js';
import { Alert, Empty, PageHeader, Segmented, Table } from '../../components/ui/index.js';

export default function Logs() {
  const [kind, setKind] = useState('students'), [cls, setCls] = useState(''), [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, error } = useFetch(() => api(`/logs/${kind}?class=${cls}&q=${encodeURIComponent(q)}`), [kind, cls, q], []);
  const rows = data || [], students = kind === 'students';
  return <>
    <PageHeader title="Change History" />
    <div className="filters"><Segmented label="Log" items={[['students', 'Student_LOG'], ['vacancies', 'VACANCY_logs']]} value={kind} onChange={setKind} /></div>
    <section className="panel">
      <div className="toolbar">
        <input className="grow" type="search" aria-label="Search" placeholder={students ? 'Search name / EMIS / user' : 'Search district / EMIS / user'} value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="Class" value={cls} onChange={e => setCls(e.target.value)}><option value="">All classes</option>{[9, 10].map(c => <option key={c} value={c}>Class {c}</option>)}</select>
      </div>
      <Alert>{error}</Alert>
      {students
        ? <Table><thead><tr><th>#</th><th>Time</th><th>User</th><th>Class</th><th>EMIS</th><th>Name</th><th>Change</th><th>Seat in</th><th>Note</th></tr></thead>
          <tbody>{rows.map(l => <tr key={l.id}><td>{l.id}</td><td>{ts(l.updatedAt)}</td><td>{l.updatedBy}</td><td>{l.class}</td><td>{l.emis ?? '—'}</td>
            <td>{l.name || (l.tag1 === 'LIST_REQUEST' ? `DMS ${l.district}` : '—')}</td>
            <td>{l.tag1 === 'LIST_REQUEST' ? `List request (${l.tag2 === 'DONE' ? 'done' : 'waiting'})` : <>{l.updateStatusBefore || 'start'} → {l.updateStatusAfter || 'none'}</>}</td>
            <td>{l.newSchoolName || '—'}</td><td>{l.remark1 || '—'}</td></tr>)}</tbody></Table>
        : <Table><thead><tr><th>#</th><th>Time</th><th>User</th><th>Class</th><th>District</th><th>School</th><th>Seat group</th><th>EMIS</th><th>Change</th></tr></thead>
          <tbody>{rows.map(l => <tr key={l.id}><td>{l.id}</td><td>{ts(l.updatedAt)}</td><td>{l.updatedBy}</td><td>{l.classLevel}</td><td>{l.newDistrict}</td><td>{l.newSchoolName || '—'}</td>
            <td>{l.gender} / {l.medium} / {l.community}</td><td>{l.vacancyRefNo ?? '—'}</td><td>{l.updateStatusBefore} → {l.updateStatusAfter}</td></tr>)}</tbody></Table>}
      {!rows.length && !error && <Empty>No entries.</Empty>}
    </section>
  </>;
}
