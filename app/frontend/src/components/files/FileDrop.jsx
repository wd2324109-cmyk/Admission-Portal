import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/index.js';
import { toBase64 } from '../../lib/format.js';
import { DOC_FILES, checkFile, extOf, mimeOf, sizeOf } from '../../lib/files.js';
import FileViewer from './FileViewer.jsx';

// One file: drag it in or browse. A chosen file shows as a card with a preview, so people can check it before they send it.
// value / onChange work with { file, name, size, data (base64), preview (a blob address) } or null.
export default function FileDrop({ value, onChange, onError = () => {}, spec = DOC_FILES, label, disabled = false, compact = false, read = true, previewable = true }) {
  const input = useRef(null), depth = useRef(0), [over, setOver] = useState(false), [busy, setBusy] = useState(false), [view, setView] = useState(false);
  useEffect(() => () => { if (value?.preview) URL.revokeObjectURL(value.preview); }, [value?.preview]);

  const take = async f => {
    if (!f || disabled || busy) return;
    const bad = await checkFile(f, spec);
    if (bad) return onError(bad);
    try {
      setBusy(true);
      const data = read ? await toBase64(f) : undefined;
      onError('');
      onChange({ file: f, name: f.name, size: f.size, data, preview: previewable && mimeOf(f.name) ? URL.createObjectURL(f) : null });
    } catch (e) { onError(e.message); } finally { setBusy(false); }
  };
  const browse = () => { if (!disabled) input.current?.click(); };
  const picker = <input ref={input} type="file" hidden accept={spec.exts.map(x => '.' + x).join(',')} onChange={e => { take(e.target.files[0]); e.target.value = ''; }} />;
  const drag = {
    onDragEnter: e => { e.preventDefault(); depth.current += 1; setOver(true); },
    onDragOver: e => e.preventDefault(),
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDrop: e => { e.preventDefault(); depth.current = 0; setOver(false); take(e.dataTransfer.files[0]); },
  };

  if (!value) return <>
    <div className={`drop${over ? ' drop--over' : ''}${compact ? ' drop--compact' : ''}${disabled ? ' drop--off' : ''}`} role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
      aria-label={`${label || 'File'}: choose a file or drop it here`} onClick={browse} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); } }} {...drag}>
      <span className="drop__icon"><Icon n="up" size={compact ? 18 : 22} /></span>
      <span className="drop__text"><b>{busy ? 'Reading the file…' : over ? 'Drop to add the file' : <>Drop the file here or <u>browse</u></>}</b><small>{spec.types} · up to {spec.maxLabel}</small></span>
    </div>
    {picker}
  </>;

  const ext = extOf(value.name), image = value.preview && /^image\//.test(mimeOf(value.name));
  return <div className="filecard" {...drag}>
    <span className={`thumb${image ? '' : ' thumb--' + (ext === 'pdf' ? 'pdf' : 'sheet')}`}>{image ? <img src={value.preview} alt="" /> : ext.toUpperCase()}</span>
    <span className="filecard__meta"><b title={value.name}>{value.name}</b><small>{sizeOf(value.size)} · {ext.toUpperCase()} · ready to send</small></span>
    <span className="filecard__actions">
      {value.preview && <button type="button" className="btn btn--sm" onClick={() => setView(true)}><Icon n="eye" size={14} /> Preview</button>}
      <button type="button" className="btn btn--sm" disabled={disabled || busy} onClick={browse}>Replace</button>
      <button type="button" className="btn btn--sm btn--ghost" aria-label={`Remove ${value.name}`} disabled={disabled} onClick={() => onChange(null)}><Icon n="trash" size={14} /></button>
    </span>
    {picker}
    {view && <FileViewer items={[{ key: 'local', title: value.name, subtitle: `${sizeOf(value.size)} · not sent yet`, src: value.preview, type: mimeOf(value.name), name: value.name }]} onClose={() => setView(false)} />}
  </div>;
}
