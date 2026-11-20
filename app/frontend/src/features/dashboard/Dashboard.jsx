import { api } from '../../api/index.js';
import { useFetch } from '../../hooks/useFetch.js';
import { groupsFor } from '../../lib/status.js';
import { num } from '../../lib/format.js';
import { Alert, Icon, PageHeader } from '../../components/ui/index.js';
import Donut from '../../components/charts/Donut.jsx';
import ColumnChart from '../../components/charts/ColumnChart.jsx';
import StackedBars from '../../components/charts/StackedBars.jsx';
import Legend from '../../components/charts/Legend.jsx';
import OpenRequestsNotice from '../listRequests/OpenRequestsNotice.jsx';

const Stat = ({ icon, color, label, value, note }) => <article className="stat" style={{ '--accent': color }}>
  <div className="stat__icon"><Icon n={icon} /></div>
  <div className="stat__body"><span>{label}</span><b>{num(value)}</b>{note && <small>{note}</small>}</div>
</article>;

export default function Dashboard({ user, go }) {
  const { data: d, error, reload } = useFetch(() => api('/dashboard'), []);
  const head = <PageHeader title="Dashboard" />;
  if (!d) return <>{head}{error ? <><Alert>{error}</Alert><button type="button" className="btn" onClick={reload}>Try again</button></> : <p className="muted">Loading…</p>}</>;

  const keys = groupsFor(user), dms = user.role === 'DISTRICT';
  const byClass = d.byClass || [], tot = k => byClass.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const split = k => byClass.map(r => `Class ${r.key}: ${Number(r[k]) || 0}`).join('  ·  ');
  return <>
    {head}
    {user.role === 'SUPER_ADMIN' && <OpenRequestsNotice go={go} />}
    <div className="grid grid--stats">{keys.map(([k, l, c, icon]) => <Stat key={k} icon={icon} color={c} label={l} value={tot(k)} note={split(k)} />)}</div>
    <div className="grid grid--two">
      <section className="panel"><h3 className="panel__title">Overall share</h3><Donut parts={keys.map(([k, l, c]) => ({ l, c, v: tot(k) }))} /></section>
      <section className="panel"><h3 className="panel__title">Class comparison</h3><Legend keys={keys} /><ColumnChart rows={byClass} keys={keys} /></section>
    </div>
    <div className="grid grid--two">
      <StackedBars title="By district" rows={d.byDistrict || []} keys={keys} />
      <StackedBars title="By community" rows={d.byCommunity || []} keys={keys} />
    </div>
    {!dms && d.vacancy && <section className="panel"><h3 className="panel__title">Seats</h3>
      <dl className="seatsum">
        <div><dt>Total seats</dt><dd>{num(d.vacancy.seats)}</dd></div>
        <div><dt>Joined</dt><dd>{num(d.vacancy.joined)}</dd></div>
        <div><dt>Open</dt><dd>{num(d.vacancy.open)}</dd></div>
      </dl></section>}
  </>;
}
