import { useState } from 'react';
import { api, setToken } from '../../api/index.js';
import { PasswordMeter, passwordAcceptable } from '../../security/index.js';
import { Alert, Modal } from '../../components/ui/index.js';

export default function ChangePassword({ onClose, username }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', again: '' }), [err, setErr] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const valid = !!f.currentPassword && passwordAcceptable(f.newPassword, username) && f.newPassword === f.again;

  const submit = async e => {
    e?.preventDefault();
    if (f.newPassword !== f.again) return setErr('The new passwords do not match');
    if (!passwordAcceptable(f.newPassword, username)) return setErr('The new password does not meet the requirements listed below.');
    try {
      setBusy(true);
      const r = await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      if (r.token) setToken(r.token);
      setErr(''); setDone(true);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  if (done) return <Modal title="Change password" width={440} onClose={onClose} footer={<button type="button" className="btn btn--primary" autoFocus onClick={onClose}>Close</button>}>
    <Alert kind="success">Your password has been changed.</Alert>
  </Modal>;

  return <Modal title="Change password" width={460} onClose={onClose}
    footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="submit" form="change-password-form" className="btn btn--primary" disabled={busy || !valid}>{busy ? 'Saving…' : 'Change password'}</button>
    </>}>
    <form id="change-password-form" onSubmit={submit}>
      <div className="field"><label htmlFor="cp-cur">Current password</label><input id="cp-cur" type="password" autoComplete="current-password" autoFocus value={f.currentPassword} onChange={set('currentPassword')} /></div>
      <div className="field"><label htmlFor="cp-new">New password (at least 10 characters)</label><input id="cp-new" type="password" autoComplete="new-password" maxLength={200} value={f.newPassword} onChange={set('newPassword')} /><PasswordMeter value={f.newPassword} username={username} /></div>
      <div className="field"><label htmlFor="cp-again">Repeat new password</label><input id="cp-again" type="password" autoComplete="new-password" value={f.again} onChange={set('again')} /></div>
      <Alert>{err}</Alert>
    </form>
  </Modal>;
}
