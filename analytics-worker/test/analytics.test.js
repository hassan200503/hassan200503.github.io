/* Tests for the analytics Worker.
 *
 * The service is deliberately split so most of it can be exercised without a
 * network or a real D1 instance: routing and validation take a plain request
 * shape, and every statement goes through one narrow database interface that
 * a stub can stand in for.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import worker, { handleRequest } from "../src/index.js";
import { decodePhotoPayload, looksLikeJpeg } from "../src/github.js";
import { hashPassphrase } from "../tools/hash-passphrase.mjs";

const SITE_ORIGIN = "https://hassan200503.github.io";
const SESSION_SECRET = "test-session-secret-that-is-long-enough-to-be-usable";
const PASSPHRASE = "correct horse battery staple";
const SALT_HEX = "00112233445566778899aabbccddeeff";

/* ---------------------------------------------------------------- fixtures */

function fakeRequest({ method = "GET", url = "https://analytics.test/api/collect", headers = {}, cf = {}, body = null } = {}) {
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    method,
    url,
    cf,
    body,
    headers: { get: (name) => (map.has(String(name).toLowerCase()) ? map.get(String(name).toLowerCase()) : null) },
    async text() { return body === null ? "" : body; },
  };
}

/* A D1 stand-in that records every statement and returns whatever the test
 * says. It implements exactly the four methods store.js uses. */
