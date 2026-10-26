import assert from 'node:assert';
import { buildSample } from '../../sampleData.js';
import { runRound } from './selection.js';
const { sts, vacs } = buildSample();
const students = sts.map(s => ({ ...s, selectStatus: '', selectedCategory: '', admitStatus: '' }));
let r = runRound(students, vacs, 'initial');
const by = new Map(students.map(s => [s.regno, s]));
r.selections.forEach(x => Object.assign(by.get(x.regno), x));
assert.equal(new Set(r.selections.map(x => x.regno)).size, r.selections.length, 'no student selected twice');
assert(r.selections.filter(x => x.selectedCategory === 'GT-PWD').every(x => by.get(x.regno).disability), 'GT-PWD only disabled');
assert(r.selections.filter(x => !['GT', 'GT-PWD'].includes(x.selectedCategory)).every(x => by.get(x.regno).community === x.selectedCategory));
console.log('Round 1 selected', r.selections.length, 'of', vacs.reduce((a, v) => a + v.vacancies, 0), 'seats; shortfall cells:', r.vacancyUpdates.filter(u => u.status === 'SHORTFALL').length);
const declined = r.selections.slice(0, 10).map(x => by.get(x.regno)); declined.forEach(s => s.admitStatus = 'Not Admitted');
r.selections.slice(10, 30).forEach(x => by.get(x.regno).admitStatus = 'Admitted');
const r2 = runRound([...by.values()], vacs, 'replacement');
console.log('Replacement picks', r2.selections.length, 'for', declined.length, 'declined; marked replaced', r2.replacedRegnos.length);
assert(r2.selections.length <= declined.length);
assert(r2.selections.every(x => /Phase-1$/.test(x.selectStatus)), 'replacements keep region latest phase');
console.log('OK');

                                                                                                            
r2.selections.forEach(x => Object.assign(by.get(x.regno), x));
r2.replacedRegnos.forEach(n => (by.get(n).admitStatus = 'Not Admitted (Replaced)'));
const r3 = runRound([...by.values()], vacs, 'replacement');
assert.equal(r3.selections.length, 0, 'replacement must be idempotent');
                                                                        
const seatHolders = [...by.values()].filter(s => s.selectStatus);
assert.equal(new Set(seatHolders.map(s => s.regno)).size, seatHolders.length);
assert(seatHolders.every(s => s.selectedCategory !== 'GT-PWD' || s.disability), 'PWD seats only for disabled students');
                                                                                                                      
const cellOf = s => [s.regionalCentre, s.classLevel, s.gender, s.medium].join('|');
for (const s of seatHolders.filter(x => x.selectedCategory === 'GT')) {
  const better = students.filter(o => !o.selectStatus && cellOf(o) === cellOf(s) && (o.total > s.total || (o.total === s.total && o.orank < s.orank)));
  assert.equal(better.length, 0, 'GT seat must go to the best remaining student');
}
console.log('Idempotence + merit-order checks OK');

assert(r2.selections.every(x => x.replacesRegno && by.get(x.replacesRegno).admitStatus.startsWith('Not Admitted')), 'every replacement points at the seat it took');
console.log('Replacement links OK');

                                                                                                        
const tcStudent = by.get(r.selections[15].regno); tcStudent.admitStatus = 'TC Issued';
const r4 = runRound([...by.values()], vacs, 'replacement');
assert(r4.selections.length <= 1 && r4.replacedRegnos.length === r4.selections.length);
if (r4.selections.length) assert.equal(r4.selections[0].replacesRegno, tcStudent.regno);
console.log('TC seat refill OK');
