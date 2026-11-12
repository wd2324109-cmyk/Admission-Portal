import { pgTable, serial, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

// A request to change a password, raised by the user and approved by a super admin. The one-time code is never stored,
// only its keyed hash. At most one open (PENDING or APPROVED) request per user is enforced by a partial unique index
// created in dbUpgrade.js.
export const passwordResets = pgTable('password_resets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  username: text('username').notNull(),
  status: text('status').notNull().default('PENDING'),          // PENDING, APPROVED, REJECTED, COMPLETED, EXPIRED
  requestedAt: timestamp('requested_at').notNull(),
  requestedIp: text('requested_ip'),
  decidedBy: text('decided_by'), decidedAt: timestamp('decided_at'), decisionRemarks: text('decision_remarks'),
  codeHash: text('code_hash'), expiresAt: timestamp('expires_at'), attempts: integer('attempts').notNull().default(0),
  completedAt: timestamp('completed_at'),
}, t => ({ userIdx: index('password_resets_user_idx').on(t.userId, t.id), statusIdx: index('password_resets_status_idx').on(t.status) }));
