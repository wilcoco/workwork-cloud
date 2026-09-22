# Connected operating review — implementation contract

The accepted next iteration makes intent, collaborative work, unresolved dependencies and outcomes visible together. Keep Work / Goals / Review and existing company isolation. Employees still save plain narratives without mapping. All demonstrations are synthetic. No legacy service/data access or new external AI configuration is needed.

## Ownership

- Operating analysis agent: `server/operating-review.mjs`, `tests/operating-review.test.mjs` only.
- Frontend agent: `public/app.js`, `public/styles.css`, `public/index.html` only.
- Regression/demo agent: `scripts/seed-operating-demo.mjs`, `tests/operating-api.test.mjs` only.
- Root: integration in `server/app.mjs`, live goal relevance in `server/analysis.mjs`, package/docs, verification, publication.

## API integration

Existing `/api/state` adds `operating`, computed using `buildOperatingReview(state, review)` from a pure new module. Existing `review` stays backward compatible. `state` is company scoped `{goals,requirements,tasks,logs,cases,measurements}`. `review.cases` contains validated source events and suggested requirement applicability. No caller-supplied company data crosses this scope. Never mutate raw logs or original extraction while recomputing interpretations.

`Evidence` = `{logId,eventId,quote,sourceField,authorName,occurredAt,recordedAt}` from a validated review event; optional fields null, never fabricated. Comparisons use occurrence time; missing occurrence time means ordering unknown and must not silently clear a prior blocker. Record time is not event order. Existing source dialog resolves `logId` and highlights `quote`.

New output (all arrays always present):

```
{
  version: 1,
  cases: [{
    caseId, title, goalIds: [string], participants: [{id,name}],
    statement: string,
    readiness: 'needs_attention'|'evidence_available'|'uncertain',
    blockers: [{id,key,label,status:'open'|'resolved'|'uncertain',openedBy:Evidence,resolvedBy:Evidence|null,reason}],
    milestones: [{key,label,state:'reported_complete'|'waiting'|'not_evidenced',evidence:[Evidence]}],
    openTaskIds:[string],
    nextAction: {title,description}|null
  }],
  goalSummaries: [{goalId,caseIds:[string],needsAttentionCaseIds:[string]}],
  attention: [{id,kind:'waiting'|'measurement_gap'|'unlinked_work',caseId:null|string,goalId:null|string,title,detail,evidence:[Evidence],suggestedTask:{title,description,goalId:null|string,caseId:null|string}|null,existingTaskIds:[string]}],
  patterns: [{id,goalId:null|string,requirementId:null|string,label,count,total,caseIds:[string],cohortCaseIds:[string],cohortLabel,evidence:[Evidence]}],
  processPatterns: [{id,goalId:null|string,requirementId:null|string,title,caseCount,caseIds:[string],activities:[{key,label,count,caseIds:[string],evidence:[Evidence]}]}],
  warnings:[string]
}
```

## Interpretation behavior

- Recognize a bounded set of explicit waiting topics (QA release/approval, carrier collection, material arrival, revised drawing) in English and Korean. Preserve unknown blockers as unresolved quoted evidence. A new explicit matching completion in the same case can resolve a dated prior wait when its occurrence time is strictly later; retain both source records. A different approval/topic, negation, future plan, rejected approval or a completed team task never clears it. Undated or same-time contradictory claims remain uncertain. A later explicit wait can reopen the topic. An unrelated completed activity never clears a case-wide blocker.
- Case statement should name supported completed work and the active waiting issue. No actual operational readiness/acceptance/compliance guarantee; display as reported evidence. Do not say the entire case is complete because a blocker resolved.
- Participants come from authors of that case's records, not colleague mentions. Milestones normalize clear completed activities (inspection/rework/packing/release/dispatch) and attach sources. Do not turn contextual nouns into performed steps.
- Patterns count distinct cases within an explicit displayed cohort (same suggested requirement or goal); include denominator case IDs. A reported wait stays in historical pattern counts after resolution. Require at least 2 cases before a recurring pattern is shown. Keep different case types/goals separate. No company-wide prevalence or causal KPI claim.
- Process patterns aggregate performed activities across comparable recorded cases. Label them discovered activity patterns, not prescribed/causal sequence. No unsupported arrows just from timestamps. Existing explicit dependencies remain available in source case detail.
- Attention queue distinguishes reported waiting, unavailable/out-of-target measured actuals, and work without supported objective links. Suggest a follow-up; do not create/assign/send it automatically. Existing case task IDs allow UI to show current follow-ups without claiming they resolve evidence.
- Current goal definitions can reinterpret earlier source events; root will refresh suggested relevance during `buildReview`. Preserve source records and measurements unchanged.

## Product experience

Managers land in Review (members in Work). Lead with useful attention and the company-objective → shared work case → evidence/result connection, not record-count tiles. An objective selector filters connected cases and the separate sourced KPI result. Case selection shows the evidence-backed statement, participants, current blockers/resolution history, prescribed-vs-recorded steps and discovered process/activity pattern. Source links must be one click away. Show unknowns as unknown and distinguish suggestions from recorded facts.

Manager action “Create follow-up” opens the existing task dialog prefilled with suggested title/description/case/objective. Saving explicitly authorizes a team task; existing API enforces manager access. Members may inspect evidence and continue work but cannot authorize tasks. Keep existing Work / Goals CRUD accessible and preserve all prior safety/role behavior. UI errors retain drafts. No simulated values, AI-branded static insights or hard-coded business findings.

## Acceptance scenario

Management defines on-time delivery and required inspection/release/packing/dispatch. Three different authors report inspection, packing and waiting for QA release on a shared order. Review connects those records, names the wait, compares required steps and shows the independent actual KPI. Manager creates a linked follow-up. A new dated explicit QA release event changes the live case to show that wait as resolved, with history intact. Additional comparable cases show a sourced recurring wait and discovered activity pattern. A later-added relevant objective becomes linked to the earlier evidence without changing the original log.
