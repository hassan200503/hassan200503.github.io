#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Download each repository's screenshots once per build and shrink them.

The screenshots live in the repositories at full resolution, and one of them
is a 1.4 MB PNG. Serving those straight from raw.githubusercontent.com would
put several megabytes on a page that is meant to feel instant, so the build
fetches them, constrains them to a card-sized width, re-encodes them as WebP
and writes the result into images/projects/. The Pages artifact uploads the
whole working tree, so the optimised copies ship with the site without ever
being committed.

The file name is derived, not recorded: `<repository name>-<index>.webp`. The
renderer recomputes the same name from the snapshot, so no manifest has to be
kept in sync, and the original GitHub URL stays in the snapshot as the
fallback for anything that fails to download.
"""
from __future__ import annotations

import io
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "data" / "github.json"
OUT_DIR = ROOT / "images" / "projects"
MAX_WIDTH = 1200
QUALITY = 78
LIMIT = 3
TIMEOUT_SECONDS = 30
USER_AGENT = "hassan200503-portfolio-build"


def local_name(repo_name, index):
    """The optimised copy of one screenshot. Mirrored in github.js."""
    return "%s-%d.webp" % (repo_name, index)


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "image/*"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read()


def main() -> int:
    try:
        from PIL import Image
    except ImportError:
        print("pillow is not installed; screenshots will be served from GitHub unchanged")
        return 0

    if not SNAPSHOT.exists():
        print("no data/github.json yet; nothing to fetch")
        return 0
    with SNAPSHOT.open(encoding="utf-8") as handle:
        snapshot = json.load(handle)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.webp"):
        stale.unlink()

    written = 0
    skipped = 0
    for repo in snapshot.get("repos", []):
        name = repo.get("name") or ""
        if not name:
            continue
        for index, shot in enumerate((repo.get("screenshots") or [])[:LIMIT]):
            url = shot.get("url")
            if not url:
                continue
            target = OUT_DIR / local_name(name, index)
            try:
                image = Image.open(io.BytesIO(fetch(url)))
                image.load()
                if image.width > MAX_WIDTH:
                    height = max(1, round(image.height * MAX_WIDTH / image.width))
                    image = image.resize((MAX_WIDTH, height), Image.LANCZOS)
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGB")
                image.save(target, "WEBP", quality=QUALITY, method=5)
                written += 1
            except Exception as exc:  # noqa: BLE001 - a bad image must never fail the build
                skipped += 1
                print("  ! %s [%d] %s" % (name, index, str(exc)[:70]))
                if target.exists():
                    target.unlink()

    print("ok: optimised %d screenshot(s), skipped %d -> %s" % (
        written, skipped, OUT_DIR.relative_to(ROOT).as_posix()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
