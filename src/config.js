'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Minimal .env loader (no dependency). Real environment variables always win.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function build(overrides = {}) {
  loadEnvFile(path.join(process.cwd(), '.env'));
  const e = { ...process.env, ...overrides };
  const prod = e.NODE_ENV === 'production';
  const test = e.NODE_ENV === 'test';
  const errors = [];
  const need = (k, test_) => { if (!e[k] || (test_ && !test_(e[k]))) errors.push(k); return e[k]; };

  let adminPath = e.ADMIN_PATH;
  let sessionSecret = e.SESSION_SECRET;
  let keysRaw = e.DATA_ENCRYPTION_KEYS;
  if (test) {
    adminPath = adminPath || '/portal-testtesttesttesttest1';
    sessionSecret = sessionSecret || crypto.randomBytes(32).toString('hex');
    keysRaw = keysRaw || '1:' + crypto.randomBytes(32).toString('base64');
  } else {
    need('ADMIN_PATH', v => /^\/[A-Za-z0-9_-]{24,}$/.test(v));
    need('SESSION_SECRET', v => v.length >= 32);
    need('DATA_ENCRYPTION_KEYS', v => /^\d+:[A-Za-z0-9+/=]{43,}(,\d+:[A-Za-z0-9+/=]{43,})*$/.test(v));
    if (prod) need('SITE_URL', v => /^https:\/\//.test(v));
  }
  if (errors.length) {
    throw new Error('Invalid or missing environment variables: ' + errors.join(', ') + '. See .env.example and run "npm run gen:secrets".');
  }
  const keys = {};
  for (const part of keysRaw.split(',')) {
    const [v, k] = part.split(':');
    const buf = Buffer.from(k, 'base64');
    if (buf.length !== 32) throw new Error('DATA_ENCRYPTION_KEYS: every key must be 32 bytes (base64).');
    keys[v] = buf;
  }
  const versions = Object.keys(keys).map(Number).sort((a, b) => a - b);
  const current = Number(e.DATA_KEY_CURRENT || versions[versions.length - 1]);
  if (!keys[current]) throw new Error('DATA_KEY_CURRENT does not match a key in DATA_ENCRYPTION_KEYS.');

  return {
    prod, test,
    port: Number(e.PORT || 3000),
    siteUrl: (e.SITE_URL || 'http://localhost:' + (e.PORT || 3000)).replace(/\/$/, ''),
    adminPath,
    sessionSecret,
    keys, currentKey: current,
    dbPath: e.DB_PATH || path.join(process.cwd(), 'data', 'prevolant.db'),
    uploadDir: e.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads'),
    trustProxy: e.TRUST_PROXY === undefined ? (prod ? 1 : 0) : Number(e.TRUST_PROXY),
    adminIpAllowlist: (e.ADMIN_IP_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean),
    retentionMonths: Number(e.RETENTION_MONTHS === undefined ? 12 : e.RETENTION_MONTHS),
    smtp: e.SMTP_HOST ? { host: e.SMTP_HOST, port: Number(e.SMTP_PORT || 587), user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.MAIL_FROM || e.SMTP_USER } : null,
    notifyTo: e.NOTIFY_TO || 'Prevolant04@gmail.com',
    turnstile: e.TURNSTILE_SITEKEY && e.TURNSTILE_SECRET ? { site: e.TURNSTILE_SITEKEY, secret: e.TURNSTILE_SECRET } : null,
    cookieName: prod ? '__Host-sid' : 'sid',
  };
}
module.exports = { build };
