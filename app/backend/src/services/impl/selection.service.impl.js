import { eq, or } from 'drizzle-orm';
import { students as S } from '../../schema/index.js';
import { listCells, setShortfall } from '../../common/seats.js';
import { db } from '../../db/index.js';
import { before, audit } from '../../common/audit.js';
import { HttpError } from '../../common/http.js';
import { lockClass } from '../../common/locks.js';
import { runRound, cellKey } from '../domain/selection.js';

import { SelectionService } from '../selection.service.js';

export class SelectionServiceImpl extends SelectionService {
  async run({ user, params, query, body }) {
    const { classLevel, mode = 'initial' } = body || {};                                 
    if (![9, 10].includes(+classLevel)) throw new HttpError('classLevel must be 9 or 10');
    if (!['initial', 'replacement'].includes(mode)) throw new HttpError('Invalid mode');


    return db.transaction(async tx => {
      await lockClass(tx, +classLevel, { exclusive: true });
      const students = await tx.select().from(S).where(eq(S.classLevel, +classLevel)).orderBy(S.id).for('update');
      const vacs = await listCells(tx, +classLevel);                                         // the seats of this class, counted per cell
      const already = students.some(s => s.selectStatus);
      if (mode === 'initial' && already) throw new HttpError('First selection was already run for this class. Use "Fill declined seats" for replacements.');
      if (mode === 'replacement' && !already) throw new HttpError('Run the first selection before filling declined seats.');

      const r = runRound(students, vacs, mode);
      for (const x of r.selections) await tx.update(S).set({ selectStatus: x.selectStatus, selectedCategory: x.selectedCategory, replacesRegno: x.replacesRegno ?? null }).where(eq(S.regno, x.regno));
      const prev = new Map(students.map(x => [x.regno, x.admitStatus]));
      for (const regno of r.replacedRegnos) await tx.update(S).set({ admitStatus: prev.get(regno) === 'TC Issued' ? 'TC Issued (Replaced)' : 'Not Admitted (Replaced)' }).where(eq(S.regno, regno));
      const byKey = new Map(vacs.map(v => [cellKey(v, v.community), v]));
      for (const u of r.vacancyUpdates) await setShortfall(tx, +classLevel, byKey.get(u.key), u.balance, user);   // seats nobody could be found for are marked SHORTFALL
      const byReg = new Map(students.map(x => [x.regno, x]));
      const touched = [...r.selections.map(x => x.regno), ...r.replacedRegnos].map(n => byReg.get(n)).filter(Boolean);
      await audit(tx, { user }, { action: 'SELECTION_RUN', message: `Class ${classLevel} ${mode}: ${r.selections.length} selected, ${r.replacedRegnos.length} replaced, ${r.vacancyUpdates.filter(u => u.status === 'SHORTFALL').length} shortfall cells`, undo: { students: touched.map(before) } });
      return ({ newlySelected: r.selections.length, replaced: r.replacedRegnos.length, shortfallCells: r.vacancyUpdates.filter(u => u.status === 'SHORTFALL').length });
    });
  }
}
