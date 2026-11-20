import { studentLog, vacancyLogs } from '../schema/index.js';
import { logSnapshot } from './studentStore.js';
import { primary, stateOf } from '../workflow/statuses.js';

export const logStudent = (tx, cls, beforeRow, afterRow, user) => tx.insert(studentLog).values({
  ...logSnapshot(afterRow, cls),
  updateStatusBefore: beforeRow ? primary(stateOf(beforeRow)) : '', updateStatusAfter: primary(stateOf(afterRow)),
  updatedBy: user.username, updatedAt: new Date(),
});
export const logStudents = async (tx, cls, pairs, user) => { for (let i = 0; i < pairs.length; i += 200) await tx.insert(studentLog).values(pairs.slice(i, i + 200).map(([b, a]) => ({
  ...logSnapshot(a, cls), updateStatusBefore: b ? primary(stateOf(b)) : '', updateStatusAfter: primary(stateOf(a)), updatedBy: user.username, updatedAt: new Date() }))); };

export const logSeat = (tx, row, from, to, user, ref = row.vacancyRefNo) => tx.insert(vacancyLogs).values({
  newDistrict: row.newDistrict, newUdiseType: row.newUdiseType, newUdiseCode: row.newUdiseCode, newSchoolName: row.newSchoolName, groupCode: row.groupCode, groupDesc: row.groupDesc,
  classLevel: row.classLevel, gender: row.gender, medium: row.medium, community: row.community, vacancyRefNo: ref, vacancyStatus: to,
  updateStatusBefore: from, updateStatusAfter: to, updatedBy: user.username, updatedAt: new Date() });
