// Status pill. tone: ok | info | warn | bad | tc | neutral | outline
export default function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge--${tone}`}>{children ?? '—'}</span>;
}
