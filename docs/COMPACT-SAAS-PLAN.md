# Workwork Cloud — Product and Independent Build Plan

2026-09-22 · Updated with accepted work-entry decisions and organizational-memory design for the private `wilcoco/workwork-cloud` repository

**Project boundary:** Workwork Cloud is a separate product. All new implementation belongs in `wilcoco/workwork-cloud`, with its own application, database, storage, secrets and deployment. The existing FDE and Workwork repositories, applications and production data remain unchanged. Development and demonstrations start with synthetic data.

## 1. A clear product goal

> Help manufacturing SMB teams record daily work, understand recurring processes, and act on the gap between their goals and measured results.

The initial buyer is an owner or operations manager at a manufacturing SMB. Employees supply work records; managers use automatically generated process and outcome views to make decisions; metric owners maintain actual measurements. The first deployment scope is one team and one recurring operational problem, with one to three agreed metrics. Those pilot limits are a recommendation for validating the new product.

The founder has selected manufacturing SMBs, daily work records as the foundation, top-down OKR/KPI support, process discovery and outcome comparison, and a compact subscription-based cloud service. Exact pricing, packaging limits, payment provider, and long-term customer-isolation architecture remain open.

**Operating-experience requirement:** the founder reports that asking employees to enter goal/work mappings or define processes does not work in practice. The service must automatically construct objective–work–result associations and observed process models. Mandatory employee mapping, taxonomy selection, process drawing, or approval of every AI association is excluded from the core workflow. Management can nevertheless prescribe tasks and required processes; this is a separate top-down input. Here an objective is a desired outcome, a task is assigned work, and a business object is an order, part or other subject of that work.

Workwork Cloud will provide a repeatable subscription product with a clear customer boundary, dependable outputs, onboarding, subscription access and maintainable releases. Experience with the existing service informs this design; the new product has an independent implementation and release lifecycle.

## 2. Three main views

| View | Primary interaction | Inputs and outputs |
|---|---|---|
| Work | See relevant assigned work and describe what happened; the service extracts jobs, activities, results and blockers | Authorized assignments and bottom-up daily records; useful summaries and handoffs without mapping tasks |
| Goals | Define objectives, required operating processes, metric rules, targets and ownership; configure actual-data sources once | Versioned management expectations; OKRs and KPIs share metric definitions and observations |
| Review | Inspect generated processes against applicable requirements and compare targets with actual outcomes | Evidence for process adherence, unresolved execution gaps and outcome gaps; decisions and optional corrections |

Process discovery lives inside Review initially. Company settings, member invitations, access roles, subscription and billing sit in an administration area. Employee access and the default landing view should follow the person's role; not every employee needs a management dashboard.

Compactness also means fewer required steps. An employee should be able to record work without first creating or selecting an Objective, KR, Initiative, or formal process. The service performs case/job matching and goal association after capture. Missing information remains visible as a coverage limitation, rather than becoming an employee classification queue.

The initial entry can be a short narrative describing **what the employee did and what happened**. Job/order references can be extracted from that narrative or supplied as optional context. Evidence and additional detail are available when useful. Work date/time must remain distinct from entry time, even when defaulted. A single daily report may contain several separately linkable activities.

## 2A. Automation is part of the core product

| Automatic stage | Service responsibility | Limit on the conclusion |
|---|---|---|
| Interpret work | Split a daily entry into activities; extract outputs, blockers, recognizable case IDs, entities and occurrence times | Preserve source text; missing or ambiguous facts remain unknown |
| Associate objectives | Match activities to active objectives/KRs using metric definitions, team context and prior evidence | Relevant work can support several goals; association is not causal contribution |
| Associate results | Identify metric observations and retrieve actuals from configured sources | Use numeric facts only when metric, unit, scope and period are identifiable; do not estimate outcome achievement from activity counts |
| Construct processes | Normalize activity vocabulary, assemble identifiable case traces, and generate recurring patterns and variants | Without sufficient sequencing evidence, show an activity-pattern map and suggested workflow rather than assert an observed sequence |
| Compare required work | Match observed activities and outputs to authorized tasks and applicable mandatory process steps/order | Use the requirement version effective for the case; missing evidence alone does not establish omitted work |
| Explain gaps | Compare target with current sourced actual, show relevant cases and candidate blockers | Expose missing coverage; explanations remain hypotheses unless substantiated |

The system automatically applies sufficiently supported, reversible associations with source references and derivation versions. It retains uncertain candidates internally and excludes unsupported links from definitive totals. Confidence thresholds must be calibrated on representative records. Optional corrections and targeted questions can improve the model; daily service delivery must not depend on employees reviewing every link.

Process generation runs as records accumulate; a user need not open a process designer or initiate every run. Distinguish the automatically generated **observed process** from a **suggested standard process**, which can also use existing manuals. Automatically assigning people new work under a changed procedure is a separate consequential action and is not implied by generating a process map.

