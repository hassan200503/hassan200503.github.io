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

## Private visitor dashboard (`analytics-worker/`)

The public site is static. Everything private lives in `analytics-worker/`: one
Cloudflare Worker plus a D1 (SQLite) database. It is a separate deployable, so it
can be redeployed or rolled back without touching the site, and a failure there
can never break a page. The tracker in `analytics.js` posts to it with
`fetch(keepalive)` and falls back to `sendBeacon`.

Owner action, in `analytics-worker/`:

1. `npx wrangler login` — one-time browser authorisation of your Cloudflare account.
2. `npx wrangler d1 create hassan_portfolio_analytics` — copy the printed
   `database_id` into `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
   Nothing works until this is a real id: `/healthz` reports `storage: false`
   and `/api/collect` answers `503` while it is still a placeholder.
3. `npx wrangler d1 execute hassan_portfolio_analytics --remote --file=./schema.sql`
   — creates the tables and indexes. Re-run it after any future schema edit.
4. `npm run hash-passphrase`. Type the dashboard passphrase twice. It prints
   `ADMIN_PASSPHRASE_SALT=` and `ADMIN_PASSPHRASE_HASH=` and stores neither the
   passphrase nor the output, so put the passphrase in a password manager now.
   Then, in this order:
   - `npx wrangler secret put ADMIN_PASSPHRASE_SALT`
   - `npx wrangler secret put ADMIN_PASSPHRASE_HASH`
5. `npx wrangler secret put SESSION_SECRET` — 32 random bytes, e.g.
   `openssl rand -hex 32`. Rotating it signs every existing admin session out.
6. `npx wrangler secret put IPINFO_TOKEN` — from your ipinfo.io account. Without
   it the dashboard still shows country, city, timezone, ASN and colo from
   Cloudflare, but not company, hosting/VPN/Tor flags.
7. `npx wrangler secret put GITHUB_CONTENTS_TOKEN` — a fine-grained personal
   access token scoped to **only** `hassan200503/hassan200503.github.io` with
   `Contents: Read and write`. This is what the dashboard uses to publish an
   uploaded profile photo; no photo data is stored in D1.
8. Optional: `npx wrangler secret put GITHUB_DISPATCH_TOKEN` — a token with
   `Contents: Read and write` on the same repository. With it, an uploaded photo
   triggers the Pages rebuild immediately instead of waiting for the next
   scheduled run. Without it the upload still succeeds and goes live on that run.
9. `npx wrangler deploy` — the deploy registers the daily `17 3 * * *` retention
   cron along with the routes.

Then verify, in order:

- `https://hassan-portfolio-analytics.rentmanagerke.workers.dev/healthz` returns
  `{"ok":true,"storage":true}`. `storage:false` means step 2 is incomplete.
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
