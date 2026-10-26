# Full Spectrum Audit: School Admissions Portal (Class 9 and 10)

**Date**: October 2026
**Mode**: General repo health (the uploaded `admissions-app (2).zip`)
**Lenses run**: 10/10, adapted to this stack (Node.js, Express, Drizzle, PostgreSQL, React). The "Backend" lens was applied to Node, not Rust/Tauri.
**Also applied**: Shield security audit (OWASP, JWT, uploads, secrets) and PlanetScale Postgres best practices.
**What was checked**: all files in `backend/src` and `frontend/src`, schema, scripts, config and the archive contents. Nothing was run against a live database or a browser.

---

## Master verdict: APPROVE WITH CHANGES

The structure is sound: clean controller / service / implementation / schema layers, server-side role and district scope on every student query, transactions around multi-record changes, an audit log with revoke, and tests for the selection, import and revert logic. The serious gaps were around sign-in and secrets, not around business logic. Those are fixed in this pass. What remains is mostly operational (secrets rotation, backups, retention) and testing.

### Fixed in this pass
| # | Fix | Where |
|---|---|---|
| 1 | JWT secret must be 32+ characters; production refuses to start without one; algorithm pinned to HS256; token life 8 h | `common/auth.js` |
| 2 | Brute-force limit on sign-in (8 failures per address and user, 30 per address, 15 minutes) and equal-time check for unknown users | `common/rateLimit.js`, `auth.service.impl.js` |
| 3 | No fixed default passwords: the super admin password is random (or `SEED_ADMIN_PASSWORD`) and printed once; sample data is refused in production | `seed.js` |
| 4 | Change-password endpoint and screen (key icon in the sidebar) | `auth.service.impl.js`, `App.jsx` |
| 5 | CORS only for listed origins; 100 KB JSON limit, 25 MB only for import, documents and TC routes | `server.js` |
| 6 | Security headers, `X-Powered-By` removed, `no-store` on API, HSTS in production, `/api/health`, clean shutdown | `server.js` |
| 7 | Upload content must match its extension (PDF, PNG, JPEG signatures) | `common/upload.js` |
| 8 | Database: pool limits, 30 s statement timeout, SSL option, pool error handler | `db/index.js` |
| 9 | Database: indexes for tab lists, dashboard, district scope, logs and name search; value checks; foreign key on history | `schema/*`, `dbUpgrade.js` |
| 10 | Student lists no longer read the large `documents` / `tc` JSON of every row | `student.service.impl.js` |
| 11 | Removed leftover files from older versions (old schema files, duplicate domain files) | repo |
| 12 | Design pass: borders instead of shadows, no all-caps labels, no hover lifts or fade-in on every screen, visible focus, reduced-motion support | `styles.css` |
| 13 | Dialogs have `role="dialog"`, Esc closes them, menu marks the current page | `App.jsx` |

### Must do by you (cannot be fixed in code)
1. **Rotate secrets.** The archive contained `backend/.env` (database URL and a 9-character `JWT_SECRET`) and `backend/uploads/` with uploaded files. Treat both as exposed: change the database password, set a new `JWT_SECRET` (command in `.env.example`), and never zip `.env` or `uploads`.
2. Run `npm run db:upgrade` once, then `npm test`.
3. Behind nginx set `TRUST_PROXY=true`, otherwise the sign-in limiter sees every user as the proxy's address.

---

## Lens 1: Design Engineer: APPROVE WITH CHANGES
- **Found**: consistent tokens and clear status colours, with text on every badge (status is never colour only). The look leaned on generic traits: gradient buttons, shadow on every card, hover lift, fade-in on every screen, small all-caps labels. **Fixed** (item 12). Brand colours, layout, the emblem and tab design were kept as you approved them.
- **Open**: type is the system font only; no dark theme; the three status colours (amber, red, violet) are close for colour-blind users, but the text label covers it.

