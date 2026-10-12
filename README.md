# Express Book Reviews

Node.js and Express final project for a bookstore review API. Public users can browse the original ten-book catalogue and read reviews. Registered users can log in, add or update their own reviews, and delete their own reviews. Four asynchronous Axios client functions demonstrate calling the API.

Project repository: [Uchiha-Dauren/expressBookReviews](https://github.com/Uchiha-Dauren/expressBookReviews).

## Run locally

Requires Node.js 20 or later. No API key or external database is required.

From this repository's root:

```sh
cd final_project
npm install
npm start
```

The server listens at `http://127.0.0.1:5000`. If port 5000 is occupied, such as by Control Center on macOS, use another port:

```sh
PORT=5090 npm start
```

The project demonstration uses `http://127.0.0.1:5090`.

The committed pnpm lockfile also supports a reproducible installation:

```sh
cd final_project
pnpm install --frozen-lockfile
pnpm start
```

Run these alternative commands from the repository root, rather than repeating `cd final_project` if you are already in that directory.

## Features and validation

- Get all books, one book by ISBN, books by author or title, and a book's reviews.
- Register and log in with JSON credentials; authentication uses a session cookie.
- Add, update, and delete reviews only for the authenticated user.
- Consume four catalogue endpoints with Axios and `async`/`await`.
- Run integration tests with `npm test` from `final_project`.

The integration suite exercises a real local HTTP server, independent user sessions, review ownership, invalid requests, and the four Axios clients. The completed run reported 13 passing tests.

See [the application README](final_project/README.md) for all endpoints, cookie-based curl examples, and Axios usage. Submission screenshots should show real requests and responses from the running API; the repository's `evidence/` directory is reserved for these captures.

## Data and source

The original ten records in `final_project/router/booksdb.js` are retained. Registered users, reviews, and sessions are held in memory and reset when the server restarts. This project is a local coursework demonstration; it does not persist data between runs.

Based on the official IBM starter, [ibm-developer-skills-network/expressBookReviews](https://github.com/ibm-developer-skills-network/expressBookReviews). The correct upstream repository name ends in **Reviews**, plural. The singular `expressBookReview` address in the rubric returned 404 during setup.

License: [Apache-2.0](LICENSE).
