import { and, eq } from 'drizzle-orm';
import { vacancies as V } from '../../schema/index.js';
import { db } from '../../db/index.js';
import { userRegion } from '../../common/query.js';

import { VacancyService } from '../vacancy.service.js';

export class VacancyServiceImpl extends VacancyService {
  async list({ user, params, query, body }) {
    const rc = await userRegion(user);
    return (await db.select().from(V).where(and(query.class ? eq(V.classLevel, +query.class) : undefined, rc ? eq(V.regionalCentre, rc) : undefined)));
  }
}
