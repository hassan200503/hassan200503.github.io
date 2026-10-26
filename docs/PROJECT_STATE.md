# Project state

Last updated: 2026-10-26

## Current task

P2 data pipeline: snapshot contract and fixture-tested shaping are implemented; technology file detection remains next.

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

## Blocked items

- Browser-based Lighthouse, axe, screenshot, keyboard, mobile, and no-JavaScript visual checks were not run because no browser automation or audit runner is available in the repository/environment.
- GitHub App and Cloudflare Worker remain decision gate G3 and require owner action.
- Pages deployment-source changes remain decision gate G2.

## Next three tasks

1. P2 data pipeline: add failure/fallback fixtures and snapshot-last-good behavior tests.
2. P2 data pipeline: compute project statistics from repository evidence and add them to the snapshot.
3. P3 deployment workflow: design the build-and-deploy workflow proposal; stop at G2 before changing Pages source.

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

P0 evidence and P1 foundation are documented. Continue with snapshot schema/fixture work. Do not rely on visual quality or performance targets until the missing browser measurements have been run.