For the first pilot, evaluate the automated outputs using a sampled retrospective review by the product/service team. This is quality evaluation, not an employee workflow. Measure mapping precision and mapping coverage together, process-edge support, erroneous case merges, and reproducibility of outcome calculations.

## 2B. Accepted work-entry context and accumulated company knowledge

The founder accepted these capture decisions on 2026-09-22:

- Keep the narrative as the main input. Offer optional **Related work**, **Result/output**, and **Next dependency** details, inferred from the narrative or inherited from the originating record where supported.
- Prioritize **Continue this work**: starting from an existing log or request carries its stable shared case reference. A model, customer or equipment name alone is not a case. Do not require employees to create or classify a case before saving.
- Reuse activity status and distinguish reported completion from a successful or accepted result. Split multi-activity entries; a log may reference several cases and states.
- Capture actual occurrence time and measurement context only where relevant. An event time differs from posting time; a numeric result needs its unit, scope and source. Unknowns remain unknown.
- Offer occasional focused clarification when it resolves useful ambiguity, without making per-link approval or answering a question a condition for saving or receiving value. A named colleague is not automatically an assigned or consenting owner.

These details feed persistent company knowledge: case histories, related goals, outputs, dependencies, process patterns and unresolved contradictions are updated as evidence changes. Karpathy's LLM Wiki is an architectural reference for maintaining derived knowledge over time; it already includes business/team use. Our operational focus remains work coordination, process discovery and measurable goal review. This comparison is a design interpretation, not evidence of novelty or a replacement for pilot validation.

Maintain versioned source evidence and structured operational facts beneath generated summaries. AI-maintained explanations must respect source access, identify their basis and freshness, and never grant authority or invent measurements. Correcting a source invalidates affected interpretations so they can be rebuilt. No separate wiki-authoring screen is needed for the first product.

The detailed contract, synthetic examples, maintenance rules and acceptance checks are in [Work context and organizational memory](WORK-CONTEXT-AND-MEMORY.md). These additions update the plan; the existing preview still contains prepared examples only.

## 2C. Top-down requirements meet bottom-up evidence

The founder clarified that management must be able to prescribe what employees should accomplish and which processes must be followed. Top-down input therefore has three distinct types:

| Expectation | Meaning | Synthetic example |
|---|---|---|
| Objective and target | Desired business outcome | Reduce monthly rejected shipments to a defined target |
| Assigned task | Work authorized for a person or responsible role, with an expected output and timing | Inspect shipment DEMO-24 before its release deadline |
| Mandatory process | Required activities, ordering or decisions for a defined scope/trigger | Applicable shipments require an inspection result and a release decision before dispatch |

Management can describe requirements in ordinary language or select an existing procedure. AI can structure the draft and propose tasks. An authorized manager publishes the applicable requirements and assignments, or authorizes standing rules that create tasks for eligible cases. An objective alone does not become an assignment or invent a required procedure. Assigned, acknowledged and accepted are separate states where relevant to company policy.

Store requirement identity/version, applicability and trigger, effective dates, source of authority, responsible role, expected output, timing and evidence/acceptance conditions as applicable. Missing elements remain explicit; an ambiguous draft is not used as a definitive compliance baseline. Routine operating requirements need not have an OKR link.

The service maintains **prescribed process**, **observed process** and **suggested improvement** separately. Both prescribed tasks and observed events refer to shared work items/cases. Compare only the requirements applicable to that case and time; preserve authorized exceptions and their scope without silently replacing the baseline.

Review answers: which required work has supporting evidence, which has no captured evidence yet, where observed actions conflict with requirements, and whether measured outcomes meet targets. A dispatch log without a linked inspection yields missing inspection evidence; a verified dispatch-before-inspection sequence can support an observed ordering deviation. Unclear identity, missing sources or day-level timestamps limit that conclusion. Neither adherence nor task completion establishes goal achievement.

Prescribed requirements can exist before any work logs or discovered process. Employees still describe work without creating or mapping those requirements. Their evidence can also reveal a better process or necessary unplanned work for management to consider.

The first release records requirements and assignments, matches evidence and compares execution. It does not claim to physically prevent dispatch or execute a general workflow engine; any operational enforcement needs an explicitly implemented integration and acceptance check.

## 3. Default product boundary

