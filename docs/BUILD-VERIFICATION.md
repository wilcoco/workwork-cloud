# MVP build verification — 2026-09-22

## Process maps and source revisions — v0.3.0

- `npm run check` passed, including process-map and browser code.
- `npm test`: **124 tests passed**, zero failures. The 27 additional tests cover map provenance, source revisions and the complete correction-to-recomputed-review workflow.
- Process checks: no arrows from timestamps or required step order; explicit prerequisite evidence; report mentions do not establish performed inspections; distinct repeated activities; current revision attribution; required-step and objective source matches; corrected/removed evidence cannot retain a resolution edge or empty former case.
- Revision checks: author/manager access; other-member and cross-company rejection; CSRF; complete field validation; quotas; conflicts before and after asynchronous extraction; atomic rollback; preserved authorship and exact prior snapshots; legacy revision-1 compatibility; history persistence after restart.
- Browser acceptance: inspected the actual source wording behind an inspection-to-packing arrow; opened a resolved case; corrected its approval to pending as a manager; verified the wait returned, the resolution arrow disappeared and required QA evidence became absent. Both versions, editor identity, reason and exact original occurrence time remained visible in history. The independent KPI remained unchanged.
- Visual check: the required/recorded lanes and source dialogs were inspected in the in-app browser. The map includes keyboard-operable controls and a readable list alternative; exhaustive device and accessibility testing remains future work.
- The new `demo:process` fixture uses a separate synthetic company and demonstrates both a corrected record and a resolved wait. No customer data, live AI call or Railway deployment was used. Docker configuration is unchanged; prior container verification below was not repeated for this update.

## Connected Review update — v0.2.0

- `npm run check` passed, including the new operating-review module and updated browser code.
- `npm test`: **97 tests passed**, zero failures. The 29 additional tests cover current-objective relevance, operating interpretation and API acceptance with synthetic data.
- Interpretation checks cover English/Korean waits, matching later completion, reopened waits, missing/tied occurrence times, contradictory and negative evidence, unrelated approvals, actual record authors, cohort denominators and task/evidence separation.
- API acceptance checks cover three contributors in one case; a later QA approval resolving the reported wait while preserving its source history; a new objective relating to prior evidence; historical waiting in three of four cases; manager-only follow-up creation; and company isolation for all operating insights and sources.
- Browser acceptance: a manager opened the connected Review, inspected a shared case and required-versus-recorded steps, created a source-based follow-up, continued the case with a later dated QA approval, and returned to the updated Review. The wait resolved, its earlier evidence remained, the follow-up task remained independently open, and the measured delivery KPI stayed at 94% against a 98% target. The historical waiting cohort remained three of four cases.
- Visual check: the objective, independent KPI, case selector and selected case statement are visible together at the tested 1280 × 720 viewport. Source and measurement details expand on demand.
- The connected demo creates a separate synthetic company with real invited member accounts through the local API. Tests verify that the seed script refuses production/Railway environments before creating a database.
- No live AI provider, production data or Railway deployment was used for this update. The interpretation is a bounded projection recomputed from saved evidence; it is not a general process-mining engine or a background memory service. Docker files were unchanged and the original container verification below was not repeated for v0.2.0.

## Original MVP checks — v0.1.0

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
