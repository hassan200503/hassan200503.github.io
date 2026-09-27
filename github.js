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
  var CACHE_TTL_MS = 15 * 60 * 1000;

  var mount = document.querySelector("[data-github]");
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

  function render(data, isLive) {
    var repos = (data.repos || []).slice();

    // The portfolio repository itself is real work, but listing the site you
    // are currently reading among "projects" is noise. Kept in the totals,
    // dropped from the grid.
    var shown = repos.filter(function (r) {
      return r.name !== "hassan200503.github.io" && r.name !== "hassan200503";
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

    var grid = mount.querySelector("[data-github-repos]");
    if (grid) {
      grid.innerHTML = "";
      shown.forEach(function (r) { grid.appendChild(repoCard(r)); });
      if (window.htReveal) window.htReveal(grid);
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

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (Date.now() - c.at > CACHE_TTL_MS) return null;
      return c.repos;
    } catch (e) { return null; }
  }

  function writeCache(repos) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), repos: repos }));
    } catch (e) { /* private mode, or the quota is full; the page is fine */ }
  }

  /* Fold a live API response over the snapshot. The live call gives one
   * page of repository metadata and no language breakdown — that would cost
   * one request per repository and exhaust the hourly allowance in a single
   * page view — so language bytes are carried over from the snapshot, and a
   * repository too new to appear there falls back to its primary language. */
  function merge(snapshot, liveRepos) {
    var bySnapshot = {};
    (snapshot.repos || []).forEach(function (r) { bySnapshot[r.name] = r; });

    var merged = liveRepos
      .filter(function (r) { return !r.fork && !r.archived; })
      .map(function (r) {
        var prev = bySnapshot[r.name] || {};
        return {
          name: r.name,
          description: r.description,
          url: r.html_url,
          homepage: (r.homepage || "").trim() || null,
          language: r.language,
          languages: prev.languages || {},
          topics: r.topics || prev.topics || [],
          stars: r.stargazers_count,
          forks: r.forks_count,
          sizeKb: r.size,
          license: (r.license && r.license.spdx_id) || null,
          createdAt: r.created_at,
          pushedAt: r.pushed_at,
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
      repos: merged
    };
  }

  function goLive(snapshot) {
    var cached = readCache();
    if (cached) {
      render(merge(snapshot, cached), true);
      return;
    }
    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("gh " + r.status);   // 403 = rate limited
        return r.json();
      })
      .then(function (live) {
        if (!Array.isArray(live) || !live.length) return;
        writeCache(live);
        render(merge(snapshot, live), true);
      })
      .catch(function () {
        /* Rate limited, offline, or blocked. The snapshot is already
           rendered and correct, so there is nothing to report and nothing
           for the visitor to do. */
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
    });
})();
