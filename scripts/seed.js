// Idempotent demo data: drops any existing demo user, then recreates it with two
// projects covering every task state. Talks to db.js directly, not HTTP.
import { createDb } from '../server/db.js';
import { config } from '../server/config.js';
import { hashPassword } from '../server/auth.js';

const EMAIL = 'demo@demo.dev';
const PASSWORD = 'demo1234';

const db = createDb({ file: config.dataFile });

const existing = db.findUserByEmail(EMAIL);
if (existing) {
  db.deleteUser(existing.id);
}

const passwordHash = await hashPassword(PASSWORD);
const user = db.createUser({ email: EMAIL, passwordHash });

function isoDate(daysFromToday) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

const work = db.createProject(user.id, 'Work');
const home = db.createProject(user.id, 'Home');

db.createTask(user.id, work.id, { description: 'Reply to the backlog of emails.' }); // pending, no finish date
db.createTask(user.id, work.id, { title: 'Write proposal', description: 'Draft the Q3 proposal.', finishDate: isoDate(7) }); // pending, future
db.createTask(user.id, work.id, { title: 'File expense report', description: 'Overdue paperwork.', finishDate: isoDate(-1) }); // overdue

const onTime = db.createTask(user.id, home.id, {
  title: 'Clean garage',
  description: 'Sort and clean the garage.',
  finishDate: isoDate(1),
});
db.completeTask(user.id, onTime.id); // completed before its finish date

const late = db.createTask(user.id, home.id, {
  title: 'Renew license',
  description: 'Renew the driving license.',
  finishDate: isoDate(-3),
});
db.completeTask(user.id, late.id); // completed after its finish date

db.close();

console.log('Seeded demo account:');
console.log(`  email:    ${EMAIL}`);
console.log(`  password: ${PASSWORD}`);
