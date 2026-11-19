/* The private dashboard: one HTML shell plus a same-origin stylesheet and
 * script, so the Content-Security-Policy can forbid inline code entirely.
 *
 * It is served only behind a verified session cookie and is never linked to
 * from the public site, so it is invisible to crawlers and to anyone without
 * the passphrase.
 */

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow, noarchive" />
<meta name="referrer" content="no-referrer" />
<title>Visitor analytics · private</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230b0c0d'/%3E%3Cpath d='M8 22V13M14 22V9M20 22v-6M26 22V11' stroke='%23e2b34a' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E" />
<link rel="stylesheet" href="/admin/app.css" />
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>

<header class="topbar">
  <div class="brand">
    <span class="mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="26" height="26"><path d="M6 24V13M12 24V8M18 24v-7M24 24V11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
    </span>
    <span class="brand-text"><strong>Visitor analytics</strong><span class="faint">hassan200503.github.io</span></span>
  </div>
  <div class="topbar-tools">
    <div class="segmented" role="group" aria-label="Time range">
      <button type="button" data-range="1h">1h</button>
      <button type="button" data-range="24h" class="is-on">24h</button>
      <button type="button" data-range="7d">7d</button>
      <button type="button" data-range="30d">30d</button>
      <button type="button" data-range="all">All</button>
    </div>
    <label class="toggle"><input type="checkbox" id="include-bots" /> <span>Bots</span></label>
    <label class="toggle"><input type="checkbox" id="include-owner" /> <span>My visits</span></label>
    <span class="pulse" id="pulse" title="Auto-refresh status"><i></i><span id="pulse-text">Live</span></span>
    <button type="button" class="btn" id="refresh">Refresh</button>
    <button type="button" class="btn btn-quiet" id="logout">Sign out</button>
  </div>
</header>

<nav class="tabs" aria-label="Sections">
  <button type="button" data-tab="overview" class="is-on">Overview</button>
  <button type="button" data-tab="visitors">Visitors</button>
  <button type="button" data-tab="photo">Profile photo</button>
</nav>

<main id="main">
  <p class="banner" id="banner" hidden></p>

  <section id="panel-overview" class="panel">
    <div class="kpis" id="kpis"></div>

    <div class="cols">
      <article class="card span-2">
        <header class="card-head">
          <h2>Traffic</h2>
          <span class="faint small" id="chart-note"></span>
        </header>
        <div class="chart" id="chart"><p class="faint">No visits recorded in this range yet.</p></div>
      </article>
      <article class="card">
        <header class="card-head"><h2>Live now</h2><span class="faint small">last 5 minutes</span></header>
        <ul class="live" id="live"><li class="faint">Waiting for data…</li></ul>
      </article>
    </div>

    <div class="cols" id="breakdowns"></div>

    <article class="card">
      <header class="card-head"><h2>What people did</h2><span class="faint small">clicks, downloads, copies</span></header>
      <div id="engagement" class="rank-list"></div>
    </article>
  </section>

  <section id="panel-visitors" class="panel" hidden>
    <article class="card">
      <header class="card-head">
        <h2>Visitor sessions</h2>
        <div class="card-tools">
          <input type="search" id="search" placeholder="Filter by city, country, company, network or IP" aria-label="Filter sessions" />
          <button type="button" class="btn btn-quiet" id="export">Export CSV</button>
        </div>
      </header>
      <p class="faint small" id="visitor-count"></p>
      <div class="table-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th scope="col">When</th><th scope="col">Location</th><th scope="col">Company / network</th>
              <th scope="col">Device</th><th scope="col">Pages</th><th scope="col">Time</th>
              <th scope="col">Scroll</th><th scope="col">Arrived from</th>
            </tr>
          </thead>
          <tbody id="visitors"></tbody>
        </table>
      </div>
      <div class="pager">
        <button type="button" class="btn btn-quiet" id="prev">Previous</button>
        <span class="faint small" id="pageinfo"></span>
        <button type="button" class="btn btn-quiet" id="next">Next</button>
      </div>
    </article>
  </section>

  <section id="panel-photo" class="panel" hidden>
    <div class="cols">
      <article class="card">
        <header class="card-head"><h2>Published photo</h2><span class="faint small" id="photo-when"></span></header>
        <div class="photo-frame"><img id="photo-current" alt="The profile photo currently published on the website" /></div>
        <p class="faint small" id="photo-meta"></p>
        <p class="small">This is the image shown in the hero and the quotation card at <span class="mono">hassan200503.github.io</span>. A change is committed to the site repository and the Pages build is triggered, so it appears live within about a minute.</p>
      </article>
      <article class="card">
        <header class="card-head"><h2>Replace it</h2><span class="faint small">JPEG · auto-cropped square</span></header>
        <div class="uploader" id="drop">
          <input type="file" id="file" accept="image/*" hidden />
          <p><strong>Drop an image here</strong><span class="faint small">or choose a file — it is cropped to a centred square and resized to 1200 px in your browser before upload</span></p>
          <button type="button" class="btn" id="pick">Choose image</button>
        </div>
        <div class="crop-preview" id="crop-preview" hidden>
          <div class="photo-frame"><img id="photo-preview" alt="Preview of the new profile photo" /></div>
          <div class="row">
            <button type="button" class="btn btn-primary" id="publish">Publish to the website</button>
            <button type="button" class="btn btn-quiet" id="cancel">Cancel</button>
          </div>
          <p class="faint small" id="publish-status"></p>
        </div>
      </article>
    </div>
  </section>
