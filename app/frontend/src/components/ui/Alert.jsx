export default function Alert({ kind = 'error', children }) {
  if (!children) return null;
  return <p className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}
