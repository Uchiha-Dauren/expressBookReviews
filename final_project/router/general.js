const express = require('express');
const axios = require('axios');
const books = require('./booksdb.js');
const { registerUser } = require('./auth_users.js');
const public_users = express.Router();

// Registration shares the same user store as login and authenticated reviews.
public_users.post('/register', registerUser);

const normalize = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function findBooks(field, value) {
  const search = normalize(value);
  return Object.fromEntries(
    Object.entries(books).filter(([, book]) => normalize(book[field]) === search)
  );
}

// Get the book list available in the shop
public_users.get('/', (req, res) => {
  return res.json(books);
});

// Get book details based on ISBN
public_users.get('/isbn/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) {
    return res.status(404).json({ message: 'No book found for this ISBN.' });
  }
  return res.json(books[req.params.isbn]);
});

// Get book details based on author
public_users.get('/author/:author', (req, res) => {
  const matches = findBooks('author', req.params.author);
  if (Object.keys(matches).length === 0) {
    return res.status(404).json({ message: 'No books found for this author.' });
  }
  return res.json(matches);
});

// Get all books based on title
public_users.get('/title/:title', (req, res) => {
  const matches = findBooks('title', req.params.title);
  if (Object.keys(matches).length === 0) {
    return res.status(404).json({ message: 'No books found for this title.' });
  }
  return res.json(matches);
});

// Get all reviews of a book, keyed by the reviewer's username.
public_users.get('/review/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) {
    return res.status(404).json({ message: 'No book found for this ISBN.' });
  }
  return res.json(books[req.params.isbn].reviews);
});

const DEFAULT_BASE_URL = process.env.BOOKSTORE_BASE_URL || 'http://127.0.0.1:5000';
const REQUEST_TIMEOUT_MS = 5000;
const endpoint = (baseURL, path) => `${baseURL.replace(/\/+$/, '')}${path}`;

// Task 11: Axios client methods for consuming the running bookstore API.
// These are deliberately separate from the Express handlers above: a server
// handler reads the book store directly and never makes a request to itself.
// Each method resolves to the JSON data or rejects with the Axios error, so its
// caller can handle a missing book, an unavailable server, or a timeout.

/** Retrieve all books. Start the API before calling this client method. */
async function getAllBooks(baseURL = DEFAULT_BASE_URL) {
  const response = await axios.get(endpoint(baseURL, '/'), {
    timeout: REQUEST_TIMEOUT_MS
  });
  return response.data;
}

/** Retrieve one book by its ISBN. */
async function getBookByISBN(isbn, baseURL = DEFAULT_BASE_URL) {
  const response = await axios.get(endpoint(baseURL, `/isbn/${encodeURIComponent(isbn)}`), {
    timeout: REQUEST_TIMEOUT_MS
  });
  return response.data;
}

/** Retrieve every book with the requested author, keyed by ISBN. */
async function getBooksByAuthor(author, baseURL = DEFAULT_BASE_URL) {
  const response = await axios.get(endpoint(baseURL, `/author/${encodeURIComponent(author)}`), {
    timeout: REQUEST_TIMEOUT_MS
  });
  return response.data;
}

/** Retrieve every book with the requested title, keyed by ISBN. */
async function getBooksByTitle(title, baseURL = DEFAULT_BASE_URL) {
  const response = await axios.get(endpoint(baseURL, `/title/${encodeURIComponent(title)}`), {
    timeout: REQUEST_TIMEOUT_MS
  });
  return response.data;
}

module.exports = {
  general: public_users,
  getAllBooks,
  getBookByISBN,
  getBooksByAuthor,
  getBooksByTitle
};
