'use strict';
const nodemailer = require('nodemailer');
function createMailer(cfg) {
  const tx = cfg.smtp ? nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465, auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined }) : null;
  return {
    enabled: !!tx,
    async send({ to, subject, text }) {
      if (!tx) { if (!cfg.test) console.log('[mail disabled] would send:', subject); return false; }
      try { await tx.sendMail({ from: cfg.smtp.from, to, subject, text }); return true; }
      catch (e) { console.error('[mail error]', e.code || e.message); return false; }
    },
  };
}
module.exports = { createMailer };
