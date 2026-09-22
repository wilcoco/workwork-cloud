# MVP scope and acceptance

The first runnable product is a **multi-company cloud pilot** intended for an independent Railway service. It is not connected to the existing worklog service or customer data.

## Included user journey

1. A manager registers a company; the workspace starts empty.
2. The manager adds an objective with a KPI target, a required operating process and authorized team tasks.
3. The manager invites employees using expiring one-use links.
4. Employees save narratives with optional results, dependencies and occurrence times. No goal mapping or process drawing is required.
5. The system extracts evidence events, connects explicit case references/continuations, and suggests objective relationships.
6. Review displays source evidence, observed timelines/dependencies, provisional required-step comparisons and measured target gaps.
7. Managers record actual observations with unit, scope, date and source. The app preserves unmatched/absent measurements instead of inferring success from activity.
8. Managers open a connected operating review: objective, shared case, participants, waiting issues, matching resolution history and measured result. They can authorize a follow-up directly from an evidence-backed finding.
9. Comparable recorded cases produce sourced waiting counts and normalized activity patterns. Adding a relevant objective refreshes links to earlier evidence without overwriting original logs.
10. A source-backed process map shows observed activity nodes, explicitly supported prerequisites and later matching resolutions alongside required steps and suggested objective relationships.
11. Authors and managers can correct work records with a reason. Prior revisions remain inspectable, while active findings and maps refresh from current evidence only. Concurrent corrections cannot silently overwrite each other.

## Meaning of the outputs

- **Goal relationship:** suggested relevance, not causal attribution or approved performance scoring.
- **Work state:** what the narrative reports; completion can coexist with a failed test or unresolved business issue.
- **Observed process:** events and explicitly supported dependencies within a case. A chronological timeline does not establish a mandatory process or causal edge.
- **Required step:** management-authored version 1 with effective date. Applicability and evidence matching are provisional. “Not evidenced” is not proof of nonperformance.
- **KPI actual:** a manager-entered, source-labelled observation with matching unit, scope and reporting period. This is self-reported evidence, not an audited integration. The pilot uses the most recent matching observation rather than aggregating daily values.

## Deliberate first-release limits

- One membership per login email; managers invite members. No cross-company administrator UI.
- Company-shared operational data; no department/document-level permissions.
- One metric per objective; no OKR tree or weighted rollups yet.
- Team tasks, not personal assignment or recurring automated task generation. Completing a team task records a claim, not proof of its outcome.
- Traceable source corrections with immutable prior snapshots are included; no delete/retention workflow yet. No file attachments, external worklog import or ERP integrations.
- Rules start at version 1 and cannot yet be revised through the interface. No binding automated compliance verdict, exception approval or workflow enforcement.
- Case IDs rely on explicit references or continuation; ambiguous narrative similarity does not merge cases automatically.
- Bounded cross-case activity/waiting aggregation is included; general process mining and autonomous semantic memory maintenance are not. Current goals re-evaluate prior validated evidence during review. There is no background re-ingestion, stored interpretation history or process-version editing.
- Optional AI extraction validates quotes and known goal IDs, but semantic interpretation needs pilot evaluation. No live provider validation was possible without a new key.
- No paid subscriptions, email verification/recovery, data retention/export management, payment entitlements or billing quotas. These are required before a paid public launch.
- One SQLite database with company-scoped access on one replica. Database-level tenant policies, managed PostgreSQL, background extraction workers and distributed limits remain scale-up work.

## Pilot checks

Automated tests cover tenant boundaries, role checks, session and CSRF behavior, input validation, persistence, case continuation, conservative extraction, source provenance, measurement comparability and AI failure handling. Browser checks cover primary signup/login, narrative capture, management forms and source review journeys. See the latest build handoff for actual results; this document describes intended scope, not a claim that future changes passed.

The next product decision should be based on observed pilot use: can an employee record work without extra mapping, and can management discover a useful gap with enough evidence to act?

See [Connected operating review](CONNECTED-REVIEW.md) for the newer objective/case/evidence experience and its synthetic acceptance scenario.

See [Process maps and corrections](PROCESS-MAP-AND-CORRECTIONS.md) for v0.3 source-driven maps, revision history and the Forge Works demonstration.
