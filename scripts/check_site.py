#!/usr/bin/env python3
"""Dependency-free checks for the static site's local HTML surface."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = sorted(ROOT.rglob("*.html"))


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.in_title = False
        self.has_main = False
        self.links = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "main":
            self.has_main = True
        if tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"])

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


errors = []
for page in HTML_FILES:
    parser = PageParser()
    parser.feed(page.read_text(encoding="utf-8"))
    if not parser.title.strip():
        errors.append(f"{page.relative_to(ROOT)}: missing title")
    if page.name != "404.html" and not parser.has_main:
        errors.append(f"{page.relative_to(ROOT)}: missing main landmark")
    for href in parser.links:
        parts = urlsplit(href)
        if parts.scheme or href.startswith("//") or href.startswith("#"):
            continue
        if parts.path.startswith("/"):
            target = (ROOT / parts.path.lstrip("/")).resolve()
        else:
            target = (page.parent / parts.path).resolve()
        if not target.exists():
            errors.append(f"{page.relative_to(ROOT)}: missing local link {href}")

if errors:
    print("site check failed")
    print("\n".join(errors))
    raise SystemExit(1)

print(f"ok: checked {len(HTML_FILES)} HTML pages and their local links")
