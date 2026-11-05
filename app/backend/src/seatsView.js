// The `seats` view: the seat list the Vacancies page shows, one row per seat, saying who each seat is for.
//
// Seats are real stored rows (Vacancies_9th / _10th / _11th, one row per seat, see schema/vacancyTables.schema.js); this view only
// reads them, adds the student's name, and shows which open seats are reserved for a selected student. It stores nothing.
//   JOINED seat  -> ADMITTED: the student is found by the EMIS in Vacancy_Ref_no (no EMIS = a seat filled before the portal was used)
//   open seat    -> RESERVED when a selected student who has not decided yet is waiting for it (best rank gets the first open seat), else VACANT
// Seat numbers are the position of the row in its cell (regional centre, class, gender, medium, community), so they never move.
export const SEATS_VIEW_SQL = `
CREATE VIEW seats AS
WITH stored AS (
  SELECT id, "New_district" AS regional_centre, class_level, gender, medium, community, "Vacancy_Ref_no" AS ref, "Vacancy_status" AS vstatus FROM "Vacancies_9th"
  UNION ALL SELECT id, "New_district", class_level, gender, medium, community, "Vacancy_Ref_no", "Vacancy_status" FROM "Vacancies_10th"
  UNION ALL SELECT id, "New_district", class_level, gender, medium, community, "Vacancy_Ref_no", "Vacancy_status" FROM "Vacancies_11th"
), numbered AS (
  SELECT x.*,
         row_number() OVER (PARTITION BY regional_centre, class_level, gender, medium, community ORDER BY id) AS seat_no,
         CASE WHEN vstatus <> 'JOINED' THEN row_number() OVER (PARTITION BY regional_centre, class_level, gender, medium, community, (vstatus <> 'JOINED') ORDER BY id) END AS open_no
  FROM stored x
), waiting AS (
  SELECT s.id AS student_id, s.regno, s.name, s.district, s.regional_centre, s.class_level, s.gender, s.medium, s.selected_category AS community,
         row_number() OVER (PARTITION BY s.regional_centre, s.class_level, s.gender, s.medium, s.selected_category ORDER BY s.orank, s.regno) AS open_no
  FROM students s
  WHERE s.select_status <> '' AND s.admit_status = ''
)
SELECT n.regional_centre || '-C' || n.class_level || '-' || n.gender || '-' || n.medium || '-' || n.community || '-' || lpad(n.seat_no::text, 3, '0') AS seat_code,
       n.regional_centre, n.class_level, n.gender, n.medium, n.community, n.seat_no::int AS seat_no,
       CASE WHEN n.vstatus = 'JOINED' THEN 'ADMITTED' WHEN w.student_id IS NOT NULL THEN 'RESERVED' ELSE 'VACANT' END AS status,
       COALESCE(j.id, w.student_id) AS student_id, COALESCE(j.regno, w.regno) AS regno, COALESCE(j.name, w.name) AS student_name, COALESCE(j.district, w.district) AS student_district
FROM numbered n
LEFT JOIN students j ON n.vstatus = 'JOINED' AND n.ref IS NOT NULL AND j.class_level = n.class_level AND j.emis_no = n.ref::text
LEFT JOIN waiting w ON n.vstatus <> 'JOINED' AND (w.regional_centre, w.class_level, w.gender, w.medium, w.community, w.open_no)
                                                = (n.regional_centre, n.class_level, n.gender, n.medium, n.community, n.open_no)`;
