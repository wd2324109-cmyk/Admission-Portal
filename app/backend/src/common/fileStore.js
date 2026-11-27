import { and, desc, eq } from 'drizzle-orm';
import { studentFiles9th, studentFiles10th } from '../schema/index.js';

const TABLES = { 9: studentFiles9th, 10: studentFiles10th };
export const fileTable = cls => TABLES[+cls];

export async function saveFile(x, cls, { studentId, emis, group, type, name, url, by }) {
  await x.insert(fileTable(cls)).values({ studentId, emis: emis ?? null, fileGroup: group, fileType: type, fileName: name, fileUrl: url, uploadedBy: by, uploadedAt: new Date() });
}

export async function latestFile(x, cls, studentId, group, type) {
  const T = fileTable(cls), [f] = await x.select().from(T).where(and(eq(T.studentId, studentId), eq(T.fileGroup, group), eq(T.fileType, type))).orderBy(desc(T.id)).limit(1);
  return f ?? null;
}
