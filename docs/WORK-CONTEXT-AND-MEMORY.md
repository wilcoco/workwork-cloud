# Work context and organizational memory

2026-09-22 · Workwork Cloud planning decision record

Status: the founder accepted the lightweight capture recommendations below. The LLM Wiki comparison informs the proposed architecture; it is not a claim of implemented functionality or market uniqueness. This document complements the [build plan](COMPACT-SAAS-PLAN.md) and [framework](WORK-ALIGNMENT-FRAMEWORK.md). The product keeps Work, Goals and Review as its three principal views.

## 1. Accepted employee-entry contract

Employees describe work once. The service builds connections and process knowledge. No new context field, case creation, taxonomy choice, goal mapping, process design or routine approval of an AI link is a prerequisite for saving or receiving value.

| Optional context | Meaning | Default interaction |
|---|---|---|
| Related work | The specific case/request/job this activity concerns, with a stable internal ID | **Continue this work** carries the case reference from an existing log/request. Standalone entry can show recent or inferred matches; unresolved identity remains allowed |
| Result/output | What was produced, changed, measured or discovered | Extract from narrative and attachments; show a concise correctable result alongside activity state |
| Next dependency | The input, output or decision needed next, with relevant provider/recipient and requested time when known | Extract statements such as waiting for a revised drawing; clarification is optional and focused |

**Pilot priority:** implement Continue this work before expanding the form. Existing task-state, issue and next-action fields should be reused and clarified, not duplicated. A case can span several people and days. An entry may contain several activities and cases; never force a single case/status onto every statement in a daily log.

The service may apply supported, reversible identity matches automatically while keeping their basis visible. A product, vehicle model, supplier or machine can participate in many separate cases. Shared entity names alone must not collapse them into one case. New internal IDs are system-managed; employees do not maintain a case taxonomy.

Use at most one high-value clarification at a time. Saving proceeds even if it is ignored. Avoid repeatedly asking the same unresolved question across a case. Inferred owners, dates, measurements and case matches must not be filled merely to complete the form.

## 2. Conditional context and separate states

| Context | Capture when | Interpretation rule |
|---|---|---|
| Actual occurrence date/time | A date differs from the work date, sequence is ambiguous, or a deadline comparison needs it | Keep occurrence time, reporting date, recording time and requested due time separate. A day-level default is not an exact observed timestamp |
| Measurement details | A number is being used as an outcome | Preserve value, unit, sample/batch or population, applicable specification/version, period and source where needed. Flag incompatible units and unclear denominators |
| Supporting material | A file, photo, report or source link substantiates a useful claim | An attachment supplies evidence; it is not verification by itself |

An activity can be completed while its intended outcome remains unmet. Store activity state, observed result, case state and required acceptance separately. Explicit acceptance applies to genuine workflow conditions, not to every captured record. Future plans do not become completed events.

Dependencies distinguish information-only links, required outputs and required decisions. Mentioning a colleague, selecting a recipient or generating a suggestion does not establish accepted responsibility or approval authority. New assignments and notifications require the ordinary authorized work-request action; knowledge extraction alone does not send them.

### Synthetic design example

Case DEMO-17 concerns replacement-fixture delivery. A request requires arrival by 10:00. A later entry opened through Continue this work says assembly finished at 09:10 and arrival occurred around 09:40. The system can connect the entries and calculate a reported arrival about 20 minutes before the requested time. It preserves the reported nature of the timestamps and does not infer company-wide on-time performance from that one case.

A separate inspection says testing finished but two samples failed. Preserve both facts and the unresolved correction. A department name alone does not prove that the department accepted the follow-up.

All examples in this repository are synthetic. No customer exports, original employee quotes or internal data-review findings belong here.

## 3. Relationship to Karpathy's LLM Wiki

Karpathy describes an LLM-maintained, persistent set of interconnected knowledge pages derived from source material, guided by a schema and maintained through ingestion, querying and consistency checks. His original description explicitly includes business/team use. [Original LLM Wiki idea, published April 4, 2026](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) (reviewed September 22, 2026).

Our design interpretation: its source-to-knowledge flow is a useful bottom-up analogy. Workwork Cloud also has an explicit top-down path: management defines objectives, assigns work and prescribes mandatory processes. The service connects those expectations to observed case state, collaboration dependencies, process patterns and measured results. Calling it a business wiki alone does not explain those requirements. This comparison does not claim that the LLM Wiki pattern prohibits top-down schemas or goals. The potential distinction must be demonstrated through useful outputs and low setup/maintenance effort for manufacturing SMBs.

