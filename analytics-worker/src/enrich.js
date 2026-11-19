/* Visitor enrichment: who they are, where they are, and what network they
 * arrived from.
 *
 * Two sources, with a deliberate split of responsibility:
 *
 *   request.cf  — Cloudflare's own geo, always available, no third party and
 *                 no API key. Trusted for country, city, coordinates and ASN.
 *   IPinfo      — the organisation and company behind the address, plus
 *                 VPN/proxy/Tor/hosting flags, which Cloudflare does not give
 *                 away on the free plan.
 *
 * IPinfo answers are cached for a day per address. A missing token, a rate
 * limit, or a slow lookup degrades to the Cloudflare data; it never fails the
 * beacon, and it never invents a value it does not have.
 */

import { cfGeo, clampInt, clampText } from "./http.js";

const IPINFO_TTL_SECONDS = 24 * 60 * 60;
const IPINFO_TIMEOUT_MS = 1500;

const BOT_PATTERN = new RegExp([
  "bot\\b", "\\bbots?/", "crawler", "spider", "slurp", "curl/", "wget", "python-requests",
  "python-urllib", "httpx", "axios/", "node-fetch", "go-http-client", "java/", "okhttp",
  "headlesschrome", "phantomjs", "puppeteer", "playwright", "lighthouse", "pagespeed",
  "gtmetrix", "pingdom", "uptime", "monitoring", "facebookexternalhit", "facebot",
  "twitterbot", "slackbot", "telegrambot", "whatsapp", "discordbot", "linkedinbot",
  "embedly", "quora link preview", "skypeuripreview", "applebot", "bingbot", "googlebot",
  "duckduckbot", "yandex", "baiduspider", "semrush", "ahrefs", "mj12bot", "dotbot",
  "petalbot", "bytespider", "gptbot", "claudebot", "ccbot", "perplexitybot", "scanner",
  "nuclei", "zgrab", "masscan", "censys",
].join("|"), "i");

/* Order matters: Edge and Opera both claim Chrome, and Edge claims Safari. */
const BROWSERS = [
  [/\bEdg(?:iOS|A|G)?\/([\d.]+)/, "Edge"],
  [/\bOPR\/([\d.]+)/, "Opera"],
  [/\bSamsungBrowser\/([\d.]+)/, "Samsung Internet"],
  [/\bFxiOS\/([\d.]+)/, "Firefox"],
  [/\bFirefox\/([\d.]+)/, "Firefox"],
  [/\bCriOS\/([\d.]+)/, "Chrome"],
  [/\bChrome\/([\d.]+)/, "Chrome"],
  [/\bVersion\/([\d.]+).*Safari/, "Safari"],
];

const SYSTEMS = [
  [/\bWindows NT 10\.0/, "Windows"],
  [/\bWindows/, "Windows"],
  [/\biPhone|iPad|iPod/, "iOS"],
  [/Mac OS X/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bAndroid\b/, "Android"],
  [/\bLinux\b/, "Linux"],
];

export function parseUserAgent(userAgent) {
  const ua = String(userAgent || "");
  const isBot = !ua || BOT_PATTERN.test(ua);

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua));
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua));

  let deviceType = "desktop";
  if (/\biPad\b|Tablet|PlayBook|Silk|\bNexus 7\b|\bNexus 10\b/i.test(ua)) deviceType = "tablet";
  else if (/\bMobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) deviceType = "mobile";
  if (isBot) deviceType = "bot";

  return {
    deviceType,
    os: system ? system[1] : null,
    browser: browser ? browser[1] : null,
    browserVersion: browser ? (ua.match(browser[0])?.[1] ?? null) : null,
    isBot,
  };
}

function parseLoc(loc) {
  const [latitude, longitude] = String(loc || "").split(",");
  const lat = Number.parseFloat(latitude);
  const lon = Number.parseFloat(longitude);
  return {
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
  };
}

