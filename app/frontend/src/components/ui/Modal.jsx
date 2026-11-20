import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

// Open dialogs, topmost last: only the topmost one reacts to Escape and Tab.
const stack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Accessible dialog: labelled, traps Tab, closes on Escape / backdrop (unless `dismissable` is false),
// locks page scrolling and returns focus to where it came from.
export default function Modal({ title, titleExtra, onClose, dismissable = true, role = 'dialog', width, describedBy, footer, className = '', children }) {
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
    <div className={`modal ${className}`} onMouseDown={e => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => { if (dismissable && pressedBackdrop.current && e.target === e.currentTarget) close.current?.(); }}>
      <div className="dialog" ref={box} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-describedby={describedBy} style={width ? { width } : undefined}>
        {title && <header className="dialog__head"><h2 id={titleId}>{title}</h2>{titleExtra}</header>}
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </div>
    </div>, document.body);
}
