/* All SQL lives here.
 *
 * Two rules the rest of the service depends on:
 *
 *  1. No request value is ever interpolated into a statement. Column names and
 *     clause templates are literals in this file; every data value is bound.
 *  2. Every read that could be slow is either indexed in schema.sql or reads a
 *     single row by primary key.
 */

import { clampInt, clampText } from "./http.js";

export const RANGE_MS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  all: null,
};

export function resolveRange(name) {
  const key = Object.prototype.hasOwnProperty.call(RANGE_MS, String(name)) ? String(name) : "24h";
  const span = RANGE_MS[key];
  return { key, since: span === null ? 0 : Date.now() - span, span };
}

function scope(table, timeColumn, { since, includeBots, includeOwner }) {
  const clauses = [`${table}.${timeColumn} >= ?`];
  const binds = [since];
  if (!includeBots) clauses.push(`${table}.is_bot = 0`);
  if (!includeOwner) clauses.push(`${table}.is_owner = 0`);
  return { sql: clauses.join(" AND "), binds };
}

export function normalizeSessionId(value) {
  const id = clampText(value, 64);
  return id && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
}

export function normalizeVisitorKey(value) {
  const key = clampText(value, 64);
  return key && /^[A-Za-z0-9_-]{6,64}$/.test(key) ? key : null;
}

export async function recordVisit(env, visit) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO visits (
         id, session_id, visitor_hash, ts, day, path, url, title, referrer, referrer_host,
         utm_source, utm_medium, utm_campaign, ip, ip_version, country_code, country, region,
         city, postal, latitude, longitude, timezone, continent, colo, asn, net_org, company,
         company_domain, is_hosting, is_vpn, is_proxy, is_tor, device_type, os, browser,
         browser_version, language, screen_w, screen_h, viewport_w, viewport_h, is_bot,
         is_owner, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      visit.id, visit.sessionId, visit.visitorHash, visit.ts, visit.day, visit.path, visit.url,
      visit.title, visit.referrer, visit.referrerHost, visit.utmSource, visit.utmMedium,
      visit.utmCampaign, visit.ip, visit.ipVersion, visit.countryCode, visit.country, visit.region,
      visit.city, visit.postal, visit.latitude, visit.longitude, visit.timezone, visit.continent,
      visit.colo, visit.asn, visit.netOrg, visit.company, visit.companyDomain, visit.isHosting,
      visit.isVpn, visit.isProxy, visit.isTor, visit.deviceType, visit.os, visit.browser,
      visit.browserVersion, visit.language, visit.screenW, visit.screenH, visit.viewportW,
      visit.viewportH, visit.isBot, visit.isOwner, visit.createdAt,
    ),
    env.DB.prepare(
      `INSERT INTO sessions (
         session_id, visitor_hash, first_ts, last_ts, pageviews, event_count, max_scroll,
         duration_ms, country_code, country, region, city, asn, net_org, company, company_domain,
         is_hosting, is_vpn, is_proxy, is_tor, device_type, os, browser, language, referrer_host,
         entry_path, exit_path, ip, is_bot, is_owner, updated_at
       ) VALUES (?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         last_ts        = MAX(sessions.last_ts, excluded.last_ts),
         pageviews      = sessions.pageviews + 1,
         exit_path      = excluded.exit_path,
         country_code   = COALESCE(sessions.country_code, excluded.country_code),
         country        = COALESCE(sessions.country, excluded.country),
         region         = COALESCE(sessions.region, excluded.region),
         city           = COALESCE(sessions.city, excluded.city),
         asn            = COALESCE(sessions.asn, excluded.asn),
         net_org        = COALESCE(sessions.net_org, excluded.net_org),
         company        = COALESCE(sessions.company, excluded.company),
         company_domain = COALESCE(sessions.company_domain, excluded.company_domain),
         ip             = COALESCE(sessions.ip, excluded.ip),
         updated_at     = excluded.updated_at`,
    ).bind(
      visit.sessionId, visit.visitorHash, visit.ts, visit.ts, visit.countryCode, visit.country,
      visit.region, visit.city, visit.asn, visit.netOrg, visit.company, visit.companyDomain,
      visit.isHosting, visit.isVpn, visit.isProxy, visit.isTor, visit.deviceType, visit.os,
      visit.browser, visit.language, visit.referrerHost, visit.path, visit.path, visit.ip,
      visit.isBot, visit.isOwner, visit.createdAt,
    ),
  ]);
}

