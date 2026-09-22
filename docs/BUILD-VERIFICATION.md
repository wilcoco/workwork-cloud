# MVP build verification — 2026-09-22

## Executed checks

- `npm run check`: all server and browser JavaScript syntax checks passed.
- `npm test`: **68 tests passed**, zero failures. Tests use synthetic records and isolated temporary SQLite databases.
- API coverage: separate-company registration/read/write boundaries; foreign goal/case/task rejection; manager/member authorization; one-use invitations and expiration; session expiry/logout; CSRF and origin checks; validation; restart persistence; production Secure cookies; rate and extraction-concurrency limits.
- Analysis coverage: English/Korean work states, source-field evidence, narrow case context, conflicting references, explicit dependencies, incomplete/planned/negative work, dated required-step evidence, and comparable actual measurements. Narrative quantities never become KPI actuals.
- AI adapter coverage: mocked structured responses, case/source attribution, invalid quotes/IDs/structures, missing keys, unavailable provider and fallback. **No live provider call was performed.**
- Browser journey: signed in to a synthetic manufacturing company; registered a second company and verified its empty workspace; created objective and prescribed process; saved narrative with optional evidence/dependency/time; inspected required versus recorded steps; entered a sourced measurement and observed its target gap; used Continue this work and verified the case count stayed unchanged.
- Docker image built successfully. A separate test container started with production variables and a new persistent volume. Health, static assets, company signup and Secure session cookie passed. The synthetic account remained usable after a container restart. The test container was stopped afterward.

## Corrections found during verification

- A shipment mentioned as inspection context no longer counts as evidence of actual dispatch.
- Optional result/dependency fields now share a single clearly established case; they do not create orphan cases for the same scoped entry.
- Ambiguous references cannot silently attach to the continued case.
- Percentage target differences display percentage points.
- Signout and company changes clear transient workspace drafts and views.

## Not verified here

No Railway deployment, real customer import, live AI call, payment processing or public launch was performed. Railway deployment instructions are in [RAILWAY-DEPLOYMENT.md](RAILWAY-DEPLOYMENT.md). This pilot requires deployment-level backup/restore and operational checks before customer use. Browser tests used the in-app viewport; exhaustive device/accessibility testing remains future work.
