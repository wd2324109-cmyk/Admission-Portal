export function makeLimiter({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  const live = k => { const e = hits.get(k); if (!e) return null; if (Date.now() > e.reset) { hits.delete(k); return null; } return e; };
  setInterval(() => { for (const k of hits.keys()) live(k); }, 10 * 60 * 1000).unref();
  return {
    blocked: k => (live(k)?.count || 0) >= max,
    retryAfter: k => Math.max(1, Math.ceil(((live(k)?.reset || 0) - Date.now()) / 1000)),
    fail: k => { const e = live(k) || { count: 0, reset: Date.now() + windowMs }; e.count++; hits.set(k, e); },
    clear: k => { hits.delete(k); },
  };
}
