const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const books = require('./booksdb.js');

const regd_users = express.Router();
const users = [];
const scrypt = promisify(crypto.scrypt);
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const reservedNames = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validUsername(username) {
  return typeof username === 'string' &&
    /^[A-Za-z0-9_.-]{1,80}$/.test(username) && !reservedNames.has(username);
}

function validPassword(password) {
  return typeof password === 'string' && password.length > 0 && password.length <= 1024;
}

// In the starter API, a valid user is one who has already registered.
const isValid = (username) => users.some((user) => user.username === username);

async function authenticatedUser(username, password) {
  if (!validUsername(username) || !validPassword(password)) return false;
  const user = users.find((candidate) => candidate.username === username);
  if (!user) return false;
  const candidateHash = await scrypt(password, user.salt, 64);
  return crypto.timingSafeEqual(candidateHash, Buffer.from(user.passwordHash, 'hex'));
}

async function registerUser(req, res, next) {
  const { username, password } = req.body || {};
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ message: 'Provide a valid username and a non-empty password.' });
  }
  if (isValid(username)) {
    return res.status(409).json({ message: 'This username is already registered.' });
  }
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    // Another registration can finish while the password hash is being computed.
    if (isValid(username)) {
      return res.status(409).json({ message: 'This username is already registered.' });
    }
    users.push({ username, salt, passwordHash });
    return res.status(201).json({ message: 'User successfully registered. You can now log in.' });
  } catch (error) {
    return next(error);
  }
}

// Authentication is carried in a server-side session, never in a query username.
function requireAuth(req, res, next) {
  const accessToken = req.session?.authorization?.accessToken;
  if (typeof accessToken !== 'string') {
    return res.status(401).json({ message: 'Log in before changing a review.' });
  }
  try {
    const payload = jwt.verify(accessToken, jwtSecret, { algorithms: ['HS256'] });
    if (!validUsername(payload.sub) || !isValid(payload.sub)) throw new Error('Unknown user');
    req.user = { username: payload.sub };
    return next();
  } catch {
    delete req.session.authorization;
    return res.status(401).json({ message: 'Your session is invalid or expired. Please log in again.' });
  }
}

regd_users.post('/login', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ message: 'Provide a valid username and password.' });
  }
  try {
    if (!(await authenticatedUser(username, password))) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    // Replacing the session ID prevents an existing session from being reused at login.
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    const accessToken = jwt.sign({}, jwtSecret, {
      algorithm: 'HS256', subject: username, expiresIn: '1h'
    });
    req.session.authorization = { accessToken };
    await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    return res.status(200).json({ message: 'Customer successfully logged in', username, registered: true });
  } catch (error) {
    return next(error);
  }
});

regd_users.put('/auth/review/:isbn', (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Log in before changing a review.' });
  const { isbn } = req.params;
  if (!hasOwn(books, isbn)) return res.status(404).json({ message: 'Book not found.' });
  const review = req.body?.review ?? req.query.review;
  if (typeof review !== 'string' || !review.trim() || review.length > 5000) {
    return res.status(400).json({ message: 'Provide a review between 1 and 5000 characters.' });
  }
  const reviews = books[isbn].reviews;
  const exists = hasOwn(reviews, req.user.username);
  Object.defineProperty(reviews, req.user.username, {
    value: review.trim(), enumerable: true, configurable: true, writable: true
  });
  return res.status(200).json({ message: exists ? 'Review updated.' : 'Review added.', reviews });
});

regd_users.delete('/auth/review/:isbn', (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Log in before changing a review.' });
  const { isbn } = req.params;
  if (!hasOwn(books, isbn)) return res.status(404).json({ message: 'Book not found.' });
  const reviews = books[isbn].reviews;
  if (!hasOwn(reviews, req.user.username)) {
    return res.status(404).json({ message: 'You have not reviewed this book.' });
  }
  delete reviews[req.user.username];
  return res.status(200).json({ message: `Review for ISBN ${isbn} deleted`, reviews });
});

module.exports = { authenticated: regd_users, requireAuth, registerUser, isValid, authenticatedUser, users };
