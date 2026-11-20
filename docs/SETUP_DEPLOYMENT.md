# Deployment setup

## Current deployment

- Public site: <https://hassan200503.github.io/>
- Pages workflow: `.github/workflows/pages.yml`
- Pages source: **GitHub Actions**; no commit-back snapshot loop
- Verified Pages runs: `44757811192`, `44758660861`, `44760861423` (2026-11-20)
- Public artifact: `_site/`, assembled by `scripts/stage_site.py`

The workflow builds the GitHub snapshot and static pages, validates them, stages
only the public allowlist into `_site/`, checks the artifact surface, and uploads
`_site/` with `actions/upload-pages-artifact@v3`. It never uploads the repository
root, so the analytics Worker, relay, scripts, templates, tests, schemas, docs,
and repository metadata are not published.

The workflow uses the built-in `GITHUB_TOKEN` only for read access to repository
contents, Pages artifact upload, and the Pages deployment identity. It does not
commit `data/github.json` back to the repository.

The schedule is intentionally at minutes 17 and 47 rather than minute 0. GitHub
may delay scheduled runs; the webhook repository-dispatch path is the faster
refresh route. No keep-alive commit loop has been added.

Rollback: open **Settings → Pages**, select the previous source, and disable the
Pages workflow. The previous site files remain in Git history.

## Public artifact allowlist

`scripts/stage_site.py` copies the nine built pages, the two legacy redirect
stubs, CSS/JS, `data/github.json`, `robots.txt`, `sitemap.xml`, and the `fonts/`,
`vendor/`, `images/`, and `files/` directories. `scripts/check_artifact.py` then
fails if any private directory, source file, hidden file, package manifest, or
unexpected JSON is present.

Run both locally before pushing:

```sh
python scripts/build_site.py
python scripts/build_site.py --check
python scripts/check_site.py
python scripts/stage_site.py
python scripts/check_artifact.py
```

## Private visitor dashboard (`analytics-worker/`)

The public site is static. Everything private lives in `analytics-worker/`: one
Cloudflare Worker plus a D1 (SQLite) database. It is a separate deployable, so it
can be redeployed or rolled back without touching the site, and a failure there
can never break a page. The tracker in `analytics.js` posts to it with
`fetch(keepalive)` and falls back to `sendBeacon`.

Current deployment:

- Worker: <https://hassan-portfolio-analytics.rentmanagerke.workers.dev>
- Dashboard: <https://hassan-portfolio-analytics.rentmanagerke.workers.dev/admin>
- Health: <https://hassan-portfolio-analytics.rentmanagerke.workers.dev/healthz>
- D1: `hassan_portfolio_analytics`, id
  `804a5303-9e47-4d9b-b721-a7d8c2257372`
- Deployed version: `4cb96f2d-348b-4070-b3a2-379d049304aa` (2026-11-20)
- Configured secrets: `ADMIN_PASSPHRASE_HASH`, `ADMIN_PASSPHRASE_SALT`,
  `SESSION_SECRET`, `IPINFO_TOKEN`, `GITHUB_CONTENTS_TOKEN`
- Optional: `GITHUB_DISPATCH_TOKEN` for immediate rebuilds after a photo upload

Redeploy from `analytics-worker/`:

```sh
npx wrangler login
npx wrangler deploy
```

If the database ever has to be recreated:

1. `npx wrangler d1 create hassan_portfolio_analytics` and put the printed
   `database_id` into `wrangler.toml`.
2. `npx wrangler d1 execute hassan_portfolio_analytics --remote --file=./schema.sql`
   — creates the tables and indexes. Re-run it after any future schema edit.
3. `npm run hash-passphrase`. Type the dashboard passphrase twice. It prints
   `ADMIN_PASSPHRASE_SALT=` and `ADMIN_PASSPHRASE_HASH=` and stores neither the
   passphrase nor the output, so put the passphrase in a password manager now.
   Then, in this order:
   - `npx wrangler secret put ADMIN_PASSPHRASE_SALT`
   - `npx wrangler secret put ADMIN_PASSPHRASE_HASH`
4. `npx wrangler secret put SESSION_SECRET` — 32 random bytes, e.g.
   `openssl rand -hex 32`. Rotating it signs every existing admin session out.
5. `npx wrangler secret put IPINFO_TOKEN` — from your ipinfo.io account. Without
   it the dashboard still shows country, city, timezone, ASN and colo from
   Cloudflare, but not company, hosting/VPN/Tor flags.
6. `npx wrangler secret put GITHUB_CONTENTS_TOKEN` — a fine-grained personal
   access token scoped to **only** `hassan200503/hassan200503.github.io` with
   `Contents: Read and write`. This is what the dashboard uses to publish an
   uploaded profile photo; no photo data is stored in D1.
7. `npx wrangler secret put GITHUB_DISPATCH_TOKEN` — optional; a token with
   `Contents: Read and write` on the same repository. With it, an uploaded photo
   triggers the Pages rebuild immediately instead of waiting for the next
   scheduled run.
8. `npx wrangler deploy` — the deploy registers the daily `17 3 * * *` retention
   cron along with the routes.

Verify, in order:

- `/healthz` returns `{"ok":true,"storage":true}`. `storage:false` means the D1
  binding is missing or the schema has not been applied.
- `/admin` shows the sign-in page. After signing in, the dashboard lists your own
  visit within about 20 seconds if the site is open in another tab.
- `analytics.js` has `ENDPOINT` pointing at
  `…workers.dev/api/collect`. If you rename the Worker, change both.
- `ALLOWED_ORIGINS` in `wrangler.toml` is the exact origin of the live site
  (`https://hassan200503.github.io`) with no trailing slash and never `*`.
  A custom domain means adding it there too.

Set `OWNER_IPS` to your own comma-separated public IPs once you know them. Visits
from those addresses are stored and flagged but kept out of the headline figures,
so your own testing does not distort the numbers.

Notes: the dashboard is same-origin only, always `noindex`, and is not linked
from anywhere on the public site. It removes data older than `RETENTION_DAYS`
(180) on the daily sweep. Passphrase login is rate limited in D1 per source IP.
