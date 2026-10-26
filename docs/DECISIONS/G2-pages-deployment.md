# G2 decision: GitHub Pages deployment source

Status: awaiting owner approval
Date: 2026-10-26

## Current evidence

The repository contains a static site and a data-refresh workflow with `contents: write` that commits `data/github.json`. No Pages deployment workflow is present, and the Pages settings source could not be inspected from this local repository.

## Proposed change

Deploy the generated site through a dedicated GitHub Actions workflow:

1. Checkout `main`.
2. Build the public GitHub snapshot into the workspace without committing it.
3. Validate profile, snapshot, fixtures, and generated HTML.
4. Run the hand-written static build.
5. Upload the repository root as a Pages artifact.
6. Deploy that artifact with `pages: write` and `id-token: write`.

Triggers would be pushes to `main`, manual dispatch, repository dispatch from the future Worker, and the existing off-peak schedule. The workflow would use read-only contents permission while building and would not write generated data back to Git history.

## Effect and rollback

- The Pages settings must be switched from the current source to **GitHub Actions**. That settings change is the G2 owner action.
- Generated snapshots stop creating hourly history commits and commit loops.
- A failed build leaves the previous Pages deployment in place because deployment occurs only after validation and artifact creation succeed.
- Rollback is to select the previous Pages source in repository Settings → Pages and disable the new deployment workflow; no content rewrite is required.

## Owner decision

Approve or reject switching the repository’s GitHub Pages deployment source to GitHub Actions after the deployment workflow is prepared.
