# Pages deployment setup

The repository now contains `.github/workflows/pages.yml`, which builds the snapshot and site in one run and deploys a Pages artifact without committing generated data.

Owner action after pushing the workflow:

1. Open the repository on GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Open the **Actions** tab and run **Build and deploy Pages** with **Run workflow**, or push a change to `main`.
5. Confirm the workflow reaches the **Deploy Pages artifact** step and open the published URL.

The workflow uses the built-in `GITHUB_TOKEN` only for read access to repository contents, Pages artifact upload, and the Pages deployment identity. It does not commit `data/github.json` back to the repository.

The schedule is intentionally at minutes 17 and 47 rather than minute 0. GitHub may delay scheduled runs; the future Worker repository-dispatch path is the faster refresh route. No keep-alive commit loop has been added.

Rollback: return to **Settings → Pages**, select the previous source, and disable the Pages workflow. The previous site files remain in Git history.
