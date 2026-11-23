import { useState } from 'react';
import { api } from '../../api/index.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useFetch } from '../../hooks/useFetch.js';
import { usePage } from '../../hooks/usePage.js';
import { DOC_SHORT, DOC_STATES, DOC_STATUS, DOC_TABS, firstClass } from '../../lib/status.js';
import { Alert, Badge, ClassTabs, Empty, PageHeader, Pager, Segmented, Table } from '../../components/ui/index.js';
import DocumentsModal from './DocumentsModal.jsx';

const EMPTY = { rows: [], pages: 1, total: 0 };
const DocChip = ({ type, d }) => { const [label, tone] = d ? DOC_STATUS[d.status] || [d.status, 'neutral'] : ['Missing', 'neutral']; return <Badge tone={tone}>{DOC_SHORT[type] || type}: {label}</Badge>; };

export default function DocumentVerification({ user }) {
  const dms = user.role === 'DISTRICT', admin = user.role === 'SUPER_ADMIN';
  const [cls, setCls] = useState(firstClass(user)), [search, setSearch] = useState(''), [state, setState] = useState(admin ? 'PENDING' : ''), [open, setOpen] = useState(null);
  const q = useDebounced(search), [page, setPage] = usePage(cls, q, state);
  const { data, error, loading, reload } = useFetch(() => api(`/documents?class=${cls}&state=${state}&search=${encodeURIComponent(q)}&page=${page}`), [cls, q, state, page], EMPTY);
  return <>
    <PageHeader title="Document Verification" />
    <div className="filters"><ClassTabs user={user} cls={cls} onChange={setCls} /></div>
    <div className="filters"><Segmented label="Document state" items={DOC_TABS} value={state} onChange={setState} /></div>
    <section className="panel">
      <div className="toolbar"><input className="grow" type="search" aria-label="Search name / EMIS" placeholder="Search name / EMIS" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Alert>{error}</Alert>
      <Table>
        <thead><tr><th>EMIS</th><th>Name</th><th>District</th><th>School</th><th>Comm.</th><th>Documents</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data.rows.map(r => { const [label, tone] = DOC_STATES[r.state] || [r.state, 'neutral']; return <tr key={r.id}>
          <td>{r.emis}</td><td>{r.name}</td><td>{r.district}</td><td>{r.school || '—'}</td><td>{r.community}{r.pwd ? ' (PWD)' : ''}</td>
          <td><div className="chips">{r.required.map(t => <DocChip key={t} type={t} d={r.docs[t]} />)}</div></td>
          <td><Badge tone={tone}>{label}</Badge></td>
          <td className="actions"><button type="button" className="btn btn--sm" aria-label={`${dms ? 'Documents of' : 'Review'} ${r.name}`} onClick={() => setOpen(r.id)}>{dms ? 'Documents' : 'Review'}</button></td></tr>; })}</tbody>
      </Table>
      {!loading && !data.rows.length && !error && <Empty>No joined students in this view.</Empty>}
      <Pager page={page} pages={data.pages} onPage={setPage} />
    </section>
    {open && <DocumentsModal cls={cls} id={open} user={user} onClose={() => setOpen(null)} onChange={reload} />}
  </>;
}
