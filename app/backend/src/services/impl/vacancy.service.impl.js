import { asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { userRegion } from '../../common/query.js';
import { seatTable, aggregate, cellView } from '../../common/seats.js';
import { COMMUNITY_ORDER } from '../domain/selection.js';

import { VacancyService } from '../vacancy.service.js';

// The vacancy list is counted from the seat rows: admitted = JOINED seats, vacancies = open seats.
export class VacancyServiceImpl extends VacancyService {
  async list({ user, params, query, body }) {
    const rc = await userRegion(user), classes = query.class ? [+query.class] : [9, 10];
    const cells = [];
    for (const c of classes) {
      const T = seatTable(c);
      cells.push(...aggregate(await db.select().from(T).orderBy(asc(T.id))).filter(x => !rc || x.regionalCentre === rc).map(cellView));
    }
    return cells.sort((a, b) => a.regionalCentre.localeCompare(b.regionalCentre) || a.classLevel - b.classLevel || a.gender.localeCompare(b.gender)
      || a.medium.localeCompare(b.medium) || COMMUNITY_ORDER.indexOf(a.community) - COMMUNITY_ORDER.indexOf(b.community));
  }
}