function makeDb({ first = () => null, all = () => [] } = {}) {
  const log = [];
  const db = {
    log,
    prepare(sql) {
      const statement = {
        sql,
        binds: [],
        bind(...values) { statement.binds = values; log.push({ sql, binds: values }); return statement; },
        async first() { return first(sql, statement.binds); },
        async all() { return { results: all(sql, statement.binds) }; },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
    async batch(statements) { log.push({ batch: statements.length }); return statements.map(() => ({ meta: { changes: 1 } })); },
  };
  return db;
}

function baseEnv(db = makeDb()) {
  return {
    DB: db,
    ALLOWED_ORIGINS: SITE_ORIGIN,
    RETENTION_DAYS: "180",
    SESSION_SECRET,
    ADMIN_PASSPHRASE_SALT: SALT_HEX,
    ADMIN_PASSPHRASE_HASH: hashPassphrase(PASSPHRASE, SALT_HEX),
    GITHUB_REPO: "hassan200503/hassan200503.github.io",
    GITHUB_PHOTO_PATH: "images/profile-portrait.jpg",
  };
}

function visitBody(overrides = {}) {
  return JSON.stringify({
    kind: "visit",
    sessionId: "session-abc12345",
    path: "/",
    title: "Hassan Tsuma Karungwa",
    url: "https://hassan200503.github.io/",
    referrer: "https://www.google.com/search?q=java+developer",
    language: "en-KE",
    screen: [1920, 1080],
    viewport: [1280, 800],
    ...overrides,
  });
}

const GOOD_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function collectRequest({ headerOverrides = {}, body } = {}) {
  return fakeRequest({
    method: "POST",
    headers: {
      origin: SITE_ORIGIN,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.9",
      "user-agent": GOOD_UA,
      ...headerOverrides,
    },
    cf: { country: "KE", city: "Nairobi", region: "Nairobi", latitude: "-1.2921", longitude: "36.8219", asn: 33771, asOrganization: "Safaricom", continent: "AF", colo: "NBO", timezone: "Africa/Nairobi" },
    body: body === undefined ? visitBody() : body,
  });
}

/* ------------------------------------------------------------------ collect */

test("collect refuses an origin that is not on the allowlist", async () => {
  const db = makeDb();
  const response = await handleRequest(collectRequest({ headerOverrides: { origin: "https://evil.example" } }), baseEnv(db));
  assert.equal(response.status, 403);
  assert.equal(db.log.length, 0, "nothing should reach the database");
});

test("collect refuses a request with no origin and no matching referer", async () => {
  const db = makeDb();
  const response = await handleRequest(fakeRequest({
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
    body: visitBody(),
  }), baseEnv(db));
  assert.equal(response.status, 403);
});

test("collect answers a preflight with the allowlisted origin", async () => {
  const response = await handleRequest(fakeRequest({
    method: "OPTIONS",
    headers: { origin: SITE_ORIGIN, "access-control-request-method": "POST" },
  }), baseEnv());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  assert.match(response.headers.get("access-control-allow-headers"), /content-type/);
});

test("collect stores a visit and derives identity from the request, never the payload", async () => {
  const db = makeDb();
  const response = await handleRequest(collectRequest({
    body: visitBody({ ip: "1.2.3.4", country: "North Korea", isOwner: 1, city: "Pyongyang" }),
  }), baseEnv(db));

  assert.equal(response.status, 204);
  const insert = db.log.find((entry) => entry.sql && entry.sql.startsWith("INSERT INTO visits"));
  assert.ok(insert, "a visit row is written");

  // Column order in store.js: 13 ip, 15 country_code, 16 country, 17 region,
  // 18 city, 26 net_org, 33 device, 35 browser, 42 is_bot, 43 is_owner.
  assert.equal(insert.binds[13], "203.0.113.9", "IP comes from cf-connecting-ip");
  assert.equal(insert.binds[15], "KE", "country code comes from Cloudflare geo");
  assert.equal(insert.binds[17], "Nairobi", "region comes from Cloudflare geo");
  assert.equal(insert.binds[18], "Nairobi", "city comes from Cloudflare geo");
  assert.equal(insert.binds[26], "Safaricom", "network organisation comes from the Cloudflare ASN");
  assert.equal(insert.binds[43], 0, "the visitor is not the owner");
  assert.equal(insert.binds[33], "desktop");
  assert.equal(insert.binds[35], "Chrome");
  assert.equal(insert.binds[9], "www.google.com", "referrer host is extracted");
});

test("collect marks a browser it does not recognise as a bot and still records it", async () => {
  const db = makeDb();
  const response = await handleRequest(collectRequest({ headerOverrides: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" } }), baseEnv(db));
  assert.equal(response.status, 204);
  const insert = db.log.find((entry) => entry.sql && entry.sql.startsWith("INSERT INTO visits"));
  assert.equal(insert.binds[42], 1, "is_bot is set");
  assert.equal(insert.binds[33], "bot");
});

test("collect drops a malformed session id without writing anything", async () => {
  const db = makeDb();
  const response = await handleRequest(collectRequest({ body: visitBody({ sessionId: "short" }) }), baseEnv(db));
  assert.equal(response.status, 204);
  assert.equal(db.log.length, 0);
});

test("collect records a heartbeat as dwell time rather than an event row", async () => {
  const db = makeDb();
  const response = await handleRequest(collectRequest({
    body: JSON.stringify({ kind: "event", type: "heartbeat", sessionId: "session-abc12345", path: "/", duration: 42000, scroll: 55 }),
  }), baseEnv(db));
  assert.equal(response.status, 204);
  assert.equal(db.log.filter((entry) => entry.sql && entry.sql.startsWith("INSERT INTO events")).length, 0);
  assert.ok(db.log.some((entry) => entry.sql && entry.sql.startsWith("UPDATE sessions")), "the session row is refreshed");
});

test("collect turns an unknown interaction type into a custom event", async () => {
  const db = makeDb();
  await handleRequest(collectRequest({
    body: JSON.stringify({ kind: "event", type: "telepathy", sessionId: "session-abc12345", path: "/", label: "Contact me" }),
  }), baseEnv(db));
  const event = db.log.find((entry) => entry.sql && entry.sql.startsWith("INSERT INTO events"));
  assert.equal(event.binds[4], "custom");
  assert.equal(event.binds[6], "Contact me");
});

test("collect rejects a body that is not a JSON object", async () => {
  const response = await handleRequest(collectRequest({ body: "[1,2,3]" }), baseEnv());
  assert.equal(response.status, 400);
});

/* -------------------------------------------------------------------- admin */

test("the dashboard is not served to an unauthenticated visitor", async () => {
  const response = await handleRequest(fakeRequest({ url: "https://analytics.test/admin" }), baseEnv());
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Unlock dashboard/);
  assert.doesNotMatch(html, /Visitor sessions/, "dashboard markup must not be sent");
});

test("admin endpoints reject a request with no session", async () => {
  const response = await handleRequest(fakeRequest({ url: "https://analytics.test/api/admin/overview" }), baseEnv());
  assert.equal(response.status, 401);
});

test("login rejects a request that does not carry the custom header", async () => {
  const response = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), baseEnv());
  assert.equal(response.status, 403, "a cross-site form cannot set x-ht-admin");
});

test("login rejects the wrong passphrase and accepts the right one", async () => {
  const env = baseEnv();
  const attempt = (passphrase) => handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase }),
  }), env);

  const bad = await attempt("not the passphrase");
  assert.equal(bad.status, 401);

  const good = await attempt(PASSPHRASE);
  assert.equal(good.status, 200);
  const cookie = good.headers.get("set-cookie");
  assert.match(cookie, /^ht_admin=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(await attempt(PASSPHRASE).then((response) => response.status), 200, "the passphrase keeps working");
});

