# v0.3 implementation contract

This version adds an evidence-backed process map and traceable work-log corrections within Work / Goals / Review. Existing accounts and records remain compatible. No legacy service or customer data is involved.

## Process map API

`GET /api/state` adds `processMaps`, computed by `buildProcessMaps(state, review, operating)` from the same authenticated company state used by Review.

```js
{
  version: 1,
  cases: [{
    caseId,
    nodes: [{ id, label, kind, status, evidence: [], participants: [] }],
    edges: [{ id, from, to, kind, label, reason, evidence: [] }],
    requirements: [{ requirementId, title, version, steps: [{ id, title, status, nodeIds: [], evidence: [] }] }],
    objectiveLinks: [{ goalId, nodeIds: [], reason, evidence: [] }],
    warnings: []
  }]
}
```

- Evidence: `{ logId, eventId, quote, sourceField, authorName, occurredAt, recordedAt, revision }`.
- Participant: `{ id, name }`, derived from record authors only.
- Node kinds: `activity`, `waiting`, `record`. Status is a descriptive source state such as `completed`, `in_progress`, `planned`, `blocked`, `recorded`, `resolved`, `uncertain`.
- Group supported activity evidence conservatively; keep uncovered events accessible as record nodes. Node IDs need only be stable for the same input.
- Edge kinds: `explicit_dependency` and `resolution`. Dependencies use validated explicit source wording; resolution uses the already computed matching later result. Shared occurrence times, author order, task completion and prescribed step order create no observed edges.
- Required steps remain separate from observed nodes. Matching lines mean potential evidence, not compliance or causal effect. Step status uses the existing review values `evidence_found` / `not_evidenced`.
- Objective relationships remain suggested relevance with exact source evidence, never claimed business impact.
- Clicking a node/edge/step opens its sources. A readable non-graph representation remains available. An empty/sparse graph explains missing support rather than inventing connections.

## Correct a work record

`PATCH /api/logs/:id` accepts `{ expectedRevision, text, result, nextDependency, occurredAt, reason }`.

- Authors may correct their own work; company managers may correct company work. Other members and other companies cannot edit the record. Session, origin, CSRF, validation and extraction limits still apply.
- `expectedRevision` is a positive integer; old records default to revision 1. Stale changes return 409 and do not overwrite current data.
- Text/result/dependency/time represent the complete corrected source, with existing length/date rules. `reason` is required, up to 500 characters.
- Re-extract corrected sources using current company context, then atomically save the previous snapshot and current corrected record. Preserve original log ID, author ID/name and original creation time; store revision, updatedAt and updatedBy. Corrections can change case references and therefore active derivations; old snapshots preserve previous attribution. Do not alter unrelated existing case identities.
- `GET /api/logs/:id/history` returns `{ logId, currentRevision, revisions: [{ revision, log, changedAt, changedBy: { id, name }, reason }] }`, newest first and including current source. History is scoped to the authenticated company. Baseline reason may be `Original record`.
- `/api/state.logs` contains current sources only, including `revision` (default 1 for old records). Historical records never re-enter active analysis. Empty former cases must not produce live findings or recurring-pattern denominator entries.
- UI explains that saving a correction refreshes the process and findings. A version conflict retains the entered draft; history shows who changed what and why.

## Acceptance

An explicit prerequisite becomes a source-backed edge; unconnected consecutive activities do not. A later QA approval resolves a wait; correcting that approval to pending reopens the active finding and removes the resolution edge while retaining both source revisions. KPI actuals remain independent. New and existing companies remain isolated, including history and generated maps. Demonstrate with synthetic manufacturing records only.
