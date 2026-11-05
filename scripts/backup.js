'use strict';
// Consistent online backup of the SQLite database. Uploaded images live in UPLOAD_DIR: back that folder up too.
const path = require('path'); const fs = require('fs'); const { build } = require('../src/config'); const dbm = require('../src/db');
const cfg = build(); const db = dbm.open(cfg); const dir = process.argv[2] || path.join(path.dirname(cfg.dbPath), 'backups');
fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
const f = path.join(dir, 'prevolant-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
db.backup(f).then(() => { fs.chmodSync(f, 0o640); console.log('Backup written:', f, '\nNote: enquiry data inside is encrypted; keep DATA_ENCRYPTION_KEYS stored separately and safely.'); });