test("login stops accepting attempts from one address after repeated failures", async () => {
  const db = makeDb({
    first: (sql, binds) => {
      if (sql.includes("FROM login_attempts") && sql.includes("ok = 0")) return { failures: 5 };
      if (sql.includes("FROM login_attempts")) return { attempts: 5 };
      return null;
    },
  });
  const response = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), baseEnv(db));
  assert.equal(response.status, 429);
});

test("a signature that was tampered with is not accepted as a session", async () => {
  const env = baseEnv();
  const login = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), env);
  const token = login.headers.get("set-cookie").split(";")[0].slice("ht_admin=".length);
  // Flip the final signature character deterministically; replacing a suffix
  // with a fixed string can accidentally reproduce the original token.
  const forged = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

  const response = await handleRequest(fakeRequest({
    url: "https://analytics.test/api/admin/overview",
    headers: { cookie: `ht_admin=${forged}` },
  }), env);
  assert.equal(response.status, 401);
});

test("a valid session reaches the dashboard and its data endpoints", async () => {
  const env = baseEnv();
  const login = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const page = await handleRequest(fakeRequest({ url: "https://analytics.test/admin", headers: { cookie } }), env);
  assert.match(await page.text(), /Visitor sessions/);

  const overview = await handleRequest(fakeRequest({ url: "https://analytics.test/api/admin/overview?range=24h", headers: { cookie } }), env);
  assert.equal(overview.status, 200);
  const data = await overview.json();
  assert.equal(data.range, "24h");
  assert.equal(data.totals.visitors, 0);
  assert.deepEqual(data.series, []);

  const live = await handleRequest(fakeRequest({ url: "https://analytics.test/api/admin/live", headers: { cookie } }), env);
  assert.deepEqual(await live.json(), { visitors: [] });

  const csv = await handleRequest(fakeRequest({ url: "https://analytics.test/api/admin/export.csv?range=7d", headers: { cookie } }), env);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(await csv.text(), /^first_seen,last_seen/);
});

test("an unknown range falls back to the default window", async () => {
  const env = baseEnv();
  const login = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const response = await handleRequest(fakeRequest({ url: "https://analytics.test/api/admin/overview?range=;DROP TABLE visits", headers: { cookie } }), env);
  assert.equal((await response.json()).range, "24h");
});

