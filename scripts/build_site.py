#!/usr/bin/env python3
"""Build the static pages from shared shell partials and page fragments.

The first migration is intentionally mechanical: head metadata, page content,
and script tails stay page-owned, while the skip link/header and footer become
shared. No framework or runtime dependency is introduced.
"""
from __future__ import annotations

import argparse
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
    return output


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