</main>

<div class="drawer" id="drawer" hidden>
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <header class="drawer-head">
      <h2 id="drawer-title">Session</h2>
      <button type="button" class="btn btn-quiet" id="drawer-close">Close</button>
    </header>
    <div class="drawer-body" id="drawer-body"></div>
  </div>
</div>

<footer class="foot">
  <span>Private analytics for <span class="mono">hassan200503.github.io</span>. Events are stored in your own Cloudflare D1 database and swept after the retention window.</span>
</footer>

<script src="/admin/app.js"></script>
</body>
</html>
`;

export const DASHBOARD_CSS = `:root {
  --bg: #0b0c0d;
  --bg-soft: #111316;
  --card: rgba(255,255,255,0.028);
  --line: rgba(255,255,255,0.085);
  --line-soft: rgba(255,255,255,0.05);
  --ink: #eceff1;
  --ink-dim: #a8b0b6;
  --ink-faint: #6d767c;
  --gold: #e2b34a;
  --teal: #46c2b3;
  --rose: #e0785f;
  --violet: #9b8cf0;
  --radius: 14px;
  --ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --display: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--ui); font-size: 15px; line-height: 1.5; }
body { min-height: 100vh; background-image: radial-gradient(1100px 520px at 12% -8%, rgba(226,179,74,0.10), transparent 62%), radial-gradient(900px 480px at 96% 4%, rgba(70,194,179,0.075), transparent 60%); background-attachment: fixed; }
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.faint { color: var(--ink-faint); }
.small { font-size: 0.82rem; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 12px; top: 12px; z-index: 20; background: var(--gold); color: #111; padding: 8px 12px; border-radius: 8px; }
:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.topbar { position: sticky; top: 0; z-index: 12; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; padding: 14px clamp(16px, 3vw, 34px); background: rgba(11,12,13,0.82); backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 12px; }
.brand .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(150deg, rgba(226,179,74,0.22), rgba(226,179,74,0.04)); color: var(--gold); border: 1px solid rgba(226,179,74,0.28); }
.brand-text { display: flex; flex-direction: column; line-height: 1.25; }
.brand-text strong { font-family: var(--display); font-size: 1.16rem; font-weight: 600; letter-spacing: 0.01em; }
.brand-text .faint { font-family: var(--mono); font-size: 0.74rem; }
.topbar-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

.segmented { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-soft); }
.segmented button { appearance: none; border: 0; background: transparent; color: var(--ink-dim); font: inherit; font-size: 0.82rem; padding: 6px 11px; border-radius: 7px; cursor: pointer; }
.segmented button.is-on { background: rgba(255,255,255,0.1); color: var(--ink); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
.toggle { display: inline-flex; align-items: center; gap: 7px; font-size: 0.82rem; color: var(--ink-dim); cursor: pointer; }
.toggle input { accent-color: var(--gold); }
.pulse { display: inline-flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 0.74rem; color: var(--ink-faint); }
.pulse i { width: 8px; height: 8px; border-radius: 50%; background: var(--teal); box-shadow: 0 0 0 0 rgba(70,194,179,0.6); animation: ping 2.4s infinite; }
@keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(70,194,179,0.5); } 70% { box-shadow: 0 0 0 9px rgba(70,194,179,0); } 100% { box-shadow: 0 0 0 0 rgba(70,194,179,0); } }
@media (prefers-reduced-motion: reduce) { .pulse i { animation: none; } }

.btn { appearance: none; border: 1px solid var(--line); background: rgba(255,255,255,0.05); color: var(--ink); font: inherit; font-size: 0.83rem; padding: 7px 13px; border-radius: 9px; cursor: pointer; transition: background 0.16s ease, border-color 0.16s ease; }
.btn:hover { background: rgba(255,255,255,0.09); }
.btn-primary { background: linear-gradient(160deg, #f0c766, #d9a534); border-color: rgba(226,179,74,0.5); color: #1a1405; font-weight: 600; }
.btn-primary:hover { background: linear-gradient(160deg, #f6d27b, #e0ac3a); }
.btn-quiet { background: transparent; color: var(--ink-dim); }

.tabs { display: flex; gap: 4px; padding: 12px clamp(16px, 3vw, 34px) 0; }
.tabs button { appearance: none; border: 1px solid transparent; background: transparent; color: var(--ink-faint); font: inherit; font-size: 0.88rem; padding: 8px 14px; border-radius: 9px; cursor: pointer; }
.tabs button.is-on { color: var(--ink); background: var(--card); border-color: var(--line); }

main { padding: clamp(16px, 2.4vw, 28px) clamp(16px, 3vw, 34px) 48px; display: flex; flex-direction: column; gap: 18px; }
.banner { margin: 0; padding: 11px 14px; border-radius: 10px; background: rgba(224,120,95,0.13); border: 1px solid rgba(224,120,95,0.4); color: #f3bfae; font-size: 0.86rem; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 12px; }
.kpi { padding: 16px 16px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)); }
.kpi .label { display: block; font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.11em; text-transform: uppercase; color: var(--ink-faint); }
.kpi .value { display: block; margin-top: 7px; font-family: var(--display); font-size: 2.05rem; line-height: 1.05; letter-spacing: -0.01em; }
.kpi .sub { display: block; margin-top: 5px; font-size: 0.78rem; color: var(--ink-faint); }

.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: 16px 18px; min-width: 0; }
.card.span-2 { grid-column: span 2; }
@media (max-width: 900px) { .card.span-2 { grid-column: span 1; } }
.card-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.card-head h2 { margin: 0; font-family: var(--display); font-size: 1.12rem; font-weight: 600; }
.card-tools { display: flex; gap: 8px; align-items: center; }
.card-tools input { font: inherit; font-size: 0.83rem; color: var(--ink); background: var(--bg-soft); border: 1px solid var(--line); border-radius: 9px; padding: 7px 11px; min-width: 250px; }

.chart svg { display: block; width: 100%; height: auto; }
.rank-list { display: flex; flex-direction: column; gap: 9px; }
.rank { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: baseline; }
.rank .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem; }
.rank .n { font-family: var(--mono); font-size: 0.78rem; color: var(--ink-dim); }
.rank .bar { grid-column: 1 / -1; height: 4px; border-radius: 4px; background: rgba(255,255,255,0.07); overflow: hidden; }
.rank .bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, rgba(226,179,74,0.85), rgba(226,179,74,0.4)); }
.empty { color: var(--ink-faint); font-size: 0.85rem; margin: 0; }

