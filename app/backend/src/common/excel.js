import * as XLSX from 'xlsx';

export const readSheet = b64 => { const wb = XLSX.read(Buffer.from(String(b64 || ''), 'base64'), { type: 'buffer' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); };
export const chunks = (a, n = 400) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
