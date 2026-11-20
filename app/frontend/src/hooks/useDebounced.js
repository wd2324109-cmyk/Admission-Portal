import { useEffect, useState } from 'react';

// Returns `value` after it has stopped changing for `ms` milliseconds (used for search boxes).
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
