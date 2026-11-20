import { api } from '../../api/index.js';
import { useFetch } from '../../hooks/useFetch.js';

// Super admin: how many DMS requests are waiting (shown on the dashboard).
export default function OpenRequestsNotice({ go }) {
  const { data } = useFetch(() => api('/list-requests?status=OPEN'), []);
  const n = data?.rows?.length || 0;
  if (!n) return null;
  return <section className="panel panel--slim panel--notice">
    <div className="toolbar toolbar--between">
      <span><b>{n}</b> DMS {n === 1 ? 'request is' : 'requests are'} waiting for a new list.</span>
      <button type="button" className="btn btn--primary" onClick={() => go('listreq')}>Open List Requests</button>
    </div>
  </section>;
}
