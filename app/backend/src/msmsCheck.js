import 'dotenv/config';
import readline from 'node:readline';
import { msmsLogin, resolveRole, profileFrom, nameFrom } from './common/msms.js';

const ask = (question, { hidden = false } = {}) => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(question); };
  rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
});

const args = process.argv.slice(2).filter(a => a !== '--');
let [username, password] = [args[0] || process.env.MSMS_USER, args[1] || process.env.MSMS_PASS];
if (!username) username = await ask('MSMS username: ');
if (!password) password = await ask('MSMS password: ', { hidden: true });
if (!username || !password) { console.error('A username and password are needed.'); process.exit(1); }
try {
  const d = await msmsLogin(username, password);
  console.log('MSMS fields:', { userName: d.userName, userRole: d.userRole, staffType: d.staffType, designation: d.designation, regionCode: d.regionCode, districtId: d.districtId });
  const { loginReply, ...fromToken } = d;
  console.log('Token fields (names only)     :', Object.keys(fromToken).join(', '));
  console.log('Response fields (names only)  :', Object.keys(loginReply || {}).join(', ') || '(none besides token)');
  console.log('Name found :', nameFrom(d) || 'none - set MSMS_NAME_FIELD to the field that holds the name');
  console.log('Role here  :', resolveRole(d) || 'none (login would be refused)');
  console.log('Profile    :', await profileFrom(d));
} catch (e) { console.error(e.status ? `${e.status}: ${e.message}` : e); process.exitCode = 1; }
