import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

// One row per signed-in device. An account may have many rows at once.
export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow().notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
}, t => ({ byUser: index('user_sessions_user_idx').on(t.userId, t.lastSeen) }));
