# Project state

Last updated: 2026-10-26

## Current task

G1 decision: choose whether to introduce a small custom static build/template step for the duplicated page shell.

## Completed work

- P0 repository inspection and baseline evidence recorded in `docs/AUDIT.md` (commit `596e317`).
- P1 data foundation slice: added `data/profile.json`, `data/tech-map.json`, schemas for both, and dependency-free validation in `scripts/validate_data.py`.
- P1 CI smoke slice: added `scripts/check_site.py` and `.github/workflows/ci.yml` with read-only permissions; root-relative link handling was fixed after the first failing run (commits `e8872eb`, `d1df67a`); deployment workflow is unchanged.

## Blocked items

- Browser-based Lighthouse, axe, screenshot, keyboard, mobile, and no-JavaScript visual checks were not run because no browser automation or audit runner is available in the repository/environment.
- GitHub App and Cloudflare Worker remain decision gate G3 and require owner action.
- Pages deployment-source changes remain decision gate G2.

## Next three tasks

1. P1 foundation: decide whether shared partials can be introduced with a small build script; stop at G1 if a static-site generator becomes necessary.
2. P1 foundation: add snapshot schema validation and a build smoke check without changing rendered content.
3. P2 data pipeline: redesign the snapshot schema and generator around numeric repository IDs, evidence links, technology detection, and computed project statistics.

## Commands that work

- `git status --short`
- `git log -5 --oneline`
- `python -c "import json; ..."` for inspecting the checked-in snapshot
- `python scripts/validate_data.py`
- `python scripts/check_site.py`
- `python -m compileall -q scripts`
- `Get-Content` / `rg` for repository inspection

## Known defects

- Existing workflow has `contents: write`, commits generated snapshots, and pushes from Actions.
- Existing workflow does not include a monthly keep-alive, schema validation, test suite, or secret/link/accessibility/performance checks.
- Browser refresh in `github.js` has no ETag handling and uses localStorage caching; it merges by repository name rather than numeric ID.
- Technology ledger and manifest evidence are not generated.
- The CI smoke check is intentionally not a full HTML, axe, Lighthouse, or schema validator yet.
- Shared header/footer markup is duplicated across eight HTML documents.
- Google Fonts, Lenis CSS, GSAP, ScrollTrigger, and Lenis are loaded from third parties; CSP/SRI and self-hosting are not implemented.
- Contact email and WhatsApp number are present in static HTML.

## Open questions

- Owner approval is required before changing contact presentation (G5).
- Owner approval is required before changing first-person factual copy or proficiency tiers (G5).
- Owner decision is required before changing Pages deployment source (G2).
- G1 is now reached: eight HTML pages each contain their own header/footer shell. A shared-partial implementation would require generated HTML or a template build step; no framework is required, but it is still a static-site-generator decision.
- Owner must create/install the GitHub App and add Worker secrets at G3.

## Handover note

P0 evidence and the initial P1 slices are documented. Work is paused at G1 pending the owner’s choice. Do not rely on visual quality or performance targets until the missing browser measurements have been run.
