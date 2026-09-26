# Deploy the independent MVP on Railway

Use `wilcoco/workwork-cloud`. Do not select the existing workwork service or its database. The repository includes a Dockerfile and `railway.json`.

## Current public MVP — 2026-09-26

- Public URL: [Workwork Cloud](https://workwork-cloud-production.up.railway.app).
- Project/service: a new independent `workwork-cloud` project and service, in the `production` environment. [Railway dashboard](https://railway.com/project/ff91f657-6946-42e8-84f2-7c06d0977068/service/fd3dfe5e-d334-447f-b5bc-5d0098b1a446?environmentId=e937a91d-26d5-4441-b7cc-cd08955e2263).
- Application source: v0.3, commit `0599324`. Uploaded from a clean Git archive through the Railway CLI. Railway's GitHub integration returned `repo not found`, so GitHub automatic deployments are not enabled.
- New volume: `workwork-cloud-volume`, mounted at `/data`; one replica; baseline rule extraction. `PORT=3000` and `APP_ORIGIN=https://workwork-cloud-production.up.railway.app`.
- Public registration starts a new workspace. Local accounts, demo databases and environment files were not uploaded.

To publish a subsequent verified release from a clean checkout of this repository, use the exact independent target:

```sh
railway up --project ff91f657-6946-42e8-84f2-7c06d0977068 --service fd3dfe5e-d334-447f-b5bc-5d0098b1a446 --environment e937a91d-26d5-4441-b7cc-cd08955e2263 --detach
```

Keep `.gitignore` and `.dockerignore` in effect; never add `--no-gitignore` or include local databases/secrets. Preserve the attached volume when deploying updates. The instructions below describe creating an additional independent deployment and ongoing operating requirements.

## Setup

1. Create a **new Railway project** and deploy a service from the `wilcoco/workwork-cloud` GitHub repository, branch `main` (or the reviewed MVP branch while testing). Railway must have access to this private repository.
2. Attach a **new volume** to this service with mount path **`/data`**. The volume is required: container filesystem storage alone does not persist across replacements.
3. Keep **one replica**. All companies are isolated workspaces within the one application/database. Multiple companies do not require multiple app replicas.
4. Set service variables:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `HOST` | `0.0.0.0` |
   | `DATABASE_PATH` | `/data/workwork.sqlite` |
   | `APP_ORIGIN` | Your exact HTTPS public URL, for example `https://your-new-service.up.railway.app` |
   | `WORKWORK_AI_MODE` | `rules` initially |

5. Generate a public domain in Networking settings, copy it into `APP_ORIGIN` **without a trailing slash**, and redeploy. An initial deployment can fail until the origin is configured; production startup intentionally requires it. Railway supplies `PORT`; the server listens on it.
6. Confirm `/api/health` returns `{"status":"ok"}`. Open the HTTPS root URL and register your first company. There are **no built-in production accounts**.
7. Create a second test company with a different email and confirm that it starts empty. Invite an employee from the first company and verify Work / Goals / Review access. Use synthetic work for the first smoke test.
8. Redeploy and confirm both companies and their saved records remain. Configure volume backups in Railway and test restoration into a **separate test service** before accepting real customer records.

The database initializes its independent schema automatically on first start. No legacy migration or existing database URL is used. Sessions are stored persistently and cookies require HTTPS in production.

## Optional AI extraction

After the baseline pilot is running, add a **new project-scoped** OpenAI API key through Railway Variables:

```text
WORKWORK_AI_MODE=openai
OPENAI_API_KEY=<set privately in Railway>
OPENAI_MODEL=gpt-4.1-mini
```

Never commit a real key. Do not reuse secrets from the legacy service. Enabling this mode sends the newly submitted narrative, optional output/dependency and up to 50 goal definitions **from that company only** to OpenAI. The implementation uses the Responses API with structured output and `store: false`. Model suggestions are validated against source quotes and allowed company goal IDs. An API failure, timeout or invalid output falls back to baseline extraction and adds a visible warning to the saved log. Structured output does not guarantee factual correctness. Existing logs are not automatically reprocessed when switching modes.

The API integration is covered by mock-based tests. A live provider smoke test requires your new key and has not been performed as part of the local build. Set provider spending limits before inviting external companies; per-company billing and durable AI usage quotas are not in this pilot.

## Operational limits

- SQLite and one persistent-volume replica support this first multi-company pilot. This version has no multi-region/high-availability guarantee. Plan managed PostgreSQL plus shared job/rate-limit storage before horizontal scaling.
- Keep the volume across redeployments. Do not delete it to troubleshoot startup.
- `APP_ORIGIN` must match the browser's public URL. Changing domains requires updating that variable.
- Keep invitation links private; possession of a valid one-use link authorizes joining that workspace. There is no separate email ownership verification.
- This pilot does not collect subscription payments or provide password reset/email delivery. Resolve those before a paid public launch.
- Authentication has per-email and peer-address limits. `TRUST_PROXY_HOPS` defaults to `0`, ignoring untrusted forwarded headers. Set it to the verified number of reverse proxies only when your deployment's header handling is known; an incorrect value lets callers spoof the rate-limit identity. Company work submission is limited to 100 entries/hour and two concurrent extractions. Limits are in memory and reset on restart; they are not durable billing quotas.

References: [Railway volumes](https://docs.railway.com/volumes), [Railway config as code](https://docs.railway.com/config-as-code/reference), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1 mini model](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
