# Project state

Last updated: 2026-10-26

## Current task

P0 baseline and audit. The repository was cloned from `https://github.com/hassan200503/hassan200503.github.io` and inspected without changing site behavior.

## Completed work

- P0 repository inspection and baseline evidence recorded in `docs/AUDIT.md` (local commit pending).

## Blocked items

- Browser-based Lighthouse, axe, screenshot, keyboard, mobile, and no-JavaScript visual checks were not run because no browser automation or audit runner is available in the repository/environment.
- GitHub App and Cloudflare Worker remain decision gate G3 and require owner action.
- Pages deployment-source changes remain decision gate G2.

## Next three tasks

1. P1 foundation: add hand-edited profile and technology-map data, schemas, and a minimal build/validation entry point without changing rendered content.
2. P1 foundation: define shared partial/build strategy and CI validation skeleton; stop at G1 if a static-site generator becomes necessary.
3. P2 data pipeline: redesign the snapshot schema and generator around numeric repository IDs, evidence links, technology detection, and computed project statistics.

## Commands that work

- `git status --short`
- `git log -5 --oneline`
- `python -c "import json; ..."` for inspecting the checked-in snapshot
- `Get-Content` / `rg` for repository inspection

## Known defects

- Existing workflow has `contents: write`, commits generated snapshots, and pushes from Actions.
- Existing workflow does not include a monthly keep-alive, schema validation, test suite, or secret/link/accessibility/performance checks.
- Browser refresh in `github.js` has no ETag handling and uses localStorage caching; it merges by repository name rather than numeric ID.
- Technology ledger and manifest evidence are not generated.
- Shared header/footer markup is duplicated across eight HTML documents.
- Google Fonts, Lenis CSS, GSAP, ScrollTrigger, and Lenis are loaded from third parties; CSP/SRI and self-hosting are not implemented.
- Contact email and WhatsApp number are present in static HTML.

## Open questions

- Owner approval is required before changing contact presentation (G5).
- Owner approval is required before changing first-person factual copy or proficiency tiers (G5).
- Owner decision is required before changing Pages deployment source (G2).
- Owner must create/install the GitHub App and add Worker secrets at G3.

## Handover note

P0 evidence is documented. Continue with the first unblocked P1 slice. Do not rely on visual quality or performance targets until the missing browser measurements have been run.
