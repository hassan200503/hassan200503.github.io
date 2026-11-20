#!/usr/bin/env python3
"""Stage only the files that belong on the public website.

The repository also contains the analytics Worker, the webhook relay, build
scripts, templates, tests and deployment notes. GitHub Pages deploys whatever
the artifact contains, so uploading the working tree would publish all of
that. This script builds `_site/` from an explicit allowlist instead.
"""
from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "_site"

# Files served directly by the site.
PUBLIC_FILES = (
    "index.html",
    "projects.html",
    "skills.html",
    "services.html",
    "about.html",
    "documents.html",
    "contact.html",
    "404.html",
    "projects/rentmanager.html",
    # Compatibility redirects for the old Work URLs. They are noindexed and
    # keep existing bookmarks and search results working.
    "work.html",
    "work/rentmanager.html",
    "styles.css",
    "script.js",
    "motion.js",
    "github.js",
    "analytics.js",
    "data/github.json",
    "robots.txt",
    "sitemap.xml",
)

# Optional files that are copied when present.
OPTIONAL_FILES = ("CNAME",)

# Directories that contain public assets only.
PUBLIC_DIRS = (
    "fonts",
    "vendor",
    "images",
    "files",
)

IGNORE = shutil.ignore_patterns(".DS_Store", "Thumbs.db", "*.map")


def stage() -> int:
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()

    copied = 0
    for name in PUBLIC_FILES:
        source = ROOT / name
        if not source.is_file():
            raise SystemExit(f"missing public file: {name}")
        target = DEST / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied += 1

    for name in OPTIONAL_FILES:
        source = ROOT / name
        if source.is_file():
            shutil.copy2(source, DEST / name)
            copied += 1

    for name in PUBLIC_DIRS:
        source = ROOT / name
        if not source.is_dir():
            raise SystemExit(f"missing public directory: {name}")
        shutil.copytree(source, DEST / name, ignore=IGNORE)
        copied += sum(1 for item in (DEST / name).rglob("*") if item.is_file())

    print(f"ok: staged {copied} public files in {DEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(stage())
