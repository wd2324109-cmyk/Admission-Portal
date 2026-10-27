import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),                                              
  region: text('region'),                                                   
  district: text('district'),                                          
  // access freeze: set => the user cannot sign in and every session is dead
  frozenAt: timestamp('frozen_at', { withTimezone: true }),
  frozenBy: text('frozen_by'),
  frozenReason: text('frozen_reason'),
});
