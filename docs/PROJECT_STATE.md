# Project state

Last updated: 2026-11-20

## Current state

The portfolio is live at <https://hassan200503.github.io/>. GitHub Pages is built
and deployed by `.github/workflows/pages.yml`; the private analytics dashboard is
a separate Cloudflare Worker, and the GitHub webhook relay is deployed as well.

- Pages: latest verified successful run `44666926490`; the live site served a
  snapshot stamped `2026-11-20T03:20:06Z` with 7 repositories and 11 languages.
- Analytics: <https://hassan-portfolio-analytics.rentmanagerke.workers.dev>;
  `/healthz` returned `{"ok":true,"storage":true}`, `/admin` served the sign-in
  page, and a wrong passphrase returned 401.
- Webhook relay: <https://hassan-portfolio-refresh.rentmanagerke.workers.dev/>;
  `GET` returns 405 by design, and repository-dispatch runs have completed.
- D1 database: `hassan_portfolio_analytics`, id
  `804a5303-9e47-4d9b-b721-a7d8c2257372`.

## Completed work

- P0 repository inspection and baseline evidence recorded in `docs/AUDIT.md`.
- P1 data foundation: `data/profile.json`, `data/tech-map.json`, schemas, and
  dependency-free validation in `scripts/validate_data.py`.
- P1 CI: `scripts/check_site.py` and `.github/workflows/ci.yml` with read-only
  permissions.
- G1: `scripts/build_site.py` renders all 9 published pages from shared partials
  and page-owned head/content/tail fragments.
- P2 snapshot contract, fixture tests, technology detection with evidence URLs,
  fallback hardening, browser refresh with ETag/304 handling, and no-JavaScript
  prerendering.
- P2 computed project stats: `data/github.json` carries migrations, modules, and
  test-source-file counts; the build updates the legacy hard-coded figures.
  Current RentManager values: 100 migrations, 21 modules, 262 test source files.
- G2: Pages builds, validates, and deploys an artifact without committing
  generated data. The workflow uses the built-in `GITHUB_TOKEN` only for read
  access and Pages deployment.
- G3: the relay verifies `X-Hub-Signature-256`, filters repository events,
  coalesces bursts, and dispatches `refresh-github-data`. The Worker and App are
  deployed and a real dispatch has completed.
- Security hardening: `scripts/stage_site.py` now assembles `_site/` from an
  explicit public allowlist, and `scripts/check_artifact.py` fails the build if
  internals, source files, hidden files, or non-public JSON reach the artifact.
- Stale-content cleanup: the site now links to the current `Lovora` repository
  instead of `LetsVibe`; the removed WhatsApp-bot copy is gone; the CV is
  regenerated with 21 modules, 100 migrations, 63 routes, Lovora, and Automata.
- Analytics session hardening: `verifySession` now rejects non-canonical
  base64url payload and signature encodings; all 27 analytics-worker tests pass.

## Open work

- Redeploy the analytics Worker with the canonical-signature fix. The live
  Worker still runs the previous build; deployment needs a Cloudflare API token
  or `npx wrangler login` on this machine.
- Browser-based Lighthouse, axe, keyboard, mobile, and no-JavaScript visual
  checks have not been run in this environment.
- GitHub scheduled Pages runs stopped after `2026-11-20T03:19` in the last
  observed window. The workflow is active and webhook dispatches still work;
  monitor the next scheduled run before treating this as a repository defect.

## Next three tasks

1. Deploy the analytics Worker after authenticating Wrangler, then re-run
   `npm test --prefix analytics-worker` and check `/healthz` and `/admin`.
2. Run the browser-based quality pass against the deployed site.
3. Confirm the scheduled Pages runs resume; if they do not, inspect the
   repository's Actions scheduling separately from the webhook path.

## Commands that work

- `git status --short`
- `git log -5 --oneline`
- `python scripts/validate_data.py`
- `python scripts/validate_github_snapshot.py`
- `python -m unittest discover -s tests -p 'test_*.py' -v`
- `npm test --prefix worker`
- `npm test --prefix analytics-worker`
- `python scripts/build_site.py`
- `python scripts/build_site.py --check`
- `python scripts/check_site.py`
- `python scripts/stage_site.py`
- `python scripts/check_artifact.py`
- `python scripts/build_cv.py`
- `python -m compileall -q scripts`

## Known defects and intentional behavior

- The live analytics Worker predates the canonical base64url signature check
  until it is redeployed.
- The daily retention cron and the public tracker are working; the dashboard is
  same-origin only, `noindex`, and not linked from the public site.
- `work.html` and `work/rentmanager.html` are intentional `noindex` redirect
  stubs for old URLs.
- Contact email and WhatsApp number are present in static HTML by design.
- Google Fonts are self-hosted; GSAP, ScrollTrigger, and Lenis are served from
  `vendor/`.

## Open questions

- Owner approval is required before changing first-person factual copy or
  proficiency tiers (G5).
- A Cloudflare credential is required to redeploy the analytics Worker from this
  environment.

## Handover note

Deploy the site by committing to `main`; Pages rebuilds the snapshot, stages
`_site/`, verifies the artifact surface, and deploys it. The analytics Worker and
webhook relay are separate Cloudflare deployments under `analytics-worker/` and
`worker/`. See `docs/SETUP_DEPLOYMENT.md` and `docs/SETUP_WEBHOOK.md` for the
current deployed URLs and redeploy steps.
