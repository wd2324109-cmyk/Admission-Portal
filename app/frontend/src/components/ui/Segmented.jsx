export default function Segmented({ items, value, onChange, label }) {
  return <div className="seg" role="group" aria-label={label}>
    {items.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
  </div>;
}
