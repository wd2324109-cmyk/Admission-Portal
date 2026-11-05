// Vacancy_Ref_no is an INTEGER column (as in the database document), so only an EMIS that is a plain whole number
// up to 2,147,483,647 can be stored in it. Anything else returns null and the seat keeps the EMIS in its `remarks` instead.
export const emisRef = v => { const s = String(v ?? '').trim(); return /^\d{1,10}$/.test(s) && +s <= 2147483647 ? +s : null; };
