import cors from 'cors';

export const securityHeaders = (env = process.env) => (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-DNS-Prefetch-Control': 'off',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  });
  if (env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

export const apiHeaders = (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
  next();
};

export function corsMiddleware(env = process.env) {
  const origins = (env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length) return null;
  if (origins.includes('*')) {
    const msg = 'CORS_ORIGIN must list exact origins (for example https://admissions.example.gov.in), not "*".';
    if (env.NODE_ENV === 'production') { console.error(msg); process.exit(1); }
    console.warn('WARNING: ' + msg);
  }
  return cors({ origin: origins, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 600 });
}
