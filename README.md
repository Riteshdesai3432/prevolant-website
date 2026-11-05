# Prevolant website: full stack (site + backend + secure admin)

A production-ready build of the approved Prevolant design. Public site is rendered from a database, edited through a hidden, hardened admin panel. One Node.js app, SQLite storage, no external services required to start.

- **Public site**: pixel-faithful to the approved design, with all motion, a mobile menu, SEO tags and a working contact form
- **Backend**: contact API (validated, rate-limited, bot-protected, stored encrypted), content API, uploads
- **Admin (CMS)**: hidden URL, password + mandatory 2FA, roles, draft/preview/publish, enquiry inbox, media library, users, audit log, session management

## 1. Run locally (5 minutes)
Requires **Node.js 22.13 or newer** (22 LTS or 24). Nothing needs a C++ compiler: the database is Node's built-in SQLite.
Windows tip: keep the folder somewhere simple such as `C:\dev\prevolant`, not inside OneDrive/Desktop sync folders, which can lock files and cause `EPERM` errors during `npm install`.

```bash
npm install
npm run gen:secrets            # prints ADMIN_PATH, SESSION_SECRET, DATA_ENCRYPTION_KEYS
cp .env.example .env           # paste the 4 generated lines in, set NODE_ENV=development, SITE_URL=http://localhost:3000
npm run create-owner -- you@company.com "Your Name"   # prints a one-time temporary password
npm start                      # http://localhost:3000
```
Open the admin URL printed by `create-owner` (SITE_URL + ADMIN_PATH). First sign-in: temporary password, then scan the QR code (Google/Microsoft Authenticator), save the 10 backup codes, choose a new password.

`npm test` runs the automated tests (crypto, auth, 2FA, lockout, CSRF, roles, uploads, encryption, XSS, rate limits).

## 2. Deploy (Render, recommended)
1. Push this folder to a **private** GitHub repository.
2. On render.com: New → Blueprint → select the repo (it reads `render.yaml`). SQLite needs the persistent disk that the Blueprint creates (a paid instance type is required for disks).
3. In the service's Environment tab fill the values marked `sync: false`: `SITE_URL` (https address), `ADMIN_PATH`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEYS` (from `npm run gen:secrets`), and optionally SMTP and Turnstile keys.
4. Deploy, then open the Shell tab and run `npm run create-owner -- you@company.com "Your Name"`.
5. Add your custom domain in Render (HTTPS certificate is automatic). Update `SITE_URL` to match.
6. Visit `SITE_URL + ADMIN_PATH`, sign in, set up 2FA.

Any Docker host works too: `docker build -t prevolant . && docker run -p 3000:3000 -v prevolant-data:/var/data --env-file .env prevolant`. Keep it behind HTTPS (the app redirects HTTP to HTTPS in production and trusts one proxy hop).

## 3. Using the admin
| Area | What it does |
|---|---|
| Content | Edit every section (hero, about, services, industries, projects, team, process, why, tech, contact, site settings). Save draft, **Preview draft**, then **Save & publish**. |
| Enquiries | Contact-form messages (decrypted only when opened). Mark read/replied, add notes, delete, export CSV (needs re-confirmation). |
| Media | Upload JPEG/PNG/WebP (≤5 MB). Images are re-encoded and stripped of metadata. |
| Users | Owner only. Roles: **Owner** (everything), **Admin** (content + inbox), **Editor** (content + media). New users get a one-time temporary password and must set 2FA and a new password. |
| Audit log | Owner only. Sign-ins, failures, content changes, exports, user changes. |
| Security | Change password, see and revoke sessions. |

## 4. Environment variables
See `.env.example` (every variable is documented). Required: `ADMIN_PATH`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEYS`, and in production `SITE_URL` (https). The app refuses to start if they are missing or weak.

**Email** (optional): set `SMTP_*`. You get an alert for each new enquiry (the alert does not include the message) and the visitor gets an auto-reply. **Turnstile** (optional but recommended): create a free Cloudflare Turnstile widget and set both keys; the contact form then requires the human check.

## 5. Operations
- **Backups**: `npm run backup` writes a consistent database copy; also back up `UPLOAD_DIR`. Store `DATA_ENCRYPTION_KEYS` separately (a password manager). Without the keys, encrypted enquiries cannot be read.
- **Key rotation**: add a new key to `DATA_ENCRYPTION_KEYS` (e.g. `1:...,2:...`), set `DATA_KEY_CURRENT=2`, restart, run `npm run rotate-keys`, and remove the old key only when it reports 0 re-encrypted fields.
- **Locked out / lost 2FA**: another Owner can use Users → Reset. If you are the only Owner, run `npm run create-owner` with a new email, then remove the old account.
- **Retention**: enquiries older than `RETENTION_MONTHS` (default 12) are deleted automatically.
- **Changing the admin URL**: change `ADMIN_PATH` and restart.

## 6. Project layout
```
server.js            start-up
src/app.js           routes, security middleware, auth, admin API
src/render.js        public page templates (design)    src/content.js  content model + validation
src/crypto.js        encryption, argon2id, TOTP        src/db.js       database schema
public/              site.css, site.js, images         admin/          admin panel UI
scripts/             create-owner, gen-secrets, rotate-keys, backup
tests/               automated tests                   render.yaml, Dockerfile, .github/workflows
```
To change the look, edit `public/site.css` and `src/render.js`. To change wording or images, use the admin.

## 7. Things you must do yourself
Set the secrets and domain, configure SMTP and Turnstile, have the privacy page (`/privacy`, draft text) reviewed by a legal professional, and have a developer review the deployment before going live. See `SECURITY.md` for details and honest limitations.
