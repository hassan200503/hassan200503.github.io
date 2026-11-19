/* The route table for the private analytics service.
 *
 * Two public surfaces and one private one:
 *
 *   POST /api/collect      the beacon from the public site. Cross-origin, so
 *                          it is the only route with a CORS allowlist, and it
 *                          is the only route that accepts data from a browser.
 *   /admin, /admin/*       the dashboard, its stylesheet and its scripts.
 *                          Same-origin only, never CORS, never linked from
 *                          the public site.
 *   /api/admin/*           private JSON. Every request must carry a valid
 *                          signed session cookie; every mutating request must
 *                          also carry the custom header that a cross-site
 *                          page cannot set.
 *
 * Nothing the browser sends is trusted for identity or location. The IP comes
 * from Cloudflare's own header, the geo comes from the Cloudflare request
 * object, and the organisation comes from IPinfo server-side.
 */

import {
  adminHeaders,
  clampInt,
  clampText,
  clientIp,
  corsHeaders,
  isIpv6,
  json,
  parseOrigins,
  problem,
  readJson,
  textResponse,
} from "./http.js";
import {
  SESSION_COOKIE,
  clearedCookie,
  createSession,
  hasAdminIntent,
  loginAllowed,
  parseCookies,
  recordLogin,
  sessionCookie,
  verifyPassphrase,
  verifySession,
  visitorHash,
} from "./auth.js";
import { enrichVisitor, isOwnerIp, parseUserAgent } from "./enrich.js";
import {
  exportSessions,
  getPhoto,
  listSessions,
  liveVisitors,
  normalizeSessionId,
  recordEvent,
  recordVisit,
  resolveRange,
  retentionSweep,
  sessionDetail,
  setPhoto,
  summary,
  touchSession,
} from "./store.js";
import { commitPhoto, decodePhotoPayload, dispatchPagesRebuild, readPhoto } from "./github.js";
import {
  DASHBOARD_CSS,
  DASHBOARD_HTML,
  DASHBOARD_JS,
  LOGIN_HTML,
  LOGIN_JS,
} from "./dashboard.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/* Interaction types the tracker may report. Anything else is stored as
 * "custom" so a stale cached script can never write an unknown shape. */
const EVENT_TYPES = new Set(["click", "download", "copy", "contact", "outbound", "scroll", "exit", "custom"]);

const HTML_TYPE = "text/html; charset=utf-8";
const CSS_TYPE = "text/css; charset=utf-8";
const JS_TYPE = "text/javascript; charset=utf-8";

/* ------------------------------------------------------------------ helpers */