export async function recordEvent(env, event) {
  const statements = [
    env.DB.prepare(
      `INSERT INTO events (id, session_id, visitor_hash, ts, type, path, label, target, value, meta, is_bot, is_owner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      event.id, event.sessionId, event.visitorHash, event.ts, event.type, event.path, event.label,
      event.target, event.value, event.meta, event.isBot, event.isOwner,
    ),
  ];
  if (event.type !== "heartbeat") {
    statements.push(env.DB.prepare(
      `UPDATE sessions SET
         event_count = event_count + 1,
         last_ts     = MAX(last_ts, ?),
         duration_ms = CASE WHEN ? > duration_ms THEN ? ELSE duration_ms END,
         max_scroll  = CASE WHEN ? > max_scroll THEN ? ELSE max_scroll END,
         exit_path   = COALESCE(exit_path, ?),
         updated_at  = ?
       WHERE session_id = ?`,
    ).bind(
      event.ts, event.durationMs, event.durationMs, event.scrollDepth, event.scrollDepth,
      event.path, event.createdAt, event.sessionId,
    ));
  }
  await env.DB.batch(statements);
}

export async function touchSession(env, event) {
  await env.DB.prepare(
    `UPDATE sessions SET
       last_ts     = MAX(last_ts, ?),
       duration_ms = CASE WHEN ? > duration_ms THEN ? ELSE duration_ms END,
       max_scroll  = CASE WHEN ? > max_scroll THEN ? ELSE max_scroll END,
       updated_at  = ?
     WHERE session_id = ?`,
  ).bind(
    event.ts, event.durationMs, event.durationMs, event.scrollDepth, event.scrollDepth,
    event.createdAt, event.sessionId,
  ).run();
}

export async function summary(env, options) {
  const visitScope = scope("visits", "ts", options);
  const sessionScope = scope("sessions", "last_ts", options);
  const eventScope = scope("events", "ts", options);

  const [pages, sessions, countries, cities, companies, devices, browsers, systems, referrers, topPages, landing, clicks, series] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS pageviews,
              COUNT(DISTINCT visitor_hash) AS visitors,
              COUNT(DISTINCT session_id) AS sessions
         FROM visits WHERE ${visitScope.sql}`,
    ).bind(...visitScope.binds).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS sessions,
              CAST(AVG(CASE WHEN duration_ms > 0 THEN duration_ms END) AS INTEGER) AS avg_duration_ms,
              CAST(AVG(max_scroll) AS INTEGER) AS avg_scroll,
              SUM(CASE WHEN pageviews = 1 THEN 1 ELSE 0 END) AS single_page,
              SUM(event_count) AS interactions
         FROM sessions WHERE ${sessionScope.sql}`,
    ).bind(...sessionScope.binds).first(),
    env.DB.prepare(
      `SELECT country_code AS code, MAX(country) AS name, COUNT(*) AS n, COUNT(DISTINCT session_id) AS visitors
         FROM visits WHERE ${visitScope.sql} AND country_code IS NOT NULL
        GROUP BY country_code ORDER BY n DESC LIMIT 12`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT city, region, MAX(country) AS country, COUNT(*) AS n
         FROM visits WHERE ${visitScope.sql} AND city IS NOT NULL
        GROUP BY city ORDER BY n DESC LIMIT 12`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT COALESCE(NULLIF(company, ''), NULLIF(net_org, ''), 'Unresolved network') AS name,
              company_domain AS domain, COUNT(DISTINCT session_id) AS visitors, COUNT(*) AS n
         FROM visits WHERE ${visitScope.sql}
        GROUP BY name ORDER BY visitors DESC, n DESC LIMIT 12`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT COALESCE(device_type, 'unknown') AS name, COUNT(*) AS n
         FROM visits WHERE ${visitScope.sql} GROUP BY device_type ORDER BY n DESC`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT COALESCE(browser, 'unknown') AS name, COUNT(*) AS n
         FROM visits WHERE ${visitScope.sql} GROUP BY browser ORDER BY n DESC LIMIT 10`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT COALESCE(os, 'unknown') AS name, COUNT(*) AS n
         FROM visits WHERE ${visitScope.sql} GROUP BY os ORDER BY n DESC LIMIT 10`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT COALESCE(NULLIF(referrer_host, ''), 'Direct / none') AS name, COUNT(*) AS n
         FROM visits WHERE ${visitScope.sql} GROUP BY name ORDER BY n DESC LIMIT 12`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT path, COUNT(*) AS n, COUNT(DISTINCT session_id) AS visitors
         FROM visits WHERE ${visitScope.sql} GROUP BY path ORDER BY n DESC LIMIT 12`,
    ).bind(...visitScope.binds).all(),
    env.DB.prepare(
      `SELECT entry_path AS path, COUNT(*) AS n FROM sessions WHERE ${sessionScope.sql}
        GROUP BY entry_path ORDER BY n DESC LIMIT 10`,
    ).bind(...sessionScope.binds).all(),
    env.DB.prepare(
      `SELECT type, COALESCE(NULLIF(label, ''), NULLIF(target, ''), type) AS name, COUNT(*) AS n
         FROM events WHERE ${eventScope.sql} AND type IN ('click', 'download', 'copy', 'contact', 'outbound', 'custom')
        GROUP BY type, name ORDER BY n DESC LIMIT 15`,
    ).bind(...eventScope.binds).all(),
    env.DB.prepare(
      `SELECT CAST(ts / ? AS INTEGER) AS bucket, COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS sessions
         FROM visits WHERE ${visitScope.sql} GROUP BY bucket ORDER BY bucket ASC`,
    ).bind(...[options.bucketMs, ...visitScope.binds]).all(),
  ]);

  return {
    range: options.rangeKey,
    generatedAt: new Date().toISOString(),
    totals: {
      pageviews: pages?.pageviews ?? 0,
      visitors: pages?.visitors ?? 0,
      sessions: pages?.sessions ?? 0,
      avgSessionMs: sessions?.avg_duration_ms ?? 0,
      avgScroll: sessions?.avg_scroll ?? 0,
      bounceRate: sessions?.sessions ? Math.round((sessions.single_page ?? 0) / sessions.sessions * 100) : 0,
      interactions: sessions?.interactions ?? 0,
    },
    countries: countries.results ?? [],
    cities: cities.results ?? [],
    companies: companies.results ?? [],
    devices: devices.results ?? [],
    browsers: browsers.results ?? [],
    systems: systems.results ?? [],
    referrers: referrers.results ?? [],
    topPages: topPages.results ?? [],
    landingPages: landing.results ?? [],
    engagement: clicks.results ?? [],
    series: (series.results ?? []).map((row) => ({
      at: new Date(row.bucket * options.bucketMs).toISOString(),
      pageviews: row.pageviews,
      sessions: row.sessions,
    })),
  };
}

