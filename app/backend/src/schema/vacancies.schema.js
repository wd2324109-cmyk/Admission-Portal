import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';

export const vacancies = pgTable('vacancies', {
  id: serial('id').primaryKey(),
  regionalCentre: text('regional_centre').notNull(),
  classLevel: integer('class_level').notNull(),
  gender: text('gender').notNull(),
  medium: text('medium').notNull(),
  community: text('community').notNull(),   
  admitted: integer('admitted').notNull().default(0),
  vacancies: integer('vacancies').notNull().default(0),
  filled: integer('filled'), balance: integer('balance'), status: text('status').default(''),
}, t => ({ uniq: uniqueIndex('vac_uniq').on(t.regionalCentre, t.classLevel, t.gender, t.medium, t.community) }));
