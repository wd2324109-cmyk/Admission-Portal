import * as XLSX from 'xlsx';
import { and, asc } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import { requireClass, scope, seatScope } from '../common/access.js';
import { studentTable, parseClass } from '../common/studentStore.js';
import { seatTable } from '../common/seats.js';

const toBuffer = (rows, name) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };
const day = () => new Date().toISOString().slice(0, 10);
// The headers of the sheets are the column names of the database document, so a downloaded sheet can be imported again as it is.
const asSheet = (T, rows) => { const cols = getTableConfig(T).columns.filter(c => c.name !== 'id'); return rows.map(r => Object.fromEntries(cols.map(c => [c.name, r[Object.keys(T).find(k => T[k] === c)]]))); };

export const exportService = {
  async master({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), T = studentTable(cls);
    const rows = await db.select().from(T).where(and(scope(user, cls))).orderBy(asc(T.id));
    return { buffer: toBuffer(asSheet(T, rows), 'Students'), filename: `Students_master_${cls}th_${day()}.xlsx` };
  },
  async vacancies({ user, query }) {
    const cls = await requireClass(user, parseClass(query.class)), V = seatTable(cls);
    const rows = await db.select().from(V).where(seatScope(user, V)).orderBy(asc(V.id));
    return { buffer: toBuffer(asSheet(V, rows), 'Vacancies'), filename: `Vacancies_${cls}th_${day()}.xlsx` };
  },
};
