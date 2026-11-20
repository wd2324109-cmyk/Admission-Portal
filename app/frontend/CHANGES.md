# What changed in this frontend pass

## UI
* One design system (`src/styles/`): navy / slate palette, 12–14 px type scale, consistent buttons, inputs, tables, badges, dialogs.
  The old stylesheet was three layers of overrides (some text was 9–10 px); it is now a single set of tokens and components.
* Formal sign-in page (brand panel + form), breadcrumb top bar with scope and signed-in user, grouped sidebar.
* Dashboard: restrained chart palette, neutral stat cards with a colour edge, readable chart labels, text alternatives.
* Confirmation dialogs match the portal (they replace the browser's `window.confirm`).
* Mobile: drawer menu, condensed top bar, tables scroll inside their own box.

## Bugs found and fixed
1. Sidebar items were declared inside `App()`, so they were re-created on every render and keyboard focus was lost after each click.
2. "Import Data & Lists" had a blank menu icon (the `up` icon path never existed).
3. The top bar's page title used a class (`page-title`) that no stylesheet defined; replaced with a breadcrumb.
4. The emblem used a root-absolute path (`/emblem.png`) and ignored Vite's base path, so it broke when hosted under a sub-path.
5. Idle sign-out ran every second until the logout request finished, so a slow server could trigger repeated sign-outs.
6. On small screens the hidden menu drawer was still reachable with the Tab key.
7. Buttons outside `.row2` (Download Excel in page headers, letter file names, Remove) had no styling at all.
8. Dialogs: Escape was a global DOM `click()` hack, releasing a text selection outside the box closed the dialog and lost entered data,
   and there was no focus trap, focus return or dialog label. Replaced by one `Modal` component.
9. Charts showed `NaN` when the API omitted a group, and an unexpected status/stage/seat code (`TC_STAGE[...]`, `SEAT_TAG[...]`)
   threw and blanked the page. All lookups now have safe fallbacks.
10. Changing a filter while on page 2+ sent a request for the old page first, then another for page 1 (`usePage` removes this).
11. Change History searched on every keystroke; it is now debounced like the other lists.
12. Users page: crashed if a user had no `classes`; "Create" accepted a blank username or a DMS/Region without a district; class list sorted as text.
13. After sign-out and sign-in as another user the previous screen stayed selected (e.g. a hidden admin page).
14. The "Request new list" success message survived switching class.
15. Sign-in was not a `<form>` (password managers and Enter-to-submit relied on a key handler).
16. `vite.config.js` did not contain what `UPGRADE-NOTES.md` describes (no console removal / no source maps setting); now it does.
17. Pagination, search debounce and loading code were copy-pasted in six screens; now shared hooks/components.

## Ported from the newest upload
Document Verification (live screens), TC Requests (stage tabs, server paging, TC-only dialog mode), single "Not Joined" group
(7A shown as "Not Joined - Pending"), no TC tab in Student Details — all behave as in your `App.jsx`, with the same API calls.

## How it was checked
The refactored source bundles with no unresolved imports and was exercised in headless Chromium against a mocked API as a
super admin and as a DMS user: sign-in, every menu screen, student / document / TC dialogs, stacked confirm dialogs, Escape handling,
mobile drawer — no console errors. **Not run:** `vite build` itself (the `node_modules` in the zip were installed on Windows and have
no Linux build of rollup) and a real backend. Run `npm ci && npm run build` and click through once before deploying.

## Left alone, worth a look
* `MSenroll_web/` is an older copy of the frontend and is not included here (nothing imports it).
* `dist/` is not included: it is stale and is rebuilt by `npm run build`.
* Backend: `controllers/document.controller.js` and `services/impl/dashboard.service.impl.js` look like unused older versions
  (the live routes are in `controllers/index.js` and `services/dashboard.service.js`); the screens here call the live ones.
* `UPGRADE-NOTES.md` mentions a forgot-password flow and Password Requests page in the frontend; neither exists in the current source
  (the sign-in page says to ask the super admin). The backend has the pieces if you want it back.
* The sign-in token is still a Bearer header (as before); an HttpOnly cookie would need backend work.
