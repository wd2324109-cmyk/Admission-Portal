# Admission Portal (Class 9 and 10)

Node.js + PostgreSQL API (`backend`) and React/Vite website (`frontend`). The database has **exactly the 10 tables of
`Admission_Portal_Database_Tables.docx`**, and the process follows the flowchart *Student Selection and Admission to District Model Schools*.
Read **WORKFLOW-AND-DATABASE.md** first: it says what is done, what is assumed and what to finish.

## Run
```
cd backend && cp .env.example .env     # set DATABASE_URL and JWT_SECRET
npm install
npm run db:setup                        # creates the 10 tables (add  -- --drop-legacy  to remove the old tables of the previous version)
npm run db:verify                       # fails if any table/column differs from the document
npm run seed                            # superadmin + state_coordinator
npm run dev                             # API on :4000
cd ../frontend && npm install && npm run dev      # http://localhost:5173
```
Tests: `npm test` (no database) and `DATABASE_URL=<an EMPTY test database> npm run test:integration` (walks the whole flowchart; it DROPS the public schema, never point it at real data).
