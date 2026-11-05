'use strict';
// Re-encrypts all encrypted fields with the CURRENT key (DATA_KEY_CURRENT).
// Procedure: 1) add the new key to DATA_ENCRYPTION_KEYS (keep old ones)  2) set DATA_KEY_CURRENT  3) restart  4) npm run rotate-keys  5) after it reports 0 old rows, you may remove the old key.
const { build } = require('../src/config'); const dbm = require('../src/db'); const C = require('../src/crypto');
const cfg = build(); const db = dbm.open(cfg); const ci = C.makeCipher(cfg); let n = 0, old = 0;
const re = (blob, aad) => { if (!blob) return blob; if (ci.keyVersion(blob) === cfg.currentKey) return blob; old++; return ci.encrypt(ci.decrypt(blob, aad), aad); };
db.transaction(() => {
  for (const r of db.prepare('SELECT id,data_enc,note_enc FROM enquiries').all()) { db.prepare('UPDATE enquiries SET data_enc=?, note_enc=? WHERE id=?').run(re(r.data_enc, 'enquiry'), re(r.note_enc, 'note'), r.id); n++; }
  for (const u of db.prepare('SELECT id,totp_secret_enc FROM users WHERE totp_secret_enc IS NOT NULL').all()) db.prepare('UPDATE users SET totp_secret_enc=? WHERE id=?').run(re(u.totp_secret_enc, 'totp:' + u.id), u.id);
})();
console.log(`Checked ${n} enquiries; re-encrypted ${old} fields to key v${cfg.currentKey}.`);
