'use strict';
const { createApp } = require('./src/app');
const ctx = createApp();
const server = ctx.app.listen(ctx.cfg.port, () => console.log(`Prevolant site running on port ${ctx.cfg.port} (${ctx.cfg.prod ? 'production' : 'development'})`));
const stop = () => server.close(() => { ctx.close(); process.exit(0); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
