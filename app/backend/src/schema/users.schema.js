import { serial, text } from 'drizzle-orm/pg-core';
import { table } from './table.js';

export const users = table('users', {
  id: serial('id').primaryKey(),
  username: text('username'),
  passwordHash: text('password_hash'),
  role: text('role'),
  region: text('region'),
  district: text('district'),
  sessionId: text('session_id'),
});

export const access = table('access', {
  user: text('User'),
  classLevel: text('Class_level'),
  tag: text('tag'),
});
