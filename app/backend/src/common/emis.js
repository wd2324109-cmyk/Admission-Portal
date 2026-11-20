export const emisRef = v => { const s = String(v ?? '').trim(); return /^\d{1,10}$/.test(s) && +s <= 2147483647 ? +s : null; };
