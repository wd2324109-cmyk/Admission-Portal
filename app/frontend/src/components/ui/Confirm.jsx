import { createContext, useCallback, useContext, useState } from 'react';
import Modal from './Modal.jsx';

const Ctx = createContext(null);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const confirm = useCallback(opts => new Promise(res => setReq({ ...opts, res })), []);
  const answer = ok => { req.res(ok); setReq(null); };
  return <Ctx.Provider value={confirm}>{children}
    {req && <Modal title={req.title || 'Please confirm'} role="alertdialog" width={460} onClose={() => answer(false)}
      footer={<>
        <button type="button" className="btn" autoFocus={!!req.danger} onClick={() => answer(false)}>Cancel</button>
        <button type="button" className={`btn ${req.danger ? 'btn--danger' : 'btn--primary'}`} autoFocus={!req.danger} onClick={() => answer(true)}>{req.confirmLabel || 'Confirm'}</button>
      </>}>
      <p className="preline">{req.message}</p>
    </Modal>}
  </Ctx.Provider>;
}

export const useConfirm = () => useContext(Ctx);
