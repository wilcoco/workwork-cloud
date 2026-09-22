# Workwork Cloud

A working multi-company pilot for manufacturing SMBs. Management defines objectives and required work. Employees describe daily work. The service builds source-linked case histories, suggests goal relationships, and compares recorded evidence and measurements with management expectations.

## Run locally

Requires **Node.js 22.14 or newer**. There are no third-party runtime packages to install.

```sh
cp .env.example .env
npm start
```

Open **http://127.0.0.1:3000** and choose **Create company**. Each signup creates a separate workspace and its manager. Managers can invite employees through a single-use join link; no email is sent automatically. A login email belongs to one company in this MVP.

To create an optional local synthetic manufacturing company before starting the server:

```sh
npm run demo
npm start
```

The demo command prints a randomly generated local password once. Save it to sign in as `manager@demo.workwork.test`. It refuses to run in production or Railway. Normal signup starts empty; no demo credentials or customer data ship with the app.

## What works

- Company registration and sign-in, manager/member roles, expiring sessions and one-use invitations.
- **Work:** persistent narratives, optional output/dependency/time, automatic event splitting, case references, “Continue this work,” and management-created team tasks.
- **Goals:** objectives with one measurable target each, source-labelled actual observations, and version 1 process requirements with an effective date.
- **Review:** source-linked goal associations, case evidence timelines, explicit dependencies where supported, provisional required-step evidence, open/completed task counts, and target/actual comparisons.
- Company-scoped storage, password hashing, CSRF protection, request limits, and automated isolation tests.
- Railway Docker deployment with a separate persistent volume and a single app replica.

Baseline extraction runs locally using conservative English/Korean text rules. It is a working extractor, but it will miss relationships outside its rules. Optional OpenAI extraction provides language-model event and goal suggestions with exact source-quote validation and fallback when unavailable. It is **not enabled by default**. Neither mode turns narrative numbers into verified KPI measurements or makes an activity association proof of causation.

See [Railway deployment](docs/RAILWAY-DEPLOYMENT.md), [pilot scope and limitations](docs/MVP-STATUS.md), and [the implementation contract](docs/MVP-CONTRACT.md).

## Validate

```sh
npm run check
npm test
```

Tests use isolated temporary databases, synthetic data and mocked AI responses. They do not contact the old application, customer databases, or an AI provider.

## Product boundary

This repository is independent of `wilcoco/FDE`, `wilcoco/workwork`, and their Railway services. Use a **new Railway project/service, volume and secrets**. Never reuse the existing production database or run legacy migrations.

This is a functional pilot, not a production subscription launch. Paid billing, email verification/recovery, operational monitoring, data export/retention controls, comprehensive permissions and production hardening remain launch work. The embedded SQLite database supports multiple isolated company workspaces on one app replica; horizontal scaling requires a database migration.

## Planning material

- [Compact SaaS plan](docs/COMPACT-SAAS-PLAN.md)
- [Work alignment framework](docs/WORK-ALIGNMENT-FRAMEWORK.md)
- [Work context and organizational memory](docs/WORK-CONTEXT-AND-MEMORY.md)
- [Original concept preview](prototype/index.html) — historical visual prototype, separate from the working app in `public/` and `server/`.