| Capability | Proposed treatment | Reason |
|---|---|---|
| Work logs, files/photos, work history and comments | Build a compact capture and history experience | Foundation of the service and employee value |
| Objectives, KPI definitions, targets, actual measurements | Combine into Goals with one measurement model | Avoid duplicate setup and conflicting numbers |
| Management task assignments and mandatory process requirements | Versioned expectations in Goals/Work, automatically compared with evidence in Review | Support top-down direction without employee mapping or a general process designer |
| Activity, ontology and strategy/contribution views | Automatic interpretation and association behind Review | Present decisions and evidence without user taxonomy/mapping work |
| Process patterns and source records | Automatically generated core output inside Review | Essential to the founder's product promise; no mandatory process-definition step |
| Manuals and reviewed procedures | Context linked from relevant work/processes | Reuse existing knowledge without making a library a mandatory starting point |
| Lightweight follow-up owner, date and status | Include in Review, reusing work items | Let analysis lead to an agreed action |
| General BPMN designer and process execution engine | Advanced capability for validated needs | Validate demand before including this complexity in the default paid workflow |
| Broad approvals, attendance/leave, vehicle dispatch, meeting management, general company-data chat | Outside the default subscription product | Expand the product beyond its current operating-review purpose |
| Company-specific integrations and AI instructions | Configurable, selectively enabled | Enable repeatable customer setup without code forks |

“Outside default” defines the scope of the new Workwork Cloud product. It does not authorize hiding, removing or changing any feature or historical record in the existing services.

## 4. One initial subscription offer

Proposed first offer: a **company workspace subscription** containing Work, Goals and Review, with clearly specified included users, storage, AI usage and support. Use a scoped onboarding service where metric setup or data mapping needs assistance. Test the offer before introducing multiple feature tiers.

Keep the core process and outcome views in the same offer, since they are the reason to collect work records. Price and capacity limits should follow willingness-to-pay evidence and measured infrastructure, AI and support costs. Do not promise unlimited analysis or ongoing custom implementation without a cost model.

The recurring value is a current work history, accumulated process knowledge, reliable outcome review, and decisions made from it. The first pilot should establish both usefulness and the cost of delivering that value.

## 5. SaaS capabilities required around the product

| Area | Concrete requirement |
|---|---|
| Company account | Workspace, memberships, roles, invitations and customer configuration |
| Authorization | Actor identity derived from authentication; resource access checked on the server |
| Customer isolation | Separation across database records, files, search, AI retrieval, caches and scheduled jobs |
| Subscription access | Account subscription state, plan entitlements, usage limits, failure/recovery and cancellation behavior |
| Billing operations | Chosen provider or initial invoicing workflow, payment-state reconciliation, receipts/invoices as applicable; automated integrations handle verified and repeated events safely |
| Repeatable onboarding | Create company/team, invite users, configure the first metric and source, confirm the first review |
| Service operations | Shared release process, per-customer errors and usage, backups with restore checks, support procedures, export and retention behavior |

Customer isolation is not equivalent to adding a company filter to visible screens. Background jobs, entity normalization, uploads and AI context must use the same customer boundary. Implement and test authentication and within-company authorization in the new product under either architecture.

For the first pilots, compare standardized isolated customer environments with a shared application that enforces customer isolation throughout. Both options use the new product's maintained release and configuration, independent of legacy environments. Dedicated resources still need repeatable onboarding, deployment, monitoring and billing; they must not become separate customer code forks. Measure provisioning effort and per-customer costs before committing to a model at scale.

