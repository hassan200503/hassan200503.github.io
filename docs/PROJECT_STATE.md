# Project state

Last updated: 2026-10-26

## Current task

G3 decision: webhook relay code is complete and tested; owner must create/install the GitHub App, deploy the Worker, and add its secrets.

## Completed work

- P0 repository inspection and baseline evidence recorded in `docs/AUDIT.md` (commit `596e317`).
- P1 data foundation slice: added `data/profile.json`, `data/tech-map.json`, schemas for both, and dependency-free validation in `scripts/validate_data.py`.
- P1 CI smoke slice: added `scripts/check_site.py` and `.github/workflows/ci.yml` with read-only permissions; root-relative link handling was fixed after the first failing run (commits `e8872eb`, `d1df67a`); deployment workflow is unchanged.
- G1 resolved with owner approval: `scripts/build_site.py` now renders all 9 published pages from shared header/footer partials and page-owned head/content/tail fragments. The generated output matched the existing pages before commit (`9628dfc`). No framework was added.
- P2 snapshot contract: added `schemas/github.schema.json`, numeric repository IDs, visibility topic rules, source/technology-ledger fields, and `scripts/validate_github_snapshot.py`.
- P2 fixture tests: added `scripts/github_snapshot.py` and `tests/test_github_snapshot.py` covering HTML in descriptions, missing languages, forks, archived repositories, hidden repositories, numeric IDs, and aggregate data.
- Regenerated `data/github.json` successfully from the public GitHub API locally; it reports 7 repositories and 10 languages at `2026-10-26T10:35:42Z`.
- P2 technology detector: added pure language/file/manifest matching with repository-relative evidence URLs and fixture coverage (`f7134ea`). Live generator wiring remains intentionally next so it can be added with controlled API calls.
- P2 live evidence wiring: the generator now reads recursive repository trees plus bounded manifest/config contents, applies `data/tech-map.json`, and drops detections without a proving file path. The latest snapshot has no null evidence paths.
- P2 fallback hardening: malformed or unexpectedly empty candidates now preserve the existing snapshot; fixture coverage includes API-error and empty-candidate behavior.
- P2 browser refresh: reduced metadata cache to 5 minutes, added ETag/304 handling, numeric-ID merging, topic filters, and visible last-snapshot status on API failure; `node --check github.js` passes.
- P2 no-JavaScript baseline: the build now pre-renders GitHub stats, language footprint, technology ledger, and escaped repository cards into `index.html`; the JS layer enhances those hosts instead of owning their existence.
- P2 computed project stats: generated `data/github.json` now carries migrations, modules, and test-source-file counts; the build replaces legacy hard-coded counts across the home, work, skills, and case-study pages. Latest backend values: 100 migrations, 21 modules, 262 test source files.
- G2 proposal documented in `docs/DECISIONS/G2-pages-deployment.md`; no Pages settings or deployment workflow has been changed yet.
- G2 implementation: `.github/workflows/pages.yml` builds, validates, uploads, and deploys the site artifact; the old commit-back snapshot workflow was removed. Setup is documented in `docs/SETUP_DEPLOYMENT.md`.
- G3 implementation: `worker/src/index.js` verifies signatures, filters events/actions, coalesces bursts, and dispatches refreshes; four signed-fixture tests pass. Owner setup is documented in `docs/SETUP_WEBHOOK.md`.
- Deployment verification: commit `a1bcfbe` is pushed; Site checks run `40312571360` and Pages deployment run `40312571367` both completed successfully. Pages API reports `build_type: workflow` and `status: built`.

## Blocked items

- Browser-based Lighthouse, axe, screenshot, keyboard, mobile, and no-JavaScript visual checks were not run because no browser automation or audit runner is available in the repository/environment.
- GitHub App and Cloudflare Worker remain decision gate G3 and require owner action.
- Pages deployment-source changes remain decision gate G2.

## Next three tasks

1. Owner G3 action: create/install the GitHub App, deploy the Worker, and add `WEBHOOK_SECRET` and `GITHUB_DISPATCH_TOKEN`.
2. After G3: verify a real repository metadata change reaches one Pages workflow and measure latency.
3. P5 visual/accessibility refinement and browser-based quality verification.

## Commands that work

- `git status --short`
- `git log -5 --oneline`
- `python -c "import json; ..."` for inspecting the checked-in snapshot
- `python scripts/validate_data.py`
- `python scripts/check_site.py`
- `python scripts/build_site.py --check`
- `python scripts/validate_github_snapshot.py`
- `python -m unittest discover -s tests -p 'test_*.py' -v`
- `python -m compileall -q scripts`
- `Get-Content` / `rg` for repository inspection

## Known defects

- Existing workflow has `contents: write`, commits generated snapshots, and pushes from Actions.
- Existing workflow does not include a monthly keep-alive, schema validation, test suite, or secret/link/accessibility/performance checks.
- Browser refresh in `github.js` has no ETag handling and uses localStorage caching; it merges by repository name rather than numeric ID.
- Technology ledger and manifest evidence are not generated.
- Snapshot technology arrays and ledger are currently empty for live data; manifest/configuration detection is the next P2 slice.
- The CI smoke check is intentionally not a full HTML, axe, Lighthouse, or schema validator yet.
- Generated pages are now produced from shared shell partials; page-owned head/content/tail fragments remain intentionally separate.
- Google Fonts, Lenis CSS, GSAP, ScrollTrigger, and Lenis are loaded from third parties; CSP/SRI and self-hosting are not implemented.
- Contact email and WhatsApp number are present in static HTML.

## Open questions

- Owner approval is required before changing contact presentation (G5).
- Owner approval is required before changing first-person factual copy or proficiency tiers (G5).
- Owner decision is required before changing Pages deployment source (G2).
- G1 is resolved: owner approved the framework-free custom build approach.
- Owner must create/install the GitHub App and add Worker secrets at G3.

## Handover note

P0–P2 evidence, G2 deployment, and G3 relay code are documented. Work is paused at G3 pending the owner’s App/Worker/secrets actions. Do not rely on visual quality or performance targets until the missing browser measurements have been run.
