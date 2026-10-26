# GitHub App and Cloudflare Worker setup (G3)

The relay code is in `worker/src/index.js`. It verifies `X-Hub-Signature-256` with HMAC-SHA-256, rejects unsigned/malformed requests, accepts only `repository` actions `edited`, `renamed`, `publicized`, `privatized`, `archived`, `unarchived`, `deleted`, and `transferred`, plus `push`, `release`, and `public`, and sends only `repository_dispatch` with event type `refresh-github-data`.

The code does not log webhook payloads. The 30-second coalescing window is best-effort per Worker isolate; the Pages workflow concurrency group remains the final protection against overlapping builds.

## Owner action: create and install the GitHub App

1. Open GitHub → profile picture → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**.
2. Set an identifiable name such as `Hassan Portfolio Refresh`.
3. Set **Webhook URL** to the deployed Worker URL. Leave the App uncreated until the Worker URL exists if you prefer to configure both together.
4. Generate a high-entropy webhook secret. Keep it out of this repository and browser logs.
5. Under **Repository permissions**, grant only **Metadata: Read-only**. The App needs event delivery, not repository contents.
6. Under **Subscribe to events**, enable **Repository**, **Push**, **Release**, and **Public**. Repository actions are filtered by the Worker.
7. Keep the App private, create it, then choose **Install App** and install it only on the repositories whose changes should refresh this portfolio. For the account-wide portfolio behavior, install it on all of Hassan’s public repositories.

GitHub’s current App documentation says webhook activation, URL, secret, permissions, and event subscriptions are configured in the App settings. The available event list depends on the selected permissions.

## Owner action: create the Worker and add secrets

1. Create a Cloudflare Worker named `hassan-portfolio-refresh` in the intended account.
2. Deploy the contents of `worker/` with Wrangler or the Cloudflare dashboard.
3. Add these Worker secrets; never commit their values:
   - `WEBHOOK_SECRET`: the exact secret entered in the GitHub App webhook settings.
   - `GITHUB_DISPATCH_TOKEN`: a fine-grained token scoped only to `hassan200503/hassan200503.github.io` with the minimum repository permission needed to call `repository_dispatch`.
4. In the Worker dashboard, confirm both secrets appear by name only, not by value.
5. Return to the GitHub App settings and save the Worker URL as the webhook URL, then use **Recent deliveries → Redeliver** on a test delivery.
6. Check that the Worker returns `202`, the Pages workflow starts, and the workflow completes successfully.

Cloudflare’s current documentation supports `wrangler secret put NAME` or dashboard **Workers & Pages → Worker → Settings → Variables and Secrets → Add**. Use the dashboard if Wrangler is not already installed; do not install global tooling without approval.

## Safe test

Use a repository description or topic edit on a public installed repository. Confirm one `repository_dispatch`-triggered Pages run. Do not paste a secret or full payload into an issue, log, or test fixture.