## Lens 2: UX Engineer: APPROVE WITH CHANGES
- **Good**: the status flow is short; errors come from the server in plain words; destructive reverts ask for remarks and confirmation.
- **Found**: no way to change a password (**fixed**). Counts on tabs are missing, so a user cannot see how many students wait without opening each tab. Search covers name and EMIS only, not registration number. A 401 reloads the page and loses where the user was.
- **Open**: add counts on the tabs and a registration-number search.

## Lens 3: Frontend Engineer: APPROVE WITH CHANGES
- **Good**: stale responses are ignored in lists; search is debounced; sign-in state survives a refresh.
- **Found**: all screens live in one ~400-line `App.jsx`; pages are state, not routes, so the browser Back button leaves the portal; the token is in `localStorage` (readable by any script that runs in the page); many inline styles; no error boundary.
- **Open**: split `App.jsx` per screen, add a router, add an error boundary. A strict Content-Security-Policy at nginx limits the `localStorage` risk (see Shield S9).

## Lens 4: Backend Engineer (Node): APPROVE WITH CHANGES
- **Good**: errors never crash the server (`wrap` plus error handler); admits use SQL arithmetic on the vacancy counters, so they are atomic; logs are written in the same transaction as the change.
- **Found**: no input schema validation (each service checks by hand); `documents` and `tc` are updated by read, modify, write, so two simultaneous edits to the same student's JSON could overwrite each other; `student.service.impl.js` `update` does too many things.
- **Open**: add schema validation (for example zod), lock the student row (`SELECT ... FOR UPDATE`) in the document and TC methods.

## Lens 5: Structural Engineer: APPROVE
- Layers and dependencies run one way (controller, service, domain, schema). No cycles. The contract / implementation pair is ceremony without dependency injection, but it is consistent and harmless.
- **Fixed**: old schema files `tcRequests` and `studentDocuments` were still present and matched by the drizzle glob, which would have recreated the old tables; the old `db/schema.js` and duplicate domain files are removed.

## Lens 6: Repo Maintainer: APPROVE WITH CHANGES
- **Found**: code comments were stripped from the uploaded files, so the reasoning behind rules (vacancy checks, revert, locking of documents) is no longer written down. Three ways of changing the database exist (`db:push`, the `drizzle/` migration folder, `db:upgrade`) and the migration folder only knows the first schema.
- **Open**: restore key comments; choose one migration route (suggested: `db:upgrade` or proper drizzle migrations, not both); add a lint and format config (the `.vscode` setting formats on save, which changes many files silently).

## Lens 7: Production Readiness: APPROVE WITH CHANGES
- **Fixed**: secret enforcement, CORS, body limits, health endpoint, graceful shutdown, pool settings.
- **Open**: logs go to the console only (ship them with the service manager); uploads and the database need backup together; no retention for `audit_logs`, which grows with every page view; deploy files (service, nginx) are not in the repo; recommended nginx headers: `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; frame-src 'self' blob:; style-src 'self' 'unsafe-inline'`, plus `client_max_body_size 30m`.

## Lens 8: DX Engineer: APPROVE
- Good scripts and a seed that works first time. **Fixed**: `.env.example` lists every setting; the seed prints the generated password once. **Open**: README should say that `npm test` needs no database.

## Lens 9: Performance Engineer: APPROVE WITH CHANGES
- **Fixed**: indexes; list queries skip the JSON columns; `pg_trgm` indexes (optional, created when the database user is allowed) make name and EMIS search use an index.
- **Open**: `/documents/students` and `/documents/progress` load every student with documents and count in memory (fine for a few thousand, move to SQL beyond that); the Logs screen polls every 3 s and each poll runs two queries; one `VIEW` log row per page view will grow the table quickly (consider sampling or a 90-day clean-up job).

## Lens 10: Accessibility Engineer: APPROVE WITH CHANGES
- **Fixed**: dialog role, Esc to close, visible focus, current-page marker, reduced motion, labelled login and password fields, accessible names for icon buttons.
- **Open**: dialogs do not trap keyboard focus; the tab buttons are not exposed as tabs (`role="tab"`); table headers lack `scope="col"`; the grey secondary text should be checked for contrast on the dashboard cards.