test("a session detail request validates its id before touching the database", async () => {
  const env = baseEnv();
  const login = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const response = await handleRequest(fakeRequest({ url: "https://analytics.test/api/admin/session?id=%27%20OR%201%3D1", headers: { cookie } }), env);
  assert.equal(response.status, 400);
});

test("logout requires a session, then the admin header, and clears the cookie", async () => {
  const env = baseEnv();
  const anonymous = await handleRequest(fakeRequest({ method: "POST", url: "https://analytics.test/api/admin/logout" }), env);
  assert.equal(anonymous.status, 401, "no session, no logout");

  const login = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const withoutHeader = await handleRequest(fakeRequest({
    method: "POST", url: "https://analytics.test/api/admin/logout", headers: { cookie },
  }), env);
  assert.equal(withoutHeader.status, 403, "a cross-site form cannot sign the owner out");

  const response = await handleRequest(fakeRequest({
    method: "POST", url: "https://analytics.test/api/admin/logout", headers: { cookie, "x-ht-admin": "1" },
  }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

/* -------------------------------------------------------------------- photo */

test("photo upload requires a session and the admin header", async () => {
  const env = baseEnv();
  const noHeader = await handleRequest(fakeRequest({
    method: "POST", url: "https://analytics.test/api/admin/photo",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/jpeg;base64,AAAA" }),
  }), env);
  assert.equal(noHeader.status, 401);
});

test("photo upload rejects anything that is not a JPEG", async () => {
  const env = baseEnv();
  const login = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/login",
    headers: { "content-type": "application/json", "x-ht-admin": "1", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  }), env);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const response = await handleRequest(fakeRequest({
    method: "POST",
    url: "https://analytics.test/api/admin/photo",
    headers: { cookie, "content-type": "application/json", "x-ht-admin": "1" },
    body: JSON.stringify({ image: `data:image/png;base64,${Buffer.from("not a jpeg at all").toString("base64")}` }),
  }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /JPEG/);
});

test("the photo decoder accepts a JPEG data URL and rejects other shapes", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  assert.equal(looksLikeJpeg(jpeg), true);
  const decoded = decodePhotoPayload(`data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`);
  assert.deepEqual(Array.from(decoded.slice(0, 3)), [0xff, 0xd8, 0xff]);
  assert.throws(() => decodePhotoPayload(""), /missing image data/);
  assert.throws(() => decodePhotoPayload("not base64 !!"), /not base64/);
  assert.throws(() => decodePhotoPayload(Buffer.from("plain text here").toString("base64")), /JPEG/);
});

/* ------------------------------------------------------------------- router */

test("health and unknown routes answer predictably", async () => {
  const health = await handleRequest(fakeRequest({ url: "https://analytics.test/healthz" }), baseEnv());
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const missing = await handleRequest(fakeRequest({ url: "https://analytics.test/nope" }), baseEnv());
  assert.equal(missing.status, 404);
});

test("the root redirects to the dashboard entry point", async () => {
  const response = await handleRequest(fakeRequest({ url: "https://analytics.test/" }), baseEnv());
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /\/admin$/);
});

test("every admin response carries the hardened headers", async () => {
  const response = await handleRequest(fakeRequest({ url: "https://analytics.test/admin" }), baseEnv());
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("the dashboard assets are served as script and style, never as HTML", async () => {
  const css = await handleRequest(fakeRequest({ url: "https://analytics.test/admin/app.css" }), baseEnv());
  assert.match(css.headers.get("content-type"), /text\/css/);
  const js = await handleRequest(fakeRequest({ url: "https://analytics.test/admin/app.js" }), baseEnv());
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.match(await js.text(), /x-ht-admin/);
});

test("a database that throws does not leak a stack trace", async () => {
  const db = makeDb();
  db.prepare = () => { throw new Error('relation "visits" does not exist'); };
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await worker.fetch(collectRequest(), baseEnv(db));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal error" });
  } finally {
    console.error = originalError;
  }
});
