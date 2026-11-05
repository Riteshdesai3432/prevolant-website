# Security notes

## Controls implemented
**Transport**: HTTPS enforced in production (HTTP redirected), HSTS with preload, secure cookies. **Headers**: strict Content-Security-Policy (no inline scripts, no eval), X-Frame-Options DENY, frame-ancestors none, nosniff, strict Referrer-Policy, Permissions-Policy, COOP/CORP, no X-Powered-By.

**Authentication**: argon2id password hashing; 12-character minimum with weak-password blocklist; mandatory TOTP 2FA (RFC 6238) with replay protection and 10 one-time backup codes (stored hashed); account lockout with exponential back-off (5 failures → 15 min, doubling up to 24 h); identical error for unknown/locked/wrong accounts (no enumeration) with constant-time dummy hashing; IP rate limits on login; sessions are server-side, random 256-bit, stored hashed, `__Host-` HttpOnly Secure SameSite=Strict cookies, rotated at login and 2FA, 15-minute idle and 8-hour absolute timeout, revocable; re-authentication (password + 2FA code) for user management, exports and password change; no default accounts (owner created by CLI, temporary passwords force change + 2FA enrolment).

**Authorization**: role checks on every admin API route (server-side); owner-only user management and audit log; last owner cannot be removed.

**Data**: contact submissions and internal notes encrypted in the database with AES-256-GCM (versioned keys, per-record nonce, context binding, key rotation script); TOTP secrets encrypted; client IPs stored only as HMAC hashes on enquiries; automatic retention deletion; SQLite secure_delete.

**Input/Output**: all input validated server-side (zod and a schema validator for content); output escaped (tests confirm HTML injected into content is neutralised); CSV export neutralises spreadsheet-formula injection; parameterised SQL only.

**CSRF**: SameSite=Strict plus per-session token and Origin check on every state-changing request.

**Uploads**: real-image check (decoded, not by extension), JPEG/PNG/WebP only, 5 MB and pixel limits, re-encoded to WebP (strips EXIF and payloads), random filenames, served with nosniff and a locked-down CSP, external image URLs rejected in content.

**Abuse**: honeypot field, optional Cloudflare Turnstile, per-IP rate limits (contact 5/hour), body size limits.

**Hidden admin**: secret `ADMIN_PATH`, never linked, absent from robots.txt/sitemap, `noindex`, all other admin-like paths return the normal 404, optional IP allow-list.

**Supply chain**: small dependency set, lockfile, `npm audit` in CI (0 known vulnerabilities at build time).

## Honest limitations
- **Not end-to-end encryption.** Visitors' messages are protected in transit (TLS) and at rest (field encryption), but the server must decrypt them so admins can read them. Anyone who gets both the database and the encryption keys can read enquiries.
- **The hidden admin URL is not a security boundary.** It reduces noise; the protection is password + 2FA + lockout + rate limits.
- Rate limiting is in memory per instance (fine for a single instance; use a shared store if you scale out). SQLite suits a single instance; migrate to PostgreSQL if you need several.
- No "new device" login alerts yet (account-lock alerts are sent if SMTP is configured). No WebAuthn/passkeys yet.
- Automated tests cover the main security logic, but this is **not a professional penetration test**. Have the deployment reviewed before relying on it for sensitive data.

## If something goes wrong
1. Rotate `SESSION_SECRET` (signs out everyone) and change `ADMIN_PATH`.
2. Review the Audit log; reset affected users (Users → Reset).
3. If the database may have leaked, rotate `DATA_ENCRYPTION_KEYS` — note that data already copied is only protected if the old keys were not also exposed.
4. Tell affected people if personal data was exposed, as legal rules require.
