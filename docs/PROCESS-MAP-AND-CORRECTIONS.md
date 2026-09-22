# Process maps and source corrections — v0.3

Review now turns each shared case into an inspectable process map. Management's required steps sit alongside the recorded activities, and each suggested match can be traced to the employee's source. The company objective remains connected by suggested relevance; its measured KPI is still an independent observation.

## What an arrow means

Two kinds of arrows are supported:

- **Explicit prerequisite:** a source says an activity occurred only after another supported activity in the same case. The current baseline recognizes a bounded English/Korean wording set within one work record.
- **Later matching resolution:** a source-backed waiting issue has a matching completion with an explicitly later occurrence time. This clears that reported wait, not the entire case.

Activities that merely occurred on successive dates remain unconnected. Required step order is a management expectation and never creates an observed arrow. A repeated activity stays identifiable as a separate event so its evidence is not silently combined with a different execution. Clicking a node, relationship or requirement exposes its source records, authors and revisions. A list alternative supports inspection without reading the diagram.

This is a bounded process-discovery pilot. It does not yet reconstruct arbitrary business processes, infer cross-record prerequisites from vague prose, infer accepted handoffs from people mentioned in a log, or generate executable BPMN.

## Correcting a work record

The author or a company manager can open a source, choose **Correct record**, change its text, result, dependency or occurrence time, and provide a short reason. Saving re-extracts the corrected source and refreshes the current case, objective relationships, process map and waiting findings.

The original record identity, author and creation time are preserved. Revision history keeps the prior source and extraction, the editor, change time and reason. Historical versions are available for inspection but never count as additional current work. A corrected order reference can move evidence into another case without renaming the original case or keeping its empty former case in live findings and pattern denominators.

If another person corrects the same record while the form is open, saving returns a conflict. The entered draft remains available; it does not silently overwrite the newer version. Current company permissions apply equally to original sources, revision history and generated maps.

## Local demonstration

```sh
npm run demo:process
npm start
```

The command creates a new synthetic **Forge Works · Process Demo** company and prints local manager credentials. It leaves existing companies in place and refuses production or Railway seeding.

- **FORGE-101:** inspection and packing have an explicitly reported prerequisite, while QA release is still waiting.
- **FORGE-102:** a mistaken approval was corrected to pending. Its map reflects the correction; the earlier approval remains in revision history.
- **FORGE-103:** later QA approval resolves an earlier wait with both source records retained.
- **FORGE-104:** recorded activities include QA release and dispatch without a reported wait.

Try correcting the approval in FORGE-103 to “QA release is pending for order FORGE-103 shipment.” The resolution arrow disappears and the waiting finding returns. The delivery KPI stays at its separately recorded 94% actual against a 98% target.

## Deployment and remaining scope

The revision table is created additively on startup; existing records are treated as revision 1. Keep the existing single-replica SQLite persistent volume and backup practices described in [Railway deployment](RAILWAY-DEPLOYMENT.md). No migration of the old worklog service is involved.

Automatic broad process mining, interpretation snapshots, management process version editing, attachments/imports, billing and production account recovery remain future work. This release stores source revision history and computes current derived views; it does not introduce an autonomous background knowledge-writing service.
