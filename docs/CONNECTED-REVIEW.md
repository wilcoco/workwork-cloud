# Connected operating review

This iteration addresses the gap between the original product idea and an ordinary work-log/goal dashboard. Review brings a management objective, collaborative case, source evidence, current waiting issues and measured outcome together. It is the default view for managers; employees still start in Work.

## What changes when work changes

The server derives the operating view from the company's saved source records on every state refresh. This means a new work record, goal, task or measurement is reflected when the workspace refreshes. Derived review does not change original log text or extraction. Since v0.3, an authorized source correction creates a new current revision and preserves prior versions separately.

Each shared case contains:

- Suggested links to company objectives and the separate sourced KPI measurement.
- Participating authors, supported performed activities, and management's applicable process requirements.
- Explicit waiting issues, any later matching resolution evidence, and the reason for the current interpretation.
- A suggested next action that a manager can authorize as an ordinary team task.

An objective added after work was recorded can become related to that earlier evidence. This is recalculated relevance, not proof that the activity achieved or caused the objective's result.

## Evidence and time rules

The first operating interpreter recognizes a bounded set of waiting topics: QA release/approval, carrier collection, material arrival and revised drawings, plus otherwise reported blockers. It uses source-backed events and explicit text rules. Optional model extraction remains available for event interpretation; the operating decisions do not depend on a model API call.

A positive matching event in the same case may resolve an earlier wait only when its occurrence time is explicitly later. A plan, rejected approval, another kind of approval, task checkbox, dependency-field assertion or unrelated completed action does not resolve it. Conflicting or unknown event times remain uncertain. The earlier waiting evidence stays visible after resolution, and a later wait can reopen the issue. Removing one waiting issue does not certify that a shipment or entire case is ready.

The actual event time remains optional at capture. When it is missing, the product explains the resulting uncertainty instead of treating record time as occurrence time.

## Accumulated process knowledge

Review summarizes reported waiting topics and performed activity patterns across comparable recorded cases. Every displayed pattern identifies its cohort, numerator, denominator and evidence. Counts refer to the recorded cases in that cohort, not all company operations. A historical wait remains in the count after its individual case is resolved.

Activity patterns show which supported activities recur. They are not a general process-mining algorithm, prescribed process, or causal sequence. Explicit source-backed dependency edges and management-required steps remain distinct. Shared activity names do not establish a handoff, and pattern frequency does not establish a recommended standard.

## Try the manufacturing scenario locally

```sh
npm run demo:connected
npm start
```

The command creates a new synthetic company and prints its manager's local sign-in credentials. It refuses production/Railway seeding. It creates employee accounts through one-use invitations, so shared case evidence has real separate authors within the demo workspace.

The demo contains four delivery cases, with three reporting a QA release wait and one of those subsequently resolved. Their KPI measurement remains independent: a case update does not change the reported delivery percentage.

1. Open Review and select the delivery objective and a case with an open QA release wait.
2. Inspect the case's inspection/packing evidence, collaborating authors, applicable required steps and quoted waiting record.
3. Use **Create follow-up** to review and authorize a linked team task. Saving the task does not resolve the underlying waiting evidence.
4. Use **Continue this work** and record an actual matching QA release approval with an occurrence time later than the waiting event.
5. Return to Review: the case preserves the original wait and shows the source that resolved it. Historical pattern counts still include the case.

Use a second empty company to check that it sees none of the first company's cases, insights, patterns or source records.

## Remaining scope

This is a computed operating view over persistent evidence, not a separate autonomous knowledge-writing service. Background ingestion, broad semantic case reconciliation, general process mining, saved interpretation revisions, process version editing, notifications and automated operational enforcement remain future work. Paid subscriptions and public-launch operations retain the limits in [MVP-STATUS.md](MVP-STATUS.md).
