import { useState } from 'react';
import { api } from '../../api/index.js';
import { useFetch } from '../../hooks/useFetch.js';
import { ts } from '../../lib/format.js';
import { Alert, Badge } from '../../components/ui/index.js';

// DMS: inside Student Details, ask the super admin for a new list once most of the students of the chosen class are decided.
export default function RequestNewList({ cls }) {
  const { data: d, error, reload } = useFetch(() => api('/list-requests'), [cls]);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const raise = async () => {
    try { setBusy(true); setErr(''); setMsg(''); await api('/list-requests', { method: 'POST', body: { classLevel: cls } }); setMsg(`Your request for Class ${cls} was sent to the super admin.`); reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const p = d?.progress?.find(x => x.classLevel === cls), open = d?.rows?.find(r => r.classLevel === cls && r.status === 'OPEN');
  if (!p) return <Alert>{error}</Alert>;
  return <section className="panel panel--slim">
    <div className="toolbar toolbar--between">
      <span><b>New list</b> · {p.total ? `${p.decided} of ${p.total} students decided (${p.percent}%)` : 'No students listed yet'}</span>
      {open ? <Badge tone="warn">Request pending · sent {ts(open.requestedAt)}</Badge> : <button type="button" className="btn btn--primary" disabled={busy || !p.canRequest} onClick={raise}>Request new list</button>}
    </div>
    {!open && !p.canRequest && p.reason && <p className="hint">{p.reason}</p>}
    <Alert kind="success">{msg}</Alert><Alert>{err}</Alert>
  </section>;
}
