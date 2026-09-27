#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/github.json, the snapshot the site renders from.

Why a snapshot exists when the page also calls the GitHub API live: the
unauthenticated API allows 60 requests an hour per IP, shared across every
visitor. A page that renders only from it shows an empty state exactly when
it is busiest. So this file is committed, the page paints from it instantly,
and a live call refreshes it in place when the visitor's request goes
through. One of the two is always available.

Runs the same on a laptop and on the Actions runner: Python plus the gh CLI,
which is authenticated locally by the user and in CI by GITHUB_TOKEN. No jq,
no pip install, one implementation rather than two that can drift.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

USER = sys.argv[1] if len(sys.argv) > 1 else "hassan200503"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join("data", "github.json")


def gh(path, default=None):
    """One gh api call. Returns `default` rather than raising, because a
    single unreachable endpoint must not cost us the whole snapshot."""
    try:
        r = subprocess.run(["gh", "api", path], capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            print("    ! %s -> %s" % (path, (r.stderr or "").strip()[:90]))
            return default
        return json.loads(r.stdout)
    except Exception as exc:                                  # noqa: BLE001
        print("    ! %s -> %s" % (path, exc))
        return default


print("profile: %s" % USER)
profile = gh("users/%s" % USER)
if not profile:
    sys.exit("could not read the profile; refusing to write a half-empty snapshot")

print("repositories")
repos_raw = gh("users/%s/repos?per_page=100&sort=pushed" % USER, []) or []

# Forks and archived repos are excluded: this is a portfolio of what he built
# and still maintains, not an inventory of the account.
repos_raw = [r for r in repos_raw if not r.get("fork") and not r.get("archived")]

repos = []
for r in repos_raw:
    name = r["name"]
    print("  - %s" % name)
    languages = gh("repos/%s/%s/languages" % (USER, name), {}) or {}
    commits = gh("repos/%s/%s/commits?per_page=1" % (USER, name), []) or []

    last_commit = None
    if isinstance(commits, list) and commits:
        c = commits[0]
        last_commit = {
            "sha": (c.get("sha") or "")[:7],
            "message": (c.get("commit", {}).get("message") or "").split("\n")[0][:140],
            "date": c.get("commit", {}).get("author", {}).get("date"),
            "url": c.get("html_url"),
        }

    homepage = (r.get("homepage") or "").strip() or None

    repos.append({
        "name": name,
        "description": r.get("description"),
        "url": r.get("html_url"),
        "homepage": homepage,
        "language": r.get("language"),
        "languages": languages,
        "topics": r.get("topics") or [],
        "stars": r.get("stargazers_count", 0),
        "forks": r.get("forks_count", 0),
        "sizeKb": r.get("size", 0),
        "license": (r.get("license") or {}).get("spdx_id"),
        "createdAt": r.get("created_at"),
        "pushedAt": r.get("pushed_at"),
        "lastCommit": last_commit,
    })

repos.sort(key=lambda x: x.get("pushedAt") or "", reverse=True)

# Bytes per language across every repo. Presented as a share of the whole,
# and never described as "lines of code", which it is not.
totals = {}
for r in repos:
    for lang, count in (r["languages"] or {}).items():
        totals[lang] = totals.get(lang, 0) + count
language_bytes = dict(sorted(totals.items(), key=lambda kv: -kv[1]))

snapshot = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "user": {
        "login": profile.get("login"),
        "name": profile.get("name"),
        "bio": profile.get("bio"),
        "avatarUrl": profile.get("avatar_url"),
        "url": profile.get("html_url"),
        "followers": profile.get("followers", 0),
        "publicRepos": profile.get("public_repos", 0),
        "createdAt": profile.get("created_at"),
    },
    "totals": {
        "repos": len(repos),
        "stars": sum(r["stars"] for r in repos),
        "languageBytes": language_bytes,
        "lastPush": max((r["pushedAt"] for r in repos if r["pushedAt"]), default=None),
    },
    "repos": repos,
}

os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(snapshot, fh, indent=2, ensure_ascii=False)
    fh.write("\n")

print("\nwrote %s" % OUT)
print("  repos=%d  stars=%d  languages=%d  lastPush=%s" % (
    snapshot["totals"]["repos"], snapshot["totals"]["stars"],
    len(language_bytes), snapshot["totals"]["lastPush"]))
