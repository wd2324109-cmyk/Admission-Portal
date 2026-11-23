import { useCallback, useEffect, useState } from 'react';

/**
 * Fetch hook keyed by its dependencies.
 *
 * When the dependencies change (tab, class, search, page...) the previous
 * response is discarded immediately and `loading` is true until the new
 * response arrives, so callers never render rows from another view
 * (wrong table schema, stale rows, premature empty-state messages).
 * `reload()` re-runs the request but keeps the current data on screen.
 */
export function useFetch(load, deps, initial = null) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key, data: initial, error: '', loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stale = false;
    setState(s => (s.key === key ? { ...s, loading: true } : { key, data: initial, error: '', loading: true }));
    Promise.resolve().then(load)
      .then(data => { if (!stale) setState({ key, data, error: '', loading: false }); })
      .catch(e => { if (!stale) setState(s => ({ ...(s.key === key ? s : { data: initial }), key, error: e.message || 'Request failed', loading: false })); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const reload = useCallback(() => setTick(n => n + 1), []);
  // Until the effect has caught up with a changed key, never expose the old view's data.
  const fresh = state.key === key;
  return {
    data: fresh ? state.data : initial,
    error: fresh ? state.error : '',
    loading: fresh ? state.loading : true,
    reload,
  };
}
