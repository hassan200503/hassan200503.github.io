/* Live GitHub section.
 *
 * Two sources, deliberately:
 *
 *   1. data/github.json, committed hourly by a workflow. Paints instantly,
 *      needs no network beyond this origin, and carries per-repo language
 *      byte counts, which are expensive to gather (one API call per repo).
 *
 *   2. The public GitHub API, called once from the visitor's browser. It
 *      refreshes what one request can cover — new repositories, renamed or
 *      re-described ones, stars, topics, push times — so something pushed a
 *      minute ago is visible without waiting for the next workflow run.
 *
 * Unauthenticated callers get 60 requests an hour per IP, shared by every
 * visitor, so (2) is treated as a bonus that often will not arrive. It is
 * fetched once, cached briefly, and every failure is silent: the snapshot is
 * already on screen and correct. Nothing here can leave the page emptier
 * than it started.
 */
(function () {
  "use strict";

  var API = "https://api.github.com/users/hassan200503/repos?per_page=100&sort=pushed";
  var CACHE_KEY = "ht-gh-live";
  var CACHE_TTL_MS = 5 * 60 * 1000;

  var mount = document.querySelector("[data-github]");
  var SHOT_LIMIT = 3;
  var SHOT_DIR = "images/projects/";

  // ---- screenshots ------------------------------------------------------

  /* The optimised copy of a screenshot is written by scripts/fetch_screenshots.py
   * during the build as <repository>-<index>.webp. The name is derived in both
   * places rather than recorded, so nothing has to be kept in sync; the original
   * GitHub URL always travels with the image in data-shot-full, and if the local
   * copy is missing the error handler below puts the original in its place.
   * Delegated on the document, capture phase, because error does not bubble. */
  document.addEventListener("error", function (event) {
    var img = event.target;
    if (!img || img.tagName !== "IMG") return;
    var full = img.getAttribute("data-shot-full");
    var src = img.getAttribute("src") || "";
    if (!full || src.indexOf(SHOT_DIR) !== 0) return;
    img.setAttribute("src", full);
  }, true);

  function shotLocal(repoName, index) {
    return SHOT_DIR + repoName + "-" + index + ".webp";
  }

  function shotFrame(repo, shot, index, count) {
    var frame = el("button", index === 0 ? "repo-cover" : "repo-shot-thumb");
    frame.type = "button";
    frame.setAttribute("data-shot-index", String(index));
    frame.setAttribute("aria-label", "Open screenshot: " + (shot.alt || repo.name));

    var img = el("img");
    img.src = shotLocal(repo.name, index);
    img.alt = shot.alt || repo.name;
    img.width = 1200;
    img.height = 750;
    img.loading = "lazy";
    img.decoding = "async";
    img.setAttribute("data-shot-full", shot.url);
    frame.appendChild(img);

    if (index === 0) {
      if (count > 1) frame.appendChild(el("span", "shot-badge", "1 / " + count));
      frame.appendChild(el("span", "shot-zoom", "Expand"));
    }
    return frame;
  }

  function repoInitials(name) {
    var parts = String(name || "").split(/[-_.\s]+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || "?").slice(0, 2).toUpperCase();
  }

  function repoShots(repo) {
    var shots = (repo.screenshots || []).filter(function (s) { return s && s.url; }).slice(0, SHOT_LIMIT);
    if (!shots.length) {
      var placeholder = el("div", "repo-shots");
      var empty = el("div", "repo-cover repo-cover-empty");
      empty.setAttribute("aria-hidden", "true");
      empty.appendChild(el("span", "repo-mono", repoInitials(repo.name)));
      empty.appendChild(el("span", "repo-cover-label", "Code only"));
      placeholder.appendChild(empty);
      return placeholder;
    }

    var wrap = el("div", "repo-shots");
    wrap.appendChild(shotFrame(repo, shots[0], 0, shots.length));
    if (shots.length > 1) {
      var rail = el("div", "repo-shot-rail");
      shots.slice(1).forEach(function (s, i) { rail.appendChild(shotFrame(repo, s, i + 1, shots.length)); });
      wrap.appendChild(rail);
    }
    return wrap;
  }

  /* ---- lightbox --------------------------------------------------------
   * Built once, reused for every card. The gallery is read from the DOM —
   * every frame inside the same .repo-shots container — so the prerendered
   * cards and the live cards need no extra data on the page. */
  var box = null;

  function buildBox() {
    var dialog = el("dialog", "shotbox");
    var fig = el("figure", "shotbox-fig");
    var img = el("img", "shotbox-img");
    img.alt = "";
    var cap = el("figcaption", "shotbox-cap");
    var prev = el("button", "shotbox-btn shotbox-prev");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous screenshot");
    prev.textContent = "←";
    var next = el("button", "shotbox-btn shotbox-next");
    next.type = "button";
    next.setAttribute("aria-label", "Next screenshot");
    next.textContent = "→";
    var close = el("button", "shotbox-btn shotbox-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "✕";
    fig.appendChild(img);
    fig.appendChild(cap);
    dialog.appendChild(fig);
    dialog.appendChild(prev);
    dialog.appendChild(next);
    dialog.appendChild(close);
    document.body.appendChild(dialog);

    var state = { items: [], at: 0 };

    function show(i) {
      var n = state.items.length;
      if (!n) return;
      state.at = ((i % n) + n) % n;
      var item = state.items[state.at];
      img.src = item.full;
      img.alt = item.alt;
      cap.textContent = "";
      var strong = document.createElement("b");
      strong.textContent = item.alt;
      cap.appendChild(strong);
      cap.appendChild(document.createTextNode(" · " + (state.at + 1) + " / " + n));
      if (item.repo) {
        cap.appendChild(document.createTextNode(" · "));
        var link = document.createElement("a");
        link.href = item.repo;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "repository ↗";
        cap.appendChild(link);
      }
    }

    prev.addEventListener("click", function () { show(state.at - 1); });
    next.addEventListener("click", function () { show(state.at + 1); });
    close.addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(state.at - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(state.at + 1); }
    });
    // Clicking the backdrop. The figure covers the whole dialog, so a hit on
    // the dialog itself means the padding around the image was clicked.
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog || e.target === fig) dialog.close();
    });
    dialog.addEventListener("close", function () {
      document.body.classList.remove("shotbox-open");
      img.removeAttribute("src");
    });

    return {
      open: function (items, at) {
        state.items = items;
        dialog.setAttribute("data-count", String(items.length));
        show(at);
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        document.body.classList.add("shotbox-open");
        close.focus();
      }
    };
  }

  document.addEventListener("click", function (event) {
    var frame = event.target.closest ? event.target.closest("[data-shot-index]") : null;
    if (!frame) return;
    var group = frame.closest(".repo-shots");
    if (!group) return;
    var frames = [].slice.call(group.querySelectorAll("[data-shot-index]"));
    var items = frames.map(function (f) {
      var image = f.querySelector("img");
      var card = f.closest(".repo-card");
      var anchor = card ? card.querySelector(".repo-head h3 a") : null;
      return {
        full: image ? image.getAttribute("data-shot-full") : "",
        alt: image ? (image.getAttribute("alt") || "") : "",
        repo: anchor ? anchor.getAttribute("href") : ""
      };
    }).filter(function (i) { return i.full; });
    if (!items.length) return;
    event.preventDefault();
    if (!box) box = buildBox();
    box.open(items, Number(frame.getAttribute("data-shot-index")) || 0);
  });

  if (!mount) return;

  // ---- helpers ----------------------------------------------------------

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function relTime(iso) {
    if (!iso) return "";
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    var secs = Math.round((Date.now() - then) / 1000);
    if (secs < 60) return "just now";
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? " hour ago" : " hours ago");
    var days = Math.round(hrs / 24);
    if (days < 31) return days + (days === 1 ? " day ago" : " days ago");
    var months = Math.round(days / 30.44);
    if (months < 12) return months + (months === 1 ? " month ago" : " months ago");
    var years = (days / 365.25).toFixed(1).replace(/\.0$/, "");
    return years + (years === "1" ? " year ago" : " years ago");
  }

  function titleCase(slug) {
    return slug.replace(/[-_]/g, " ").replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  // A fixed hue per language, so the same language is the same colour in the
  // footprint bar and on every card.
  var LANG_HUE = {
    Java: 24, TypeScript: 212, JavaScript: 47, HTML: 14, CSS: 268,
    PLpgSQL: 195, Shell: 120, Dockerfile: 199, Python: 208, Kotlin: 280,
    Swift: 12, Go: 187, Rust: 18, SQL: 195
  };

  function langColour(name, i) {
    var hue = LANG_HUE[name];
    if (hue === undefined) hue = (name.charCodeAt(0) * 37 + (i || 0) * 53) % 360;
    return "hsl(" + hue + " 58% 48%)";
  }

  function bytesLabel(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + " MB";
    if (n >= 1e3) return Math.round(n / 1e3) + " KB";
    return n + " B";
  }

  // ---- rendering --------------------------------------------------------

  function languageBar(languages) {
    var entries = Object.keys(languages || {}).map(function (k) {
      return [k, languages[k]];
    }).sort(function (a, b) { return b[1] - a[1]; });

    var total = entries.reduce(function (s, e) { return s + e[1]; }, 0);
    var wrap = el("div", "lang-bar");
    if (!total) return wrap;

    entries.forEach(function (e, i) {
      var seg = el("span");
      seg.style.width = (e[1] / total * 100) + "%";
      seg.style.background = langColour(e[0], i);
      seg.title = e[0] + " · " + Math.round(e[1] / total * 100) + "%";
      wrap.appendChild(seg);
    });
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", entries.map(function (e) {
      return e[0] + " " + Math.round(e[1] / total * 100) + " percent";
    }).join(", "));
    return wrap;
  }

  function repoCard(repo) {
    var card = el("article", "repo-card reveal");
    card.setAttribute("data-tilt", "");
    card.setAttribute("data-repo-lang", repo.primaryLanguage || repo.language || "");
    card.setAttribute("data-repo-live", repo.homepage ? "1" : "0");

    var head = el("div", "repo-head");
    var title = el("h3");
    var link = el("a", null, repo.name);
    link.href = repo.url;
    link.target = "_blank";
    link.rel = "noopener";
    title.appendChild(link);
    head.appendChild(title);

    if (repo.homepage) {
      var live = el("a", "repo-live", "Live ↗");
      live.href = repo.homepage;
      live.target = "_blank";
      live.rel = "noopener";
      head.appendChild(live);
    }
    card.appendChild(head);

    var shots = repoShots(repo);
    if (shots) card.appendChild(shots);

    card.appendChild(el("p", "repo-desc",
      repo.description || "No description on the repository yet."));

    var langs = repo.languages && Object.keys(repo.languages).length
      ? repo.languages
      : (repo.language ? (function () { var o = {}; o[repo.language] = 1; return o; })() : {});
    if (Object.keys(langs).length) card.appendChild(languageBar(langs));

    if (repo.topics && repo.topics.length) {
      var topics = el("div", "repo-topics");
      repo.topics.slice(0, 6).forEach(function (t) {
        topics.appendChild(el("span", "topic", t));
      });
      card.appendChild(topics);
    }

    var foot = el("div", "repo-foot");
    var bits = [];
    if (repo.language) bits.push(repo.language);
    if (repo.stars) bits.push(repo.stars + (repo.stars === 1 ? " star" : " stars"));
    if (repo.license) bits.push(repo.license);
    foot.appendChild(el("span", "repo-meta", bits.join(" · ")));
    foot.appendChild(el("span", "repo-when", "updated " + relTime(repo.pushedAt)));
    card.appendChild(foot);

    if (repo.lastCommit && repo.lastCommit.message) {
      var commit = el("p", "repo-commit");
      commit.appendChild(el("span", "mono sha", repo.lastCommit.sha));
      commit.appendChild(document.createTextNode(" " + repo.lastCommit.message));
      card.appendChild(commit);
    }
    return card;
  }

  function footprint(languageBytes) {
    var wrap = el("div", "footprint");
    var entries = Object.keys(languageBytes || {}).map(function (k) {
      return [k, languageBytes[k]];
    }).sort(function (a, b) { return b[1] - a[1]; });
    var total = entries.reduce(function (s, e) { return s + e[1]; }, 0);
    if (!total) return wrap;

    var bar = el("div", "lang-bar lang-bar-lg");
    entries.forEach(function (e, i) {
      var seg = el("span");
      seg.style.width = (e[1] / total * 100) + "%";
      seg.style.background = langColour(e[0], i);
      seg.title = e[0] + " · " + bytesLabel(e[1]);
      bar.appendChild(seg);
    });
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", "Language share across every public repository: " +
      entries.map(function (e) {
        return e[0] + " " + Math.round(e[1] / total * 100) + " percent";
      }).join(", "));
    wrap.appendChild(bar);

    var key = el("div", "footprint-key");
    entries.slice(0, 8).forEach(function (e, i) {
      var item = el("span", "fk");
      var dot = el("i");
      dot.style.background = langColour(e[0], i);
      item.appendChild(dot);
      item.appendChild(document.createTextNode(
        e[0] + " " + (e[1] / total * 100).toFixed(1) + "%"));
      key.appendChild(item);
    });
    wrap.appendChild(key);
    return wrap;
  }

  function technologyLedger(items) {
    var list = el("ul", "stack-list");
    (items || []).forEach(function (item) {
      var li = el("li", "tech-card");
      var top = el("div", "tech-card-top");
      top.appendChild(el("strong", null, item.technology || ""));
      top.appendChild(el("span", "tech-count", (item.repoCount || 0) + " repos"));
      li.appendChild(top);
      li.appendChild(el("span", "tech-cat", item.category || "in the code"));
      var evidence = el("div", "tech-evidence");
      (item.evidence || []).slice(0, 3).forEach(function (e) {
        var a = el("a", null, (e.path || "source") + " ↗");
        a.href = e.url || "#";
        a.target = "_blank";
        a.rel = "noopener";
        a.title = e.path || "";
        evidence.appendChild(a);
      });
      li.appendChild(evidence);
      list.appendChild(li);
    });
    return list;
  }

  function applyFilter(value) {
    var grid = mount.querySelector("[data-github-repos]");
    if (!grid) return;
    var visible = 0;
    grid.querySelectorAll(".repo-card").forEach(function (card) {
      var show = value === "all" ||
        (value === "live"
          ? card.getAttribute("data-repo-live") === "1"
          : card.getAttribute("data-repo-lang") === value);
      card.hidden = !show;
      if (show) visible += 1;
    });
    var empty = grid.querySelector(".repo-empty");
    if (!visible && !empty) {
      grid.appendChild(el("p", "repo-empty", "No repositories in this filter yet."));
    } else if (visible && empty) {
      empty.remove();
    }
  }

  function buildFilters(repos) {
    var host = mount.querySelector("[data-github-filters]");
    if (!host) return;
    host.innerHTML = "";
    var langs = {};
    repos.forEach(function (r) {
      var l = r.primaryLanguage || r.language;
      if (l) langs[l] = (langs[l] || 0) + 1;
    });
    var options = [["all", "All", repos.length]];
    var liveCount = repos.filter(function (r) { return !!r.homepage; }).length;
    if (liveCount) options.push(["live", "Deployed", liveCount]);
    Object.keys(langs).sort(function (a, b) { return langs[b] - langs[a]; }).slice(0, 4)
      .forEach(function (l) { options.push([l, l, langs[l]]); });

    options.forEach(function (o, i) {
      var btn = el("button", "filter-chip" + (i === 0 ? " is-active" : ""), o[1]);
      btn.type = "button";
      btn.setAttribute("data-filter", o[0]);
      btn.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      btn.appendChild(el("span", "count", String(o[2])));
      host.appendChild(btn);
    });
    host.hidden = false;
    if (host.getAttribute("data-bound") !== "1") {
      host.setAttribute("data-bound", "1");
      host.addEventListener("click", function (event) {
        var btn = event.target.closest(".filter-chip");
        if (!btn) return;
        host.querySelectorAll(".filter-chip").forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        applyFilter(btn.getAttribute("data-filter"));
      });
    }
    applyFilter("all");
  }

  function render(data, isLive) {
    var repos = (data.repos || []).slice();

    // The portfolio repository itself is real work, but listing the site you
    // are currently reading among "projects" is noise. Kept in the totals,
    // dropped from the grid. Same rules as include_in_grid() in build_site.py,
    // so the snapshot grid and the live grid always agree.
    var shown = repos.filter(function (r) {
      if (r.archived) return false;
      if (r.name === "hassan200503.github.io" || r.name === "hassan200503") return false;
      return (r.topics || []).indexOf("portfolio-hidden") === -1;
    });

    var statsHost = mount.querySelector("[data-github-stats]");
    if (statsHost) {
      statsHost.innerHTML = "";
      var stats = [
        [String(data.totals.repos), "public repositories"],
        [String(Object.keys(data.totals.languageBytes || {}).length), "languages in use"],
        [relTime(data.totals.lastPush) || "—", "last push"]
      ];
      stats.forEach(function (s) {
        var d = el("div", "stat");
        d.appendChild(el("span", "n mono", s[0]));
        d.appendChild(el("span", "label", s[1]));
        statsHost.appendChild(d);
      });
    }

    var fpHost = mount.querySelector("[data-github-footprint]");
    if (fpHost) {
      fpHost.innerHTML = "";
      fpHost.appendChild(footprint(data.totals.languageBytes));
    }

    var ledgerHost = mount.querySelector("[data-github-ledger]");
    if (ledgerHost && Array.isArray(data.technologyLedger) && data.technologyLedger.length) {
      ledgerHost.innerHTML = "";
      ledgerHost.appendChild(technologyLedger(data.technologyLedger));
    }

    var grid = mount.querySelector("[data-github-repos]");
    if (grid) {
      grid.innerHTML = "";
      shown.forEach(function (r) { grid.appendChild(repoCard(r)); });
      if (window.htTilt) grid.querySelectorAll("[data-tilt]").forEach(window.htTilt);
      if (window.htReveal) window.htReveal(grid);
      buildFilters(shown);
    }

    var stamp = mount.querySelector("[data-github-stamp]");
    if (stamp) {
      stamp.textContent = isLive
        ? "Live from the GitHub API · " + relTime(data.generatedAt || new Date().toISOString())
        : "From a snapshot built " + relTime(data.generatedAt);
      stamp.classList.toggle("is-live", !!isLive);
    }
  }

  // ---- data -------------------------------------------------------------

  function readCacheEntry() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      return c && Array.isArray(c.repos) ? c : null;
    } catch (e) { return null; }
  }

  function readCache() {
    var c = readCacheEntry();
    return c && Date.now() - c.at <= CACHE_TTL_MS ? c : null;
  }

  function writeCache(repos, etag) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), etag: etag || null, repos: repos }));
    } catch (e) { /* private mode, or the quota is full; the page is fine */ }
  }

  /* Fold a live API response over the snapshot. The live call gives one
   * page of repository metadata and no language breakdown — that would cost
   * one request per repository and exhaust the hourly allowance in a single
   * page view — so language bytes are carried over from the snapshot, and a
   * repository too new to appear there falls back to its primary language. */
  function merge(snapshot, liveRepos) {
    var bySnapshot = {};
    (snapshot.repos || []).forEach(function (r) { bySnapshot[String(r.id || r.name)] = r; });

    var merged = liveRepos
      .filter(function (r) {
        var topics = r.topics || [];
        return !r.archived && (!r.fork || topics.indexOf("portfolio-included") !== -1) && topics.indexOf("portfolio-hidden") === -1;
      })
      .map(function (r) {
        var prev = bySnapshot[String(r.id || r.name)] || {};
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          url: r.html_url,
          homepage: (r.homepage || "").trim() || null,
          language: r.language,
          primaryLanguage: r.language,
          languageBytes: prev.languageBytes || prev.languages || {},
          languages: prev.languages || {},
          topics: r.topics || prev.topics || [],
          stars: r.stargazers_count,
          forks: r.forks_count,
          sizeKb: r.size,
          license: (r.license && r.license.spdx_id) || null,
          createdAt: r.created_at,
          pushedAt: r.pushed_at,
          archived: !!r.archived,
          defaultBranch: r.default_branch || prev.defaultBranch || "main",
          technologies: prev.technologies || [],
          // Screenshots are discovered by the build from each repository's README
          // and tree, which one API request cannot reproduce. They come from the
          // snapshot or not at all, so a live refresh never empties a card.
          screenshots: prev.screenshots || [],
          lastCommit: prev.lastCommit || null
        };
      })
      .sort(function (a, b) {
        return (b.pushedAt || "").localeCompare(a.pushedAt || "");
      });

    var languageBytes = {};
    merged.forEach(function (r) {
      Object.keys(r.languages || {}).forEach(function (k) {
        languageBytes[k] = (languageBytes[k] || 0) + r.languages[k];
      });
    });
    // A brand-new repository has no snapshot entry and so no byte counts.
    // Rather than letting it vanish from the footprint, give it a nominal
    // share so the language at least appears.
    merged.forEach(function (r) {
      if (r.language && !languageBytes[r.language]) languageBytes[r.language] = 1;
    });

    var ordered = {};
    Object.keys(languageBytes).sort(function (a, b) {
      return languageBytes[b] - languageBytes[a];
    }).forEach(function (k) { ordered[k] = languageBytes[k]; });

    return {
      generatedAt: new Date().toISOString(),
      user: snapshot.user,
      totals: {
        repos: merged.length,
        stars: merged.reduce(function (s, r) { return s + (r.stars || 0); }, 0),
        languageBytes: ordered,
        lastPush: merged.length ? merged[0].pushedAt : snapshot.totals.lastPush
      },
      technologyLedger: snapshot.technologyLedger || [],
      repos: merged
    };
  }

  function goLive(snapshot) {
    var stored = readCacheEntry();
    var cached = readCache();
    if (cached) {
      render(merge(snapshot, cached.repos), true);
      return;
    }
    var headers = { Accept: "application/vnd.github+json" };
    if (stored && stored.etag) headers["If-None-Match"] = stored.etag;
    fetch(API, { headers: headers })
      .then(function (r) {
        if (r.status === 304) return { notModified: true };
        if (!r.ok) throw new Error("gh " + r.status);   // 403 = rate limited
        return r.json().then(function (live) { return { live: live, etag: r.headers.get("ETag") }; });
      })
      .then(function (result) {
        if (result.notModified && stored) {
          render(merge(snapshot, stored.repos), true);
          return;
        }
        var live = result.live;
        if (!Array.isArray(live) || !live.length) return;
        writeCache(live, result.etag);
        render(merge(snapshot, live), true);
      })
      .catch(function () {
        var stamp = mount.querySelector("[data-github-stamp]");
        if (stamp) {
          stamp.textContent = "Snapshot · last synced " + relTime(snapshot.generatedAt);
          stamp.classList.remove("is-live");
        }
      });
  }

  fetch("data/github.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (snapshot) {
      render(snapshot, false);
      goLive(snapshot);
    })
    .catch(function () {
      var grid = mount.querySelector("[data-github-repos]");
      if (grid && !grid.children.length) {
        grid.appendChild(el("p", "muted",
          "The project list could not be loaded. It is always readable at github.com/hassan200503."));
      }
      var stamp = mount.querySelector("[data-github-stamp]");
      if (stamp) stamp.textContent = "Snapshot unavailable · try again later";
    });
})();
