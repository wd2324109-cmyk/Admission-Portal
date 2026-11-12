# Admission Portal — Government Enterprise Frontend

This package contains the redesigned primary React/Vite frontend from `app/frontend`.

## What changed
- Formal government-enterprise visual system using navy, slate and neutral surfaces.
- Updated application sidebar with grouped navigation and role-aware menu visibility.
- Responsive mobile navigation drawer with backdrop and Escape-key close behaviour.
- New top application bar with current section, access scope and signed-in user.
- Refined dashboard cards, tables, forms, tabs, status badges, dialogs and sign-in screen.
- Improved spacing, typography, contrast, focus states and small-screen layouts.

## What was intentionally preserved
- Existing React pages and admission workflows.
- Existing API helper and endpoint paths.
- Existing authentication/session handling and role checks.
- Existing database and backend contracts.
- Existing student, vacancy, document, TC, import, audit-log and user-management logic in the primary frontend source.

## Run locally
1. Install Node.js (the project uses Vite 5).
2. Run `npm ci`.
3. Run `npm run dev`.
4. Configure `VITE_API_URL` only if the API is hosted at a different base URL. When omitted, the frontend continues to use the existing same-origin `/api` path.

## Build
Run `npm run build` to create the production bundle in `dist/`.

## Notes
- The uploaded archive contained a second, older frontend copy under `MSenroll_web/`. The primary `app/frontend` source was selected because it contains the fuller current workflow set, including vacancy management. The older duplicate is not included in this handoff to avoid ambiguity.
- A production build could not be completed in this environment because Vite dependencies were not available locally and the package registry was unreachable. JSX syntax was checked successfully with the installed TypeScript parser.
- No backend source, database schema, environment files or credentials are included in this frontend-only package.
