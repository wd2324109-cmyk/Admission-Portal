// Section 6, last part: TC requests wait for the Regional Coordinator, then the State Regional Coordinator (workflow/transitions.js).
// The approvals themselves are student actions (TC_REQUEST, TC_RC_APPROVE, TC_STATE_APPROVE); this only lists them.
import { and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { classesOf, scope } from '../common/access.js';
import { studentTable } from '../common/studentStore.js';
import { view } from './student.service.js';

export const tcService = {
  async list({ user, query }) {
    const out = [];
    for (const cls of await classesOf(user)) {
      const T = studentTable(cls), rows = await db.select().from(T).where(and(scope(user, cls), sql`${T.selectStatus} in ('8A','8B')`)).orderBy(desc(T.id)).limit(500);
      out.push(...rows.map(r => ({ ...view(r, cls, user.role), tcStage: r.selectStatus === '8B' ? 'DONE' : r.tag2 === 'TC-SRC' ? 'STATE' : 'REGION', reason: r.remark1 })));
    }
    return query.stage ? out.filter(r => r.tcStage === query.stage) : out;
  },
};