.live { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 268px; overflow: auto; }
.live li { display: flex; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line-soft); font-size: 0.85rem; }
.live li:last-child { border-bottom: 0; }
.live .who { min-width: 0; flex: 1; }
.live .who b { display: block; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.live .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--teal); flex: none; }

.table-wrap { overflow-x: auto; }
table.grid { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
table.grid th { text-align: left; font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); font-weight: 500; padding: 0 12px 9px 0; border-bottom: 1px solid var(--line); }
table.grid td { padding: 11px 12px 11px 0; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
table.grid tbody tr { cursor: pointer; }
table.grid tbody tr:hover { background: rgba(255,255,255,0.035); }
table.grid tbody tr:last-child td { border-bottom: 0; }
.cell-strong { display: block; }
.cell-sub { display: block; font-size: 0.76rem; color: var(--ink-faint); }
.tag { display: inline-block; font-family: var(--mono); font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; border: 1px solid var(--line); color: var(--ink-dim); }
.tag.warn { border-color: rgba(224,120,95,0.45); color: #eaa48e; }
.tag.cool { border-color: rgba(70,194,179,0.4); color: #8eddd1; }
.pager { display: flex; gap: 12px; align-items: center; justify-content: flex-end; margin-top: 14px; }

.photo-frame { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg-soft); max-width: 320px; }
.photo-frame img { display: block; width: 100%; height: auto; aspect-ratio: 1 / 1; object-fit: cover; }
.uploader { border: 1px dashed var(--line); border-radius: 12px; padding: 22px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.uploader p { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.uploader.is-over { border-color: var(--gold); background: rgba(226,179,74,0.06); }
.crop-preview { display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; gap: 10px; flex-wrap: wrap; }

.drawer { position: fixed; inset: 0; background: rgba(4,5,6,0.62); backdrop-filter: blur(3px); display: flex; justify-content: flex-end; z-index: 30; }
.drawer-panel { width: min(680px, 96vw); height: 100%; background: var(--bg-soft); border-left: 1px solid var(--line); display: flex; flex-direction: column; }
.drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--line); }
.drawer-head h2 { margin: 0; font-family: var(--display); font-size: 1.1rem; }
.drawer-body { padding: 18px; overflow: auto; display: flex; flex-direction: column; gap: 18px; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.fact { border: 1px solid var(--line-soft); border-radius: 10px; padding: 10px 12px; }
.fact dt { font-family: var(--mono); font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); }
.fact dd { margin: 5px 0 0; font-size: 0.9rem; }
.timeline { list-style: none; margin: 0; padding: 0 0 0 16px; border-left: 1px solid var(--line); }
.timeline li { position: relative; padding: 0 0 14px 16px; font-size: 0.87rem; }
.timeline li::before { content: ""; position: absolute; left: -21px; top: 6px; width: 9px; height: 9px; border-radius: 50%; background: var(--ink-faint); border: 2px solid var(--bg-soft); }
.timeline li.page::before { background: var(--gold); }
.timeline li.click::before { background: var(--teal); }
.timeline li.exit::before { background: var(--violet); }
.timeline time { font-family: var(--mono); font-size: 0.74rem; color: var(--ink-faint); margin-left: 8px; }

.foot { padding: 22px clamp(16px, 3vw, 34px) 40px; color: var(--ink-faint); font-size: 0.78rem; border-top: 1px solid var(--line-soft); }

.auth { display: grid; place-items: center; min-height: 100vh; padding: 24px; }
.auth-card { width: min(420px, 100%); border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012)); padding: 30px 28px 26px; display: flex; flex-direction: column; gap: 14px; }
.auth-card .mark { display: grid; place-items: center; width: 50px; height: 50px; border-radius: 14px; background: linear-gradient(150deg, rgba(226,179,74,0.22), rgba(226,179,74,0.04)); color: var(--gold); border: 1px solid rgba(226,179,74,0.28); }
.auth-card h1 { margin: 4px 0 0; font-family: var(--display); font-size: 1.62rem; font-weight: 600; letter-spacing: -0.01em; }
.auth-card p { margin: 0; }
.auth-card form { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
.auth-card label { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.11em; text-transform: uppercase; color: var(--ink-faint); }
.auth-card input { font: inherit; font-size: 1rem; color: var(--ink); background: var(--bg-soft); border: 1px solid var(--line); border-radius: 10px; padding: 11px 13px; letter-spacing: 0.06em; }
.auth-card input:focus { border-color: rgba(226,179,74,0.5); outline: none; }
.auth-card .btn { justify-content: center; padding: 11px 16px; }
.auth-foot { margin-top: 4px; font-size: 0.76rem; }
`;

export const DASHBOARD_JS = `"use strict";
(function () {
  var state = { range: "24h", bots: false, owner: false, tab: "overview", q: "", page: 0, pageSize: 25, total: 0, timer: null };
  var $ = function (id) { return document.getElementById(id); };

  function api(path, options) {
    return fetch(path, Object.assign({ credentials: "same-origin", headers: { "x-ht-admin": "1" } }, options || {}))
      .then(function (response) {
        if (response.status === 401) { window.location.reload(); throw new Error("unauthenticated"); }
        if (!response.ok) return response.json().then(function (body) { throw new Error(body.error || ("HTTP " + response.status)); });
        return response.json();
      });
  }

  function banner(message) {
    var el = $("banner");
    if (!message) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = message;
  }

  function text(node, value) { node.textContent = value === null || value === undefined ? "" : String(value); }

  function flag(code) {
    if (!code || code.length !== 2) return "";
    return String.fromCodePoint.apply(null, code.toUpperCase().split("").map(function (c) { return 127397 + c.charCodeAt(0); }));
  }

  function location(row) {
    var bits = [row.city, row.region, row.country].filter(Boolean);
    return bits.length ? bits.join(", ") : "Unknown location";
  }

  function duration(ms) {
    var s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m " + (s % 60) + "s";
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }

  function when(ts) {
    var d = new Date(ts);
    var diff = Math.round((Date.now() - ts) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.round(diff / 60) + "m ago";
    if (diff < 86400) return Math.round(diff / 3600) + "h ago";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function clock(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

  function rankList(host, rows, options) {
    host.innerHTML = "";
    var items = (rows || []).filter(function (row) { return options.keepEmpty || row.n; });
    if (!items.length) {
      var p = document.createElement("p");
      p.className = "empty";
      p.textContent = options.empty || "Nothing recorded yet in this range.";
      host.appendChild(p);
      return;
    }
    var max = items.reduce(function (m, row) { return Math.max(m, row.n || 0); }, 1);
    items.slice(0, options.limit || 10).forEach(function (row) {
      var wrap = document.createElement("div");
      wrap.className = "rank";
      var name = document.createElement("span");
      name.className = "name";
      text(name, options.label ? options.label(row) : row.name);
      var n = document.createElement("span");
      n.className = "n";
      text(n, options.value ? options.value(row) : String(row.n));
      var bar = document.createElement("span");
      bar.className = "bar";
      var fill = document.createElement("i");
      fill.style.width = Math.max(3, Math.round((row.n || 0) / max * 100)) + "%";
      bar.appendChild(fill);
      wrap.appendChild(name); wrap.appendChild(n); wrap.appendChild(bar);
      host.appendChild(wrap);
    });
  }

  function breakdownCard(title, note) {
    var card = document.createElement("article");
    card.className = "card";
    var head = document.createElement("header");
    head.className = "card-head";
    var h = document.createElement("h2");
    h.textContent = title;
    var span = document.createElement("span");
    span.className = "faint small";
    span.textContent = note;
    head.appendChild(h); head.appendChild(span);
    var body = document.createElement("div");
    body.className = "rank-list";
    card.appendChild(head); card.appendChild(body);
    return { card: card, body: body };
  }

  function renderKpis(data) {
    var host = $("kpis");
    host.innerHTML = "";
    var t = data.totals;
    [
      ["Visitors", t.visitors, "distinct people", null],
      ["Pageviews", t.pageviews, "across " + t.sessions + " sessions", null],
      ["Avg. time", duration(t.avgSessionMs), "per session", null],
      ["Avg. scroll", t.avgScroll + "%", "of the page", null],
      ["Bounce rate", t.bounceRate + "%", "single-page sessions", t.bounceRate > 65 ? "warn" : null],
      ["Interactions", t.interactions, "clicks and events", null]
    ].forEach(function (row) {
      var card = document.createElement("div");
      card.className = "kpi";
      var label = document.createElement("span");
      label.className = "label";
      label.textContent = row[0];
      var value = document.createElement("span");
      value.className = "value";
      text(value, typeof row[1] === "number" ? row[1].toLocaleString() : row[1]);
      var sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = row[2];
      card.appendChild(label); card.appendChild(value); card.appendChild(sub);
      host.appendChild(card);
    });
  }

  function renderChart(series) {
    var host = $("chart");
    host.innerHTML = "";
    if (!series || series.length < 2) {
      var p = document.createElement("p");
      p.className = "faint";
      p.textContent = "Not enough data yet for a trend line.";
      host.appendChild(p);
      $("chart-note").textContent = "";
      return;
    }
    var w = 1000, h = 260, pad = 30;
    var max = series.reduce(function (m, row) { return Math.max(m, row.pageviews); }, 1);
    var step = (w - pad * 2) / (series.length - 1);
    var points = series.map(function (row, index) {
      return [pad + index * step, h - pad - (row.pageviews / max) * (h - pad * 2)];
    });
    var line = points.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = line + " L" + points[points.length - 1][0].toFixed(1) + " " + (h - pad) + " L" + points[0][0].toFixed(1) + " " + (h - pad) + " Z";
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Pageviews over time, peaking at " + max);
    var defs = document.createElementNS(ns, "defs");
    var grad = document.createElementNS(ns, "linearGradient");
    grad.setAttribute("id", "fill");
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
    var stop1 = document.createElementNS(ns, "stop");
    stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", "#e2b34a"); stop1.setAttribute("stop-opacity", "0.34");
    var stop2 = document.createElementNS(ns, "stop");
    stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", "#e2b34a"); stop2.setAttribute("stop-opacity", "0");
    grad.appendChild(stop1); grad.appendChild(stop2); defs.appendChild(grad); svg.appendChild(defs);
    for (var g = 0; g <= 3; g += 1) {
      var y = pad + ((h - pad * 2) / 3) * g;
      var grid = document.createElementNS(ns, "line");
      grid.setAttribute("x1", pad); grid.setAttribute("x2", w - pad);
      grid.setAttribute("y1", y); grid.setAttribute("y2", y);
      grid.setAttribute("stroke", "rgba(255,255,255,0.07)");
      svg.appendChild(grid);
    }
    var areaPath = document.createElementNS(ns, "path");
    areaPath.setAttribute("d", area); areaPath.setAttribute("fill", "url(#fill)");
    var linePath = document.createElementNS(ns, "path");
    linePath.setAttribute("d", line);
    linePath.setAttribute("fill", "none");
    linePath.setAttribute("stroke", "#e2b34a");
    linePath.setAttribute("stroke-width", "2");
    linePath.setAttribute("stroke-linejoin", "round");
    svg.appendChild(areaPath); svg.appendChild(linePath);
    points.forEach(function (p, index) {
      var dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", p[0]); dot.setAttribute("cy", p[1]); dot.setAttribute("r", series.length > 40 ? 1.6 : 3);
      dot.setAttribute("fill", "#0b0c0d"); dot.setAttribute("stroke", "#e2b34a"); dot.setAttribute("stroke-width", "1.6");
      var title = document.createElementNS(ns, "title");
      title.textContent = new Date(series[index].at).toLocaleString() + " · " + series[index].pageviews + " pageviews";
      dot.appendChild(title);
      svg.appendChild(dot);
    });
    var first = document.createElementNS(ns, "text");
    first.setAttribute("x", pad); first.setAttribute("y", h - 8);
    first.setAttribute("fill", "rgba(255,255,255,0.34)"); first.setAttribute("font-size", "15");
    first.textContent = new Date(series[0].at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    var last = first.cloneNode(true);
    last.setAttribute("x", w - pad); last.setAttribute("text-anchor", "end");
    last.textContent = new Date(series[series.length - 1].at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    svg.appendChild(first); svg.appendChild(last);
    host.appendChild(svg);
    var pv = series.reduce(function (s, row) { return s + row.pageviews; }, 0);
    $("chart-note").textContent = pv.toLocaleString() + " pageviews · peak " + max + " per bucket";
  }

  function renderBreakdowns(data) {
    var host = $("breakdowns");
    host.innerHTML = "";
    var specs = [
      ["Countries", data.countries, { label: function (r) { return flag(r.code) + "  " + (r.name || r.code); }, value: function (r) { return r.n + " · " + r.visitors + " " + (r.visitors === 1 ? "visitor" : "visitors"); } }],
      ["Cities", data.cities, { label: function (r) { return r.city + (r.country ? ", " + r.country : ""); } }],
      ["Company / network", data.companies, { label: function (r) { return r.name + (r.domain ? " · " + r.domain : ""); }, value: function (r) { return r.visitors + " " + (r.visitors === 1 ? "visitor" : "visitors"); } }],
      ["Referrers", data.referrers, {}],
      ["Pages", data.topPages, { label: function (r) { return r.path; }, value: function (r) { return r.n + " views"; } }],
      ["Landing pages", data.landingPages, { label: function (r) { return r.path || "(unknown)"; } }],
      ["Devices", data.devices, {}],
      ["Browsers", data.browsers, {}],
      ["Operating systems", data.systems, {}]
    ];
    specs.forEach(function (spec) {
      var card = breakdownCard(spec[0], spec[1] && spec[1].length ? spec[1].length + " entries" : "");
      rankList(card.body, spec[1], spec[2]);
      host.appendChild(card.card);
    });
  }

  function renderEngagement(rows) {
    rankList($("engagement"), rows, {
      empty: "No clicks, downloads or copies recorded in this range.",
      label: function (r) { return r.name + "  (" + r.type + ")"; }
    });
  }

  function renderLive(rows) {
    var host = $("live");
    host.innerHTML = "";
    if (!rows.length) {
      var li = document.createElement("li");
      li.className = "faint";
      li.textContent = "Nobody on the site right now.";
      host.appendChild(li);
      return;
    }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      var dot = document.createElement("span");
      dot.className = "dot";
      var who = document.createElement("span");
      who.className = "who";
      var b = document.createElement("b");
      b.textContent = flag(row.country_code) + " " + location(row);
      var sub = document.createElement("span");
      sub.className = "faint small";
      sub.textContent = [row.company || row.net_org || "Unknown network", row.device_type, row.browser, row.pageviews + (row.pageviews === 1 ? " page" : " pages"), "seen " + when(row.last_ts)].filter(Boolean).join(" · ");
      who.appendChild(b); who.appendChild(sub);
      li.appendChild(dot); li.appendChild(who);
      li.dataset.session = row.session_id;
      li.style.cursor = "pointer";
      li.addEventListener("click", function () { openSession(row.session_id); });
      host.appendChild(li);
    });
  }

  var breakdownCache = {};

  function renderVisitors(payload) {
    state.total = payload.total;
    var body = $("visitors");
    body.innerHTML = "";
    if (!payload.sessions.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 8; td.className = "faint";
      td.textContent = "No sessions match this range and filter.";
      tr.appendChild(td); body.appendChild(tr);
    }
    payload.sessions.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.dataset.session = row.session_id;
      var cells = [];
      cells.push([when(row.last_ts), clock(row.first_ts) + " – " + clock(row.last_ts)]);
      cells.push([flag(row.country_code) + " " + location(row), row.ip || ""]);
      cells.push([row.company || row.net_org || "—", row.company ? (row.company_domain || "") : (row.asn ? "AS" + row.asn : "")]);
      cells.push([row.device_type || "—", [row.os, row.browser].filter(Boolean).join(" · ")]);
      cells.push([String(row.pageviews), "entry " + (row.entry_path || "—")]);
      cells.push([duration(row.duration_ms), row.event_count + " events"]);
      cells.push([row.max_scroll + "%", row.is_owner ? "owner" : (row.is_bot ? "bot" : "")]);
      cells.push([row.referrer_host || "Direct", row.exit_path ? "left on " + row.exit_path : ""]);
      cells.forEach(function (cell, index) {
        var td = document.createElement("td");
        var strong = document.createElement("span");
        strong.className = index === 2 ? "cell-strong" : "cell-strong";
        text(strong, cell[0]);
        td.appendChild(strong);
        if (cell[1]) {
          var sub = document.createElement("span");
          sub.className = "cell-sub";
          text(sub, cell[1]);
          td.appendChild(sub);
        }
        if (index === 7 && [row.is_vpn, row.is_proxy, row.is_tor, row.is_hosting].some(Boolean)) {
          var tag = document.createElement("span");
          tag.className = "tag warn";
          tag.textContent = [row.is_vpn ? "VPN" : "", row.is_proxy ? "proxy" : "", row.is_tor ? "Tor" : "", row.is_hosting ? "datacentre" : ""].filter(Boolean).join(" · ");
          td.appendChild(tag);
        }
        tr.appendChild(td);
      });
      tr.addEventListener("click", function () { openSession(row.session_id); });
      body.appendChild(tr);
    });
    $("visitor-count").textContent = payload.total + " sessions in range" + (state.q ? " matching “" + state.q + "”" : "");
    var pages = Math.max(1, Math.ceil(payload.total / state.pageSize));
    $("pageinfo").textContent = "Page " + (state.page + 1) + " of " + pages;
    $("prev").disabled = state.page === 0;
    $("next").disabled = state.page >= pages - 1;
  }

  function fact(dt, dd) {
    var wrap = document.createElement("div");
    wrap.className = "fact";
    var t = document.createElement("dt");
    t.textContent = dt;
    var d = document.createElement("dd");
    text(d, dd || "—");
    wrap.appendChild(t); wrap.appendChild(d);
    return wrap;
  }

  function openSession(sessionId) {
    var drawer = $("drawer");
    var body = $("drawer-body");
    body.innerHTML = "";
    drawer.hidden = false;
    var p = document.createElement("p");
    p.className = "faint";
    p.textContent = "Loading session…";
    body.appendChild(p);
    api("/api/admin/session?id=" + encodeURIComponent(sessionId)).then(function (data) {
      body.innerHTML = "";
      var s = data.session;
      var facts = document.createElement("dl");
      facts.className = "facts";
      facts.appendChild(fact("Location", [s.city, s.region, s.country].filter(Boolean).join(", ")));
      facts.appendChild(fact("Company", s.company ? s.company + (s.company_domain ? " (" + s.company_domain + ")" : "") : "—"));
      facts.appendChild(fact("Network", s.net_org ? s.net_org + (s.asn ? " · AS" + s.asn : "") : "—"));
      facts.appendChild(fact("IP address", s.ip));
      facts.appendChild(fact("Device", [s.device_type, s.os, s.browser].filter(Boolean).join(" · ")));
      facts.appendChild(fact("Language", s.language));
      facts.appendChild(fact("Sessions pages", s.pageviews + " pages · " + s.event_count + " events"));
      facts.appendChild(fact("Time on site", duration(s.duration_ms) + " · " + s.max_scroll + "% scroll"));
      facts.appendChild(fact("Arrived from", s.referrer_host || "Direct"));
      facts.appendChild(fact("First seen", new Date(s.first_ts).toLocaleString()));
      if (s.is_vpn || s.is_proxy || s.is_tor || s.is_hosting) {
        facts.appendChild(fact("Network flags", [s.is_vpn ? "VPN" : "", s.is_proxy ? "proxy" : "", s.is_tor ? "Tor" : "", s.is_hosting ? "datacentre" : ""].filter(Boolean).join(", ")));
      }
      body.appendChild(facts);

      var heading = document.createElement("h3");
      heading.textContent = "Journey";
      body.appendChild(heading);
      var timeline = document.createElement("ul");
      timeline.className = "timeline";
      var entries = [];
      data.visits.forEach(function (v) { entries.push({ ts: v.ts, kind: "page", main: "Viewed " + v.path, sub: v.title || "" }); });
      data.events.forEach(function (e) {
        var label = e.label || e.target || "";
        var copy = e.type;
        if (e.type === "scroll") copy = "Scrolled to " + Math.round(e.value || 0) + "%";
        else if (e.type === "click") copy = "Clicked " + (label || "a link");
        else if (e.type === "download") copy = "Downloaded " + (label || "a file");
        else if (e.type === "copy") copy = "Copied " + (label || "contact details");
        else if (e.type === "exit") copy = "Left the page";
        else if (e.type === "heartbeat") copy = "Still reading";
        entries.push({ ts: e.ts, kind: e.type === "click" ? "click" : (e.type === "exit" ? "exit" : "page"), main: copy, sub: e.path || "" });
      });
      entries.sort(function (a, b) { return a.ts - b.ts; });
      entries.slice(0, 120).forEach(function (entry) {
        var li = document.createElement("li");
        li.className = entry.kind;
        li.appendChild(document.createTextNode(entry.main));
        if (entry.sub) {
          var small = document.createElement("span");
          small.className = "faint small";
          small.textContent = " — " + entry.sub;
          li.appendChild(small);
        }
        var time = document.createElement("time");
        time.textContent = clock(entry.ts);
        li.appendChild(time);
        timeline.appendChild(li);
      });
      body.appendChild(timeline);

      var repeat = document.createElement("p");
      repeat.className = "faint small";
      repeat.textContent = "All traffic from this browser: " + (s.pageviews) + " pages in this session.";
      body.appendChild(repeat);
    }).catch(function (error) {
      banner("Could not load that session: " + error.message);
      drawer.hidden = true;
    });
  }

  function load() {
    banner("");
    var query = "?range=" + state.range + "&bots=" + (state.bots ? 1 : 0) + "&owner=" + (state.owner ? 1 : 0);
    api("/api/admin/overview" + query).then(function (data) {
      renderKpis(data);
      renderChart(data.series);
      renderBreakdowns(data);
      renderEngagement(data.engagement);
      $("pulse-text").textContent = "Updated " + clock(Date.now());
    }).catch(function (error) { banner(error.message); });

    api("/api/admin/live").then(function (data) {
      renderLive((data.visitors || []).filter(function (row) { return state.bots ? true : !row.is_bot; }));
    }).catch(function () {});

    if (state.tab === "visitors") loadVisitors();
  }

  function loadVisitors() {
    var query = "?range=" + state.range + "&bots=" + (state.bots ? 1 : 0) + "&owner=" + (state.owner ? 1 : 0) +
      "&limit=" + state.pageSize + "&offset=" + state.page * state.pageSize + "&q=" + encodeURIComponent(state.q);
    api("/api/admin/sessions" + query).then(renderVisitors).catch(function (error) { banner(error.message); });
  }

  function loadPhoto() {
    api("/api/admin/photo").then(function (data) {
      $("photo-when").textContent = data.photo && data.photo.updated_at ? "updated " + new Date(data.photo.updated_at).toLocaleString() : "not published yet";
      $("photo-meta").textContent = data.photo && data.photo.bytes ? (Math.round(data.photo.bytes / 1024) + " KB · committed as " + data.photo.path) : "No photo has been published from this dashboard yet.";
      if (data.photo && data.photo.dataUrl) $("photo-current").src = data.photo.dataUrl;
    }).catch(function (error) { banner(error.message); });
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tabs button").forEach(function (button) {
      button.classList.toggle("is-on", button.dataset.tab === tab);
    });
    ["overview", "visitors", "photo"].forEach(function (name) {
      $("panel-" + name).hidden = name !== tab;
    });
    if (tab === "visitors") loadVisitors();
    if (tab === "photo") loadPhoto();
  }

  document.querySelectorAll(".tabs button").forEach(function (button) {
    button.addEventListener("click", function () { setTab(button.dataset.tab); });
  });
  document.querySelectorAll("[data-range]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.range = button.dataset.range;
      state.page = 0;
      document.querySelectorAll("[data-range]").forEach(function (other) { other.classList.toggle("is-on", other === button); });
      load();
    });
  });
  $("include-bots").addEventListener("change", function (event) { state.bots = event.target.checked; state.page = 0; load(); });
  $("include-owner").addEventListener("change", function (event) { state.owner = event.target.checked; state.page = 0; load(); });
  $("refresh").addEventListener("click", load);
  $("prev").addEventListener("click", function () { if (state.page > 0) { state.page -= 1; loadVisitors(); } });
  $("next").addEventListener("click", function () { state.page += 1; loadVisitors(); });
  $("drawer-close").addEventListener("click", function () { $("drawer").hidden = true; });
  $("drawer").addEventListener("click", function (event) { if (event.target.id === "drawer") $("drawer").hidden = true; });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") $("drawer").hidden = true; });

  var searchTimer;
  $("search").addEventListener("input", function (event) {
    state.q = event.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.page = 0; loadVisitors(); }, 250);
  });
  $("export").addEventListener("click", function () {
    var link = document.createElement("a");
    link.href = "/api/admin/export.csv?range=" + state.range + "&bots=" + (state.bots ? 1 : 0) + "&owner=" + (state.owner ? 1 : 0) + "&q=" + encodeURIComponent(state.q);
    link.download = "visitors-" + state.range + ".csv";
    link.click();
  });
  $("logout").addEventListener("click", function () {
    fetch("/api/admin/logout", { method: "POST", credentials: "same-origin", headers: { "x-ht-admin": "1" } }).then(function () { window.location.reload(); });
  });

  var croppedDataUrl = null;
  function pickFile() { $("file").click(); }
  $("pick").addEventListener("click", pickFile);
  $("file").addEventListener("change", function (event) { if (event.target.files[0]) handleFile(event.target.files[0]); });
  ["dragenter", "dragover"].forEach(function (name) {
    $("drop").addEventListener(name, function (event) { event.preventDefault(); $("drop").classList.add("is-over"); });
  });
  ["dragleave", "drop"].forEach(function (name) {
    $("drop").addEventListener(name, function (event) { event.preventDefault(); $("drop").classList.remove("is-over"); });
  });
  $("drop").addEventListener("drop", function (event) {
    var file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  $("cancel").addEventListener("click", function () {
    croppedDataUrl = null;
    $("crop-preview").hidden = true;
    $("file").value = "";
  });

  function handleFile(file) {
    if (!file.type || file.type.indexOf("image/") !== 0) { banner("That file is not an image."); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var image = new Image();
      image.onload = function () {
        var size = Math.min(image.width, image.height);
        var target = 1200;
        var canvas = document.createElement("canvas");
        canvas.width = target; canvas.height = target;
        var context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, target, target);
        croppedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
        $("photo-preview").src = croppedDataUrl;
        $("crop-preview").hidden = false;
        $("publish-status").textContent = "Ready — " + Math.round(croppedDataUrl.length * 0.75 / 1024) + " KB after cropping to " + target + "×" + target + ".";
      };
      image.onerror = function () { banner("That image could not be read."); };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  $("publish").addEventListener("click", function () {
    if (!croppedDataUrl) return;
    $("publish-status").textContent = "Publishing…";
    api("/api/admin/photo", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ht-admin": "1" },
      body: JSON.stringify({ image: croppedDataUrl })
    }).then(function (result) {
      $("publish-status").textContent = "Published. The Pages build was " + (result.dispatched ? "triggered" : "not triggered") + "; it goes live in about a minute.";
      $("crop-preview").hidden = true;
      croppedDataUrl = null;
      loadPhoto();
    }).catch(function (error) {
      $("publish-status").textContent = "";
      banner(error.message);
    });
  });

  state.timer = setInterval(function () {
    if (document.hidden) return;
    api("/api/admin/live").then(function (data) {
      renderLive((data.visitors || []).filter(function (row) { return state.bots ? true : !row.is_bot; }));
    }).catch(function () {});
  }, 15000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });

  api("/api/admin/overview?range=24h&bots=0&owner=0").then(function () { setTab("overview"); load(); }).catch(function (error) { banner(error.message); });
})();
`;

/* The gate. Served instead of the dashboard whenever the session cookie is
 * missing or expired, so an unauthenticated visitor never receives the
 * dashboard markup at all. */
export const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow, noarchive" />
<meta name="referrer" content="no-referrer" />
<title>Sign in · private</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230b0c0d'/%3E%3Cpath d='M8 22V13M14 22V9M20 22v-6M26 22V11' stroke='%23e2b34a' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E" />
<link rel="stylesheet" href="/admin/app.css" />
</head>
<body class="auth">
<main class="auth-card">
  <span class="mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" width="28" height="28"><path d="M6 24V13M12 24V8M18 24v-7M24 24V11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
  </span>
  <h1>Visitor analytics</h1>
  <p class="faint small">Private dashboard for <span class="mono">hassan200503.github.io</span>. Enter the passphrase to continue.</p>
  <form id="login-form" novalidate>
    <label for="passphrase">Passphrase</label>
    <input type="password" id="passphrase" name="passphrase" autocomplete="current-password" required />
    <button type="submit" class="btn btn-primary" id="submit">Unlock dashboard</button>
  </form>
  <p class="banner" id="login-error" hidden></p>
  <p class="faint auth-foot">Failed attempts are rate limited. The session ends after eight hours.</p>
</main>
<script src="/admin/login.js"></script>
</body>
</html>
`;

export const LOGIN_JS = `"use strict";
(function () {
  var form = document.getElementById("login-form");
  var input = document.getElementById("passphrase");
  var button = document.getElementById("submit");
  var error = document.getElementById("login-error");

  function show(message) {
    error.hidden = !message;
    error.textContent = message || "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var passphrase = input.value;
    if (!passphrase) { show("Enter the passphrase."); return; }
    show("");
    button.disabled = true;
    button.textContent = "Checking…";
    fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-ht-admin": "1" },
      body: JSON.stringify({ passphrase: passphrase })
    }).then(function (response) {
      if (response.ok) { window.location.href = "/admin"; return null; }
      return response.json().then(function (body) { throw new Error(body.error || "Sign-in failed"); });
    }).catch(function (failure) {
      show(failure.message);
      input.select();
    }).finally(function () {
      button.disabled = false;
      button.textContent = "Unlock dashboard";
    });
  });
})();
`;
