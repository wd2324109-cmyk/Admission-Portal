const R = 64, C = 2 * Math.PI * R;

export default function Donut({ parts, label = 'Overall share' }) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  let off = 0;
  const summary = `${label}: ${parts.map(p => `${p.l} ${p.v}`).join(', ')}. Total ${total}.`;
  return <div className="donut">
    <div className="donut__ring">
      <svg viewBox="0 0 170 170" role="img" aria-label={summary}>
        <circle cx="85" cy="85" r={R} fill="none" stroke="#e8edf3" strokeWidth="18" />
        {parts.map(p => {
          const len = total ? (p.v / total) * C : 0;
          const el = <circle key={p.l} cx="85" cy="85" r={R} fill="none" stroke={p.c} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />;
          off += len; return el;
        })}
      </svg>
      <div className="donut__total"><b>{total.toLocaleString()}</b><span>Total</span></div>
    </div>
    <ul className="donut__legend">{parts.map(p => <li key={p.l}><i style={{ background: p.c }} />{p.l}<b>{p.v.toLocaleString()}</b></li>)}</ul>
  </div>;
}
