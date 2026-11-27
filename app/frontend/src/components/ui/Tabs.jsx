import { useRef } from 'react';

export default function Tabs({ items, value, onChange, label, idBase = 'tabs' }) {
  const list = useRef(null);
  const move = (e, i) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + step + items.length) % items.length;
    onChange(items[next].key);
    list.current?.querySelectorAll('[role=tab]')[next]?.focus();
  };
  return <div className="tabs" role="tablist" aria-label={label} ref={list}>
    {items.map((t, i) => <button key={t.key} type="button" role="tab" id={`${idBase}-${t.key}`} aria-selected={value === t.key} aria-controls={`${idBase}-panel`} tabIndex={value === t.key ? 0 : -1}
      className={`tab ${value === t.key ? 'on' : ''}`} onClick={() => onChange(t.key)} onKeyDown={e => move(e, i)}>
      {t.label}
      {t.count != null && <span className="tab__count">{t.count}</span>}
      {t.alert && <span className="tab__dot" title="Action needed"><span className="sr-only">Action needed</span></span>}
    </button>)}
  </div>;
}

export function TabPanel({ idBase = 'tabs', tab, children }) {
  return <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-${tab}`} className="tabpanel">{children}</div>;
}
