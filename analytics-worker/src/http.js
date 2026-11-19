/* Small HTTP helpers shared by the analytics routes.
 *
 * Everything the browser sends is treated as hostile: values are clamped to a
 * known shape and length before they can reach a SQL statement, and no value
 * the client sends is ever used for geolocation or identity.
 */

export const JSON_TYPE = "application/json; charset=utf-8";

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": JSON_TYPE, "cache-control": "no-store", ...(init.headers || {}) },
  });
}

export function problem(status, message, headers = {}) {
  return json({ error: message }, { status, headers });
}

export function textResponse(body, contentType, init = {}) {
  return new Response(body, {
    ...init,
    headers: { "content-type": contentType, ...(init.headers || {}) },
  });
}

/* Hardening applied to every admin response. The dashboard ships its CSS and
 * JS as separate same-origin files so the policy can forbid inline script
 * entirely — a stolen passphrase should not also mean an XSS foothold. */
export function adminHeaders(extra = {}) {
  return {
    "content-security-policy": [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "permissions-policy": "geolocation=(), camera=(), microphone=(), payment=()",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": "no-store",
    ...extra,
  };
}

export function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function corsHeaders(origin, allowed) {
  const headers = { vary: "Origin" };
  if (origin && allowed.includes(origin.replace(/\/$/, ""))) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers["access-control-max-age"] = "600";
  }
  return headers;
}

export async function readJson(request, maxBytes = 8192) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length && length > maxBytes) throw new Error("payload too large");
  const raw = await request.text();
  if (raw.length > maxBytes) throw new Error("payload too large");
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }
  return parsed;
}

export function clampText(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function clampInt(value, min, max, fallback = null) {
  const number = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function clientIp(request) {
  // Cloudflare sets this and overwrites anything a client tries to supply.
  return request.headers.get("cf-connecting-ip") || "";
}

export function isIpv6(ip) {
  return Boolean(ip) && ip.includes(":");
}

export function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

/* Cloudflare's geo object uses PascalCase for the continent and a bare
 * country code; normalise once so the rest of the service sees one shape. */
export function cfGeo(request) {
  const cf = request.cf || {};
  const latitude = Number.parseFloat(cf.latitude);
  const longitude = Number.parseFloat(cf.longitude);
  return {
    countryCode: clampText(cf.country, 4),
    country: clampText(cf.country, 64),
    region: clampText(cf.region, 64),
    city: clampText(cf.city, 64),
    postal: clampText(cf.postalCode, 16),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    timezone: clampText(cf.timezone, 48),
    continent: clampText(cf.continent, 32),
    colo: clampText(cf.colo, 8),
    asn: clampInt(cf.asn, 0, 4_294_967_295),
    netOrg: clampText(cf.asOrganization, 128),
  };
}
