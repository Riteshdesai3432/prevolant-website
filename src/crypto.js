'use strict';
const crypto = require('crypto');
const argon2 = require('argon2');

const b64u = b => Buffer.from(b).toString('base64url');

// ---- Field-level encryption: AES-256-GCM with versioned keys (supports rotation)
function makeCipher(cfg) {
  return {
    encrypt(plain, aad = 'prevolant') {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', cfg.keys[cfg.currentKey], iv);
      c.setAAD(Buffer.from(aad));
      const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
      return ['v' + cfg.currentKey, b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join('.');
    },
    decrypt(blob, aad = 'prevolant') {
      const [v, iv, tag, ct] = String(blob).split('.');
      const key = cfg.keys[String(v).slice(1)];
      if (!key) throw new Error('Unknown encryption key version');
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
    },
    keyVersion: blob => Number(String(blob).split('.')[0].slice(1)),
  };
}

// ---- Passwords: argon2id
const ARGON = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
const hashPassword = pw => argon2.hash(pw, ARGON);
const verifyPassword = async (hash, pw) => { try { return await argon2.verify(hash, pw); } catch { return false; } };
let dummy;
const dummyVerify = async pw => { dummy = dummy || await hashPassword('dummy-password-for-timing'); await verifyPassword(dummy, pw); };

// Basic password policy: length + small blocklist (no composition rules)
const COMMON = new Set(['password123456', '123456789012', 'qwertyuiop12', 'prevolant1234', 'administrator1', 'welcome12345', 'letmein123456']);
function passwordProblem(pw, email = '') {
  if (typeof pw !== 'string' || pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 200) return 'Password is too long.';
  const l = pw.toLowerCase();
  if (COMMON.has(l) || /^(.)\1+$/.test(pw) || /prevolant/.test(l)) return 'That password is too easy to guess. Use a longer passphrase.';
  if (email && l.includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length > 3) return 'Password must not contain your email name.';
  return null;
}

// ---- Tokens / hashing
const randomToken = (n = 32) => crypto.randomBytes(n).toString('base64url');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---- TOTP (RFC 6238, SHA-1, 6 digits, 30 s)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
function b32dec(s) { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
const newTotpSecret = () => b32enc(crypto.randomBytes(20));
function hotp(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 10 ** digits;
  return String(code).padStart(digits, '0');
}
// returns matched counter (for replay protection) or null
function totpCheck(secret, token, lastCounter = 0, now = Date.now()) {
  if (!/^\d{6}$/.test(String(token))) return null;
  const c = Math.floor(now / 30000);
  for (const w of [-1, 0, 1]) {
    const cc = c + w;
    if (cc > lastCounter && safeEqual(hotp(secret, cc), token)) return cc;
  }
  return null;
}
const otpauthUri = (secret, email) => `otpauth://totp/Prevolant:${encodeURIComponent(email)}?secret=${secret}&issuer=Prevolant&algorithm=SHA1&digits=6&period=30`;

function newBackupCodes(n = 10) { return Array.from({ length: n }, () => { const r = crypto.randomBytes(5).toString('hex'); return r.slice(0, 5) + '-' + r.slice(5); }); }

module.exports = { makeCipher, hashPassword, verifyPassword, dummyVerify, passwordProblem, randomToken, sha256, hmac, safeEqual, newTotpSecret, totpCheck, hotp, otpauthUri, newBackupCodes, b32enc, b32dec };