export async function listSessions(env, options) {
  const sessionScope = scope("sessions", "last_ts", options);
  const clauses = [sessionScope.sql];
  const binds = [...sessionScope.binds];
  if (options.search) {
    clauses.push("(instr(lower(COALESCE(city, '')), lower(?)) + instr(lower(COALESCE(country, '')), lower(?)) + instr(lower(COALESCE(company, '')), lower(?)) + instr(lower(COALESCE(net_org, '')), lower(?)) + instr(lower(COALESCE(ip, '')), lower(?)) + instr(lower(COALESCE(entry_path, '')), lower(?))) > 0");
    for (let i = 0; i < 6; i += 1) binds.push(options.search);
  }
  const where = clauses.join(" AND ");
  const [rows, total] = await Promise.all([
    env.DB.prepare(
      `SELECT session_id, visitor_hash, first_ts, last_ts, pageviews, event_count, max_scroll,
              duration_ms, country_code, country, region, city, asn, net_org, company,
              company_domain, is_hosting, is_vpn, is_proxy, is_tor, device_type, os, browser,
              language, referrer_host, entry_path, exit_path, ip, is_bot, is_owner
         FROM sessions WHERE ${where}
        ORDER BY last_ts DESC LIMIT ? OFFSET ?`,
    ).bind(...binds, options.limit, options.offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM sessions WHERE ${where}`).bind(...binds).first(),
  ]);
  return { total: total?.total ?? 0, sessions: rows.results ?? [] };
}

export async function sessionDetail(env, sessionId) {
  const [session, visits, events] = await Promise.all([
    env.DB.prepare("SELECT * FROM sessions WHERE session_id = ?").bind(sessionId).first(),
    env.DB.prepare("SELECT * FROM visits WHERE session_id = ? ORDER BY ts ASC LIMIT 200").bind(sessionId).all(),
    env.DB.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY ts ASC LIMIT 200").bind(sessionId).all(),
  ]);
  if (!session) return null;
  return { session, visits: visits.results ?? [], events: events.results ?? [] };
}

export async function liveVisitors(env, windowMs = 5 * 60 * 1000) {
  const rows = await env.DB.prepare(
    `SELECT session_id, city, country, country_code, company, net_org, device_type, browser, os,
            pageviews, max_scroll, duration_ms, entry_path, exit_path, referrer_host, ip,
            first_ts, last_ts, is_bot, is_owner
       FROM sessions WHERE last_ts >= ? ORDER BY last_ts DESC LIMIT 50`,
  ).bind(Date.now() - windowMs).all();
  return rows.results ?? [];
}

export async function visitorProfile(env, visitorHash) {
  const [visits, events, sessions] = await Promise.all([
    env.DB.prepare(
      "SELECT ts, path, city, country, company, net_org, device_type, browser, referrer_host FROM visits WHERE visitor_hash = ? ORDER BY ts DESC LIMIT 100",
    ).bind(visitorHash).all(),
    env.DB.prepare(
      "SELECT ts, type, path, label, target, value FROM events WHERE visitor_hash = ? ORDER BY ts DESC LIMIT 100",
    ).bind(visitorHash).all(),
    env.DB.prepare(
      "SELECT session_id, first_ts, last_ts, pageviews, duration_ms, max_scroll FROM sessions WHERE visitor_hash = ? ORDER BY last_ts DESC LIMIT 50",
    ).bind(visitorHash).all(),
  ]);
  return { visits: visits.results ?? [], events: events.results ?? [], sessions: sessions.results ?? [] };
}

export async function retentionSweep(env, days) {
  const cutoff = Date.now() - clampInt(days, 1, 3650, 180) * 24 * 60 * 60 * 1000;
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM visits WHERE ts < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM events WHERE ts < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM sessions WHERE last_ts < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM login_attempts WHERE ts < ?").bind(Date.now() - 7 * 24 * 60 * 60 * 1000),
  ]);
  return results.map((result) => result?.meta?.changes ?? 0);
}

export async function getPhoto(env) {
  return env.DB.prepare("SELECT path, sha, bytes, updated_at, history FROM profile_photo WHERE id = 1").first();
}

export async function setPhoto(env, { path, sha, bytes, previousHistory }) {
  const history = JSON.stringify(previousHistory || []).slice(0, 4000);
  await env.DB.prepare(
    `INSERT INTO profile_photo (id, path, sha, bytes, updated_at, history)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       path = excluded.path, sha = excluded.sha, bytes = excluded.bytes,
       updated_at = excluded.updated_at, history = excluded.history`,
  ).bind(path, sha, bytes, new Date().toISOString(), history).run();
}

export function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportSessions(env, options) {
  const rows = await listSessions(env, { ...options, limit: 5000, offset: 0 });
  const columns = [
    "first_seen", "last_seen", "duration_ms", "pageviews", "interactions", "max_scroll_pct",
    "country", "country_code", "region", "city", "company", "company_domain", "network_org",
    "asn", "vpn", "proxy", "tor", "hosting", "device", "os", "browser", "language",
    "referrer", "entry_path", "exit_path", "ip", "session_id",
  ];
  const lines = [columns.join(",")];
  rows.sessions.forEach((row) => {
    lines.push([
      new Date(row.first_ts).toISOString(), new Date(row.last_ts).toISOString(), row.duration_ms,
      row.pageviews, row.event_count, row.max_scroll, row.country, row.country_code, row.region,
      row.city, row.company, row.company_domain, row.net_org, row.asn, row.is_vpn, row.is_proxy,
      row.is_tor, row.is_hosting, row.device_type, row.os, row.browser, row.language,
      row.referrer_host, row.entry_path, row.exit_path, row.ip, row.session_id,
    ].map(csvCell).join(","));
  });
  return lines.join("\n");
}
