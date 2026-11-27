import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const stack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({ title, titleExtra, subtitle, leading, belowHead, side = false, rich = false, onClose, dismissable = true, role = 'dialog', width, describedBy, footer, className = '', children }) {
  const titleId = useId(), box = useRef(null), pressedBackdrop = useRef(false), close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const token = {}, previous = document.activeElement;
    stack.push(token);
    document.body.classList.add('modal-open');
    if (box.current && !box.current.contains(document.activeElement)) box.current.focus();
    const onKey = e => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); close.current?.(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); box.current.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      if (!stack.length) document.body.classList.remove('modal-open');
      if (previous && document.contains(previous)) previous.focus?.();
    };
  }, [dismissable]);

  return createPortal(
    <div className={`modal ${side ? 'modal--drawer' : ''} ${className}`} onMouseDown={e => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => { if (dismissable && pressedBackdrop.current && e.target === e.currentTarget) close.current?.(); }}>
      <div className="dialog" ref={box} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-describedby={describedBy} style={width ? { width } : undefined}>
        {side || rich
          ? <header className="dialog__head dialog__head--side">
            {leading}
            <div className="dialog__titles"><div className="dialog__row"><h2 id={titleId}>{title}</h2>{titleExtra}</div>{subtitle && <p className="dialog__sub">{subtitle}</p>}</div>
            <button type="button" className="iconbtn dialog__x" aria-label="Close" onClick={() => close.current?.()}><Icon n="x" size={18} /></button>
          </header>
          : title && <header className="dialog__head"><h2 id={titleId}>{title}</h2>{titleExtra}</header>}
        {belowHead}
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </div>
    </div>, document.body);
}
