'use strict';
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { build } = require('./config');
const dbm = require('./db');
const C = require('./crypto');
const content = require('./content');
const view = require('./render');
const { createMailer } = require('./mailer');

const MIN = 60 * 1000;
const IDLE = { full: 15 * MIN, pw: 5 * MIN }, ABS = 8 * 60 * MIN;

function createApp(overrides = {}) {
  const cfg = build(overrides);
  const db = dbm.open(cfg);
  dbm.seedContent(db, content.DEFAULTS);
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  const cipher = C.makeCipher(cfg);
  const mailer = createMailer(cfg);
  const scale = Number(overrides.RATE_SCALE || (cfg.test ? 100 : 1));
  const app = express();
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const now = () => Date.now();

  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);

  // ---------- HTTPS + security headers
  app.use((req, res, next) => {
    if (cfg.prod && req.path !== '/healthz' && (req.headers['x-forwarded-proto'] || req.protocol) !== 'https') return res.redirect(301, cfg.siteUrl + req.originalUrl);
    next();
  });
  const ts = cfg.turnstile;
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", ...(ts ? ['https://challenges.cloudflare.com'] : [])],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'], styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
      frameSrc: ts ? ['https://challenges.cloudflare.com'] : ["'none'"], objectSrc: ["'none'"], baseUri: ["'self'"],
      formAction: ["'self'"], frameAncestors: ["'none'"], ...(cfg.prod ? { upgradeInsecureRequests: [] } : {}) } },
    frameguard: { action: 'deny' },
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' }, crossOriginResourcePolicy: { policy: 'same-origin' },
  }));
  app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'); next(); });
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  const lim = (windowMs, limit, error) => rateLimit({ windowMs, limit: limit * scale, standardHeaders: true, legacyHeaders: false, message: { error }, validate: { trustProxy: false, xForwardedForHeader: false } });
  const general = lim(MIN, 300, 'Too many requests. Please slow down.');
  const loginLimiter = lim(15 * MIN, 10, 'Too many attempts. Please try again later.');
  const contactLimiter = lim(60 * MIN, 5, 'Too many messages from your network. Please try again later or call us.');
  const adminLimiter = lim(5 * MIN, 400, 'Too many requests.');
  const uploadLimiter = lim(15 * MIN, 30, 'Too many uploads. Try again later.');

  // ---------- helpers
  const siteOrigin = new URL(cfg.siteUrl).origin;
  const sameOrigin = req => { const o = req.get('origin'); if (!o) return false; return o === siteOrigin || o === `${req.protocol}://${req.get('host')}`; };
  const audit = (req, action, detail = '', user = req.user) => db.prepare('INSERT INTO audit(ts,user_id,email,action,detail,ip,ua) VALUES(?,?,?,?,?,?,?)')
    .run(now(), user ? user.id : null, user ? user.email : null, action, String(detail).slice(0, 500), req.ip, String(req.get('user-agent') || '').slice(0, 200));
  const setCookie = (res, token, ms) => res.cookie(cfg.cookieName, token, { httpOnly: true, secure: cfg.prod, sameSite: 'strict', path: '/', maxAge: ms });
  const createSession = (req, res, user, stage) => {
    const token = C.randomToken(32), csrf = C.randomToken(24), t = now(), ttl = stage === 'pw' ? IDLE.pw : ABS;
    db.prepare('INSERT INTO sessions(id,user_id,stage,csrf,created_at,last_seen,expires_at,ip,ua) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(C.sha256(token), user.id, stage, csrf, t, t, t + ttl, req.ip, String(req.get('user-agent') || '').slice(0, 200));
    setCookie(res, token, ttl); return csrf;
  };
  const dropSession = (req, res, clear = true) => { if (req.sess) db.prepare('DELETE FROM sessions WHERE id=?').run(req.sess.id); if (clear) res.clearCookie(cfg.cookieName, { path: '/' }); };
  const lockout = n => n >= 5 ? now() + Math.min(15 * MIN * 2 ** (n - 5), 24 * 60 * MIN) : 0;
  const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, totp: !!u.totp_enabled, mustChangePw: !!u.must_change_pw });
  async function failAttempt(req, user, why) {
    const n = user.failed_attempts + 1;
    db.prepare('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?').run(n, lockout(n), user.id);
    audit(req, why, `attempt ${n}`, user);
    if (n === 5) mailer.send({ to: user.email, subject: 'Prevolant admin: account temporarily locked', text: 'There were repeated failed sign-in attempts on your Prevolant admin account, so it has been temporarily locked. If this was not you, change your password after the lock expires.' });
  }

  // ---------- content
  let cache = null;
  const loadContent = which => {
    const rows = db.prepare('SELECT key,draft,published FROM content').all(), out = {};
    for (const r of rows) out[r.key] = JSON.parse(which === 'draft' ? r.draft : r.published);
    for (const k of Object.keys(content.DEFAULTS)) if (!out[k]) out[k] = content.DEFAULTS[k];
    return out;
  };
  const home = () => cache || (cache = view.render(loadContent('published'), { siteUrl: cfg.siteUrl, turnstile: cfg.turnstile }));
  const settings = () => loadContent('published').settings;
  const notFound = (req, res) => res.status(404).type('html').send(view.notFound(settings(), cfg.siteUrl));

  // ---------- public site
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: cfg.prod ? '1d' : 0, index: false }));
  app.use('/media', express.static(cfg.uploadDir, { maxAge: '7d', index: false, dotfiles: 'deny', setHeaders: r => { r.setHeader('X-Content-Type-Options', 'nosniff'); r.setHeader('Content-Security-Policy', "default-src 'none'"); } }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(general);
  app.get('/', (req, res) => res.type('html').send(home()));
  app.get('/privacy', (req, res) => res.type('html').send(view.privacy(settings(), cfg.siteUrl)));
  app.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nAllow: /\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`));
  app.get('/sitemap.xml', (req, res) => res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${cfg.siteUrl}/</loc></url><url><loc>${cfg.siteUrl}/privacy</loc></url></urlset>`));

  const contactSchema = z.object({
    name: z.string().trim().min(2, 'Please enter your name.').max(100), phone: z.string().trim().max(20).regex(/^[0-9+()\-\s]*$/, 'Please enter a valid phone number.').optional().default(''),
    email: z.string().trim().email('Please enter a valid email address.').max(160), service: z.string().trim().max(80).optional().default(''),
    message: z.string().trim().min(10, 'Please tell us a little more (at least 10 characters).').max(3000), website: z.string().max(200).optional().default(''),
    'cf-turnstile-response': z.string().max(2100).optional(),
  });
  app.post('/api/contact', contactLimiter, wrap(async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Request blocked.' });
    const r = contactSchema.safeParse(req.body || {});
    if (!r.success) return res.status(400).json({ error: r.error.issues[0].message });
    const d = r.data;
    if (d.website) return res.json({ ok: true }); // honeypot: pretend success
    if (cfg.turnstile) {
      let ok = false;
      try {
        const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: cfg.turnstile.secret, response: d['cf-turnstile-response'] || '', remoteip: req.ip }), signal: AbortSignal.timeout(5000) });
        ok = (await resp.json()).success === true;
      } catch { ok = false; }
      if (!ok) return res.status(400).json({ error: 'Please complete the human check and try again.' });
    }
    const strip = s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    const rec = { name: strip(d.name), phone: strip(d.phone), email: d.email, service: strip(d.service), message: strip(d.message) };
    db.prepare('INSERT INTO enquiries(created_at,data_enc,ip_hash) VALUES(?,?,?)').run(now(), cipher.encrypt(JSON.stringify(rec), 'enquiry'), C.hmac(cfg.sessionSecret, req.ip));
    mailer.send({ to: cfg.notifyTo, subject: 'New website enquiry', text: `A new enquiry was received on the Prevolant website.\nOpen the admin inbox to read it: ${cfg.siteUrl}${cfg.adminPath}` });
    mailer.send({ to: rec.email, subject: 'We received your message – Prevolant', text: `Hi ${rec.name.split(' ')[0]},\n\nThank you for contacting Prevolant. We have received your message and will get back to you soon.\n\nPrevolant Software Services & Consultancy\n${settings().phones.join(' | ')}` });
    res.json({ ok: true });
  }));

  // ---------- admin (hidden path)
  const admin = express.Router();
  const A = cfg.adminPath;
  admin.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (cfg.adminIpAllowlist.length && !cfg.adminIpAllowlist.includes(req.ip)) return notFound(req, res);
    next();
  });
  const adminDir = path.join(__dirname, '..', 'admin');
  const shell = () => fs.readFileSync(path.join(adminDir, 'index.html'), 'utf8').replace(/__BASE__/g, A);
  admin.get('/', (req, res) => res.type('html').send(shell()));
  admin.get('/assets/admin.js', (req, res) => res.type('js').sendFile(path.join(adminDir, 'admin.js')));
  admin.get('/assets/admin.css', (req, res) => res.type('css').sendFile(path.join(adminDir, 'admin.css')));

  const api = express.Router();
  api.use(adminLimiter);
  api.use((req, res, next) => { // load session (may be absent)
    const tok = req.cookies[cfg.cookieName];
    if (tok && typeof tok === 'string' && tok.length < 100) {
      const row = db.prepare('SELECT s.*, u.id uid FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?').get(C.sha256(tok));
      if (row) {
        const t = now(), user = db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id);
        if (t > row.expires_at || t - row.last_seen > IDLE[row.stage] || user.disabled) db.prepare('DELETE FROM sessions WHERE id=?').run(row.id);
        else { req.sess = row; req.user = user; if (t - row.last_seen > 15000) db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(t, row.id); }
      }
    }
    next();
  });
  api.use((req, res, next) => { // CSRF for every state-changing call
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Request blocked (origin).' });
    if (req.sess && !C.safeEqual(req.get('x-csrf-token') || '', req.sess.csrf)) return res.status(403).json({ error: 'Request blocked (token). Reload the page.' });
    next();
  });
  const needAny = (req, res, next) => req.sess ? next() : res.status(401).json({ error: 'Please sign in.' });
  const needPw = (req, res, next) => req.sess && req.sess.stage === 'pw' ? next() : res.status(401).json({ error: 'Please sign in again.' });
  const needFull = (req, res, next) => {
    if (!req.sess || req.sess.stage !== 'full') return res.status(401).json({ error: 'Please sign in.' });
    if (req.user.must_change_pw && !req.allowForced) return res.status(403).json({ error: 'You must change your password first.', mustChangePw: true });
    next();
  };
  const forced = (req, res, next) => { req.allowForced = true; next(); };
  const role = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action.' });
  const reauthed = (req, res, next) => req.sess.reauth_until > now() ? next() : res.status(403).json({ error: 'Please confirm your password and 2FA code.', reauth: true });
  const bodyOf = (schema, req, res) => { const r = schema.safeParse(req.body || {}); if (!r.success) { res.status(400).json({ error: r.error.issues[0].message }); return null; } return r.data; };

  // --- auth
  api.post('/login', loginLimiter, wrap(async (req, res) => {
    const b = bodyOf(z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(200) }), req, res); if (!b) return;
    const generic = { error: 'Invalid credentials, or the account is temporarily locked.' };
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(b.email);
    if (!user || user.disabled) { await C.dummyVerify(b.password); audit(req, 'login_failed', 'unknown account', { id: null, email: b.email.slice(0, 160) }); return res.status(401).json(generic); }
    if (user.locked_until > now()) { await C.dummyVerify(b.password); audit(req, 'login_blocked', 'account locked', user); return res.status(401).json(generic); }
    if (!(await C.verifyPassword(user.pass_hash, b.password))) { await failAttempt(req, user, 'login_failed'); return res.status(401).json(generic); }
    db.prepare('DELETE FROM sessions WHERE user_id=? AND stage=?').run(user.id, 'pw');
    const csrf = createSession(req, res, user, 'pw');
    res.json({ next: user.totp_enabled ? 'totp' : 'enroll', csrf });
  }));
  api.post('/login/totp', loginLimiter, needPw, wrap(async (req, res) => {
    const b = bodyOf(z.object({ code: z.string().trim().min(6).max(12) }), req, res); if (!b) return;
    const u = req.user;
    if (!u.totp_enabled) return res.status(400).json({ error: 'Set up 2FA first.' });
    if (u.locked_until > now()) return res.status(401).json({ error: 'Invalid code, or the account is temporarily locked.' });
    let ok = false;
    const secret = cipher.decrypt(u.totp_secret_enc, 'totp:' + u.id);
    if (/^\d{6}$/.test(b.code)) {
      const ctr = C.totpCheck(secret, b.code, u.totp_last_counter);
      if (ctr) { ok = true; db.prepare('UPDATE users SET totp_last_counter=? WHERE id=?').run(ctr, u.id); }
    } else {
      const codes = JSON.parse(u.backup_codes), h = C.hmac(cfg.sessionSecret, b.code.toLowerCase());
      const i = codes.findIndex(x => C.safeEqual(x, h));
      if (i >= 0) { ok = true; codes.splice(i, 1); db.prepare('UPDATE users SET backup_codes=? WHERE id=?').run(JSON.stringify(codes), u.id); audit(req, 'backup_code_used', `${codes.length} left`); }
    }
    if (!ok) { await failAttempt(req, u, 'totp_failed'); return res.status(401).json({ error: 'Invalid code, or the account is temporarily locked.' }); }
    dropSession(req, res, false);
    db.prepare('UPDATE users SET failed_attempts=0, locked_until=0, last_login_at=? WHERE id=?').run(now(), u.id);
    const csrf = createSession(req, res, u, 'full'); audit(req, 'login', '', u);
    res.json({ csrf, user: publicUser(u) });
  }));
  api.post('/2fa/setup', needPw, wrap(async (req, res) => {
    const u = req.user; if (u.totp_enabled) return res.status(400).json({ error: '2FA is already enabled.' });
    const secret = C.newTotpSecret(), uri = C.otpauthUri(secret, u.email);
    db.prepare('UPDATE users SET totp_secret_enc=? WHERE id=?').run(cipher.encrypt(secret, 'totp:' + u.id), u.id);
    res.json({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
  }));
  api.post('/2fa/confirm', needPw, wrap(async (req, res) => {
    const b = bodyOf(z.object({ code: z.string().trim().regex(/^\d{6}$/) }), req, res); if (!b) return;
    const u = req.user; if (u.totp_enabled || !u.totp_secret_enc) return res.status(400).json({ error: 'Start 2FA setup first.' });
    const ctr = C.totpCheck(cipher.decrypt(u.totp_secret_enc, 'totp:' + u.id), b.code, 0);
    if (!ctr) { await failAttempt(req, u, 'totp_enroll_failed'); return res.status(401).json({ error: 'That code is not correct. Try again.' }); }
    const codes = C.newBackupCodes();
    db.prepare('UPDATE users SET totp_enabled=1, totp_last_counter=?, backup_codes=?, failed_attempts=0, locked_until=0, last_login_at=? WHERE id=?').run(ctr, JSON.stringify(codes.map(c => C.hmac(cfg.sessionSecret, c))), now(), u.id);
    dropSession(req, res, false); const csrf = createSession(req, res, u, 'full'); audit(req, '2fa_enabled', '', u); audit(req, 'login', 'after 2FA enrolment', u);
    res.json({ csrf, backupCodes: codes, user: publicUser({ ...u, totp_enabled: 1 }) });
  }));
  api.post('/logout', (req, res) => { if (req.user) audit(req, 'logout'); dropSession(req, res); res.json({ ok: true }); });
  api.get('/me', forced, needFull, (req, res) => res.json({ user: publicUser(req.user), csrf: req.sess.csrf }));
  api.post('/reauth', needFull, wrap(async (req, res) => {
    const b = bodyOf(z.object({ password: z.string().min(1).max(200), code: z.string().trim().regex(/^\d{6}$/) }), req, res); if (!b) return;
    const u = req.user; const okPw = await C.verifyPassword(u.pass_hash, b.password);
    const ctr = okPw && C.totpCheck(cipher.decrypt(u.totp_secret_enc, 'totp:' + u.id), b.code, u.totp_last_counter - 1);
    if (!okPw || !ctr) { await failAttempt(req, u, 'reauth_failed'); return res.status(401).json({ error: 'Password or code is incorrect.' }); }
    db.prepare('UPDATE sessions SET reauth_until=? WHERE id=?').run(now() + 5 * MIN, req.sess.id); audit(req, 'reauth'); res.json({ ok: true });
  }));
  api.post('/password', forced, needFull, wrap(async (req, res) => {
    const b = bodyOf(z.object({ current: z.string().min(1).max(200), next: z.string().max(200) }), req, res); if (!b) return;
    const u = req.user;
    if (!u.must_change_pw && req.sess.reauth_until <= now()) return res.status(403).json({ error: 'Please confirm your password and 2FA code.', reauth: true });
    if (!(await C.verifyPassword(u.pass_hash, b.current))) { await failAttempt(req, u, 'password_change_failed'); return res.status(401).json({ error: 'Current password is incorrect.' }); }
    const prob = C.passwordProblem(b.next, u.email); if (prob) return res.status(400).json({ error: prob });
    if (b.next === b.current) return res.status(400).json({ error: 'Choose a new password.' });
    db.prepare('UPDATE users SET pass_hash=?, must_change_pw=0 WHERE id=?').run(await C.hashPassword(b.next), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(u.id, req.sess.id); audit(req, 'password_changed'); res.json({ ok: true });
  }));
  api.get('/sessions', needFull, (req, res) => res.json(db.prepare('SELECT id,created_at,last_seen,ip,ua FROM sessions WHERE user_id=? AND stage=? ORDER BY last_seen DESC').all(req.user.id, 'full').map(s => ({ handle: s.id.slice(0, 16), current: s.id === req.sess.id, created_at: s.created_at, last_seen: s.last_seen, ip: s.ip, ua: s.ua }))));
  api.delete('/sessions/:h', needFull, (req, res) => { db.prepare("DELETE FROM sessions WHERE user_id=? AND substr(id,1,16)=? AND id<>?").run(req.user.id, String(req.params.h).slice(0, 16), req.sess.id); audit(req, 'session_revoked'); res.json({ ok: true }); });
  api.post('/sessions/revoke-others', needFull, (req, res) => { db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(req.user.id, req.sess.id); audit(req, 'sessions_revoked_all'); res.json({ ok: true }); });

  // --- dashboard
  api.get('/dashboard', needFull, (req, res) => {
    const canInbox = ['owner', 'admin'].includes(req.user.role), g = q => db.prepare(q).get().n;
    res.json({ newEnquiries: canInbox ? g("SELECT count(*) n FROM enquiries WHERE status='new'") : null, totalEnquiries: canInbox ? g('SELECT count(*) n FROM enquiries') : null,
      unpublished: db.prepare('SELECT key FROM content WHERE draft<>published').all().map(r => r.key), media: g('SELECT count(*) n FROM media'),
      recent: req.user.role === 'owner' ? db.prepare('SELECT ts,email,action FROM audit ORDER BY id DESC LIMIT 6').all() : [] });
  });

  // --- content (draft / publish)
  const canEdit = (req, key) => content.SCHEMA[key] && (!content.SCHEMA[key].roles || content.SCHEMA[key].roles.includes(req.user.role));
  api.get('/content', needFull, (req, res) => res.json(db.prepare('SELECT key,draft,published,updated_at,updated_by FROM content').all().filter(r => canEdit(req, r.key)).map(r => ({ key: r.key, title: content.SCHEMA[r.key].title, dirty: r.draft !== r.published, updated_at: r.updated_at, updated_by: r.updated_by }))));
  api.get('/content/:key', needFull, (req, res) => {
    if (!canEdit(req, req.params.key)) return res.status(404).json({ error: 'Not found' });
    const r = db.prepare('SELECT * FROM content WHERE key=?').get(req.params.key);
    res.json({ key: r.key, title: content.SCHEMA[r.key].title, fields: content.SCHEMA[r.key].fields, draft: JSON.parse(r.draft), dirty: r.draft !== r.published });
  });
  api.put('/content/:key', needFull, (req, res) => {
    if (!canEdit(req, req.params.key)) return res.status(404).json({ error: 'Not found' });
    let v; try { v = content.validate(content.SCHEMA[req.params.key].fields, req.body && req.body.value); } catch (e) { if (e instanceof content.ValidationError) return res.status(400).json({ error: e.message }); throw e; }
    db.prepare('UPDATE content SET draft=?, updated_at=?, updated_by=? WHERE key=?').run(JSON.stringify(v), now(), req.user.email, req.params.key);
    audit(req, 'content_saved', req.params.key); res.json({ ok: true, draft: v });
  });
  api.post('/content/:key/publish', needFull, (req, res) => {
    if (!canEdit(req, req.params.key)) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE content SET published=draft, updated_at=?, updated_by=? WHERE key=?').run(now(), req.user.email, req.params.key); cache = null;
    audit(req, 'content_published', req.params.key); res.json({ ok: true });
  });
  api.post('/content/:key/discard', needFull, (req, res) => {
    if (!canEdit(req, req.params.key)) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE content SET draft=published WHERE key=?').run(req.params.key); audit(req, 'content_discarded', req.params.key); res.json({ ok: true });
  });
  api.get('/preview', needFull, (req, res) => res.type('html').send(view.render(loadContent('draft'), { siteUrl: cfg.siteUrl, turnstile: null, preview: true })));

  // --- enquiries (owner/admin only)
  const inbox = [needFull, role('owner', 'admin')];
  const readEnq = r => { try { return { ...JSON.parse(cipher.decrypt(r.data_enc, 'enquiry')), id: r.id, created_at: r.created_at, status: r.status, note: r.note_enc ? cipher.decrypt(r.note_enc, 'note') : '' }; } catch { return { id: r.id, created_at: r.created_at, status: r.status, name: '[could not decrypt]', email: '', message: '', service: '', phone: '', note: '' }; } };
  api.get('/enquiries', ...inbox, (req, res) => {
    const st = ['new', 'read', 'replied'].includes(req.query.status) ? req.query.status : null, q = String(req.query.q || '').toLowerCase().slice(0, 80);
    let rows = db.prepare(`SELECT * FROM enquiries ${st ? 'WHERE status=?' : ''} ORDER BY id DESC LIMIT 500`).all(...(st ? [st] : [])).map(readEnq);
    if (q) rows = rows.filter(e => (e.name + e.email + e.service + e.message).toLowerCase().includes(q));
    res.json(rows.map(e => ({ id: e.id, created_at: e.created_at, status: e.status, name: e.name, service: e.service, preview: e.message.slice(0, 90) })));
  });
  api.get('/enquiries/export.csv', ...inbox, reauthed, (req, res) => {
    const f = v => { v = String(v ?? '').replace(/\r?\n/g, ' '); if (/^[=+\-@\t]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    const rows = db.prepare('SELECT * FROM enquiries ORDER BY id DESC').all().map(readEnq);
    audit(req, 'enquiries_exported', `${rows.length} rows`);
    res.setHeader('Content-Disposition', 'attachment; filename="enquiries.csv"');
    res.type('text/csv').send('Date,Name,Email,Phone,Service,Status,Message\n' + rows.map(e => [new Date(e.created_at).toISOString(), e.name, e.email, e.phone, e.service, e.status, e.message].map(f).join(',')).join('\n'));
  });
  api.get('/enquiries/:id', ...inbox, (req, res) => {
    const r = db.prepare('SELECT * FROM enquiries WHERE id=?').get(Number(req.params.id)); if (!r) return res.status(404).json({ error: 'Not found' });
    audit(req, 'enquiry_viewed', '#' + r.id); if (r.status === 'new') db.prepare("UPDATE enquiries SET status='read' WHERE id=?").run(r.id);
    res.json(readEnq({ ...r, status: r.status === 'new' ? 'read' : r.status }));
  });
  api.patch('/enquiries/:id', ...inbox, (req, res) => {
    const b = bodyOf(z.object({ status: z.enum(['new', 'read', 'replied']).optional(), note: z.string().max(2000).optional() }), req, res); if (!b) return;
    const id = Number(req.params.id); if (!db.prepare('SELECT 1 FROM enquiries WHERE id=?').get(id)) return res.status(404).json({ error: 'Not found' });
    if (b.status) db.prepare('UPDATE enquiries SET status=? WHERE id=?').run(b.status, id);
    if (b.note !== undefined) db.prepare('UPDATE enquiries SET note_enc=? WHERE id=?').run(b.note ? cipher.encrypt(b.note, 'note') : null, id);
    audit(req, 'enquiry_updated', '#' + id); res.json({ ok: true });
  });
  api.delete('/enquiries/:id', ...inbox, (req, res) => { db.prepare('DELETE FROM enquiries WHERE id=?').run(Number(req.params.id)); audit(req, 'enquiry_deleted', '#' + req.params.id); res.json({ ok: true }); });

  // --- media
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  api.get('/media', needFull, (req, res) => res.json(db.prepare('SELECT id,url,original_name,bytes,created_at FROM media ORDER BY id DESC LIMIT 200').all()));
  api.post('/media', uploadLimiter, needFull, (req, res, next) => upload.single('file')(req, res, e => e ? res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB.' : 'Upload failed.' }) : next()), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    let meta; try { meta = await sharp(req.file.buffer, { limitInputPixels: 40e6 }).metadata(); } catch { return res.status(400).json({ error: 'That file is not a valid image.' }); }
    if (!['jpeg', 'png', 'webp'].includes(meta.format)) return res.status(400).json({ error: 'Only JPEG, PNG or WebP images are allowed.' });
    const name = crypto.randomBytes(12).toString('hex') + '.webp';
    // re-encode: strips EXIF/metadata and any embedded payloads
    const out = await sharp(req.file.buffer, { limitInputPixels: 40e6 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    fs.writeFileSync(path.join(cfg.uploadDir, name), out, { mode: 0o640 });
    const orig = String(req.file.originalname || '').replace(/[^\w.\- ]/g, '').slice(0, 80);
    db.prepare('INSERT INTO media(url,original_name,bytes,created_at,uploaded_by) VALUES(?,?,?,?,?)').run('/media/' + name, orig, out.length, now(), req.user.email);
    audit(req, 'media_uploaded', name); res.json({ url: '/media/' + name });
  }));
  api.delete('/media/:id', needFull, role('owner', 'admin'), (req, res) => {
    const m = db.prepare('SELECT * FROM media WHERE id=?').get(Number(req.params.id)); if (!m) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM media WHERE id=?').run(m.id); try { fs.unlinkSync(path.join(cfg.uploadDir, path.basename(m.url))); } catch {}
    audit(req, 'media_deleted', m.url); res.json({ ok: true });
  });

  // --- users (owner only, re-auth required for changes)
  const ownerOnly = [needFull, role('owner')];
  const safeU = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, totp: !!u.totp_enabled, disabled: !!u.disabled, created_at: u.created_at, last_login_at: u.last_login_at });
  const tempPw = () => C.randomToken(12) + '!A9';
  api.get('/users', ...ownerOnly, (req, res) => res.json(db.prepare('SELECT * FROM users ORDER BY id').all().map(safeU)));
  api.post('/users', ...ownerOnly, reauthed, wrap(async (req, res) => {
    const b = bodyOf(z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(160), role: z.enum(['owner', 'admin', 'editor']) }), req, res); if (!b) return;
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(b.email)) return res.status(409).json({ error: 'A user with this email already exists.' });
    const pw = tempPw(); db.prepare('INSERT INTO users(email,name,role,pass_hash,must_change_pw,created_at) VALUES(?,?,?,?,1,?)').run(b.email, b.name, b.role, await C.hashPassword(pw), now());
    audit(req, 'user_created', `${b.email} (${b.role})`); res.json({ tempPassword: pw });
  }));
  const ownersLeft = exceptId => db.prepare("SELECT count(*) n FROM users WHERE role='owner' AND disabled=0 AND id<>?").get(exceptId).n;
  api.patch('/users/:id', ...ownerOnly, reauthed, (req, res) => {
    const b = bodyOf(z.object({ role: z.enum(['owner', 'admin', 'editor']).optional(), disabled: z.boolean().optional() }), req, res); if (!b) return;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id)); if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role or status.' });
    if (u.role === 'owner' && (b.disabled || (b.role && b.role !== 'owner')) && !ownersLeft(u.id)) return res.status(400).json({ error: 'At least one active owner is required.' });
    if (b.role) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, u.id);
    if (b.disabled !== undefined) { db.prepare('UPDATE users SET disabled=? WHERE id=?').run(b.disabled ? 1 : 0, u.id); if (b.disabled) db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id); }
    audit(req, 'user_updated', `${u.email} ${JSON.stringify(b)}`); res.json({ ok: true });
  });
  api.post('/users/:id/reset', ...ownerOnly, reauthed, wrap(async (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id)); if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.id === req.user.id) return res.status(400).json({ error: 'Use the Security page to change your own password.' });
    const pw = tempPw(); db.prepare("UPDATE users SET pass_hash=?, must_change_pw=1, totp_enabled=0, totp_secret_enc=NULL, backup_codes='[]', totp_last_counter=0, failed_attempts=0, locked_until=0 WHERE id=?").run(await C.hashPassword(pw), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id); audit(req, 'user_reset', u.email); res.json({ tempPassword: pw });
  }));
  api.delete('/users/:id', ...ownerOnly, reauthed, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id)); if (!u) return res.status(404).json({ error: 'Not found' });
    if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself.' });
    if (u.role === 'owner' && !ownersLeft(u.id)) return res.status(400).json({ error: 'At least one active owner is required.' });
    db.prepare('DELETE FROM users WHERE id=?').run(u.id); audit(req, 'user_deleted', u.email); res.json({ ok: true });
  });
  api.get('/audit', ...ownerOnly, (req, res) => res.json(db.prepare('SELECT id,ts,email,action,detail,ip FROM audit WHERE id<? ORDER BY id DESC LIMIT 100').all(Number(req.query.before) || 1e12)));
  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  admin.use('/api', api);
  app.use(A, admin);

  // ---------- 404 + errors
  app.use(notFound);
  app.use((err, req, res, next) => { // eslint-disable-line
    console.error('[error]', req.method, req.path, err && err.message);
    if (res.headersSent) return;
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid request.' });
    res.status(500).json(req.path.includes('/api') ? { error: 'Something went wrong.' } : { error: 'Server error' });
  });

  // ---------- data retention
  const retain = () => { if (cfg.retentionMonths > 0) { const n = db.prepare('DELETE FROM enquiries WHERE created_at < ?').run(now() - cfg.retentionMonths * 30 * 24 * 60 * MIN).changes; if (n) console.log(`[retention] deleted ${n} old enquiries`); }
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()); };
  retain(); const timer = setInterval(retain, 24 * 60 * MIN); timer.unref();
  return { app, db, cfg, cipher, close: () => { clearInterval(timer); db.close(); } };
}
module.exports = { createApp };