function nowMs() {
  return Date.now();
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/* The trend chart wants a readable number of points whatever range is chosen,
 * so the bucket grows with the window rather than being fixed. */
function bucketFor(span) {
  if (span === null) return DAY_MS;
  if (span <= 2 * HOUR_MS) return 5 * 60 * 1000;
  if (span <= DAY_MS) return HOUR_MS;
  if (span <= 7 * DAY_MS) return 6 * HOUR_MS;
  return DAY_MS;
}

function geoOptions(url) {
  const range = resolveRange(url.searchParams.get("range"));
  return {
    rangeKey: range.key,
    since: range.since,
    includeBots: url.searchParams.get("bots") === "1",
    includeOwner: url.searchParams.get("owner") === "1",
    bucketMs: bucketFor(range.span),
  };
}

function sessionOptions(url, base) {
  return {
    ...base,
    limit: clampInt(url.searchParams.get("limit"), 1, 100, 25),
    offset: clampInt(url.searchParams.get("offset"), 0, 500_000, 0),
    search: clampText(url.searchParams.get("q"), 64) || "",
  };
}

async function currentSession(request, env) {
  const cookie = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  return verifySession(env, cookie);
}

function adminJson(data, init = {}) {
  return json(data, { ...init, headers: adminHeaders(init.headers) });
}

function adminProblem(status, message, extra = {}) {
  return json({ error: message }, { status, headers: adminHeaders(extra) });
}

/* ------------------------------------------------------------------- collect */

function originAllowed(request, env) {
  const allowed = parseOrigins(env.ALLOWED_ORIGINS);
  if (!allowed.length) return false;
  const origin = String(request.headers.get("origin") || "").replace(/\/$/, "");
  if (allowed.includes(origin)) return true;
  // Beacons and keepalive fetches from the site always carry an Origin; a
  // missing one is only accepted when the Referer names an allowed host.
  if (origin) return false;
  const referer = String(request.headers.get("referer") || "");
  return allowed.some((entry) => referer.startsWith(`${entry}/`));
}

function shapeVisitEvent(payload, base) {
  const type = EVENT_TYPES.has(String(payload.type)) ? String(payload.type) : "custom";
  const meta = payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
    ? JSON.stringify(payload.meta).slice(0, 512)
    : null;
  return {
    id: crypto.randomUUID(),
    sessionId: base.sessionId,
    visitorHash: base.visitorHash,
    ts: base.ts,
    type,
    path: clampText(payload.path, 512) || base.path,
    label: clampText(payload.label, 160),
    target: clampText(payload.target, 512),
    value: Number.isFinite(Number(payload.value)) ? Number(payload.value) : null,
    meta,
    isBot: base.isBot,
    isOwner: base.isOwner,
    durationMs: clampInt(payload.duration, 0, 12 * HOUR_MS, 0),
    scrollDepth: clampInt(payload.scroll, 0, 100, 0),
    createdAt: new Date(base.ts).toISOString(),
  };
}

async function handleCollect(request, env, options = {}) {
  const origin = String(request.headers.get("origin") || "");
  const cors = corsHeaders(origin, parseOrigins(env.ALLOWED_ORIGINS));

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors, "access-control-max-age": "600" } });
  }
  if (request.method !== "POST") return problem(405, "method not allowed", cors);
  if (!originAllowed(request, env)) return problem(403, "origin not allowed", cors);
  if (!env.DB) return problem(503, "analytics storage is not configured", cors);

  let payload;
  try {
    payload = await readJson(request, 8192);
  } catch (error) {
    return problem(400, error.message, cors);
  }

  const sessionId = normalizeSessionId(payload.sessionId);
  if (!sessionId) return new Response(null, { status: 204, headers: cors });

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") || "";
  const identity = parseUserAgent(userAgent);
  const ts = nowMs();

  const base = {
    sessionId,
    visitorHash: await visitorHash(env, ip, userAgent),
    ts,
    path: clampText(payload.path, 512) || "/",
    isBot: identity.isBot ? 1 : 0,
    isOwner: isOwnerIp(env, ip) ? 1 : 0,
  };

  const kind = String(payload.kind || "visit");

  if (kind === "event") {
    if (String(payload.type) === "heartbeat") {
      // A heartbeat only refreshes dwell time; storing each one would bloat
      // the table without adding anything the session row does not already say.
      await touchSession(env, {
        sessionId: base.sessionId,
        ts,
        durationMs: clampInt(payload.duration, 0, 12 * HOUR_MS, 0),
        scrollDepth: clampInt(payload.scroll, 0, 100, 0),
        createdAt: new Date(ts).toISOString(),
      });
      return new Response(null, { status: 204, headers: cors });
    }
    await recordEvent(env, shapeVisitEvent(payload, base));
    return new Response(null, { status: 204, headers: cors });
  }

  const enrichment = await enrichVisitor(env, request, options.fetchFn || fetch);
  const screen = Array.isArray(payload.screen) ? payload.screen : [];
  const viewport = Array.isArray(payload.viewport) ? payload.viewport : [];
  const referrer = clampText(payload.referrer, 512);
  let referrerHost = null;
  if (referrer) {
    try { referrerHost = clampText(new URL(referrer).host, 128); } catch { referrerHost = null; }
  }

  await recordVisit(env, {
    id: crypto.randomUUID(),
    sessionId: base.sessionId,
    visitorHash: base.visitorHash,
    ts,
    day: dayKey(ts),
    path: base.path,
    url: clampText(payload.url, 512),
    title: clampText(payload.title, 200),
    referrer,
    referrerHost,
    utmSource: clampText(payload.utmSource, 64),
    utmMedium: clampText(payload.utmMedium, 64),
    utmCampaign: clampText(payload.utmCampaign, 64),
    ip: clampText(ip, 64),
    ipVersion: isIpv6(ip) ? "v6" : "v4",
    countryCode: enrichment.countryCode,
    country: enrichment.country,
    region: enrichment.region,
    city: enrichment.city,
    postal: enrichment.postal,
    latitude: enrichment.latitude,
    longitude: enrichment.longitude,
    timezone: enrichment.timezone,
    continent: enrichment.continent,
    colo: enrichment.colo,
    asn: enrichment.asn,
    netOrg: enrichment.netOrg,
    company: enrichment.company,
    companyDomain: enrichment.companyDomain,
    isHosting: enrichment.isHosting,
    isVpn: enrichment.isVpn,
    isProxy: enrichment.isProxy,
    isTor: enrichment.isTor,
    deviceType: identity.deviceType,
    os: identity.os,
    browser: identity.browser,
    browserVersion: identity.browserVersion,
    language: clampText(payload.language, 32),
    screenW: clampInt(screen[0], 0, 20000),
    screenH: clampInt(screen[1], 0, 20000),
    viewportW: clampInt(viewport[0], 0, 20000),
    viewportH: clampInt(viewport[1], 0, 20000),
    isBot: base.isBot,
    isOwner: base.isOwner,
    createdAt: new Date(ts).toISOString(),
  });

  return new Response(null, { status: 204, headers: cors });
}

