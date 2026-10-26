import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { acceptedEvent, handleWebhook, resetDebounceForTests, verifySignature } from "../src/index.js";

const secret = "fixture-webhook-secret";

async function signature(body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

beforeEach(() => resetDebounceForTests());

test("accepts a valid signature and rejects a modified body", async () => {
  const body = JSON.stringify({ action: "renamed" });
  const good = await signature(body);
  assert.equal(await verifySignature(body, good, secret), true);
  assert.equal(await verifySignature(`${body}x`, good, secret), false);
  assert.equal(await verifySignature(body, "sha256=bad", secret), false);
});

test("allowlist accepts required events and repository actions only", () => {
  assert.equal(acceptedEvent("push", {}), true);
  assert.equal(acceptedEvent("release", {}), true);
  assert.equal(acceptedEvent("public", {}), true);
  assert.equal(acceptedEvent("repository", { action: "renamed" }), true);
  assert.equal(acceptedEvent("repository", { action: "created" }), false);
  assert.equal(acceptedEvent("issues", { action: "opened" }), false);
});

test("unsigned, malformed, and ignored deliveries do not dispatch", async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; return new Response(null, { status: 204 }); };
  const env = { WEBHOOK_SECRET: secret, GITHUB_DISPATCH_TOKEN: "fixture-token" };
  const unsigned = await handleWebhook(new Request("https://worker.test", { method: "POST", body: "{}" }), env, { waitUntil() {} }, { fetchFn, delay: async () => {} });
  assert.equal(unsigned.status, 401);
  const ignoredBody = JSON.stringify({ action: "opened" });
  const ignored = await handleWebhook(new Request("https://worker.test", { method: "POST", body: ignoredBody, headers: { "x-hub-signature-256": await signature(ignoredBody), "x-github-event": "issues" } }), env, { waitUntil() {} }, { fetchFn, delay: async () => {} });
  assert.equal(ignored.status, 202);
  assert.equal(calls, 0);
});

test("valid delivery coalesces a burst and dispatches once", async () => {
  let calls = 0;
  let scheduled;
  const fetchFn = async () => { calls += 1; return new Response(null, { status: 204 }); };
  const ctx = { waitUntil(promise) { scheduled = promise; } };
  const env = { WEBHOOK_SECRET: secret, GITHUB_DISPATCH_TOKEN: "fixture-token" };
  const body = JSON.stringify({ action: "edited" });
  const request = () => new Request("https://worker.test", { method: "POST", body, headers: { "x-hub-signature-256": "", "x-github-event": "repository" } });
  const signed = await signature(body);
  const first = await handleWebhook(new Request("https://worker.test", { method: "POST", body, headers: { "x-hub-signature-256": signed, "x-github-event": "repository" } }), env, ctx, { fetchFn });
  const second = await handleWebhook(new Request("https://worker.test", { method: "POST", body, headers: { "x-hub-signature-256": signed, "x-github-event": "repository" } }), env, ctx, { fetchFn });
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(JSON.parse(await second.text()).debounced, true);
  await scheduled;
  assert.equal(calls, 1);
});
