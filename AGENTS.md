# Project instructions

- Workwork Cloud is a separate product. All new implementation belongs in this repository.
- Do not modify, commit to, push to, migrate, or deploy the existing `wilcoco/FDE` or `wilcoco/workwork` repositories or their production services as part of this project's work.
- Use independent databases, storage, secrets, and deployment resources. Never point development or test commands at the existing production database.
- Use synthetic data by default. Do not add customer records, production exports, credentials, or internal operational/security reviews to this repository.
- Any later import or reuse of legacy implementation must be explicitly scoped. Copied components must be reviewed in this repository; no change to the source service is implied.
- Keep the product compact: Work, Goals, Review. Automatic objective/work/result associations and automatic process generation are core responsibilities of the service.
- Employees describe work. Do not make taxonomy selection, manual goal mapping, process drawing, or per-link AI approval prerequisites for saving or receiving value.
- Accepted work-entry direction: offer optional Related work, Result/output and Next dependency context, populated from narrative or source context where supported. Prioritize a one-click "Continue this work" action that carries the shared case reference. Reuse task status; ask for actual occurrence time or measurement context only when relevant. Missing context must not block saving; split multi-activity logs instead of forcing one case/status onto the whole entry.
- Maintain accumulated company knowledge behind Work / Goals / Review. Preserve source revisions, permissions and derivation provenance; generated summaries must not become authoritative measurements, assignments, commitments or approvals. Details: docs/WORK-CONTEXT-AND-MEMORY.md.
- Top-down management input includes objectives, authorized task assignments and mandatory process requirements. Keep prescribed requirements, observed work and suggested improvements distinct; compare using the applicable scope/version and source evidence. Missing evidence is not proof of nonperformance. An objective alone does not authorize AI-created assignments or rules; management may authorize individual assignments or standing task-generation rules. Employees still need no manual mapping or process definition.
- Preserve evidence and uncertainty. Do not fabricate actual measurements, causal contribution, business-case identity, or observed process sequences.
- Respond in English. When the user writes English, provide a corrected version, a brief explanation, and two practice examples.
- Use a `codex/` prefix for development branches. The independent repository's default branch is `main`.
- Do not describe the current concept preview as a deployed or functional SaaS product.