/* --------------------------------------------------------------------- admin */

async function handleLogin(request, env, options = {}) {
  if (request.method !== "POST") return adminProblem(405, "method not allowed");
  if (!hasAdminIntent(request)) return adminProblem(403, "missing admin header");
  if (!env.DB || !env.SESSION_SECRET) return adminProblem(503, "dashboard is not configured");

  let payload;
  try {
    payload = await readJson(request, 1024);
  } catch (error) {
    return adminProblem(400, error.message);
  }

  const ip = clientIp(request) || "unknown";
  const gate = await loginAllowed(env, ip);
  if (!gate.allowed) {
    await recordLogin(env, ip, false);
    return adminProblem(429, gate.reason);
  }

  const passphrase = typeof payload.passphrase === "string" ? payload.passphrase : "";
  const ok = passphrase.length > 0 && passphrase.length <= 512 && await verifyPassphrase(passphrase, env);
  await recordLogin(env, ip, ok);
  if (!ok) return adminProblem(401, "That passphrase is not correct.");

  const token = await createSession(env);
  return adminJson({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
}

async function handleLogout(request, env) {
  if (request.method !== "POST") return adminProblem(405, "method not allowed");
  if (!hasAdminIntent(request)) return adminProblem(403, "missing admin header");
  return adminJson({ ok: true }, { headers: { "set-cookie": clearedCookie() } });
}

/* The published photo is read back from the repository rather than from D1, so
 * the dashboard always shows what is actually live, not what was uploaded. */
async function handlePhoto(request, env) {
  if (!env.DB) return adminProblem(503, "dashboard is not configured");

  if (request.method === "GET") {
    const stored = await getPhoto(env);
    let live = null;
    try {
      live = await readPhoto(env);
    } catch {
      live = null;
    }
    if (!stored && !live) return adminJson({ photo: null });
    return adminJson({
      photo: {
        path: live?.path || stored?.path || null,
        sha: live?.sha || stored?.sha || null,
        bytes: live?.bytes ?? stored?.bytes ?? 0,
        updated_at: stored?.updated_at || null,
        dataUrl: live?.dataUrl || null,
        url: live?.htmlUrl || null,
      },
    });
  }

  if (request.method !== "POST") return adminProblem(405, "method not allowed");
  if (!hasAdminIntent(request)) return adminProblem(403, "missing admin header");

  let payload;
  try {
    payload = await readJson(request, 2_100_000);
  } catch (error) {
    return adminProblem(400, error.message);
  }

  let bytes;
  try {
    bytes = decodePhotoPayload(payload.image);
  } catch (error) {
    return adminProblem(400, error.message);
  }

  let committed;
  try {
    committed = await commitPhoto(env, bytes);
  } catch (error) {
    return adminProblem(502, error.message);
  }

  const previous = await getPhoto(env);
  let history = [];
  try {
    const parsed = previous?.history ? JSON.parse(previous.history) : [];
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    history = [];
  }
  history.unshift({ sha: committed.sha, bytes: committed.bytes, replacedAt: new Date().toISOString() });
  await setPhoto(env, {
    path: committed.path,
    sha: committed.sha,
    bytes: committed.bytes,
    previousHistory: history.slice(0, 10),
  });

  let dispatched = false;
  try {
    dispatched = await dispatchPagesRebuild(env);
  } catch {
    dispatched = false;
  }

  return adminJson({ ok: true, dispatched, sha: committed.sha, bytes: committed.bytes, path: committed.path });
}

async function handleAdminApi(request, env, url) {
  const session = await currentSession(request, env);
  if (!session) return adminProblem(401, "not signed in");

  switch (url.pathname) {
    case "/api/admin/overview":
      return adminJson(await summary(env, geoOptions(url)));

    case "/api/admin/live":
      return adminJson({ visitors: await liveVisitors(env) });

    case "/api/admin/sessions":
      return adminJson(await listSessions(env, sessionOptions(url, geoOptions(url))));

    case "/api/admin/session": {
      const id = normalizeSessionId(url.searchParams.get("id"));
      if (!id) return adminProblem(400, "invalid session id");
      const detail = await sessionDetail(env, id);
      if (!detail) return adminProblem(404, "session not found");
      return adminJson(detail);
    }

    case "/api/admin/export.csv": {
      const csv = await exportSessions(env, sessionOptions(url, geoOptions(url)));
      return textResponse(csv, "text/csv; charset=utf-8", {
        headers: adminHeaders({
          "content-disposition": `attachment; filename="visitors-${geoOptions(url).rangeKey}.csv"`,
        }),
      });
    }

    case "/api/admin/photo":
      return handlePhoto(request, env);

    case "/api/admin/logout":
      return handleLogout(request, env);

    default:
      return adminProblem(404, "not found");
  }
}

async function handleAdminAsset(pathname, env) {
  if (pathname === "/admin/app.css") return textResponse(DASHBOARD_CSS, CSS_TYPE, { headers: adminHeaders() });
  if (pathname === "/admin/app.js") return textResponse(DASHBOARD_JS, JS_TYPE, { headers: adminHeaders() });
  if (pathname === "/admin/login.js") return textResponse(LOGIN_JS, JS_TYPE, { headers: adminHeaders() });
  return null;
}

/* -------------------------------------------------------------------- router */

export async function handleRequest(request, env, options = {}) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/healthz") {
    return json({ ok: true, storage: Boolean(env.DB), time: new Date().toISOString() });
  }

  if (pathname === "/api/collect") return handleCollect(request, env, options);

  if (pathname === "/api/admin/login") return handleLogin(request, env, options);
  if (pathname.startsWith("/api/admin/")) return handleAdminApi(request, env, url);

  const asset = await handleAdminAsset(pathname, env);
  if (asset) return asset;

  if (pathname === "/admin") {
    const session = await currentSession(request, env);
    return textResponse(session ? DASHBOARD_HTML : LOGIN_HTML, HTML_TYPE, { headers: adminHeaders() });
  }

  if (pathname === "/") {
    return Response.redirect(`${url.origin}/admin`, 302);
  }

  return problem(404, "not found");
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      // A thrown error must not leak a stack trace or a database message.
      console.error("unhandled", error && error.message);
      return problem(500, "internal error");
    }
  },

  /* Daily sweep so visitor history does not accumulate forever. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(retentionSweep(env, env.RETENTION_DAYS));
  },
};
