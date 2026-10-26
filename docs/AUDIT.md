# P0 baseline audit

Date: 2026-10-26

Repository: `hassan200503.github.io`, branch `main`, inspected from the local clone. No site files were changed for this audit.

## Structure and deployment

- Hand-written static HTML: `index.html`, `work.html`, `skills.html`, `services.html`, `about.html`, `documents.html`, `contact.html`, `404.html`, and `work/rentmanager.html`.
- Shared styles/scripts: `styles.css` (64,716 bytes), `script.js` (12,012 bytes), `motion.js` (11,093 bytes), `github.js` (13,732 bytes).
- Generated snapshot: `data/github.json`; current snapshot reports 7 repositories, 10 languages, and generated time `2026-10-26T06:16:28Z`.
- Existing workflow: `.github/workflows/github-data.yml`, scheduled at minute 17 hourly, plus manual, repository-dispatch, and limited push triggers.
- Existing workflow uses `contents: write`, commits `data/github.json`, and pushes generated changes. Pages deployment is not defined in this repository workflow; deployment source was not verified.
- No `package.json`, test runner, linter, schema files, build entry point, or CI quality workflow was found.

## GitHub data behavior

- `scripts/build_github_data.py` calls `gh api` for the profile, repository list, each repository's languages, and each repository's latest commit.
- The generator excludes forks and archived repositories and keys the generated records by `name`; numeric repository IDs are not stored.
- `github.js` first renders `data/github.json`, then makes one browser request to the public repository list endpoint. It does not make per-repository language calls, but it does not use ETags.
- Browser cache is localStorage with a 10-minute TTL in the current code, exceeding the brief's 5-minute requirement.
- The checked-in snapshot provides a useful fallback, but there is no visible last-synced/error state in the static HTML baseline.
- GitHub text is inserted into DOM text nodes in the inspected card path; the data pipeline and all future rendering paths still need explicit hostile-input tests.

## HTML, SEO, and structured data

- All primary pages have unique titles, descriptions, canonical URLs, and Open Graph metadata. `404.html` has no description/canonical/structured data.
- JSON-LD was found on `index.html` (`Person`) and `work/rentmanager.html` (`TechArticle`); other pages have none.
- `sitemap.xml` and `robots.txt` exist. No web app manifest or explicit favicon set beyond inline SVG favicon markup was found.
- Core project content is present in HTML on `index.html` and `work.html`; the GitHub repository grid is populated by `github.js` from the pre-rendered snapshot path, but the audit did not run with JavaScript disabled in a browser.

## Accessibility and motion

- Skip links, labelled primary/footer navigation, visible reduced-motion CSS/media-query handling, and `aria-hidden` on decorative marquee content were found by source inspection.
- `motion.js` checks `prefers-reduced-motion` before Lenis/GSAP motion. Smooth scrolling and scroll-triggered effects therefore need runtime verification for keyboard focus, anchor links, browser find, and layout shift.
- `skills.html` contains visual meter elements (`--lvl:5`, `--lvl:3`, `--lvl:1`), which conflicts with the brief's no-percentage-bars requirement and should be replaced with text tiers.
- axe scan: **not run** (no axe runner available).
- Keyboard-only and screen-reader behavior: **not run**.
- Reduced-motion runtime behavior: **not run**.

## Performance and visual baseline

- Lighthouse mobile: **not run**.
- Lighthouse desktop: **not run**.
- LCP, CLS, and INP: **not measured**.
- Screenshots at 360px, 768px, and 1440px: **not captured**.
- Page weight and compressed transfer size: **not measured**. Source assets include 64,716 bytes CSS and 36,837 bytes JavaScript before compression; external Google Fonts and jsDelivr resources are also requested.
- Lighthouse CI and performance budgets: **not configured**.

## Privacy and security observations

- Email and WhatsApp phone number appear as visible static text/URLs on multiple pages, including the footer.
- Google Fonts, jsDelivr, and FormSubmit are third-party requests. No CSP or SRI was found in the inspected pages.
- External links generally use `target="_blank" rel="noopener"`; this needs a complete link audit.
- No secrets were found by source inspection; secret scanning was **not run**.
- Webhook signature verification is not present because the Worker has not been implemented.

## Duplication and stale claims

- Header and footer markup is repeated across all primary pages; the same colophon appears on each page.
- `data/github.json` contains a profile bio with “3 years of experience”; experience and project statistics are not computed from a single profile source.
- The workflow comment says generated data is committed hourly, confirming the current architecture is not yet the requested build-time snapshot/deploy model.

## Link and validation checks

- Automated link check: **not run**.
- HTML validation: **not run**.
- Existing URLs observed and must remain working: `/`, `/work.html`, `/skills.html`, `/services.html`, `/about.html`, `/documents.html`, `/contact.html`, `/work/rentmanager.html`, `/404.html`.

## Ranked findings

1. High: no measured quality baseline or automated quality gates; recruiter-facing performance/accessibility claims cannot yet be verified.
2. High: the data workflow writes commits and pushes with broad contents write permission; it conflicts with the requested build-and-deploy architecture and can create stale/fragile history.
3. High: data is keyed by repository name and lacks technology evidence, numeric IDs, schemas, and computed project statistics.
4. High: static contact details are scrapeable; changing them requires owner approval at G5.
5. Medium: browser cache is 10 minutes and has no ETag/error status, so freshness and failure behavior do not meet the brief.
6. Medium: third-party fonts/scripts and duplicated page shells increase resilience, privacy, and maintenance risk.
7. Medium: visual proficiency meters conflict with the requested evidence-based text tiers.
