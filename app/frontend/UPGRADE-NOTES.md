# Frontend upgrade notes

The frontend in `app/frontend` now uses the government-enterprise design from `admissions-portal-government-redesign.zip`
(sidebar with grouped navigation, top bar with access scope, mobile drawer, refreshed tables/forms/dialogs/sign-in),
plus the security and resilience changes below. Backend code, API paths and workflows are unchanged.

## Security changes
| Change | Where | Why |
| --- | --- | --- |
| Sign-in token kept in `sessionStorage` (gone when the tab closes); leftover `localStorage` tokens are deleted | `src/api.js` | A token in `localStorage` survives browser restarts and shared-PC use |
| Automatic sign-out after inactivity, with a 2-minute warning and "Stay signed in" | `src/security.jsx` (`IdleGuard`) | Unattended screens are the most common leak. `VITE_IDLE_MINUTES` must match `SESSION_IDLE_MINUTES` on the server (default 30) |
| Removed the 60-second background ping | `src/App.jsx` | It kept the server session alive forever on an unattended tab, defeating the server's idle timeout. Keep-alive now happens only while the person is active |
| Request timeouts, offline/timeout/429 messages | `src/api.js` | No hanging screens; clear feedback when sign-in is rate limited |
| Documents open with `noopener,noreferrer`; blob URLs are released; download names are sanitised | `src/api.js`, `src/App.jsx` | Stops opened tabs reaching back into the portal and avoids leaking document data in memory |
| Password field cleared after a failed sign-in; username trimmed; Caps Lock hint | `src/App.jsx` | Standard sign-in hygiene |
| Password meter and requirement checklist (mirrors the server rules: 10-72 bytes, no username) | `src/security.jsx` | Fewer rejected changes, stronger passwords |
| Content-Security-Policy `<meta>` added to the built `index.html`, `no-referrer`, source maps off, `console` calls dropped in production | `vite.config.js`, `index.html` | Defence in depth if the page is ever served by something other than the Node server |
| Error boundary | `src/security.jsx`, `src/main.jsx` | A rendering error shows a calm message instead of a blank page |
| nginx: TLS 1.2+, security headers, `server_tokens off`, login rate limit, hidden files blocked | `deploy/nginx-admissions.conf` | Hardens the edge |

## Forgot password with super admin approval
Users request a reset, a super admin approves it and hands over a one-time code, and only then can the user set a new password.
Super admin accounts are recovered from the server with `npm run reset:superadmin`. See `app/PASSWORD-RESET.md`.
Files: `backend/src/services/impl/passwordReset.service.impl.js`, `backend/src/common/resetCode.js`, `backend/src/resetSuperadmin.js`,
the `password_resets` table in `backend/src/dbUpgrade.js`, and the sign-in screens and **Password Requests** page in `src/App.jsx`.

## Not changed (and why)
* The token is still sent as a Bearer header. Moving it to an `HttpOnly` cookie would also need backend changes
  (cookie flags, CSRF protection); worth doing as a separate step.
* `app/frontend/MSenroll_web/` is an older duplicate frontend. It was left untouched; delete it once you are happy with the new one.

## Build
`cd app/frontend && npm ci && npm run build` (verified: builds cleanly, no source maps, CSP meta present).
