import { useEffect, useRef, useState } from 'react';
import { Icon, Modal } from '../ui/index.js';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const typing = el => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

// Shows one or more files full size, in the portal: zoom and turn images, scroll a PDF, move between files with the arrow keys.
// items: [{ key, title, subtitle, badge, name, rev, src+type  OR  load() -> { url, type, revoke? } }]. side(item) adds a panel (for example the review form).
export default function FileViewer({ items, start = 0, current, onCurrent, onClose, side }) {
  const [own, setOwn] = useState(items[start]?.key), key = current ?? own;
  const setKey = k => { setOwn(k); onCurrent?.(k); };
  const at = Math.max(0, items.findIndex(x => x.key === key)), item = items[at];
  const [file, setFile] = useState({ status: 'loading' }), [zoom, setZoom] = useState(1), [turn, setTurn] = useState(0), [tries, setTries] = useState(0), root = useRef(null);

  useEffect(() => {
    if (!item) return undefined;
    let dead = false, made = null;
    setFile({ status: 'loading' }); setZoom(1); setTurn(0);
    (async () => {
      try {
        const r = item.src ? { url: item.src, type: item.type } : await item.load();
        if (dead) { r.revoke?.(); return; }
        made = r; setFile({ status: 'ready', url: r.url, type: r.type || '' });
      } catch (e) { if (!dead) setFile({ status: 'error', message: e.message || 'Could not load the file.' }); }
    })();
    return () => { dead = true; made?.revoke?.(); };
  }, [item?.key, item?.rev, tries]);

  const go = d => { const n = items[(at + d + items.length) % items.length]; if (n && n.key !== item.key) setKey(n.key); };
  const step = d => setZoom(z => { const i = ZOOMS.indexOf(z), n = Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + d)); return ZOOMS[n]; });
  useEffect(() => {
    const onKey = e => {
      const box = root.current?.closest('.dialog');
      if (!box || !box.contains(document.activeElement) || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === '+' || e.key === '=') step(1);
      else if (e.key === '-') step(-1);
      else if (e.key === '0') setZoom(1);
      else if (e.key.toLowerCase() === 'r') setTurn(t => (t + 90) % 360);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!item) return null;
  const kind = /^image\//.test(file.type) ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other', ready = file.status === 'ready', sideways = turn % 180 !== 0;
  return <Modal title={item.title} titleExtra={item.badge} onClose={onClose} className="modal--viewer">
    <div className={`viewer${side ? ' viewer--side' : ''}`} ref={root}>
      <div className="viewer__main">
        <div className="viewer__bar">
          {items.length > 1 && <div className="viewer__nav">
            <button type="button" className="iconbtn" aria-label="Previous file" onClick={() => go(-1)}><Icon n="chevL" size={18} /></button>
            <span aria-live="polite">{at + 1} / {items.length}</span>
            <button type="button" className="iconbtn" aria-label="Next file" onClick={() => go(1)}><Icon n="chevR" size={18} /></button>
          </div>}
          {item.subtitle && <span className="viewer__sub" title={item.subtitle}>{item.subtitle}</span>}
          <span className="viewer__tools">
            {kind === 'image' && <>
              <button type="button" className="iconbtn" aria-label="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => step(-1)}><Icon n="zoomOut" size={18} /></button>
              <button type="button" className="viewer__zoom" aria-label="Reset zoom" title="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" className="iconbtn" aria-label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}><Icon n="zoomIn" size={18} /></button>
              <button type="button" className="iconbtn" aria-label="Fit to screen" onClick={() => { setZoom(1); setTurn(0); }}><Icon n="fit" size={18} /></button>
              <button type="button" className="iconbtn" aria-label="Rotate" onClick={() => setTurn(t => (t + 90) % 360)}><Icon n="rotate" size={18} /></button>
            </>}
            {ready && <>
              <a className="iconbtn" href={file.url} download={item.name || item.title} target="_blank" rel="noopener noreferrer" aria-label="Download"><Icon n="download" size={18} /></a>
              <a className="iconbtn" href={file.url} target="_blank" rel="noopener noreferrer" aria-label="Open in a new tab"><Icon n="external" size={18} /></a>
            </>}
            <button type="button" className="iconbtn viewer__close" aria-label="Close the viewer" onClick={onClose}><Icon n="x" size={18} /></button>
          </span>
        </div>
        {items.length > 1 && <div className="viewer__tabs" role="group" aria-label="Files">
          {items.map(x => <button type="button" key={x.key} className={x.key === item.key ? 'on' : ''} aria-current={x.key === item.key} onClick={() => setKey(x.key)}>{x.title}</button>)}
        </div>}
        <div className="viewer__stage">
          {file.status === 'loading' && <div className="viewer__state" role="status"><span className="spinner" aria-hidden="true" />Loading the file…</div>}
          {file.status === 'error' && <div className="viewer__state viewer__state--bad" role="alert"><Icon n="alert" size={28} /><b>{file.message}</b>
            <button type="button" className="btn btn--sm" onClick={() => setTries(t => t + 1)}>Try again</button></div>}
          {ready && kind === 'image' && <div className="viewer__scroll"><div className="viewer__img" style={{ width: `${zoom * (sideways ? 60 : 100)}%`, transform: `rotate(${turn}deg)` }}>
            <img src={file.url} alt={item.title} draggable={false} onDoubleClick={() => setZoom(z => (z === 1 ? 2 : 1))}
              onError={() => setFile({ status: 'error', message: 'The image could not be shown. Use “Open in a new tab”.' })} /></div></div>}
          {ready && kind === 'pdf' && <iframe className="viewer__frame" title={item.title} src={`${file.url}#toolbar=1&navpanes=0&view=FitH`} />}
          {ready && kind === 'other' && <div className="viewer__state"><Icon n="doc" size={28} /><b>This file cannot be previewed here.</b><a className="btn btn--sm" href={file.url} target="_blank" rel="noopener noreferrer">Open in a new tab</a></div>}
        </div>
      </div>
      {side && <aside className="viewer__side">{side(item)}</aside>}
    </div>
  </Modal>;
}
