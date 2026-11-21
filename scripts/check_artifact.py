#!/usr/bin/env python3
"""Fail if the staged Pages artifact contains anything private or stale.

`scripts/stage_site.py` uses an allowlist, so this is a second, independent
guard: it checks the result rather than trusting the list. A future edit that
copies a directory wholesale will be caught here before deployment.
"""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "_site"

REQUIRED = (
    "index.html",
    "projects.html",
    "skills.html",
    "services.html",
    "about.html",
    "documents.html",
    "contact.html",
    "404.html",
    "projects/rentmanager.html",
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
    "fonts/fonts.css",
    "images/hassan-square.jpg",
    "images/hassan-portrait.webp",
    "files/Hassan-Tsuma-CV.pdf",
)

FORBIDDEN_DIRS = {
    "analytics-worker",
    "worker",
    "docs",
    "scripts",
    "templates",
    "tests",
    "schemas",
    "cv",
    "node_modules",
    ".github",
}

FORBIDDEN_NAMES = {
    ".gitignore",
    ".gitattributes",
    "package.json",
    "package-lock.json",
    "README.md",
}

FORBIDDEN_SUFFIXES = {".py", ".md", ".toml", ".sql", ".yml", ".yaml"}

# data/github.json is the only JSON the browser fetches. profile.json and
# tech-map.json are build-time inputs and must not ship.
ALLOWED_JSON = {Path("data/github.json")}


def main() -> int:
    errors = []
    if not SITE.is_dir():
        raise SystemExit("_site is missing; run scripts/stage_site.py first")

    for name in REQUIRED:
        if not (SITE / name).is_file():
            errors.append(f"missing required file: {name}")

    files = [path for path in SITE.rglob("*") if path.is_file()]
    for path in files:
        relative = path.relative_to(SITE)
        if relative in ALLOWED_JSON:
            continue
        if any(part in FORBIDDEN_DIRS for part in relative.parts):
            errors.append(f"private directory in artifact: {relative}")
            continue
        if any(part.startswith(".") for part in relative.parts):
            errors.append(f"hidden file in artifact: {relative}")
            continue
        if path.name in FORBIDDEN_NAMES:
            errors.append(f"repository file in artifact: {relative}")
            continue
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            errors.append(f"source file in artifact: {relative}")
            continue
        if path.suffix.lower() == ".json":
            errors.append(f"unexpected JSON in artifact: {relative}")

    if errors:
        print("artifact check failed")
        print("\n".join(sorted(set(errors))))
        return 1

    total = sum(path.stat().st_size for path in files)
    print(f"ok: artifact contains {len(files)} public files ({total / 1024 / 1024:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
