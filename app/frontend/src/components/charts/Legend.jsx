export default function Legend({ keys }) {
  return <ul className="chart-legend">{keys.map(([k, l, c]) => <li key={k}><i style={{ background: c }} />{l}</li>)}</ul>;
}
