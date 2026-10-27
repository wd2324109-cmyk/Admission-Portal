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

                                                                                                          
export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  regno: integer('regno').notNull().unique(),
  emisNo: text('emis_no').notNull(),
  name: text('name').notNull(),
  dob: text('dob'),
  gender: text('gender').notNull(),                            
  classLevel: integer('class_level').notNull(),            
  district: text('district').notNull(),
  regionalCentre: text('regional_centre').notNull(),
  schoolName: text('school_name'),
  community: text('community').notNull(),                                   
  medium: text('medium').notNull(),
  disability: boolean('disability').notNull().default(false),
  total: integer('total').notNull(),                            
  orank: integer('orank').notNull(),                                            
  phone: text('phone'),
  selectStatus: text('select_status').default(''),                                  
  selectedCategory: text('selected_category').default(''),                                               
  admitStatus: text('admit_status').default(''),                                                                     
  willingStatus: text('willing_status').notNull().default('WILLING'),
  unwillingLetter: text('unwilling_letter'),
  verificationStatus: text('verification_status').notNull().default('PENDING'),                             
  verificationRemarks: text('verification_remarks'),
  replacesRegno: integer('replaces_regno'),                                                                                          
}, t => ({ cell: index('cell_idx').on(t.regionalCentre, t.classLevel, t.gender, t.medium) }));

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

export const statusLogs = pgTable('status_logs', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull(),
  field: text('field').notNull(), oldValue: text('old_value'), newValue: text('new_value'), remarks: text('remarks'),
  changedBy: text('changed_by'), changedAt: timestamp('changed_at').defaultNow().notNull(),
});

                                                                                                          
export const tcRequests = pgTable('tc_requests', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull(),
  reason: text('reason').notNull(),
  letterName: text('letter_name').notNull(), letterPath: text('letter_path').notNull(),
  status: text('status').notNull().default('PENDING'),                                   
  requestedBy: text('requested_by').notNull(), requestedAt: timestamp('requested_at').defaultNow().notNull(),
  reviewedBy: text('reviewed_by'), reviewedAt: timestamp('reviewed_at'), reviewRemarks: text('review_remarks'),
});

                                                                                                                                       
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(), at: timestamp('at').defaultNow().notNull(),
  actor: text('actor').notNull(), role: text('role'), action: text('action').notNull(), level: text('level').notNull().default('INFO'),
  message: text('message').notNull(), regno: integer('regno'), studentIds: jsonb('student_ids').notNull().default([]),
  undo: jsonb('undo'), revokedAt: timestamp('revoked_at'), revokedBy: text('revoked_by'), revokeRemarks: text('revoke_remarks'),
}, t => ({ atIdx: index('audit_at_idx').on(t.at) }));


export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(), userId: integer('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow().notNull(),
  ip: text('ip'), userAgent: text('user_agent'),
}, t => ({ byUser: index('user_sessions_user_idx').on(t.userId, t.lastSeen) }));
