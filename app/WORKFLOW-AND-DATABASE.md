# Database and workflow: what was built, what was assumed, what to finish

## 1. Database = the document, nothing more
`npm run db:setup` creates the 10 tables and `npm run db:verify` compares the live database with the document
(`src/spec/dbSpec.json`, generated from the .docx). It reports any **extra or missing table, view or column, wrong type or wrong order**.
`npm test` also checks that the Drizzle schema equals the document (10 tables, 226 columns).

Removed because the document has no place for them: `students`, `vacancies`, `status_logs`, `audit_logs`, `tc_requests`, `student_documents`,
`password_resets`, `user_sessions`, the `seats` view, and the extra `users` columns. (Indexes exist for speed; they are not columns.)
`npm run db:setup -- --drop-legacy` **drops those old tables and their data. Back up first.** Old data is NOT converted to the new tables.

### Things in the document that look inconsistent (built exactly as written; please confirm)
| Point | What the document says | What was built |
|---|---|---|
| Students_master_9th | overview says 38 columns, the list has 39 (Father_name, Mother_name are unnumbered) | 39, as listed |
| Students_master_10th | list ends at `tag2`, no `remark2` | no `remark2`. The code never depends on it. |
| Names `mark1-quertly`, `mark2-half`, `Total-highest of two`, `Other marks` | not valid unquoted SQL names; "quertly" looks like a typo of "quarterly" | created exactly so (quoted). To rename: `ALTER TABLE "Students_master_9th" RENAME COLUMN "mark1-quertly" TO mark1_quarterly;`, then edit `schema/studentTables.schema.js`, `spec/dbSpec.json` and `common/studentStore.js` |
| `Emis` and `Vacancy_Ref_no` are INTEGER | max 2,147,483,647 | rows with a larger EMIS are rejected on import. If real EMIS numbers are longer, change both to BIGINT (spec, schema, `INT_MAX` in `workflow/importMap.js`) |
| `access.tag` | meaning not given | `ACTIVE` = the user may open that class |
| `users.region` | no region-to-district table exists | one district name, or several separated by commas |

## 2. Roles (the 4 values of `users.role`) and the flowchart actors
| users.role | Flowchart actor | Does |
|---|---|---|
| SUPER_ADMIN | EMIS Team data + DGE data + **SE Team** | imports, overall rank, generate lists, corrections; may also act for any role |
| DISTRICT | **DMS** | willing / not willing, reconsideration, joined, not joined, TC request; furnishes own vacancies |
| REGION | **Regional Coordinator** | verifies "Not Joined" (re-admit or approve), first TC approval |
| STATE | **State Regional Coordinator** | final TC approval |

## 3. The flowchart, step by step
**`select_status` holds the current status code (any of 1A 1B 2A 6A 3A 3B 7A 7B 8A 8B); `admit_status` holds the description of that code** (for example `3A` / `Joined by HM`). Both are written together, in `statusColumns()` in `workflow/statuses.js`. All rules live in `src/workflow/` (tested in `workflow.test.js`).
| Flowchart | Implemented as |
|---|---|
| Sec 2: student data | **one sheet per class**: `9th_master_sheet` / `10th_master_sheet` (marks, NMMS, TRUST, other marks, `select_status` and `admit_status` are all columns of this sheet). The separate EMIS / DGE / Kalai Thiruvizha imports were removed. |
| Sec 2: Generate Overall Rank | `POST /rank/generate` (**placeholder formula, see 4**) |
| Sec 3: vacancies furnished by DMS | `9th_vacancy_sheet` / `10th_vacancy_sheet` import (SUPER_ADMIN or the DMS of that district), one row per seat in `Vacancies_*` |
| Sec 3/5: generate student list -> **1A** | `POST /lists/generate`: fills the open balance of each seat group with the best-ranked eligible students; writes `New_*` columns |
| Sec 4: willing? | yes **2A** / no **6A**; DMS reconsideration: yes **1B**, no = stays 6A |
| Sec 6: relieved & joined? | yes **3A** (seat becomes JOINED) / no **7A**; RC: re-admit **3B** or approve **7B** |
| Sec 6: requests TC? | **8A** (`tag2` = TC-RC) -> RC approves (TC-SRC) -> State Regional Coordinator approves -> **8B**, seat released |
| V connector | 6A (not reconsidered), 7B and 8B free the place; those students are never listed again |
| W connector | 1B students compete again in the next list; 1A students already hold their place |
| "All vacancies filled? No" | run **Generate student list** again; the preview shows the shortfall |

## 4. Assumptions to confirm (where it may not "work" the way the department wants)
1. **Overall rank formula** (`workflow/rank.js`, function `score`): the chart does not say how marks, NMMS, TRUST and Kalai marks combine. Placeholder = sum. Replace only that function.
2. **Who is eligible for which seat**: student `district` must equal the vacancy `New_district`, same gender and medium; community rules are the old ones (GT-PWD for disabled students, GT open, others by community). If a district's students go to a DMS in another district, add that mapping in `workflow/allocation.js`.
3. **Seat group** = DMS district + school code + class + gender + medium + community. `Group_code` is stored but not used for matching.
4. **tag1 / remark1** hold the latest step and its remarks; **tag2** holds the TC stage. The full history is in `Student_LOG` (every row is the student after the change, with status before/after) and `VACANCY_logs`.
5. Overall list numbers ("List 2") are kept in `remark1` of the log rows.

## 5. In the old app but not possible with 10 tables (dropped), or not in the chart
Document upload/verification, TC letters, password-request/approval flow (a super admin now gives a new password), account freezing, login/export audit entries and the revoke-any-action undo (use *Correction* on the student; it is logged), forced single sign-in per user (`users.session_id`: signing in elsewhere signs you out).
Not in the chart, so not built: DMS "request fresh list" button (the SE Team simply generates the next list), rejecting a TC request. The app works for Class 9 and 10 only. The Class 11 tables stay in the database (the document lists them) but nothing reads or writes them.

## 6. How it was tested
- `npm test`: schema = document, every flowchart rule, access control of all 26 routes.
- `npm run test:integration` on a real PostgreSQL 16: imports Excel with the document's column names, ranks, imports vacancies, generates list 1, walks students through 2A, 6A, 3A, 7A, 7B, generates list 2, 1B, 8A, 8B, a correction, checks both log tables, the roles and class access, and finally runs `db:verify` (still exactly 10 tables).
- The React app compiles (`npm run build`) but **was not clicked through in a browser** here. Do a quick pass of each page before using it.
