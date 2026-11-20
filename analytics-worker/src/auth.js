/* Authentication for the private dashboard.
 *
 * Design notes, because this is the part that must not be got wrong:
 *
 *  - The passphrase itself is never stored anywhere. Only a PBKDF2-SHA256
 *    digest and its salt live in the Worker, as secrets.
 *  - Comparison is constant time, and the work factor is the same whether the
 *    hash is present or absent, so a missing secret cannot be detected by
 *    response time.
 *  - Sessions are HMAC-SHA256 signed with a separate secret. The cookie is
 *    HttpOnly, Secure and SameSite=Strict, so it is unreadable to script and
 *    is not attached to cross-site requests.
 *  - Failed logins are counted per IP in D1. The counter lives in the
 *    database rather than memory because Worker isolates are not a shared
 *    state store.
 */

import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
  clampInt,
  constantTimeEqual,
} from "./http.js";

export const SESSION_COOKIE = "ht_admin";
/* Cloudflare Workers WebCrypto refuses PBKDF2 iteration counts above
 * 100,000, so this is the strongest setting the runtime actually supports.
 * Keep it in lockstep with tools/hash-passphrase.mjs. */
export const PBKDF2_ITERATIONS = 100_000;
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_VERSION = "v1";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_BURST_WINDOW_MS = 60 * 60 * 1000;
const LOGIN_BURST_MAX = 25;

export function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return null;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function derivePassphrase(passphrase, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(passphrase).normalize("NFKC")), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" }, key, 256,
  );
  return new Uint8Array(bits);
}

export async function verifyPassphrase(passphrase, env) {
  const salt = hexToBytes(env.ADMIN_PASSPHRASE_SALT);
  let expected = new Uint8Array(32);
  try {
    if (env.ADMIN_PASSPHRASE_HASH) expected = base64ToBytes(env.ADMIN_PASSPHRASE_HASH);
  } catch {
    expected = new Uint8Array(32);
  }
  const saltBytes = salt && salt.length >= 16 ? salt : new Uint8Array(16);
  const derived = await derivePassphrase(passphrase ?? "", saltBytes);
  // Both operands are always 32 bytes, so the comparison cannot leak length.
  const matches = constantTimeEqual(derived, expected);
  return Boolean(salt) && matches;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
}

async function sign(payloadSegment, secret) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payloadSegment));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSession(env, now = Date.now()) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET is not configured");
  const payload = {
    sub: "owner",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const segment = `${SESSION_VERSION}.${bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}`;
  return `${segment}.${await sign(segment, env.SESSION_SECRET)}`;
}

export async function verifySession(env, token, now = Date.now()) {
  if (!token || !env.SESSION_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_VERSION) return null;
  const segment = `${parts[0]}.${parts[1]}`;
  let supplied;
  let payloadBytes;
  try {
    supplied = base64UrlToBytes(parts[2]);
    payloadBytes = base64UrlToBytes(parts[1]);
  } catch {
    return null;
  }
  /* Base64url has several encodings for the same bytes when the final
   * character's unused bits are set. Accepting one would let a tampered
   * token share a signature with the real one, so require the canonical
   * spelling on both segments. */
  if (bytesToBase64Url(supplied) !== parts[2]) return null;
  if (bytesToBase64Url(payloadBytes) !== parts[1]) return null;
  const expected = base64UrlToBytes(await sign(segment, env.SESSION_SECRET));
  if (!constantTimeEqual(supplied, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  const nowSeconds = Math.floor(now / 1000);
  if (payload?.sub !== "owner") return null;
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds + 60) return null;
  return payload;
}

export function parseCookies(header) {
  const jar = {};
  String(header || "").split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index < 1) return;
    const name = pair.slice(0, index).trim();
    if (name) jar[name] = pair.slice(index + 1).trim();
  });
  return jar;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function clearedCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function isHttps(request) {
  return new URL(request.url).protocol === "https:";
}

/* Same-origin fetch with a custom header cannot be produced by a plain HTML
 * form or a cross-site <img>/<script>, so this closes CSRF for every route
 * that changes state. */
export function hasAdminIntent(request) {
  return request.headers.get("x-ht-admin") === "1";
}

export function ownerIps(env) {
  return String(env.OWNER_IPS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function loginAllowed(env, ip, now = Date.now()) {
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS failures FROM login_attempts WHERE ip = ?1 AND ok = 0 AND ts > ?2",
  ).bind(ip, now - LOGIN_WINDOW_MS).first();
  if (clampInt(recent?.failures, 0, 1e9, 0) >= LOGIN_MAX_FAILURES) {
    return { allowed: false, reason: "too many failed attempts; try again in 15 minutes" };
  }
  const burst = await env.DB.prepare(
    "SELECT COUNT(*) AS attempts FROM login_attempts WHERE ip = ?1 AND ts > ?2",
  ).bind(ip, now - LOGIN_BURST_WINDOW_MS).first();
  if (clampInt(burst?.attempts, 0, 1e9, 0) >= LOGIN_BURST_MAX) {
    return { allowed: false, reason: "too many attempts from this address; try again later" };
  }
  return { allowed: true };
}

export async function recordLogin(env, ip, ok, now = Date.now()) {
  await env.DB.prepare(
    "INSERT INTO login_attempts (id, ip, ts, ok) VALUES (?1, ?2, ?3, ?4)",
  ).bind(crypto.randomUUID(), ip, now, ok ? 1 : 0).run();
  if (ok) {
    await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?1 AND ok = 0").bind(ip).run();
  }
}

export async function pruneLoginAttempts(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE ts < ?1").bind(now - 7 * 24 * 60 * 60 * 1000).run();
}

/* Pseudonymous but stable identity for one browser, so a returning visitor is
 * recognisable without storing a raw fingerprint. Keyed by the IP and user
 * agent, salted with a server secret. */
export async function visitorHash(env, ip, userAgent) {
  const secret = env.SESSION_SECRET || "unconfigured";
  const signature = await crypto.subtle.sign(
    "HMAC", await hmacKey(secret), new TextEncoder().encode(`${ip}|${userAgent}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