function asnNumber(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  return digits ? clampInt(digits, 0, 4_294_967_295) : null;
}

export function shapeIpinfo(payload) {
  if (!payload || typeof payload !== "object") return {};
  const company = payload.company || {};
  const asn = payload.asn || {};
  const privacy = payload.privacy || {};
  const loc = parseLoc(payload.loc);
  const orgType = String(asn.type || company.type || "").toLowerCase();
  return {
    countryCode: clampText(payload.country, 4),
    country: clampText(payload.country_name, 64),
    region: clampText(payload.region, 64),
    city: clampText(payload.city, 64),
    postal: clampText(payload.postal, 16),
    latitude: loc.latitude,
    longitude: loc.longitude,
    timezone: clampText(payload.timezone, 48),
    netOrg: clampText(asn.name, 128) || clampText(payload.org, 128),
    asn: asnNumber(asn.asn) ?? asnNumber(payload.org),
    company: clampText(company.name, 128),
    companyDomain: clampText(company.domain, 128),
    isHosting: privacy.hosting === true || orgType === "hosting" ? 1 : 0,
    isVpn: privacy.vpn === true ? 1 : 0,
    isProxy: privacy.proxy === true ? 1 : 0,
    isTor: privacy.tor === true ? 1 : 0,
  };
}

async function cacheGet(key) {
  try {
    const hit = await caches.default.match(key);
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}

async function cachePut(key, value) {
  try {
    await caches.default.put(key, new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${IPINFO_TTL_SECONDS}` },
    }));
  } catch {
    /* cache is best-effort */
  }
}

export async function lookupIpinfo(env, ip, fetchFn = fetch) {
  if (!env.IPINFO_TOKEN || !ip) return null;
  const cacheKey = `https://ipinfo.internal/v1/${encodeURIComponent(ip)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPINFO_TIMEOUT_MS);
  try {
    const response = await fetchFn(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(env.IPINFO_TOKEN)}`, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "hassan-portfolio-analytics" },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const shaped = shapeIpinfo(payload);
    await cachePut(cacheKey, shaped);
    return shaped;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Cloudflare wins on coordinates (measured, not resolved) and IPinfo wins on
 * the organisation; each field falls back to the other source when missing. */
export function mergeEnrichment(cf, ipinfo) {
  const pick = (primary, fallback) => (primary === null || primary === undefined || primary === "" ? fallback : primary);
  return {
    countryCode: pick(cf.countryCode, ipinfo?.countryCode),
    country: pick(cf.country, ipinfo?.country),
    region: pick(cf.region, ipinfo?.region),
    city: pick(cf.city, ipinfo?.city),
    postal: pick(cf.postal, ipinfo?.postal),
    latitude: pick(cf.latitude, ipinfo?.latitude),
    longitude: pick(cf.longitude, ipinfo?.longitude),
    timezone: pick(cf.timezone, ipinfo?.timezone),
    continent: cf.continent ?? null,
    colo: cf.colo ?? null,
    asn: pick(cf.asn, ipinfo?.asn),
    netOrg: pick(ipinfo?.netOrg, cf.netOrg),
    company: ipinfo?.company ?? null,
    companyDomain: ipinfo?.companyDomain ?? null,
    isHosting: ipinfo?.isHosting ?? 0,
    isVpn: ipinfo?.isVpn ?? 0,
    isProxy: ipinfo?.isProxy ?? 0,
    isTor: ipinfo?.isTor ?? 0,
  };
}

export async function enrichVisitor(env, request, fetchFn = fetch) {
  const cf = cfGeo(request);
  const ip = request.headers.get("cf-connecting-ip") || "";
  const ipinfo = await lookupIpinfo(env, ip, fetchFn);
  return { ...mergeEnrichment(cf, ipinfo), ip };
}

export function isOwnerIp(env, ip) {
  return String(env.OWNER_IPS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(ip);
}
