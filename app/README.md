# Class 9 & 10 Admissions (Node.js + Drizzle + React)

Selection logic is ported from the Humanities scripts (`selection_round_01.py`, `update_admission_vacancies_02.py`, `update_master_admit_status_03.py`), with `class_level` (9/10) added to every vacancy cell.

## Run
```
cd backend && cp .env.example .env     # set DATABASE_URL (PostgreSQL)
npm install && npm run db:push && npm run seed && npm run dev     # seed creates only the super admin
cd ../frontend && npm install && npm run dev      # http://localhost:5173
npm test --prefix backend                          # selection logic test, no DB needed
```
Logins (seeded): superadmin / Admin@12345 · region_cuddalore / Region@12345 · district_cuddalore / District@12345

## Selection rules (src/services/selection.js)
- Cell = Regional_centre / Class / Gender / Medium / Community. Rank = TOTAL desc, ORANK asc.
- GT = open merit (all communities); GT-PWD = disabled students only; others = same community. Order: GT-PWD, GT, then communities.
- Pool = never selected and no admit status. Round 1 target = vacancies.
- Admitted -> `admitted +1`, `vacancies -1` on that cell. Not Admitted -> next round replaces one-for-one in the same cell, keeping the region's latest phase; the old row becomes `Not Admitted (Replaced)`.
- Accepted unwillingness (Verification) = seat given up, treated as Not Admitted.

## Roles
Super admin: all data, runs selection, verifies. Region user: read-only, own regional centre. District user: sets Admitted / Not Admitted / Unwilling for own district.

## Rules enforced by the API (bug-fix pass)
- Errors in any route return JSON (`500 Server error`) instead of crashing the Node process.
- First selection can run only once per class; "Fill declined seats" needs a first selection to exist.
- Admitted is final. A seat already given to a replacement (`Not Admitted (Replaced)`) cannot be re-admitted.
- An unwilling student cannot be admitted until the super admin verifies and **rejects** the unwillingness; **accepting** it releases the seat.
- Rejecting an unwillingness needs remarks. Verification decisions are final.
- Dashboard seat counts are limited to the user's own region.
- Frontend keeps you signed in on refresh and returns to login when the token expires.

## Revert and TC (added)
- **Revert:** super admin only, on a Not Admitted student (remarks required). The student returns to "selected, pending". If a replacement took the seat, that student is removed (and anyone who replaced them); if the replacement had been admitted, the vacancy is given back (admitted -1, vacancies +1). Districts can no longer change a Not Admitted student.
- **TC requests:** a district user raises a request for an *admitted* student of their district with a reason and a letter (PDF/JPG/PNG, max 3 MB, stored in `backend/uploads`). The super admin approves, or rejects with remarks. Tabs: TC Requested, TC Students (approved), Rejected. Region users can view.
- After pulling these changes run `npm run db:push` (new column + `tc_requests` table) and `npm run seed`.

## Data comes from Excel (Import Data screen, super admin)
1. Login as `superadmin`, open **Import Data**, pick Class 9 or 10.
2. Upload the **students** sheet (Humanities "Master" layout) then the **vacancies** sheet. Header names are matched ignoring case/underscores. Class comes from an optional `Class` column, otherwise from the class tab you selected.
3. Bad rows are listed with their Excel row number and reason; good rows are still imported. Existing REGNOs are skipped (or tick *Replace* to start fresh).
4. A login is created for every new district and regional centre (`district_<name>`, `region_<name>`) with a random password shown once.
5. Run the first selection from Student Details.
`npm run seed:sample` still loads demo data for testing. `npm install` is needed again (adds `xlsx`).

## TC approval and seats
District user: **TC Requests > Raise TC request** lists admitted students; click one to see the details, enter the reason, attach the unwilling/request letter and submit. Super admin reviews the letter and approves or does not approve (message required). **Approved** = status `TC Issued`, the seat is revoked (admitted -1, vacancy +1) and the next **Fill declined seats** round gives that seat to the next student in merit (marked `TC Issued (Replaced)`). Not approved leaves the student admitted.

## Reverting a Not Admitted student (super admin only)
Checks the seat cell (region, class, gender, medium, seat category): free vacancy -> student is reinstated as selected. Full -> the lowest-ranked selected-but-not-admitted student ranked below this one is removed (back to the pool) and this student takes the seat. Nobody qualifies -> "No vacancy" message and nothing changes. Admitted students are never removed. Every change is logged in the students' history.

## Logs and revoke (super admin: sidebar > Logs)
Every important step is written to `audit_logs` (login, imports, selection rounds, admit / not admit / unwilling, verification, revert, TC raise / decision, revoke). **History** is a table with a Revoke button; **Console** shows the same entries as a live, WinSCP-style text log (Download .log saves it). Revoke restores the affected students and gives vacancy counts back, and needs remarks. An entry can be revoked only after any later change to the same student has been revoked first.
After updating run `npm run db:push` (or `db:generate` + `db:migrate`) to create the `audit_logs` table.

