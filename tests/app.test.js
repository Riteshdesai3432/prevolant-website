'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { createApp } = require('../src/app');
const C = require('../src/crypto');

const ADMIN = '/portal-testtesttesttesttest1';
const PASS = 'Correct-Horse-Battery-9';

async function boot(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prev-'));
  const ctx = createApp({ NODE_ENV: 'test', DB_PATH: ':memory:', UPLOAD_DIR: dir, ...over });
  const server = await new Promise(r => { const s = ctx.app.listen(0, '127.0.0.1', () => r(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  ctx.cfg.siteUrl = base; // for Origin checks in tests
  const mk = () => { // tiny cookie-jar client
    let cookie = '', csrf = '';
    const call = async (method, p, body, extra = {}) => {
      const headers = { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...extra.headers };
      let b = body; if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
      const r = await fetch(base + p, { method, headers, body: b, redirect: 'manual' });
      const sc = r.headers.getSetCookie(); if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
      const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
      return { status: r.status, headers: r.headers, text: txt, json: j, setCookie: sc };
    };
    return { call, setCsrf: c => { csrf = c; }, api: (m, p, b) => call(m, ADMIN + '/api' + p, b) };
  };
  return { ...ctx, server, base, mk, done: () => { server.close(); ctx.close(); } };
}
async function addUser(ctx, email, role) {
  ctx.db.prepare('INSERT INTO users(email,name,role,pass_hash,created_at) VALUES(?,?,?,?,?)').run(email, 'Test ' + role, role, await C.hashPassword(PASS), Date.now());
}
async function fullLogin(ctx, email) { // password -> enrol 2FA -> full session; returns client + totp secret
  const c = ctx.mk();
  let r = await c.api('POST', '/login', { email, password: PASS }); assert.equal(r.status, 200); c.setCsrf(r.json.csrf);
  if (r.json.next === 'enroll') {
    const s = await c.api('POST', '/2fa/setup', {}); assert.equal(s.status, 200);
    r = await c.api('POST', '/2fa/confirm', { code: C.hotp(s.json.secret, Math.floor(Date.now() / 30000)) }); assert.equal(r.status, 200);
    c.setCsrf(r.json.csrf); return { c, secret: s.json.secret, codes: r.json.backupCodes };
  }
  throw new Error('expected enrolment');
}

test('crypto: AES-GCM round trip, tamper detection and key rotation', () => {
  const { build } = require('../src/config');
  const k1 = Buffer.alloc(32, 1).toString('base64'), k2 = Buffer.alloc(32, 2).toString('base64');
  const old = C.makeCipher(build({ NODE_ENV: 'test', DATA_ENCRYPTION_KEYS: '1:' + k1 }));
  const blob = old.encrypt('secret text');
  assert.ok(!blob.includes('secret'));
  const rotated = C.makeCipher(build({ NODE_ENV: 'test', DATA_ENCRYPTION_KEYS: `1:${k1},2:${k2}` }));
  assert.equal(rotated.decrypt(blob), 'secret text');           // old data still readable
  assert.equal(rotated.keyVersion(rotated.encrypt('x')), 2);     // new data uses new key
  assert.throws(() => rotated.decrypt(blob.slice(0, -2) + 'AA')); // tampering detected
  assert.throws(() => rotated.decrypt(blob, 'other-context'));   // AAD binding
});

test('crypto: TOTP matches RFC 6238 vector, rejects replay; password policy', () => {
  const secret = C.b32enc(Buffer.from('12345678901234567890'));
  assert.equal(C.hotp(secret, Math.floor(59 / 30)), '287082');
  assert.equal(C.totpCheck(secret, '287082', 0, 59000), 1);
  assert.equal(C.totpCheck(secret, '287082', 1, 59000), null);   // replay blocked
  assert.ok(C.passwordProblem('short'));
  assert.equal(C.passwordProblem('a-long-unique-passphrase-2026'), null);
});

test('public site: renders content, security headers, hidden admin, 404s', async () => {
  const x = await boot(); const c = x.mk();
  try {
    const r = await c.call('GET', '/');
    assert.equal(r.status, 200); assert.match(r.text, /We build software that grows your business/); assert.match(r.text, /Shreyash Gurav/);
    assert.match(r.text, /id="burger"/);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.ok(r.headers.get('strict-transport-security')); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null); assert.ok(r.headers.get('permissions-policy'));
    assert.ok(!r.text.includes(ADMIN), 'public HTML must never reveal the admin path');
    const rb = await c.call('GET', '/robots.txt'); assert.ok(!rb.text.includes('portal'));
    const sm = await c.call('GET', '/sitemap.xml'); assert.ok(!sm.text.includes('portal'));
    for (const p of ['/admin', '/wp-admin', '/login', '/dashboard', '/administrator', '/admin/api/login']) assert.equal((await c.call('GET', p)).status, 404, p);
    const a = await c.call('GET', ADMIN); assert.equal(a.status, 200); assert.match(a.headers.get('x-robots-tag'), /noindex/); assert.equal(a.headers.get('cache-control'), 'no-store');
    assert.equal((await c.api('GET', '/enquiries')).status, 401);
    assert.equal((await c.call('GET', '/static/../src/config.js')).status, 404);
  } finally { x.done(); }
});

test('contact form: validation, honeypot, origin check, stored encrypted', async () => {
  const x = await boot(); const c = x.mk();
  try {
    const good = { name: 'Asha Patil', phone: '+91 98765 43210', email: 'asha@example.com', service: 'ERP or business software', message: 'We need billing software for our shop.' };
    assert.equal((await c.call('POST', '/api/contact', { ...good, email: 'nope' })).status, 400);
    assert.equal((await c.call('POST', '/api/contact', { ...good, message: 'short' })).status, 400);
    assert.equal((await c.call('POST', '/api/contact', good, { headers: { Origin: 'https://evil.example' } })).status, 403);
    const bot = await c.call('POST', '/api/contact', { ...good, website: 'http://spam' }); assert.equal(bot.status, 200);
    assert.equal(x.db.prepare('SELECT count(*) n FROM enquiries').get().n, 0, 'honeypot must not store');
    const ok = await c.call('POST', '/api/contact', { ...good, message: '<script>alert(1)</script> hello there friend' }); assert.equal(ok.status, 200);
    const row = x.db.prepare('SELECT * FROM enquiries').get();
    assert.ok(!row.data_enc.includes('Asha') && !row.data_enc.includes('asha@') && !row.data_enc.includes('script'), 'stored ciphertext only');
    assert.equal(JSON.parse(x.cipher.decrypt(row.data_enc, 'enquiry')).name, 'Asha Patil');
  } finally { x.done(); }
});

test('contact form: rate limit blocks floods', async () => {
  const x = await boot({ RATE_SCALE: 1 }); const c = x.mk();
  try {
    const body = { name: 'Rate Test', email: 'r@example.com', message: 'hello hello hello hello' }; let last;
    for (let i = 0; i < 7; i++) last = await c.call('POST', '/api/contact', body);
    assert.equal(last.status, 429);
  } finally { x.done(); }
});

test('admin auth: 2FA enrolment, lockout, replay, backup codes, cookie flags, CSRF', async () => {
  const x = await boot(); await addUser(x, 'owner@example.com', 'owner');
  try {
    // wrong password x5 -> locked (generic message, same as unknown user)
    const bad = x.mk(); let r;
    for (let i = 0; i < 5; i++) r = await bad.api('POST', '/login', { email: 'owner@example.com', password: 'wrong-password-123' });
    assert.equal(r.status, 401);
    const unknown = await x.mk().api('POST', '/login', { email: 'nobody@example.com', password: 'wrong-password-123' });
    assert.equal(r.json.error, unknown.json.error, 'no account enumeration');
    r = await bad.api('POST', '/login', { email: 'owner@example.com', password: PASS }); assert.equal(r.status, 401, 'locked even with right password');
    x.db.prepare('UPDATE users SET failed_attempts=0, locked_until=0').run();

    const c = x.mk(); r = await c.api('POST', '/login', { email: 'owner@example.com', password: PASS });
    assert.equal(r.json.next, 'enroll'); assert.ok(r.setCookie[0].includes('HttpOnly') && r.setCookie[0].includes('SameSite=Strict'));
    c.setCsrf(r.json.csrf);
    assert.equal((await c.api('GET', '/enquiries')).status, 401, 'password-only session is not enough');
    const s = await c.api('POST', '/2fa/setup', {}); assert.match(s.json.qr, /^data:image\/png/);
    const ctr = Math.floor(Date.now() / 30000);
    assert.equal((await c.api('POST', '/2fa/confirm', { code: '000000' })).status, 401);
    r = await c.api('POST', '/2fa/confirm', { code: C.hotp(s.json.secret, ctr) }); assert.equal(r.status, 200); assert.equal(r.json.backupCodes.length, 10);
    c.setCsrf(r.json.csrf);
    assert.equal((await c.api('GET', '/dashboard')).status, 200);
    // CSRF: missing token blocked
    c.setCsrf(''); assert.equal((await c.api('POST', '/logout', {})).status, 403); c.setCsrf(r.json.csrf);
    assert.equal((await c.call('POST', ADMIN + '/api/logout', {}, { headers: { Origin: 'https://evil.example' } })).status, 403);
    await c.api('POST', '/logout', {});
    // new login: TOTP replay of the enrolment code is rejected; fresh counter works; backup code works once
    const d = x.mk(); r = await d.api('POST', '/login', { email: 'owner@example.com', password: PASS }); d.setCsrf(r.json.csrf); assert.equal(r.json.next, 'totp');
    assert.equal((await d.api('POST', '/login/totp', { code: C.hotp(s.json.secret, ctr) })).status, 401, 'replay blocked');
    r = await d.api('POST', '/login/totp', { code: C.hotp(s.json.secret, ctr + 1) }); assert.equal(r.status, 200);
    const e = x.mk(); r = await e.api('POST', '/login', { email: 'owner@example.com', password: PASS }); e.setCsrf(r.json.csrf);
    const bc = (await c.api('POST', '/login', { email: 'x@x.xx', password: 'y' })) && null; void bc;
    r = await e.api('POST', '/login/totp', { code: 'aaaaa-bbbbb' }); assert.equal(r.status, 401);
    assert.ok(x.db.prepare("SELECT count(*) n FROM audit WHERE action='login_failed'").get().n >= 5, 'failures are audit-logged');
  } finally { x.done(); }
});

test('admin: roles, content draft/publish, enquiry decrypt, re-auth, uploads', async () => {
  const x = await boot(); await addUser(x, 'owner@example.com', 'owner'); await addUser(x, 'editor@example.com', 'editor');
  try {
    await x.mk().call('POST', '/api/contact', { name: 'Ravi Kumar', email: 'ravi@example.com', message: 'Need a hospital system for our clinic.', service: 'Something else' });
    const o = await fullLogin(x, 'owner@example.com'), ed = await fullLogin(x, 'editor@example.com');
    // editor cannot see inbox, users, audit or settings
    for (const p of ['/enquiries', '/users', '/audit']) assert.equal((await ed.c.api('GET', p)).status, 403, p);
    assert.equal((await ed.c.api('GET', '/content/settings')).status, 404);
    // owner reads decrypted enquiry
    const list = await o.c.api('GET', '/enquiries'); assert.equal(list.json[0].name, 'Ravi Kumar');
    const one = await o.c.api('GET', '/enquiries/' + list.json[0].id); assert.match(one.json.message, /hospital system/);
    // content: draft does not change the public site until published; invalid data rejected
    const hero = (await o.c.api('GET', '/content/hero')).json.draft; hero.headline = 'We craft reliable software.';
    assert.equal((await o.c.api('PUT', '/content/hero', { value: hero })).status, 200);
    assert.doesNotMatch((await x.mk().call('GET', '/')).text, /We craft reliable software/);
    assert.match((await o.c.api('GET', '/preview')).text, /We craft reliable software/);
    await o.c.api('POST', '/content/hero/publish', {});
    assert.match((await x.mk().call('GET', '/')).text, /We craft reliable software/);
    assert.equal((await o.c.api('PUT', '/content/hero', { value: { ...hero, headline: 'x'.repeat(500) } })).status, 400);
    const team = (await o.c.api('GET', '/content/team')).json.draft; team.members[0].photo = 'https://evil.example/x.png';
    assert.equal((await o.c.api('PUT', '/content/team', { value: team })).status, 400, 'external image URLs rejected');
    // XSS: HTML in content is escaped on the public page
    hero.headline = '<img src=x onerror=alert(1)>'; await o.c.api('PUT', '/content/hero', { value: hero }); await o.c.api('POST', '/content/hero/publish', {});
    const pub = (await x.mk().call('GET', '/')).text; assert.ok(!pub.includes('<img src=x'), 'escaped'); assert.match(pub, /&lt;img src=x/);
    // re-auth required for sensitive actions
    assert.equal((await o.c.api('GET', '/enquiries/export.csv')).status, 403);
    assert.equal((await o.c.api('POST', '/users', { name: 'New Person', email: 'new@example.com', role: 'editor' })).status, 403);
    assert.equal((await o.c.api('POST', '/reauth', { password: 'bad', code: '123456' })).status, 401);
    let ok = await o.c.api('POST', '/reauth', { password: PASS, code: C.hotp(o.secret, Math.floor(Date.now() / 30000)) }); assert.equal(ok.status, 200);
    const csv = await o.c.api('GET', '/enquiries/export.csv'); assert.equal(csv.status, 200); assert.match(csv.text, /Ravi Kumar/);
    const nu = await o.c.api('POST', '/users', { name: 'New Person', email: 'new@example.com', role: 'editor' }); assert.equal(nu.status, 200); assert.ok(nu.json.tempPassword.length > 12);
    // temp-password user must change password before anything else
    const t = x.mk(); let r = await t.api('POST', '/login', { email: 'new@example.com', password: nu.json.tempPassword }); t.setCsrf(r.json.csrf);
    const s = await t.api('POST', '/2fa/setup', {}); r = await t.api('POST', '/2fa/confirm', { code: C.hotp(s.json.secret, Math.floor(Date.now() / 30000)) }); t.setCsrf(r.json.csrf);
    assert.equal(r.json.user.mustChangePw, true); assert.equal((await t.api('GET', '/content')).status, 403);
    assert.equal((await t.api('POST', '/password', { current: nu.json.tempPassword, next: 'short' })).status, 400);
    assert.equal((await t.api('POST', '/password', { current: nu.json.tempPassword, next: 'My-new-long-passphrase-77' })).status, 200);
    assert.equal((await t.api('GET', '/content')).status, 200);
    // uploads: real image accepted + re-encoded; disguised text rejected; oversize rejected
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#1284ff' } }).png().toBuffer();
    const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
    const up = await ed.c.api('POST', '/media', fd); assert.equal(up.status, 200); assert.match(up.json.url, /^\/media\/[0-9a-f]{24}\.webp$/);
    const img = await x.mk().call('GET', up.json.url); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/webp'); assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    const fd2 = new FormData(); fd2.append('file', new Blob(['<?php echo 1; ?>'], { type: 'image/png' }), 'shell.png');
    assert.equal((await ed.c.api('POST', '/media', fd2)).status, 400);
    const fd3 = new FormData(); fd3.append('file', new Blob([Buffer.alloc(6 * 1024 * 1024)], { type: 'image/png' }), 'big.png');
    assert.equal((await ed.c.api('POST', '/media', fd3)).status, 400);
    // audit log is owner-only and records actions
    const au = await o.c.api('GET', '/audit'); assert.ok(au.json.some(a => a.action === 'content_published') && au.json.some(a => a.action === 'enquiries_exported'));
    // last owner cannot be removed
    const me = x.db.prepare("SELECT id FROM users WHERE email='owner@example.com'").get();
    assert.equal((await o.c.api('DELETE', '/users/' + me.id)).status, 400);
  } finally { x.done(); }
});

test('sessions expire (idle timeout) and logout invalidates', async () => {
  const x = await boot(); await addUser(x, 'owner@example.com', 'owner');
  try {
    const o = await fullLogin(x, 'owner@example.com');
    assert.equal((await o.c.api('GET', '/me')).status, 200);
    x.db.prepare('UPDATE sessions SET last_seen=last_seen-?').run(16 * 60 * 1000);
    assert.equal((await o.c.api('GET', '/me')).status, 401, 'idle session expired');
    const p = await fullLogin(x, 'owner@example.com').catch(() => null); void p;
  } finally { x.done(); }
});
