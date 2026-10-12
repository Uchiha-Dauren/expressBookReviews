# Bookstore API

An Express application with ten original book records, public search routes, authenticated review management, and asynchronous Axios client methods. Requires Node.js 20 or later. No API key is needed.

## Start and test

Run commands in this `final_project` directory:

```sh
npm install
npm start
```

Alternatively, install the versions recorded by pnpm:

```sh
pnpm install --frozen-lockfile
pnpm start
```

The default address is `http://127.0.0.1:5000`. For the local demonstration, port 5090 avoids the macOS Control Center service occupying port 5000:

```sh
PORT=5090 npm start
```

In another terminal, run the test suite:

```sh
npm test
```

Tests start their own HTTP server on an available port; they do not require a separately running application. They cover the catalogue, invalid lookups, registration, login, independent cookies, concurrent reviews, ownership checks, deletion, and the four Axios functions. The completed run reported 13 passing tests.

## Endpoints

All responses, including errors, are JSON. Send JSON bodies with `Content-Type: application/json`.

| Method | Path | Purpose | Authentication |
| --- | --- | --- | --- |
| GET | `/` | Retrieve all ten books, keyed by ISBN | Public |
| GET | `/isbn/:isbn` | Retrieve one book | Public |
| GET | `/author/:author` | Retrieve all matching books, keyed by ISBN | Public |
| GET | `/title/:title` | Retrieve all matching books, keyed by ISBN | Public |
| GET | `/review/:isbn` | Retrieve reviews, keyed by username | Public |
| POST | `/register` | Register with `username` and `password` | Public |
| POST | `/customer/login` | Log in with `username` and `password` | Public |
| PUT | `/customer/auth/review/:isbn` | Add or replace your review using `review` | Session cookie |
| DELETE | `/customer/auth/review/:isbn` | Delete your own review | Session cookie |

Author and title searches use case-insensitive, normalized exact matching. They return all matches: for example, author `Unknown` has four books. Encode spaces and other special characters in path segments. Unknown ISBNs or unmatched searches return HTTP 404. Duplicate registration returns 409, invalid input returns 400, and missing or invalid authentication returns 401.

Usernames contain 1–80 letters, numbers, underscores, periods, or hyphens. A password must be a non-empty string of at most 1024 characters. Passwords are salted and hashed with scrypt. Login creates a session cookie backed by a server-side session containing a signed JWT. Keep the cookie for authenticated requests; clients do not need to construct a JWT.

## Example requests

These commands assume the server is running on port 5090. Use demonstration credentials rather than a password you use elsewhere.

```sh
BOOKSTORE_URL=http://127.0.0.1:5090

curl "$BOOKSTORE_URL/"
curl "$BOOKSTORE_URL/isbn/1"
curl "$BOOKSTORE_URL/author/Unknown"
curl "$BOOKSTORE_URL/title/Things%20Fall%20Apart"
curl "$BOOKSTORE_URL/review/1"
```

Register and log in. The login command writes the session cookie to a local temporary cookie jar:

```sh
BOOKSTORE_COOKIE_JAR="$(mktemp)"

curl -i -X POST "$BOOKSTORE_URL/register" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo_reader","password":"Demo-Reader-2026!"}'

curl -i -c "$BOOKSTORE_COOKIE_JAR" -X POST "$BOOKSTORE_URL/customer/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo_reader","password":"Demo-Reader-2026!"}'
```

Add or update a review using the same authenticated cookie, read it publicly, then delete it:

```sh
curl -i -b "$BOOKSTORE_COOKIE_JAR" -X PUT "$BOOKSTORE_URL/customer/auth/review/1" \
  -H 'Content-Type: application/json' \
  -d '{"review":"A memorable story with compelling characters."}'

curl "$BOOKSTORE_URL/review/1"

curl -i -b "$BOOKSTORE_COOKIE_JAR" -X DELETE "$BOOKSTORE_URL/customer/auth/review/1"

rm "$BOOKSTORE_COOKIE_JAR"
```

Review text must be non-empty and no longer than 5000 characters. The PUT endpoint also accepts a URL-encoded `review` query parameter for compatibility with the lab. A username supplied in the body or query cannot change another user's review; ownership always comes from the authenticated session.

## Axios asynchronous clients

`router/general.js` exports these four functions alongside the Express router:

| Function | Return value |
| --- | --- |
| `getAllBooks(baseURL)` | All books keyed by ISBN |
| `getBookByISBN(isbn, baseURL)` | One book object |
| `getBooksByAuthor(author, baseURL)` | Matching books keyed by ISBN |
| `getBooksByTitle(title, baseURL)` | Matching books keyed by ISBN |

Each uses Axios with `async`/`await`, encodes path segments, sets a five-second request timeout, and resolves to the response's JSON data. Errors reject the promise for the caller to handle. The optional base URL defaults to `BOOKSTORE_BASE_URL` or `http://127.0.0.1:5000`.

With the server running, this example can be saved or executed from `final_project`:

```js
const {
  getAllBooks,
  getBookByISBN,
  getBooksByAuthor,
  getBooksByTitle
} = require('./router/general');

async function demonstrateSearches() {
  const baseURL = 'http://127.0.0.1:5090';
  console.log(await getAllBooks(baseURL));
  console.log(await getBookByISBN('1', baseURL));
  console.log(await getBooksByAuthor('Unknown', baseURL));
  console.log(await getBooksByTitle('Things Fall Apart', baseURL));
}

demonstrateSearches().catch(error => {
  console.error(error.response?.status || error.message);
  process.exitCode = 1;
});
```

These methods are HTTP clients. The Express handlers read the book store directly and do not recursively call their own HTTP endpoints.

## Runtime data

The catalogue retains the original ten books. Users, reviews, and sessions are stored only in memory. Restarting the process clears registrations, reviews, and logged-in sessions; register and log in again after a restart. This lab does not require a database or an external AI service.

`HOST` and `PORT` configure the listening address. `SESSION_SECRET` and `JWT_SECRET` are optional; fresh random secrets are generated when absent. Session expiry is one hour. The application is intended for a local demonstration.

Source: [IBM expressBookReviews starter](https://github.com/ibm-developer-skills-network/expressBookReviews), with **Reviews** plural. The rubric's singular repository URL returned 404 during setup. Project owner: [Uchiha-Dauren](https://github.com/Uchiha-Dauren).