The analogy does not require Markdown as the primary operational database, an Obsidian dependency, or a fourth Wiki screen. Those are implementation/UI choices, not accepted product requirements.

## 4. Proposed knowledge and operational layers

| Layer | Responsibility | Boundary |
|---|---|---|
| Source evidence | Work records, replies, requests, files and sourced measurements, with identifiers and revisions | AI-generated interpretations do not overwrite originals; authorized corrections remain traceable |
| Structured operational model | Shared cases, assigned tasks, versioned process requirements, events, outputs, typed dependencies, goal/metric definitions and observations | Distinguish expectations, reports, calculated values, authorized assignments, accepted commitments and inferred relationships; deterministic validation governs authoritative state changes |
| Derived organizational knowledge | Case summaries, capability/context suggestions, recurring patterns, exceptions and reusable explanations | Maintain source links, scope, derivation version and freshness. Repetition does not turn a practice into an approved standard |
| Work / Goals / Review | Capture evidence, define expectations, inspect processes and outcomes, record an agreed next action | An agreed action produces new work evidence; a generated recommendation is not an executed action |

New evidence updates the relevant case and derived knowledge. Reusable knowledge can inform a later case; its applicability and source dates remain visible. Customer/team permissions apply to every layer, including summaries, search, files, generated maps and model context. Combining sources must not reveal a restricted source through an unrestricted summary.

Management requirements enter this model directly; they do not need to be discovered from work history. Store prescribed processes separately from observed patterns and suggested improvements. An authorized assignment is distinct from acknowledgement or acceptance; a generated suggestion establishes none of these on its own. Management can authorize individual work or standing rules for creating work when a defined trigger occurs.

Compare evidence with the requirement version, scope and effective time applicable to the case. Later changes must not retrospectively turn earlier work into a violation. Missing evidence, demonstrated deviation, an authorized exception and an unmet business target are different findings. See the [top-down requirements contract](COMPACT-SAAS-PLAN.md#2c-top-down-requirements-meet-bottom-up-evidence).

## 5. Incremental maintenance rules

1. On capture, preserve source content and revision, then extract activities and context with evidence references. Avoid duplicate events when the same report arrives through multiple paths.
2. Update supported case relationships and goal relevance without making employees maintain the model. Keep conflicting claims and uncertain links identifiable.
3. Recalculate applicable measurements only when their definition, unit, scope, period and source are sufficient. Never use log count, completion percentage or generated prose as a substitute for business actuals.
4. Refresh affected case histories and process patterns rather than rebuilding unrelated material. Preserve historical decisions and the evidence available when they were made.
5. When a source changes, mark dependent interpretations stale and re-evaluate them. Permission changes, corrections and deletion/retention requirements must propagate to generated knowledge and retrieval too.
6. Check for contradictions, missing/inaccessible sources, conflicting dates or units, stale dependencies and unsupported process edges. Expose useful issues in Review without creating a mandatory employee annotation queue.
7. Save useful analyses with their evidence references and derivation version so later work can reuse them. Recheck their applicability when goals, measurements, procedures or source facts change.

## 6. Pilot acceptance and evaluation

- Saving a plain narrative succeeds without related-work selection, a result field or a next-dependency field.
- Continue this work preserves the originating reference across authors and dates where access permits it.
- Two cases involving the same product remain separate unless their identities are supported. A mixed daily log can contribute to several cases.
- A completed test and an unresolved quality issue coexist. A future due date remains a plan; posting order does not establish event order.
- A person's mention does not create an assignment; a required decision remains distinct from information sharing.
- Management can prescribe an assignment or mandatory procedure before work is recorded, while employee logging remains independent of manual mapping. Changes in requirements preserve the historical baseline and applicable exceptions.
- A required inspection with no captured record yields an evidence gap. A process deviation requires supporting case identity, event facts and timing; completed required steps do not by themselves establish KPI achievement.
- Correcting an event time or unit refreshes affected calculations and explanations while preserving provenance. Restricted evidence is not exposed in generated views.
- Original manual/AI/no-goal classifications remain traceable when the new system proposes case-level relationships. Relevance does not become causal credit.
- The product/service team evaluates sampled correctness, unsupported case merges, process-edge support, mapping precision and coverage, freshness and calculation reproducibility. Employees are not the default labeling workforce.
- Measure entry time and clarification burden alongside linkage quality and decision usefulness. Agree thresholds before the pilot; do not claim accuracy or adoption gains before measuring them.

These are design acceptance conditions. The current repository still contains specifications and a concept preview; no production extraction or knowledge-maintenance backend is implied.
