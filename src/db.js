'use strict';
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.13+ (no native compiling needed)
const fs = require('fs');
const path = require('path');

// Thin wrapper so the rest of the app uses one small, consistent API.
function wrap(raw) {
  const nn = a => a.map(v => (v === undefined ? null : v));
  return {
    exec: s => raw.exec(s),
    pragma: s => raw.exec('PRAGMA ' + s),
    prepare(sql) { const st = raw.prepare(sql); return { run: (...a) => st.run(...nn(a)), get: (...a) => st.get(...nn(a)), all: (...a) => st.all(...nn(a)) }; },
    transaction: fn => (...args) => { raw.exec('BEGIN'); try { const r = fn(...args); raw.exec('COMMIT'); return r; } catch (e) { try { raw.exec('ROLLBACK'); } catch {} throw e; } },
    backup: async file => { raw.prepare('VACUUM INTO ?').run(file); },
    close: () => raw.close(),
  };
}

function open(cfg) {
  if (cfg.dbPath !== ':memory:') fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });
  const db = wrap(new DatabaseSync(cfg.dbPath));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('secure_delete = ON');
  db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','admin','editor')),
    pass_hash TEXT NOT NULL,
    totp_secret_enc TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0, totp_last_counter INTEGER NOT NULL DEFAULT 0,
    backup_codes TEXT NOT NULL DEFAULT '[]',
    failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
    must_change_pw INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, last_login_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions(
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage TEXT NOT NULL CHECK(stage IN ('pw','full')), csrf TEXT NOT NULL,
    created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    reauth_until INTEGER NOT NULL DEFAULT 0, ip TEXT, ua TEXT
  );
  CREATE TABLE IF NOT EXISTS content(
    key TEXT PRIMARY KEY, draft TEXT NOT NULL, published TEXT NOT NULL,
    updated_at INTEGER NOT NULL, updated_by TEXT
  );
  CREATE TABLE IF NOT EXISTS enquiries(
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL,
    data_enc TEXT NOT NULL, note_enc TEXT, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','replied')),
    ip_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS media(
    id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE NOT NULL, original_name TEXT,
    bytes INTEGER, created_at INTEGER NOT NULL, uploaded_by TEXT
  );
  CREATE TABLE IF NOT EXISTS audit(
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, user_id INTEGER, email TEXT,
    action TEXT NOT NULL, detail TEXT, ip TEXT, ua TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_enq_created ON enquiries(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
  `);
  return db;
}

function seedContent(db, defaults) {
  const has = db.prepare('SELECT 1 FROM content WHERE key=?');
  const ins = db.prepare('INSERT INTO content(key,draft,published,updated_at,updated_by) VALUES(?,?,?,?,?)');
  for (const [k, v] of Object.entries(defaults)) {
    if (!has.get(k)) { const j = JSON.stringify(v); ins.run(k, j, j, Date.now(), 'seed'); }
  }
}
module.exports = { open, seedContent };
