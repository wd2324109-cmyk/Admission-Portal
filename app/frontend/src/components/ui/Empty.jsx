export default function Empty({ children }) { return <p className="empty">{children}</p>; }
export function Loading() { return <p className="empty" role="status">Loading…</p>; }
