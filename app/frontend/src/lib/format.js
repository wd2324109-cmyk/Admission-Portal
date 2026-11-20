export const ts = d => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
export const num = v => (Number(v) || 0).toLocaleString();

export const toBase64 = f => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => no(new Error('Could not read the file.'));
  r.readAsDataURL(f);
});

export const asset = p => import.meta.env.BASE_URL + String(p).replace(/^\//, '');
