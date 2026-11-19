/* Visitor measurement for hassan200503.github.io.
 *
 * Design rules, in order of importance:
 *
 *  1. It never gets in the way. Every entry point is wrapped so a failure in
 *     measurement can never surface as a page error, and nothing is sent
 *     before the page is usable.
 *  2. It stores nothing on the visitor's device. There is no cookie and no
 *     persistent identifier; the session id lives in sessionStorage and dies
 *     with the tab, and the identity used for "returning visitor" is derived
 *     server-side from the request itself.
 *  3. It respects an explicit refusal. Do Not Track, Global Privacy Control
 *     and an automated browser all switch it off completely.
 *
 * What it reports: one pageview per load, the interactions that say something
 * about intent (outbound links, downloads, email and phone, scroll depth,
 * dwell time), and a heartbeat while the tab is visible so the private
 * dashboard can show who is on the site right now.
 */
(function () {
  "use strict";

  /* The only line to change if the Worker is deployed under another name or
   * another workers.dev subdomain. Leaving it empty disables measurement. */
  var ENDPOINT = "https://hassan-portfolio-analytics.rentmanagerke.workers.dev/api/collect";

  var HEARTBEAT_MS = 20000;
  var SCROLL_STEPS = [25, 50, 75, 100];
  var MAX_LABEL = 80;
  var MAX_TARGET = 300;

  /* ------------------------------------------------------------ opt out */

  if (!ENDPOINT) return;
  try {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
    if (navigator.globalPrivacyControl === true) return;
    // A headless browser is testing, not reading.
    if (navigator.webdriver === true) return;
  } catch (error) {
    return;
  }

  /* ------------------------------------------------------- session id */

  var SESSION_KEY = "ht-session";
  var ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

  function randomId() {
    var bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    var text = "s" + Date.now().toString(36);
    for (var j = 0; j < bytes.length; j += 1) text += ("0" + bytes[j].toString(36)).slice(-2);
    return text;
  }

  function resolveSession() {
    try {
      var existing = window.sessionStorage.getItem(SESSION_KEY);
      if (existing && ID_PATTERN.test(existing)) return existing;
      var fresh = randomId();
      window.sessionStorage.setItem(SESSION_KEY, fresh);
      return fresh;
    } catch (error) {
      // Storage blocked: fall back to a per-load id so the visit is still
      // recorded, just without session continuity.
      return randomId();
    }
  }

  var SESSION = resolveSession();

  /* --------------------------------------------------------- transport */

  function post(payload) {
    var body;
    try {
      body = JSON.stringify(payload);
    } catch (error) {
      return;
    }
    if (typeof fetch === "function") {
      try {
        var pending = fetch(ENDPOINT, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: body
        });
        // A rejected promise here is expected whenever the network or the
        // Worker is unavailable; it must never reach the console.
        if (pending && pending.catch) pending.catch(function () {});
        return;
      } catch (error) {
        /* fall through to the beacon */
      }
    }
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      }
    } catch (error) {
      /* nothing left to try */
    }
  }

  /* ------------------------------------------------------------ context */

  function utm(name) {
    try {
      var value = new URLSearchParams(location.search).get(name);
      return value ? value.slice(0, 64) : "";
    } catch (error) {
      return "";
    }
  }

  function context() {
    var screenSize = [0, 0];
    var viewport = [0, 0];
    try {
      screenSize = [window.screen.width, window.screen.height];
      viewport = [window.innerWidth, window.innerHeight];
    } catch (error) {
      /* keep the zeros */
    }
    return {
      sessionId: SESSION,
      path: location.pathname,
      url: location.origin + location.pathname,
      title: (document.title || "").slice(0, 200),
      referrer: (document.referrer || "").slice(0, 300),
      language: navigator.language || "",
      screen: screenSize,
      viewport: viewport,
      utmSource: utm("utm_source"),
      utmMedium: utm("utm_medium"),
      utmCampaign: utm("utm_campaign")
    };
  }

  /* ---------------------------------------------------------- dwell time */

  var visibleSince = document.visibilityState === "hidden" ? 0 : Date.now();
  var accumulated = 0;

  function dwellMs() {
    return accumulated + (visibleSince ? Date.now() - visibleSince : 0);
  }

  /* ------------------------------------------------------------- scroll */

  var maxScroll = 0;
  var reported = {};

  function scrollPercent() {
    var root = document.documentElement;
    var total = Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (!total) return 0;
    var seen = (window.pageYOffset || root.scrollTop || 0) + (window.innerHeight || 0);
    return Math.min(100, Math.round((seen / total) * 100));
  }

  function readScroll() {
    var percent = scrollPercent();
    if (percent <= maxScroll) return;
    maxScroll = percent;
    for (var i = 0; i < SCROLL_STEPS.length; i += 1) {
      var step = SCROLL_STEPS[i];
      if (maxScroll >= step && !reported[step]) {
        reported[step] = true;
        report("scroll", { value: step, label: step + "% of the page" });
      }
    }
  }

  /* -------------------------------------------------------------- report */

  var finished = false;

  function report(type, detail) {
    if (finished && type !== "exit") return;
    var payload = context();
    var extra = detail || {};
    payload.kind = "event";
    payload.type = type;
    payload.label = String(extra.label || "").slice(0, MAX_LABEL);
    payload.target = String(extra.target || "").slice(0, MAX_TARGET);
    if (typeof extra.value === "number" && isFinite(extra.value)) payload.value = extra.value;
    payload.scroll = maxScroll;
    payload.duration = dwellMs();
    post(payload);
  }

  /* --------------------------------------------------------------- links */

  function describe(anchor) {
    var raw = anchor.getAttribute("href") || "";
    var text = String(anchor.getAttribute("data-track") || anchor.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (/^mailto:/i.test(raw)) return { type: "contact", label: text || "Email", target: raw };
    if (/^tel:/i.test(raw)) return { type: "contact", label: text || "Phone call", target: raw };
    if (anchor.hasAttribute("download") || /\.(pdf|zip|docx?|xlsx?|pptx?)$/i.test(raw)) {
      return { type: "download", label: text || raw, target: raw };
    }
    var url = anchor.href || raw;
    if (/^https?:/i.test(url)) {
      try {
        if (new URL(url, location.href).host !== location.host) {
          return { type: "outbound", label: text || "External link", target: url };
        }
      } catch (error) {
        /* treat as internal */
      }
    }
    return { type: "click", label: text || "Link", target: raw };
  }

  function closestLink(node) {
    while (node && node !== document) {
      if (node.tagName === "A" && node.hasAttribute("href")) return node;
      if (node.hasAttribute && node.hasAttribute("data-track")) return node;
      node = node.parentNode;
    }
    return null;
  }

  document.addEventListener("click", function (browserEvent) {
    var node = closestLink(browserEvent.target);
    if (!node) return;
    if (node.getAttribute("data-no-track") !== null) return;
    if (node.tagName === "A") {
      var detail = describe(node);
      report(detail.type, detail);
      return;
    }
    report(node.getAttribute("data-track-type") || "click", {
      label: node.getAttribute("data-track") || "",
      target: ""
    });
  }, true);

  document.addEventListener("copy", function () {
    report("copy", { label: "Copied page content" });
  });

  /* -------------------------------------------------------------- lifecycle */

  var scrollTimer = null;

  function scheduleScroll() {
    if (scrollTimer) return;
    scrollTimer = window.setTimeout(function () {
      scrollTimer = null;
      readScroll();
    }, 400);
  }

  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleScroll, { passive: true });

  try {
    window.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        accumulated += visibleSince ? Date.now() - visibleSince : 0;
        visibleSince = 0;
        readScroll();
      } else {
        visibleSince = Date.now();
        // Coming back to a tab still counts as being on the site.
        report("heartbeat", {});
      }
    }, true);
  } catch (error) {
    /* older browsers without visibilitychange simply skip heartbeats */
  }

  /* The one place the browser is leaving for good: this is the moment the
   * visit's true length is known, so it is worth one last small request. */
  window.addEventListener("pagehide", function () {
    if (finished) return;
    finished = true;
    readScroll();
    report("exit", { label: "Left the page", value: Math.round(dwellMs() / 1000) });
  });

  /* ------------------------------------------------------------- reporting */

  window.setInterval(function () {
    if (!document.hidden) report("heartbeat", {});
  }, HEARTBEAT_MS);

  function start() {
    var payload = context();
    payload.kind = "visit";
    post(payload);
    readScroll();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
