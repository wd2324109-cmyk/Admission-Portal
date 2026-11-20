# Frontend architecture — Admission Portal

React 18 + Vite 5 single-page app. No router, no state library, no UI framework: the app is small enough
that plain React, one API client and one CSS design system keep it easy to read and maintain.

## 1. Big picture

```
 index.html
    └─ main.jsx ─ ErrorBoundary ─ ConfirmProvider ─ App (shell)
                                                      │
                          ┌───────────────────────────┼──────────────────────────┐
                       Sidebar                      Topbar                  current screen
                    (from routes.jsx)                                  (one entry of routes.jsx)
                                                                              │
                                                                       features/<screen>
                                                                              │
                        ┌──────────────────────┬──────────────────┬───────────┴──────────┐
                  components/ui          components/charts       hooks/                lib/
              (Modal, Badge, Table…)    (Donut, bars, columns)  (useFetch, usePage…)  (status, format)
                                                                      │
                                                                  api/client ──► /api  (Node + Express)
                                                                  api/session (token in sessionStorage)
```

## 2. Folder layout

```
src/
├─ main.jsx               entry: error boundary, confirm dialogs, 404 for any path except the root
├─ app/                   the shell — knows about every screen, owns the session
│  ├─ App.jsx             sign-in state, idle guard, mobile menu, document title
│  ├─ routes.jsx          THE route table: key, label, icon, menu section, who may open it
│  ├─ Sidebar.jsx  Topbar.jsx  NotFound.jsx
├─ features/              one folder per screen (vertical slices; own their data loading and UI)
│  ├─ auth/               Login, ChangePassword
│  ├─ dashboard/          Dashboard
│  ├─ students/           StudentDetails, StudentModal, StatusBadge
│  ├─ vacancies/          Vacancies (seat groups + seat-by-seat)
│  ├─ documents/          DocumentVerification, DocumentsModal
│  ├─ tc/                 TcRequests
│  ├─ listRequests/       ListRequests, RequestNewList (DMS), OpenRequestsNotice (dashboard)
│  ├─ imports/            ImportData, Uploader, ListPanel
│  ├─ logs/               Logs
│  └─ users/              Users
├─ components/
│  ├─ ui/                 generic building blocks with no business knowledge:
│  │                      Modal, Confirm (useConfirm), Badge, Alert, Table, Pager, Segmented, ClassTabs, PageHeader, Icon, Empty
│  └─ charts/             Donut, ColumnChart, StackedBars, Legend (plain SVG, with text alternatives)
├─ hooks/                 useFetch (stale-safe loading), usePage (page resets with filters), useDebounced
├─ lib/
│  ├─ status.js           workflow vocabulary: status codes, groups, tones, roles, TC stages, document states
│  └─ format.js           date/number formatting, base64 reader, asset() for public files
├─ api/
│  ├─ client.js           every network call: timeouts, friendly errors, 401 handling, safe file open/download
│  └─ session.js          token + signed-in user (sessionStorage with in-memory fallback)
├─ security/              IdleGuard, OfflineBanner, ErrorBoundary, password rules + meter, Caps Lock hint
└─ styles/                tokens.css → base.css → layout.css → components.css → features.css (index.css imports them)
```

## 3. Dependency rules (keep these and the code stays tidy)

| Layer | May import | Must not import |
| --- | --- | --- |
| `app/` | features, security, api, components, lib | — |
| `features/*` | components, hooks, lib, api, security, **another feature only for a small shared piece** (e.g. `StudentModal` is reused by TC Requests) | `app/` |
| `components/*` | other components, `lib` (display helpers only) | features, api |
| `hooks/`, `lib/` | nothing from the layers above | features, components |
| `api/` | nothing | everything else |

## 4. How data flows

1. A screen calls `useFetch(() => api('/students?…'), [deps])`. The hook ignores answers that arrive after a newer
   request and keeps the last good data while loading or after an error.
2. `api()` adds the Bearer token, a timeout (45 s; 180 s for import/export/selection), turns failures into plain
   messages (offline, timeout, 429) and signs the user out on `401`.
3. Writes are plain `api(path, { method: 'POST', body })` calls inside the screen, followed by `reload()`.
4. Filters live in the screen's own state. `usePage(...filters)` returns page 1 whenever a filter changes, so a filter
   change never sends a request for a page that no longer exists.

## 5. Navigation and access

* `app/routes.jsx` is the only place that lists screens and who may see them (`can(user)`). Sidebar, Topbar,
  breadcrumbs and the page title are all generated from it.
* Hiding a menu item is a convenience, **not security**: the Express API enforces every role rule. Never rely on the
  client for authorisation.
* There is deliberately no URL router: the portal lives at the site root and every other path shows the 404 page.
  If deep links are needed later, replace `page` state in `App.jsx` with a router; features need no change.

## 6. State

* Local component state only. Server data is never copied into a global store.
* Session (token, user, logout reason) is in `api/session.js`; the token lives in `sessionStorage`, so it disappears with the tab.
* Confirmation dialogs are a promise: `if (!(await confirm({ title, message, danger }))) return;`.

## 7. Security layer (`security/`)

Idle sign-out with a two-minute warning (`VITE_IDLE_MINUTES` must equal the server's `SESSION_IDLE_MINUTES`),
offline banner, error boundary (no stack traces shown), password rules identical to the server's, Caps Lock hint.
Files are only opened if they are PDF/PNG/JPEG blobs, with `noopener,noreferrer`.
The Content-Security-Policy is set by the Node server (`server.js`), not by a `<meta>` tag.

## 8. Styling system

* `tokens.css` holds every colour, size and radius as CSS variables. Change the look there, not in components.
* Naming: block (`panel`, `dialog`, `stat`) / `block__part` / `block--variant`. Badge tones: `ok info warn bad tc neutral outline`.
* Buttons: `.btn`, `.btn--primary`, `.btn--danger`, `.btn--sm`. One base style, no per-page button CSS.
* Responsive: below 1050 px the sidebar becomes a drawer; below 680 px the top bar is condensed. Wide tables scroll inside their own box.
* Accessibility: visible focus ring, labelled dialogs with focus trap and Escape, minimum 12 px text, charts expose text summaries.

## 9. Adding a screen

1. Create `features/<name>/<Screen>.jsx` (use `PageHeader`, `Table`, `Pager`, `useFetch`).
2. Add one object to `ROUTES` in `app/routes.jsx` (`key`, `label`, `icon`, `section`, `can`, `render`).
3. Add any new icon path to `components/ui/Icon.jsx` and any new status wording to `lib/status.js`.

## 10. Build and run

```
cd app/frontend
npm ci
npm run dev        # Vite dev server, proxies /api to http://localhost:4000
npm run build      # writes dist/, which the Node server serves
```
`VITE_API_URL` is only needed if the API is on a different origin. `VITE_IDLE_MINUTES` defaults to 30.
