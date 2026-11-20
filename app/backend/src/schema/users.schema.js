import { serial, text } from 'drizzle-orm/pg-core';
import { table } from './table.js';

// 1.1 users - login accounts for all classes (exactly the 7 columns of the database document)
export const users = table('users', {
  id: serial('id').primaryKey(),
  username: text('username'),
  passwordHash: text('password_hash'),
  role: text('role'),
  region: text('region'),
  district: text('district'),
  sessionId: text('session_id'),
});

// 1.2 access - which user can open which class (3 columns). No id column in the document, so none here.
export const access = table('access', {
  user: text('User'),
  classLevel: text('Class_level'),
  tag: text('tag'),
});