AWS describes both dedicated and shared isolation models, including dedicated stacks operated through common SaaS management. This supports the architectural options; it does not select a hosting provider for the new product. [AWS SaaS isolation guidance](https://aws.amazon.com/blogs/apn/explore-saas-tenant-isolation-strategies-in-new-saas-whitepaper/)

No payment provider is selected. Stripe's documentation illustrates subscription lifecycle events and entitlement updates that an automated billing integration must handle; provider suitability for the operating business must be checked separately. [Subscription lifecycle reference](https://docs.stripe.com/billing/subscriptions/webhooks)

## 6. Build through four bounded stages

### Stage A — Build a dependable independent foundation

- Establish the new repository's application and isolated development/test configuration; use a separate database, storage and secrets. Do not connect startup, scripts or deployments to legacy resources.
- Implement access checks bound to authenticated identity, with focused role/resource tests.
- Implement independent work records, shared work-item references and sourced metric observations without mandatory goal links.
- Model objectives, authorized task assignments and prescribed process requirements separately from observations, including applicability, versions and effective dates.
- Preserve source revisions and the evidence/access dependencies of derived records; keep inferred relationships separate from recorded commitments and measurements.
- Make log and measurement-save outcomes explicit and prevent duplicate retries.
- Define reporting-period selection and aggregation rules; expose missing or stale actuals.
- Create synthetic examples for the pilot metric, its owner, source, denominator where applicable and update schedule.

Deliverable: one example KPI's actual and gap can be reproduced from identified synthetic source records, and users receive accurate save feedback in the independent application.

### Stage B — Introduce the compact product experience

- Build the Work / Goals / Review navigation and supporting services in the new application.
- Accept work without mandatory goal setup, mapping or process definition.
- Build **Continue this work** first, followed by optional related-work, result/output and next-dependency context. Reuse status and date fields; missing context must not prevent saving.
- Automatically extract case/job references and separately linkable activities from daily entries; keep ambiguous identity unresolved.
- Apply supported goal associations automatically; distinguish automatic, optionally corrected and unresolved links in the evidence detail.
- Generate processes as records accumulate, with traceable cases and explicit limits on inferred sequences.
- Let management publish scoped requirements and assignments; compare their applicable versions with observed work, preserving missing evidence, deviations and authorized exceptions as distinct findings.
- Incrementally maintain case histories and reusable knowledge; re-evaluate affected summaries and links after corrections, and surface contradictory or stale evidence within Review.

Deliverable: an employee completes the daily entry without mapping or process-design work, and a manager receives useful generated processes and gap explanations without developer assistance.

### Stage C — Package a repeatable customer workspace

- Implement the selected isolation approach and reusable customer configuration.
- Add provisioning, membership management, subscription state, entitlements and usage accounting.
- Rehearse onboarding and release updates with two isolated test customers.
- Demonstrate that neither customer can read or change the other's records, files, retrieval context or job results.
- Test payment/subscription transitions using the chosen provider's test mode when automated billing is included.

Deliverable: another company can receive the same product without copying business-specific code or sharing customer data.

### Stage D — Run and evaluate a paid pilot

- Onboard the pilot into the independent Workwork Cloud environment and operate one recurring review around the chosen process and current measurements. Any access to an existing company data source requires a separate, explicitly scoped integration or import.
- Record what decisions the review enables and whether the follow-ups occur.
- Measure employee entry effort, repeat usage, current metric coverage, support hours and operating cost.
- Evaluate whether continued-work references reduce incorrect case merges and lost goal context; compare these gains against entry time and clarification burden.
- Obtain explicit willingness to continue paying; do not treat existing internal adoption as proof of subscription demand.

Deliverable: evidence for the next product and pricing decision. Agree quantitative success thresholds before the pilot rather than defining success after results arrive.

## 7. Keep the new product independent

All implementation, schema changes and release work occur in `wilcoco/workwork-cloud` and its own environments. The existing `wilcoco/FDE` and `wilcoco/workwork` repositories and their running services remain unchanged. Do not repoint their remotes, reuse their deployment hooks, run migrations against their databases or share their credentials and storage.

Development, tests and demonstrations use synthetic records. If useful source components are copied into the new repository, adapt and verify them only in the new project. Copying a component does not bring over a live connection, customer configuration or authority to modify its original service.

The new model supports independent work records and optional work-item/goal relationships from the beginning. A future import from an existing system is a separate, explicitly scoped task. Such an import must preserve source identifiers and provenance and must not reinterpret placeholder goals as strategic alignment. No import, migration or legacy rollout is included in this build plan.

Deploy and roll back Workwork Cloud through its own release process. Test configuration isolation before any deployment; the existing applications continue operating independently.

## 8. Release acceptance

- Repository, application, database, storage, secrets and deployment are independent of the existing services. Development and test fixtures contain synthetic data.
- Work can be recorded before goal or process configuration, with zero mandatory mapping or process-definition actions by employees.
- A continued entry preserves its source/case reference; ambiguous standalone entries remain saveable. Multi-activity logs can have different case matches and states.
- A completed test with a failed result remains completed work with an unresolved outcome. Mentioning a recipient does not create an accepted assignment.
- Management can prescribe tasks and mandatory steps before work is recorded. AI drafts become binding assignments/rules only through authorized actions or pre-authorized standing rules.
- Requirement comparisons use the applicable version, trigger and case scope. Missing records or ambiguous event order cannot alone establish nonperformance or a process violation; task/process adherence remains separate from outcome achievement.
- No measurement save fails silently, and retry does not create unintended duplicate facts.
- Pilot KPI definitions, periods, denominators where relevant, targets and actual sources are explicit.
- Every displayed gap can be reproduced; missing data is visibly unavailable rather than zero or inferred success.
- The service generates process views automatically; each claimed observed step/sequence links to cases and source records. Suggested future procedures remain distinguishable from observed work.
- Mapping accuracy is evaluated alongside automatic coverage; uncertain links are not hidden by forcing a match or requiring routine user classification.
- AI relevance, human confirmation, completion and business outcomes remain distinguishable.
- A manager can record an owned follow-up from the review.
- Authentication, customer boundaries and private file access pass focused checks.
- Generated summaries, case histories, search results and process views follow the same access boundary as their evidence. Source changes invalidate affected interpretations without silently rewriting historical decisions.
- Subscription access, usage limits and account lifecycle behave as configured.
- The pilot records decision usefulness, adoption and delivery costs as well as financial outcomes.

Related: [Input/output framework](WORK-ALIGNMENT-FRAMEWORK.md).
