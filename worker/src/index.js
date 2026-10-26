const ALLOWED_EVENTS = new Set(["repository", "push", "release", "public"]);
const ALLOWED_REPOSITORY_ACTIONS = new Set([
  "edited", "renamed", "publicized", "privatized", "archived", "unarchived", "deleted", "transferred",
]);
const SITE_REPOSITORY = "hassan200503/hassan200503.github.io";
const DEBOUNCE_MS = 30_000;
let pendingUntil = 0;

function hexToBytes(hex) {
  const bytes = new Uint8Array(32);
  let valid = typeof hex === "string" && hex.length === 64;
  for (let i = 0; i < 32; i += 1) {
    const pair = hex && hex.slice(i * 2, i * 2 + 2);
    const value = Number.parseInt(pair, 16);
    if (!/^[0-9a-f]{2}$/i.test(pair || "")) valid = false;
    bytes[i] = Number.isNaN(value) ? 0 : value;
  }
  return { bytes, valid };
}

export async function verifySignature(body, header, secret) {
  const supplied = typeof header === "string" && header.startsWith("sha256=")
    ? hexToBytes(header.slice(7))
    : { bytes: new Uint8Array(32), valid: false };
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected[i] ^ supplied.bytes[i];
  return supplied.valid && difference === 0;
}

export function acceptedEvent(eventName, payload) {
  if (!ALLOWED_EVENTS.has(eventName)) return false;
  if (eventName === "repository") return ALLOWED_REPOSITORY_ACTIONS.has(payload && payload.action);
  return true;
}

async function dispatchRefresh(env, fetchFn) {
  const response = await fetchFn(`https://api.github.com/repos/${SITE_REPOSITORY}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "hassan200503-portfolio-refresh",
    },
    body: JSON.stringify({ event_type: "refresh-github-data" }),
  });
  if (!response.ok) throw new Error(`dispatch failed: ${response.status}`);
}

export async function handleWebhook(request, env, ctx, options = {}) {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await request.text();
  if (!env.WEBHOOK_SECRET || !(await verifySignature(body, request.headers.get("x-hub-signature-256"), env.WEBHOOK_SECRET))) {
    return new Response("invalid signature", { status: 401 });
  }
  const eventName = request.headers.get("x-github-event") || "";
  let payload;
  try { payload = JSON.parse(body); } catch { return new Response("invalid JSON", { status: 400 }); }
  if (!acceptedEvent(eventName, payload)) return new Response("event ignored", { status: 202 });
  if (!env.GITHUB_DISPATCH_TOKEN) return new Response("worker is not configured", { status: 500 });

  const now = Date.now();
  if (now < pendingUntil) return Response.json({ accepted: true, debounced: true }, { status: 202 });
  pendingUntil = now + DEBOUNCE_MS;
  const fetchFn = options.fetchFn || fetch;
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const work = async () => {
    await delay(DEBOUNCE_MS);
    await dispatchRefresh(env, fetchFn);
  };
  const waitUntil = ctx && ctx.waitUntil ? ctx.waitUntil.bind(ctx) : (promise) => promise.catch(() => {});
  waitUntil(work());
  return Response.json({ accepted: true, debounced: false }, { status: 202 });
}

export function resetDebounceForTests() { pendingUntil = 0; }

export default {
  async fetch(request, env, ctx) { return handleWebhook(request, env, ctx); },
};
