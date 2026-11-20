// Small formatting helpers shared by every feature.
export const ts = d => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
export const num = v => (Number(v) || 0).toLocaleString();

// Reads a File as base64 (the API accepts spreadsheets and letters as JSON base64 payloads).
export const toBase64 = f => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => no(new Error('Could not read the file.'));
  r.readAsDataURL(f);
});

// Public files respect the Vite base path, so the portal also works when hosted under a sub-path.
export const asset = p => import.meta.env.BASE_URL + String(p).replace(/^\//, '');
