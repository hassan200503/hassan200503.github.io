#!/usr/bin/env python3
"""Render cv/Hassan-Tsuma-CV.html to the one-page PDF the site serves.

Uses a locally installed Chrome or Edge in headless mode, then rewrites the
PDF metadata and checks that the result is still a single A4 page. The source
HTML is deliberately outside the Pages allowlist.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cv" / "Hassan-Tsuma-CV.html"
OUTPUT = ROOT / "files" / "Hassan-Tsuma-CV.pdf"

CANDIDATES = (
    os.environ.get("CHROME_PATH"),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)


def find_browser() -> str:
    for candidate in CANDIDATES:
        if not candidate:
            continue
        if Path(candidate).is_file():
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    raise SystemExit("could not find Chrome or Edge; set CHROME_PATH")


def render(browser: str, target: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="portfolio-cv-") as profile:
        base = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--disable-extensions",
            "--no-pdf-header-footer",
            "--print-to-pdf-no-header",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=2500",
            f"--user-data-dir={profile}",
            f"--print-to-pdf={target}",
            SOURCE.as_uri(),
        ]
        result = subprocess.run(base, capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            fallback = [item for item in base if item != "--headless=new"]
            fallback.insert(1, "--headless")
            result = subprocess.run(fallback, capture_output=True, text=True, timeout=90)
        if result.returncode != 0 or not target.is_file():
            raise SystemExit((result.stderr or result.stdout or "Chrome produced no PDF").strip())


def main() -> int:
    if not SOURCE.is_file():
        raise SystemExit(f"missing CV source: {SOURCE}")
    browser = find_browser()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="portfolio-cv-out-") as temp:
        rendered = Path(temp) / "cv.pdf"
        render(browser, rendered)

        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(str(rendered))
        if len(reader.pages) != 1:
            raise SystemExit(f"CV must be one page; Chrome produced {len(reader.pages)}")
        text = " ".join("".join(page.extract_text() or "" for page in reader.pages).split())
        for required in ("21 modules", "100 Flyway migrations", "Lovora", "Automata"):
            if required not in text:
                raise SystemExit(f"CV text is missing: {required}")

        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.add_metadata({
            "/Title": "Hassan Tsuma Karungwa - CV",
            "/Author": "Hassan Tsuma Karungwa",
            "/Subject": "Full-Stack Software Engineer - Java, Spring Boot, PostgreSQL, React, Next.js",
            "/Keywords": "Java, Spring Boot, PostgreSQL, React, Next.js, TypeScript, M-Pesa, Lovora, Automata",
            "/Creator": "Hassan Tsuma Karungwa",
        })
        with open(OUTPUT, "wb") as handle:
            writer.write(handle)

    print(f"ok: wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes, 1 page)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
