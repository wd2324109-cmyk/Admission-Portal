import Icon from './Icon.jsx';

export default function Empty({ children }) {
  return <div className="empty"><span className="empty__icon"><Icon n="inbox" size={22} /></span><p>{children}</p></div>;
}

export function Loading() {
  return <div className="skeleton" role="status" aria-label="Loading"><i /><i /><i /><i /></div>;
}
