// Grouped columns, one group per row (class), one column per status group. Missing values count as 0.
const W = 520, H = 260, L = 40, B = 36, T = 16;
const nice = m => { const p = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / p) * p; };

export default function ColumnChart({ rows, keys, label = 'Class comparison' }) {
  const v = (r, k) => Number(r[k]) || 0;
  const top = nice(Math.max(1, ...rows.flatMap(r => keys.map(([k]) => v(r, k)))));
  const ih = H - T - B, gw = (W - L) / Math.max(1, rows.length), bw = Math.min(30, (gw * 0.7) / Math.max(1, keys.length));
  const y = n => T + ih - (n / top) * ih;
  const summary = `${label}: ` + rows.map(r => `Class ${r.key}: ` + keys.map(([k, l]) => `${l} ${v(r, k)}`).join(', ')).join('. ');
  return <svg className="column-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
    {[0, 1, 2, 3, 4].map(i => { const n = (top / 4) * i; return <g key={i}><line x1={L} x2={W} y1={y(n)} y2={y(n)} stroke="#e3e9f0" /><text x={L - 6} y={y(n) + 4} fontSize="11" textAnchor="end" fill="#5b6b7e">{Math.round(n)}</text></g>; })}
    {rows.map((r, gi) => {
      const x0 = L + gi * gw + (gw - (bw + 3) * keys.length) / 2;
      return <g key={r.key}>
        {keys.map(([k, , c], i) => <g key={k}>
          <rect x={x0 + i * (bw + 3)} y={y(v(r, k))} width={bw} height={T + ih - y(v(r, k))} rx="2" fill={c} />
          {keys.length <= 5 && <text x={x0 + i * (bw + 3) + bw / 2} y={y(v(r, k)) - 5} fontSize="11" textAnchor="middle" fill="#1d2b3d">{v(r, k)}</text>}
        </g>)}
        <text x={L + gi * gw + gw / 2} y={H - 12} fontSize="12" textAnchor="middle" fill="#5b6b7e">Class {r.key}</text>
      </g>;
    })}
  </svg>;
}
