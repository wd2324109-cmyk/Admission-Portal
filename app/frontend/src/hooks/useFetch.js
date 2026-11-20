import { useCallback, useEffect, useState } from 'react';

export function useFetch(load, deps, initial = null) {
  const [state, setState] = useState({ data: initial, error: '', loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let stale = false;
    setState(s => ({ ...s, loading: true }));
    Promise.resolve().then(load)
      .then(data => { if (!stale) setState({ data, error: '', loading: false }); })
      .catch(e => { if (!stale) setState(s => ({ ...s, error: e.message || 'Request failed', loading: false })); });
    return () => { stale = true; };

  }, [...deps, tick]);
  const reload = useCallback(() => setTick(n => n + 1), []);
  return { ...state, reload };
}
