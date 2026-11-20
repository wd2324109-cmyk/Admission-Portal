import Legend from './Legend.jsx';

// Horizontal stacked bars, top 8 rows by total.
export default function StackedBars({ title, rows, keys }) {
  const v = (r, k) => Number(r[k]) || 0, sum = r => keys.reduce((a, [k]) => a + v(r, k), 0);
  const list = rows.filter(r => sum(r) > 0).sort((a, b) => sum(b) - sum(a)).slice(0, 8), max = Math.max(1, ...list.map(sum));
  return <section className="panel"><h3 className="panel__title">{title}</h3>
    <Legend keys={keys} />
    {!list.length && <p className="empty">No data yet.</p>}
    {list.map(r => <div className="hbar" key={r.key}>
      <div className="hbar__top"><b>{r.key}</b><span>{sum(r).toLocaleString()}</span></div>
      <div className="hbar__track" role="img" aria-label={`${r.key}: ` + keys.map(([k, l]) => `${l} ${v(r, k)}`).join(', ')}>
        {keys.map(([k, l, c]) => <i key={k} title={`${l}: ${v(r, k)}`} style={{ width: `${(100 * v(r, k)) / max}%`, background: c }} />)}
      </div>
    </div>)}
  </section>;
}