---

# Security review (Shield)

| ID | Severity | Finding | Status |
|---|---|---|---|
| S1 | High | `JWT_SECRET` was 9 characters: an HS256 token can be cracked offline and forged for any role | **Fixed in code** (32+ required, algorithm pinned). **You: rotate the secret** |
| S2 | High | Fixed default password `Admin@12345` in the seed, with no way to change it | **Fixed** (random password, change-password screen) |
| S3 | High | No limit on failed sign-ins | **Fixed** (limiter) |
| S4 | Medium | Unknown users answered faster than wrong passwords (username enumeration) | **Fixed** |
| S5 | Medium | Open CORS and 25 MB body limit on every route | **Fixed** |
| S6 | Medium | Uploads checked by extension only | **Fixed** (signature check). Malware scanning is not included |
| S7 | Medium | No security headers, `X-Powered-By` exposed | **Fixed** for the API. Set the CSP at nginx |
| S8 | Medium | Secrets and student files inside the shared archive | **Open: rotate and exclude** |
| S9 | Low to Medium | Token in `localStorage` can be read by any script injected into the page. React escapes output and there is no `dangerouslySetInnerHTML`, so there is no known injection point today | Accepted risk. Mitigate with CSP; consider an httpOnly cookie with CSRF protection later |
| S10 | Low | No token revocation: a changed password or a removed user stays valid until the token expires (8 h) | Open |
| S11 | Info | SQL injection: Drizzle binds parameters; the raw SQL fragments only interpolate bound values; `LIKE` input is escaped | Pass |
| S12 | Info | Broken access control: every student, document and TC query goes through `scope(user)`; role guards on every write route; file downloads check scope | Pass |
| S13 | Info | Mass assignment: update methods copy only named fields | Pass |

**JWT check**: HS256, `exp` set, no sensitive claims (id, username, role, region, district), verified with an explicit algorithm list. Only the secret strength was a problem.

---

# PostgreSQL review (PlanetScale guidance)

| Topic | Finding | Status |
|---|---|---|
| Indexing | Tab lists and counts filter on `class_level` plus a status column; district users filter on `district`; none had an index | **Added** `students_class_admit_idx`, `students_class_select_idx`, `students_district_idx` |
| Indexing | History by student and logs by student or user were full scans | **Added** `status_logs_student_idx`, `audit_regno_idx`, `audit_actor_idx` |
| Search | `ILIKE '%text%'` cannot use a normal index | **Added** trigram indexes on `name` and `emis_no` (optional step) |
| Integrity | `status_logs.student_id` had no foreign key; free text where only a few values are valid | **Added** foreign key (cascade) and checks on class, gender and role (`NOT VALID`, so existing rows are not blocked) |
| Queries | Lists selected every column including two JSON columns | **Fixed** |
| Queries | OFFSET paging and a separate count per list are fine at this size | OK |
| Connections | Default pool, no timeouts | **Fixed** (max, idle and connect timeouts, 30 s statement timeout, SSL option) |
| Types | `timestamp` without time zone is used for all times | Open: move to `timestamptz` when convenient (needs a one-off conversion) |
| Types | `serial` ids | OK; new tables could use identity columns |
| JSON | `documents` and `tc` as `jsonb` in one row suits the single-table decision; a GIN index is only needed if you start searching inside them | OK |
| Growth | `audit_logs` has no retention | Open |
| Backups | Database and `uploads/` must be backed up together | Open (needs the MSMS team) |

---

## Recommended order for the open items
1. Rotate the database password and `JWT_SECRET`; stop zipping `.env` and `uploads`.
2. `npm run db:upgrade`, `npm test`, then try each role end to end on a real database.
3. nginx: HTTPS, CSP, 30 MB body limit, `TRUST_PROXY=true`.
4. Backups for the database and `uploads/`; a retention job for `audit_logs`.
5. Row lock plus input validation in the services; restore the key comments.
6. Split `App.jsx` and add routing; tab counts; focus trap in dialogs.
