const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('../index.js');
const {
  getAllBooks,
  getBookByISBN,
  getBooksByAuthor,
  getBooksByTitle
} = require('../router/general.js');

// Each client owns its cookies, just as two independent browser sessions do.
function createClient(baseURL) {
  const cookies = new Map();
  return {
    cookies,
    async request(method, path, body) {
      const headers = { Accept: 'application/json' };
      if (cookies.size) {
        headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      }
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(`${baseURL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000)
      });
      const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
      for (const cookie of setCookies) {
        const pair = cookie.split(';', 1)[0];
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value) cookies.set(name, value);
        else cookies.delete(name);
      }
      const text = await response.text();
      assert.match(response.headers.get('content-type') || '', /application\/json/,
        `${method} ${path} must return JSON, including failures`);
      return { status: response.status, data: JSON.parse(text) };
    }
  };
}

function assertSuccess(result) {
  assert.ok(result.status >= 200 && result.status < 300,
    `Expected success, received ${result.status}: ${JSON.stringify(result.data)}`);
}

function assertRejected(result) {
  assert.ok(result.status >= 400 && result.status < 500,
    `Expected a client error, received ${result.status}: ${JSON.stringify(result.data)}`);
}

test('bookstore API and Axios clients', { timeout: 30000 }, async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
  });

  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const guest = createClient(baseURL);
  const alice = createClient(baseURL);
  const bob = createClient(baseURL);
  const aliceCredentials = {
    username: 'integration_alice', password: 'Integration-Alice-2026!'
  };
  const bobCredentials = {
    username: 'integration_bob', password: 'Integration-Bob-2026!'
  };

  await t.test('serves the ten original books and initially empty reviews', async () => {
    const all = await guest.request('GET', '/');
    assertSuccess(all);
    assert.deepEqual(Object.keys(all.data), Array.from({ length: 10 }, (_, i) => String(i + 1)));
    assert.equal(all.data['1'].author, 'Chinua Achebe');
    assert.equal(all.data['1'].title, 'Things Fall Apart');
    assert.equal(all.data['10'].author, 'Samuel Beckett');
    const reviews = await guest.request('GET', '/review/1');
    assertSuccess(reviews);
    assert.deepEqual(reviews.data, {});
  });

  await t.test('finds an ISBN, all four Unknown-author books, and an encoded title', async () => {
    const isbn = await guest.request('GET', '/isbn/1');
    assertSuccess(isbn);
    assert.equal(isbn.data.title, 'Things Fall Apart');
    const author = await guest.request('GET', `/author/${encodeURIComponent('Unknown')}`);
    assertSuccess(author);
    assert.deepEqual(Object.keys(author.data), ['4', '5', '6', '7']);
    assert.ok(Object.values(author.data).every(book => book.author === 'Unknown'));
    const title = await guest.request('GET', `/title/${encodeURIComponent('Things Fall Apart')}`);
    assertSuccess(title);
    assert.deepEqual(Object.keys(title.data), ['1']);
  });

  await t.test('unknown retrievals return 404 while the server remains usable', async () => {
    for (const path of ['/isbn/999999', '/author/NoSuchAuthor', '/title/NoSuchTitle', '/review/999999']) {
      assert.equal((await guest.request('GET', path)).status, 404, path);
    }
    assert.equal(Object.keys((await guest.request('GET', '/')).data).length, 10);
  });

  await t.test('registration rejects missing input and duplicate usernames', async () => {
    assertRejected(await guest.request('POST', '/register', {}));
    assertRejected(await guest.request('POST', '/register', { username: 'missing_password' }));
    assertRejected(await guest.request('POST', '/register', { password: 'NoUsername-2026!' }));
    for (const credentials of [aliceCredentials, bobCredentials]) {
      const registered = await guest.request('POST', '/register', credentials);
      assertSuccess(registered);
      assert.ok(!JSON.stringify(registered.data).includes(credentials.password));
    }
    assertRejected(await guest.request('POST', '/register', aliceCredentials));
  });

  await t.test('incorrect login fails and cannot modify reviews', async () => {
    const invalid = createClient(baseURL);
    assertRejected(await invalid.request('POST', '/customer/login', {
      username: aliceCredentials.username, password: 'Definitely-Wrong-Password!'
    }));
    assertRejected(await invalid.request('PUT', '/customer/auth/review/1', { review: 'Unauthorized' }));
    assertRejected(await guest.request('PUT', '/customer/auth/review/1?review=Unauthorized'));
    assertRejected(await guest.request('DELETE', '/customer/auth/review/1'));
    assert.deepEqual((await guest.request('GET', '/review/1')).data, {});
  });

  await t.test('registered users receive independent authenticated sessions', async () => {
    assertSuccess(await alice.request('POST', '/customer/login', aliceCredentials));
    assertSuccess(await bob.request('POST', '/customer/login', bobCredentials));
    assert.ok(alice.cookies.size > 0, 'Alice must receive a session cookie');
    assert.ok(bob.cookies.size > 0, 'Bob must receive a session cookie');
    assert.notDeepEqual([...alice.cookies], [...bob.cookies]);
  });

  await t.test('concurrent reviewers preserve both reviews using query and JSON input', async () => {
    const results = await Promise.all([
      alice.request('PUT', `/customer/auth/review/1?review=${encodeURIComponent('Alice original review')}`),
      bob.request('PUT', '/customer/auth/review/1', { review: 'Bob original review' })
    ]);
    results.forEach(assertSuccess);
    assert.deepEqual((await guest.request('GET', '/review/1')).data, {
      integration_alice: 'Alice original review',
      integration_bob: 'Bob original review'
    });
  });

  await t.test('an update belongs to the logged-in user despite a supplied username', async () => {
    assertSuccess(await alice.request('PUT', '/customer/auth/review/1', {
      review: 'Alice updated review', username: bobCredentials.username
    }));
    assert.deepEqual((await guest.request('GET', '/review/1')).data, {
      integration_alice: 'Alice updated review',
      integration_bob: 'Bob original review'
    });
  });

  await t.test('invalid review input and nonexistent ISBN cannot corrupt stored reviews', async () => {
    assertRejected(await alice.request('PUT', '/customer/auth/review/1', { review: '' }));
    assertRejected(await alice.request('PUT', '/customer/auth/review/1', { review: { invalid: true } }));
    assert.equal((await alice.request('PUT', '/customer/auth/review/999999', { review: 'Missing book' })).status, 404);
    assert.equal((await alice.request('DELETE', '/customer/auth/review/999999')).status, 404);
    assert.deepEqual((await guest.request('GET', '/review/1')).data, {
      integration_alice: 'Alice updated review',
      integration_bob: 'Bob original review'
    });
  });

  await t.test('deleting a review cannot delete another user’s contribution', async () => {
    assertSuccess(await alice.request('DELETE', `/customer/auth/review/1?username=${bobCredentials.username}`));
    assert.deepEqual((await guest.request('GET', '/review/1')).data, {
      integration_bob: 'Bob original review'
    });
    assertSuccess(await bob.request('DELETE', '/customer/auth/review/1'));
    assert.deepEqual((await guest.request('GET', '/review/1')).data, {});
  });

  await t.test('all four async Axios clients retrieve data from the live API', async () => {
    const [all, isbn, author, title] = await Promise.all([
      getAllBooks(baseURL),
      getBookByISBN('1', baseURL),
      getBooksByAuthor('Unknown', baseURL),
      getBooksByTitle('Things Fall Apart', baseURL)
    ]);
    assert.equal(Object.keys(all).length, 10);
    assert.equal(isbn.title, 'Things Fall Apart');
    assert.deepEqual(Object.keys(author), ['4', '5', '6', '7']);
    assert.deepEqual(Object.keys(title), ['1']);
    assert.equal(title['1'].author, 'Chinua Achebe');
  });

  await t.test('Axios rejects missing ISBN requests with their HTTP status', async () => {
    await assert.rejects(getBookByISBN('999999', baseURL), error => error.response?.status === 404);
  });
});
