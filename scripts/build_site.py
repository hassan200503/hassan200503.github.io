#!/usr/bin/env python3
"""Build the static pages from shared shell partials and page fragments.

The first migration is intentionally mechanical: head metadata, page content,
and script tails stay page-owned, while the skip link/header and footer become
shared. No framework or runtime dependency is introduced.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_ROOT = ROOT / "templates"
PARTIAL_ROOT = TEMPLATE_ROOT / "partials"
PAGE_ROOT = TEMPLATE_ROOT / "pages"
PAGES = [
    Path("index.html"),
    Path("work.html"),
    Path("skills.html"),
    Path("services.html"),
    Path("about.html"),
    Path("documents.html"),
    Path("contact.html"),
    Path("404.html"),
    Path("work/rentmanager.html"),
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", newline="\n")


def page_key(page: Path) -> str:
    return page.as_posix().replace("/", "__").replace(".html", "")


def base_for(page: Path) -> str:
    if page.name == "404.html":
        return "/"
    return "../" if len(page.parts) > 1 else ""


def normalize_shell(shell: str, page: Path) -> str:
    """Turn root-page shell links into relative-path and active-page tokens."""
    if page.name == "404.html":
        shell = shell.replace('href="/index.html', 'href="{{base}}index.html')
        shell = shell.replace('href="/work', 'href="{{base}}work')
        shell = shell.replace('href="/skills', 'href="{{base}}skills')
        shell = shell.replace('href="/services', 'href="{{base}}services')
        shell = shell.replace('href="/about', 'href="{{base}}about')
        shell = shell.replace('href="/documents', 'href="{{base}}documents')
        shell = shell.replace('href="/contact', 'href="{{base}}contact')
        shell = shell.replace('href="/files', 'href="{{base}}files')
    else:
        shell = shell.replace('href="../index.html', 'href="{{base}}index.html')
        shell = shell.replace('href="../work', 'href="{{base}}work')
        shell = shell.replace('href="../skills', 'href="{{base}}skills')
        shell = shell.replace('href="../services', 'href="{{base}}services')
        shell = shell.replace('href="../about', 'href="{{base}}about')
        shell = shell.replace('href="../documents', 'href="{{base}}documents')
        shell = shell.replace('href="../contact', 'href="{{base}}contact')
        shell = shell.replace('href="../files', 'href="{{base}}files')
        shell = shell.replace('href="files/', 'href="{{base}}files/')
        for name in ("index", "work", "skills", "services", "about", "documents", "contact"):
            shell = shell.replace(f'href="{name}.html', f'href="{{{{base}}}}{name}.html')
    shell = shell.replace('<div class="progress-rail" aria-hidden="true"></div>', '{{progress}}')
    shell = re.sub(r' aria-current="page"', "", shell)
    return shell


def extract_parts(page: Path, source: str):
    body_start = source.index("<body>") + len("<body>")
    main_start = source.index('<a class="skip-link"')
    header_end = source.index("</header>", main_start) + len("</header>")
    main_tag = source.index('<main id="main">', header_end)
    main_end = source.index("</main>", main_tag) + len("</main>")
    footer_start = source.index('<footer class="site-footer">', main_end)
    footer_end = source.index("</footer>", footer_start) + len("</footer>")
    return (
        source[:body_start],
        source[main_tag:main_end],
        source[footer_end:],
        source[main_start:header_end],
        source[footer_start:footer_end],
    )


def migrate() -> None:
    sources = {page: read(ROOT / page) for page in PAGES}
    _, _, _, header, footer = extract_parts(Path("index.html"), sources[Path("index.html")])
    write(PARTIAL_ROOT / "header.html", normalize_shell(header, Path("index.html")))
    write(PARTIAL_ROOT / "footer.html", normalize_shell(footer, Path("index.html")))

    for page, source in sources.items():
        prefix, main, suffix, _, _ = extract_parts(page, source)
        key = page_key(page)
        write(PAGE_ROOT / f"{key}.head.html", prefix)
        write(PAGE_ROOT / f"{key}.main.html", main)
        write(PAGE_ROOT / f"{key}.tail.html", suffix)


def render(page: Path) -> str:
    key = page_key(page)
    base = base_for(page)
    head = read(PAGE_ROOT / f"{key}.head.html")
    main = read(PAGE_ROOT / f"{key}.main.html")
    tail = read(PAGE_ROOT / f"{key}.tail.html")
    header = normalize_shell(read(PARTIAL_ROOT / "header.html"), page)
    footer = normalize_shell(read(PARTIAL_ROOT / "footer.html"), page)
    output = head + "\n\n" + header + "\n\n" + main + "\n\n" + footer + tail
    output = output.replace("{{base}}", base)
    availability = "#available" if page == Path("index.html") else f"{base}index.html#available"
    output = output.replace('href="#available"', f'href="{availability}"')
    if page.name == "404.html":
        output = output.replace("{{progress}}\n", "")
    else:
        output = output.replace("{{progress}}", '<div class="progress-rail" aria-hidden="true"></div>')
    current_page = "work" if page.parent.name == "work" else page.stem
    if current_page in {"index", "work", "skills", "services", "about", "documents", "contact"}:
        nav_start = output.index('<nav class="nav-links"')
        nav_end = output.index("</nav>", nav_start)
        nav = output[nav_start:nav_end]
        target = f'href="{base}{current_page}.html"'
        if current_page == "contact":
            target = target + ' class="nav-cta"'
            nav = nav.replace(target, target + ' aria-current="page"', 1)
        else:
            nav = nav.replace(target, target + ' aria-current="page"', 1)
        output = output[:nav_start] + nav + output[nav_end:]
    if page == Path("index.html"):
        output = prerender_github(output)
    elif (ROOT / "data/github.json").exists():
        with (ROOT / "data/github.json").open(encoding="utf-8") as handle:
            output = prerender_project_stats(output, json.load(handle))
    return output


def prerender_project_stats(output, data):
    backend = next((repo for repo in data.get("repos", []) if repo.get("name") == "rentmanager-backend"), None)
    if not backend:
        return output
    stats = backend.get("projectStats", {})
    migrations = int(stats.get("migrations", 0))
    modules = int(stats.get("modules", 0))
    tests = int((stats.get("tests") or {}).get("count", 0))
    output = output.replace('data-count="1588" data-sep>1,588', f'data-count="{tests}" data-sep>{tests:,}')
    output = output.replace('data-count="99">99', f'data-count="{migrations}">{migrations}')
    output = output.replace("20 modules", f"{modules} modules")
    output = output.replace("99 sequential migrations", f"{migrations} sequential migrations")
    output = output.replace("99 sequential Flyway migrations", f"{migrations} sequential Flyway migrations")
    output = output.replace("all 99 Flyway migrations", f"all {migrations} Flyway migrations")
    output = output.replace("1,588 backend tests", f"{tests:,} backend test source files")
    output = output.replace("1,588 tests", f"{tests:,} test source files")
    output = output.replace("latest at V104, ", "")
    return output


def esc(value):
    return html.escape("" if value is None else str(value), quote=True)


def safe_link(value):
    value = str(value or "")
    return value if value.startswith("https://") else "#"


def prerender_github(output):
    data_path = ROOT / "data/github.json"
    if not data_path.exists():
        return output
    with data_path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    totals = data.get("totals", {})
    stats = "".join(
        '<div class="stat"><span class="n">%s</span><span class="label">%s</span></div>' % (esc(value), esc(label))
        for value, label in (
            (totals.get("repos", 0), "public repositories"),
            (len(totals.get("languageBytes", {})), "languages in use"),
            ((totals.get("lastPush") or "")[:10] or "—", "last push"),
        )
    )
    language_items = "".join(
        '<li><span class="mono">%s</span> <span class="muted">%s bytes</span></li>' % (esc(language), esc(bytes_))
        for language, bytes_ in list(totals.get("languageBytes", {}).items())[:12]
    )
    footprint = '<ul class="footprint-key">%s</ul>' % language_items
    ledger_items = []
    for item in data.get("technologyLedger", []):
        evidence = item.get("evidence", [])
        links = " ".join(
            '<a class="small" href="%s" target="_blank" rel="noopener">%s ↗</a>' % (esc(safe_link(e.get("url"))), esc(e.get("path")))
            for e in evidence[:3]
        )
        ledger_items.append('<li><strong>%s</strong> <span class="muted">%s repos · %s</span><br>%s</li>' % (
            esc(item.get("technology")), esc(item.get("repoCount", 0)), esc(item.get("category", "")), links
        ))
    ledger = '<ul class="stack-list">%s</ul>' % "".join(ledger_items)
    cards = []
    for repo in data.get("repos", []):
        topics = "".join('<span class="topic">%s</span>' % esc(topic) for topic in (repo.get("topics") or [])[:6])
        live = repo.get("homepage")
        live_link = '<a class="repo-live" href="%s" target="_blank" rel="noopener">Live ↗</a>' % esc(safe_link(live)) if live else ""
        cards.append(
            '<article class="repo-card"><div class="repo-head"><h3><a href="%s" target="_blank" rel="noopener">%s</a></h3>%s</div><p class="repo-desc">%s</p><div class="repo-topics">%s</div><div class="repo-foot"><span>%s</span><span>updated %s</span></div></article>'
            % (esc(safe_link(repo.get("url"))), esc(repo.get("name")), live_link, esc(repo.get("description") or "No description on the repository yet."), topics, esc(repo.get("primaryLanguage") or "No primary language"), esc((repo.get("pushedAt") or "")[:10] or "unknown"))
        )
    repos = "".join(cards)
    stamp = '<span class="gh-stamp" data-github-stamp>Snapshot built %s</span>' % esc(data.get("generatedAt", "unknown"))
    output = re.sub(r'<span class="gh-stamp" data-github-stamp>.*?</span>', stamp, output, count=1, flags=re.S)
    output = output.replace('<div class="grid-3 mt-32" data-github-stats></div>', '<div class="grid-3 mt-32" data-github-stats>%s</div>' % stats)
    output = output.replace('<div class="mt-16" data-github-footprint></div>', '<div class="mt-16" data-github-footprint>%s</div>' % footprint)
    output = output.replace('<div class="mt-16" data-github-ledger></div>', '<div class="mt-16" data-github-ledger>%s</div>' % ledger)
    output = output.replace('<div class="repo-grid mt-24" data-github-repos></div>', '<div class="repo-grid mt-24" data-github-repos>%s</div>' % repos)
    return prerender_project_stats(output, data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--migrate", action="store_true", help="extract existing pages into templates")
    parser.add_argument("--check", action="store_true", help="compare generated pages with the working tree")
    args = parser.parse_args()
    if args.migrate:
        migrate()
    if not PARTIAL_ROOT.exists() or not PAGE_ROOT.exists():
        raise SystemExit("templates are missing; run with --migrate once")
    failures = []
    for page in PAGES:
        generated = render(page)
        target = ROOT / page
        if args.check:
            if generated != read(target):
                failures.append(str(page))
        else:
            write(target, generated)
    if failures:
        print("generated output differs: " + ", ".join(failures))
        return 1
    print(f"ok: {'checked' if args.check else 'built'} {len(PAGES)} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
