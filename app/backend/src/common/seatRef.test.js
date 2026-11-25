import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import { students9th, students10th, vacancies9th } from '../schema/index.js';
import { reconcileSeatRefs, seatRef, isRef } from './seatRef.js';

assert.equal(seatRef({ community: 'gt', medium: 'English', gender: 'Boy' }, 1), 'GT/Eng/Male/001');
assert.equal(seatRef({ community: 'MBC', medium: 'Tamil', gender: 'Girl' }, 12), 'MBC/Tam/Female/012');
assert.ok(isRef('GT-PWD/Eng/Male/001') && !isRef('{"decided":1}') && !isRef('some note'));

const dia = new PgDialect(), writes = [];
const run = (seats, studs) => { const queue = [seats, studs]; writes.length = 0;
  const q = r => { const o = { from: () => o, where: () => o, orderBy: () => o, for: () => o, then: (ok, no) => Promise.resolve(r).then(ok, no) }; return o; };
  return { select: () => q(queue.shift()), execute: async s => { const { sql, params } = dia.sqlToQuery(s); writes.push({ sql, params }); } }; };
const base = { newDistrict: 'MADURAI', newUdiseCode: 'U1', classLevel: 9, gender: 'Boy', medium: 'English', community: 'GT', groupCode: null };
const seats = [{ ...base, id: 1, vacancyStatus: 'VACANT' }, { ...base, id: 2, vacancyStatus: 'VACANT' }, { ...base, id: 3, vacancyStatus: 'JOINED', vacancyRefNo: 900 }];
const st = (id, emis, code, rank, remark2 = null) => ({ id, emis, selectStatus: code, orank: rank, remark2, newDistcName: 'MADURAI', newUdiseCode: 'U1', gender: 'Boy', medium: 'English', selectedCategory: 'GT' });
const studs = [st(10, 900, '3A', 5), st(11, 901, '1A', 2), st(12, 902, '2A', 1), st(13, 903, '6A', 3, 'GT/Eng/Male/002'), st(14, 904, '2A', 4, 'free text note')];

const n = await reconcileSeatRefs(run(seats.map(s => ({ ...s })), studs.map(s => ({ ...s }))), vacancies9th, students9th, 9);
const pairs = w => { const out = []; for (let i = 0; i < w.params.length; i += 2) out.push([w.params[i], w.params[i + 1]]); return Object.fromEntries(out); };
const seatW = pairs(writes[0]), stuW = pairs(writes[1]);
assert.deepEqual(seatW, { 1: 'GT/Eng/Male/001', 2: 'GT/Eng/Male/002', 3: 'GT/Eng/Male/003' });
// joined student -> seat they occupy; holders by rank take the free rows; the not-willing student's old ref is cleared; unrelated text is never wiped
assert.equal(stuW[10], 'GT/Eng/Male/003'); assert.equal(stuW[12], 'GT/Eng/Male/001'); assert.equal(stuW[11], 'GT/Eng/Male/002');
assert.equal(stuW[13], null);
// 3 holders for 2 free rows: the lowest ranked holder (rank 4) gets nothing, and its non-reference text is left alone
assert.ok(!(14 in stuW));
assert.equal(n, 4);

// second run with everything already right must write nothing
const seats2 = seats.map((s, i) => ({ ...s, groupCode: seatRef(s, i + 1) }));
const studs2 = [st(10, 900, '3A', 5, 'GT/Eng/Male/003'), st(11, 901, '1A', 2, 'GT/Eng/Male/002'), st(12, 902, '2A', 1, 'GT/Eng/Male/001')];
const n2 = await reconcileSeatRefs(run(seats2, studs2), vacancies9th, students9th, 9);
assert.equal(n2, 0); assert.equal(writes.length, 0);

// a holder keeps the seat it already claims, even when a better-ranked student arrives
const studs3 = [st(11, 901, '1A', 9, 'GT/Eng/Male/001'), st(12, 902, '2A', 1)];
await reconcileSeatRefs(run(seats2, studs3), vacancies9th, students9th, 9);
const w3 = pairs(writes[0]); assert.equal(w3[12], 'GT/Eng/Male/002'); assert.ok(!(11 in w3));

// class 10 has no remark2 column: nothing is touched
assert.equal(await reconcileSeatRefs(run([], []), vacancies9th, students10th, 10), 0);
console.log('seatRef tests passed');
