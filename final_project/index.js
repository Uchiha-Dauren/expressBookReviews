const express = require('express');
const session = require('express-session');
const { randomBytes } = require('node:crypto');
const { authenticated, requireAuth } = require('./router/auth_users');
const { general } = require('./router/general');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use('/customer', session({
    name: 'bookshop.sid',
    secret: process.env.SESSION_SECRET || randomBytes(48).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 1000 }
  }));
  app.use('/customer/auth', requireAuth);
  app.use('/customer', authenticated);
  app.use('/', general);
  app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status === 400 || err.status === 413 ? err.status : 500;
    res.status(status).json({ message: status === 500 ? 'Internal server error.' : 'Invalid request body.' });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => console.log(`Bookstore API running at http://${host}:${port}`));
}

module.exports = { createApp };