## Backend structure (layers)
```
backend/src
  server.js                     app bootstrap (middleware, /api routes, error handler)
  controllers/*.controller.js   HTTP only: routes, auth guards, call the service
  services/*.service.js         service contracts (interfaces)
  services/impl/*.service.impl.js   implementations: business rules and database work
  services/index.js             wiring: which implementation backs each contract
  services/domain/              pure logic + tests (selection, revert planning, Excel mapping)
  schema/*.schema.js            Drizzle table definitions (one file per table)
  common/                       shared helpers: auth, query scope, audit, Excel, errors
  db/index.js                   database connection
```
Services throw `HttpError(message, status)`; the error handler turns it into JSON. New endpoint: `POST /api/students/:id/revoke-admission` (super admin): admission is undone and only the vacancy is given back (admitted -1, vacancies +1); the student goes back to selected-pending. Blocked while a TC request is pending or approved. It appears in Logs and can itself be revoked.

## Document verification (new sidebar item)
After admission the district user opens **Document Verification > Upload documents**, picks an admitted student, chooses the document type. **Five documents are mandatory**: Transfer Certificate, Community Certificate, Birth Certificate, Application Form and Aadhaar Card (optional extras: Disability Certificate, Other). The super admin cannot verify any of a student's documents until all 5 are submitted (rejecting is always possible) and uploads a PDF/JPG/PNG (max 3 MB). The super admin sees them under **Pending**, previews the file and **Verifies** or **Rejects** (remarks needed to reject). A rejected type can be uploaded again. Reviews appear in Logs and can be revoked. Region users can view. Run `npm run db:upgrade` once to create the `student_documents` table.

Document Verification lists **one row per student** (Pending / Verified / Rejected-Incomplete). Clicking a student opens one popup with all their documents as links, a preview, per-document Verify / Reject, and **Verify all pending**.

**Editing documents (district):** a wrongly uploaded document can be replaced (Replace) until all 5 required documents are submitted; then the submission is locked for verification. A rejected document can be resubmitted (Resubmit). Verified documents never change.

## Revert TC and Excel downloads
**Revert TC** (super admin; Student Details popup or TC Requests > TC Students): checks the seat cell first. A free vacancy -> the student is Admitted again (admitted +1, vacancy -1) and the approved TC request becomes CANCELLED. No vacancy -> "No vacancy" message, nothing changes. Logged as `REVERT_TC` and revocable from Logs.
**Downloads:** Student Details has **Download Master (Excel)** and **Download Vacancies (Excel)** for the selected class (limited to the user's own region / district). Column names match the import sheets.

## Student Details tabs
Pending for Selection, Selected, Joined, Not Joined, TC Issued, Not Joined (names taken from the reference dashboard). Design: sidebar layout with gradient cards, charts and segmented tabs.

## Selected students, statuses and one table
The super admin imports the students who are already selected (Excel); every imported student is shown under **Selected**. District users mark them **Admitted** or **Not Admitted** only (Unwilling is no longer used). Student Details has three tabs: Selected, Admitted, Not Admitted. The revert options (Not Admitted, revoke admission, revert TC) are unchanged.
**Single table:** student details, the five documents and the TC request are all stored in the `students` table (columns `documents` and `tc`, both JSON). The History is `audit_logs` (plus the per-student `status_logs`). Run `npm run db:upgrade` to add the two columns. The old `tc_requests` and `student_documents` tables are no longer used; their data is not carried over. Remove them with `DROP TABLE IF EXISTS tc_requests, student_documents;` once you are sure nothing is needed.

## Student status flow (Class 9 and 10)
Student Details has Class 9 / Class 10 tabs, each with **Pending, Selected, Joined, Not Joined, TC**. Imported students start in **Pending**; opening one offers **Selected** or **Not Joined**. In **Selected** the buttons are **Joined** or **Not Joined**. **Joined** lists joined students; **Not Joined** lists students marked Not Joined and those marked Not Joined; **TC** lists students whose TC was issued. Documents: five can be uploaded, three are compulsory (Transfer Certificate, Birth Certificate, Application Form); the admin marks them Verified or Not Verified. Logs record sign-in, sign-out, every change and what each user opens.

## Import statuses
The Excel comes from the selection round, so its statuses are read one stage earlier than the portal tabs: students with `Select_Status` filled (and no `Admit_status`) are listed in **Pending**; students with `Admit_status` = Admitted are listed in **Selected** (to be marked Joined or Not Joined); `Not Admitted` and `TC Issued` rows keep their status. The seat category (`Selected_category`) is kept from the sheet.

## Security and operations (after the audit)
- Settings are in `backend/.env` (see `.env.example`). `JWT_SECRET` must be 32+ random characters; production refuses to start otherwise.
- `npm run seed` prints the super admin password once; set `SEED_ADMIN_PASSWORD` to choose it. Users change their password with the key icon in the sidebar.
- Failed sign-ins are limited (8 per address and user, 30 per address, per 15 minutes). Behind nginx set `TRUST_PROXY=true`.
- `npm run db:upgrade` also adds indexes, value checks and (if allowed) trigram search indexes.
- Never share `.env` or `uploads/`. Full findings: `reviews/audit-plan-full.md`.
