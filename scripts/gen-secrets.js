'use strict';
const c = require('crypto');
console.log(`# Paste into your .env (or your host's environment settings). Keep these secret.
ADMIN_PATH=/portal-${c.randomBytes(18).toString('base64url')}
SESSION_SECRET=${c.randomBytes(48).toString('base64url')}
DATA_ENCRYPTION_KEYS=1:${c.randomBytes(32).toString('base64')}
DATA_KEY_CURRENT=1`);
