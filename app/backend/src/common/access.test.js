import assert from 'node:assert';
import { PgDialect } from 'drizzle-orm/pg-core';
import { scope, inScope } from './access.js';
import { buildCells } from '../workflow/allocation.js';

const dialect = new PgDialect(), render = q => dialect.sqlToQuery(q);

// DEF-03: a Regional Coordinator also sees "Not listed" students (no allotted district) of its region,
// matched on the home district; a DMS still sees only students allotted to its district.
const region = { role: 'REGION', username: 'region_madurai', region: 'MADURAI' };
const dms = { role: 'DISTRICT', username: 'dms_madurai', district: 'MADURAI' };
const rq = render(scope(region, 9)), dq = render(scope(dms, 9));
assert(/coalesce\(nullif\(trim\("[^"]+"\."New_distc_name"\), ''\), "[^"]+"\."district"\)/.test(rq.sql), 'REGION scope falls back to the home district');
assert(!/coalesce/i.test(dq.sql), 'DISTRICT scope stays on the allotted district only');
assert.deepEqual(rq.params, ['MADURAI']);
assert.equal(inScope(region, { newDistcName: null, district: 'Madurai' }), true, 'region sees an unlisted student of its district');
assert.equal(inScope(region, { newDistcName: '', district: 'MADURAI' }), true);
assert.equal(inScope(region, { newDistcName: null, district: 'CHENNAI' }), false, 'but not another region\'s unlisted student');
assert.equal(inScope(region, { newDistcName: 'MADURAI', district: 'THENI' }), true, 'allotted district wins over home district');
assert.equal(inScope(dms, { newDistcName: null, district: 'MADURAI' }), false, 'a DMS never sees unlisted students');
assert.equal(scope({ role: 'STATE' }, 9), undefined);
assert.equal(scope({ role: 'REGION', region: '' }, 9) !== undefined, true, 'a region without districts sees nothing');

// DEF-01: the dashboard counts open seats like Vacancy Management: vacant seats minus seats held by
// listed / selected students, never "seats - joined".
const seat = vacancyStatus => ({ newDistrict: 'MADURAI', newUdiseCode: 'U1', newSchoolName: 'S', classLevel: 9, gender: 'Boy', medium: 'English', community: 'BC', vacancyStatus });
const seats = [...Array(5).fill('JOINED'), ...Array(47).fill('VACANT')].map(seat);
const holder = i => ({ id: i, selectStatus: '1A', tag2: '', newDistcName: 'MADURAI', newUdiseCode: 'U1', gender: 'Boy', medium: 'English', selectedCategory: 'BC' });
const sum = cells => cells.reduce((a, c) => ({ seats: a.seats + c.seats, joined: a.joined + c.joined, held: a.held + c.held, open: a.open + c.open }), { seats: 0, joined: 0, held: 0, open: 0 });
assert.deepEqual(sum(buildCells(Array.from({ length: 47 }, (_, i) => holder(i)), seats, 9)), { seats: 52, joined: 5, held: 47, open: 0 }, '52 seats, 5 joined, 47 held => 0 open (was 47)');
assert.deepEqual(sum(buildCells(Array.from({ length: 40 }, (_, i) => holder(i)), seats, 9)), { seats: 52, joined: 5, held: 40, open: 7 });
console.log('Access scope and dashboard seat counts OK');
