'use strict';
// Usage: npm run create-owner -- you@company.com "Your Name"
// Creates the first Owner with a one-time temporary password. 2FA enrolment is forced at first sign-in.
const { build } = require('../src/config'); const dbm = require('../src/db'); const C = require('../src/crypto');
(async () => {
  const [email, ...n] = process.argv.slice(2); const name = n.join(' ') || 'Owner';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('Usage: npm run create-owner -- email "Full Name"'); process.exit(1); }
  const cfg = build(); const db = dbm.open(cfg);
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) { console.error('That user already exists.'); process.exit(1); }
  const pw = C.randomToken(12) + '!A9';
  db.prepare("INSERT INTO users(email,name,role,pass_hash,must_change_pw,created_at) VALUES(?,?,'owner',?,1,?)").run(email, name, await C.hashPassword(pw), Date.now());
  console.log(`\nOwner created: ${email}\nTemporary password (shown once): ${pw}\nAdmin URL: ${cfg.siteUrl}${cfg.adminPath}\nYou will be asked to set a new password and enrol 2FA at first sign-in.\n`);
})();
