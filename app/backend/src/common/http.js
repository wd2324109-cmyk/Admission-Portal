export class HttpError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const ctx = req => ({ user: req.user, params: req.params, query: req.query, body: req.body, ip: req.ip || 'unknown' });
export const notFound = (req, res) => res.status(404).json({ error: 'Not found' });
export const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in the request' });
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status === 413 ? 413 : 500).json({ error: err.status === 413 ? 'File too large' : err.code === '22P02' || err.code === '42804' ? 'Invalid input' : 'Server error' });
};
