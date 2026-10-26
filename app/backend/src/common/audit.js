import { or } from 'drizzle-orm';
import { auditLogs as A } from '../schema/index.js';
import { db } from '../db/index.js';

                        
export const SNAP = s => ({ selectStatus: s.selectStatus, selectedCategory: s.selectedCategory, admitStatus: s.admitStatus, replacesRegno: s.replacesRegno,
  willingStatus: s.willingStatus, unwillingLetter: s.unwillingLetter, verificationStatus: s.verificationStatus, verificationRemarks: s.verificationRemarks });
export const before = (s, extra) => ({ id: s.id, before: { ...SNAP(s), ...(Array.isArray(extra) ? Object.fromEntries(extra.map(k => [k, s[k]])) : {}) } });                                                  
                                                                                                          
export const audit = (x, req, o) => x.insert(A).values({ actor: req?.user?.username || o.actor || 'system', role: req?.user?.role || null, action: o.action, level: o.level || 'INFO',
  message: o.message, regno: o.regno ?? null, studentIds: o.undo?.students?.length ? o.undo.students.map(t => t.id) : (o.studentId ? [o.studentId] : []), undo: o.undo ?? null });

