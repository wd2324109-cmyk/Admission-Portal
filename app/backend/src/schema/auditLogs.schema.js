import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';

                                                                                                                                       
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(), at: timestamp('at').defaultNow().notNull(),
  actor: text('actor').notNull(), role: text('role'), action: text('action').notNull(), level: text('level').notNull().default('INFO'),
  message: text('message').notNull(), regno: integer('regno'), studentIds: jsonb('student_ids').notNull().default([]),
  undo: jsonb('undo'), revokedAt: timestamp('revoked_at'), revokedBy: text('revoked_by'), revokeRemarks: text('revoke_remarks'),
}, t => ({ atIdx: index('audit_at_idx').on(t.at), regnoIdx: index('audit_regno_idx').on(t.regno), actorIdx: index('audit_actor_idx').on(t.actor) }));
