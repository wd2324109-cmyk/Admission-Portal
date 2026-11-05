import { emisRef } from './common/emis.js';

// Creates the vacancy tables of the database document and, if the database still has the old one-row-per-community `vacancies`
// table, converts it: every seat becomes its own row, a seat a student joined carries that student's EMIS in Vacancy_Ref_no,
// then the old table is removed. Safe to run any number of times.
const seatCols = `id serial PRIMARY KEY, "New_district" text NOT NULL, "New_udise_type" text, "New_udise_code" text, "New_school_name" text, "Group_code" text, "Group_desc" text,
  class_level integer NOT NULL, gender text NOT NULL, medium text NOT NULL, community text NOT NULL, "Vacancy_Ref_no" integer, "Vacancy_status" text NOT NULL, remarks text`;
export const VACANCY_DDL = [
  ...[9, 10, 11].flatMap(c => [
    `CREATE TABLE IF NOT EXISTS "Vacancies_${c}th" (${seatCols})`,
    `CREATE INDEX IF NOT EXISTS vacancies_${c}th_cell_idx ON "Vacancies_${c}th" ("New_district", gender, medium, community)`]),
  `CREATE TABLE IF NOT EXISTS "VACANCY_logs" (id serial PRIMARY KEY, "New_district" text, "New_udise_type" text, "New_udise_code" text, "New_school_name" text, "Group_code" text, "Group_desc" text,
    class_level integer, gender text, medium text, community text, "Vacancy_Ref_no" integer, "Vacancy_status" text, "Update_status_before" text, "Update_status_after" text,
    updated_by text, updated_at timestamp NOT NULL DEFAULT now())`,
];

const insertSeats = async (c, table, rows) => {
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500), params = [];
    const values = part.map((r, j) => { params.push(...r); return `(${r.map((_, k) => `$${j * 8 + k + 1}`).join(',')})`; });
    await c.query(`INSERT INTO ${table} ("New_district", class_level, gender, medium, community, "Vacancy_Ref_no", "Vacancy_status", remarks) VALUES ${values.join(',')}`, params);
  }
};

export async function migrateVacancies(pool) {
  const c = await pool.connect();
  try {
    for (const q of VACANCY_DDL) await c.query(q);
    const hasTable = async t => (await c.query(`select 1 from information_schema.tables where table_schema = current_schema() and table_name = $1`, [t])).rowCount > 0;
    if (!(await hasTable('vacancies'))) return { cells: 0, seats: 0 };
    await c.query('begin');
    await c.query('DROP VIEW IF EXISTS seats');                         // the seat list is rebuilt on the new tables afterwards
    let cells = 0, seats = 0, keepOld = false;
    for (const cls of [9, 10, 11]) {
      const old = (await c.query(`select * from vacancies where class_level = $1 order by id`, [cls])).rows;
      if (!old.length) continue;
      const table = `"Vacancies_${cls}th"`;
      if ((await c.query(`select 1 from ${table} limit 1`)).rowCount) { keepOld = true; continue; }     // already has seats: never overwrite
      const people = (await c.query(`select regional_centre, gender, medium, selected_category as community, emis_no from students
        where class_level = $1 and admit_status = 'Admitted' order by orank, regno`, [cls])).rows;
      const byCell = new Map();
      for (const s of people) { const k = [s.regional_centre, s.gender, s.medium, s.community].join('|'); (byCell.get(k) ?? byCell.set(k, []).get(k)).push(s); }
      const rows = [];
      for (const v of old) {
        const joined = byCell.get([v.regional_centre, v.gender, v.medium, v.community].join('|')) ?? [];
        for (let i = 0; i < Math.max(v.admitted, joined.length); i++) {          // joined seats: the student's EMIS, or "before this portal" when no student is on the list
          const p = joined[i], ref = p ? emisRef(p.emis_no) : null;
          rows.push([v.regional_centre, cls, v.gender, v.medium, v.community, ref, 'JOINED', p ? (ref === null && p.emis_no ? `EMIS ${p.emis_no}` : null) : 'Admitted before this portal']);
        }
        const short = v.status === 'SHORTFALL' ? Math.min(Math.max(v.balance ?? 0, 0), v.vacancies) : 0;
        for (let i = 0; i < v.vacancies; i++) rows.push([v.regional_centre, cls, v.gender, v.medium, v.community, null, i >= v.vacancies - short ? 'SHORTFALL' : 'VACANT', null]);
        cells++;
      }
      await insertSeats(c, table, rows); seats += rows.length;
    }
    if (!keepOld) await c.query('DROP TABLE vacancies');
    await c.query('commit');
    return { cells, seats };
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  finally { c.release(); }
}
