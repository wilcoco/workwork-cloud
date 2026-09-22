# Workwork Cloud

An independent subscription product for manufacturing SMBs: employees describe their daily work, management defines goals and measures, and the service connects work to objectives, discovers processes, and compares targets with measured outcomes.

## Project boundary

This is a new product with its own repository and development history. The existing `wilcoco/FDE` and `wilcoco/workwork` repositories, applications, Railway services, and production data remain unchanged.

Implementation will use independent databases, storage, secrets, and deployments. Development and demonstrations use synthetic data. Any future import from an existing service requires a separately scoped task.

## Current status

This initial version contains product specifications and an interactive interface concept. It does not yet implement authentication, persistent storage, live AI inference, billing, or a production SaaS backend.

- [Product and independent-build plan](docs/COMPACT-SAAS-PLAN.md)
- [Work alignment framework](docs/WORK-ALIGNMENT-FRAMEWORK.md)
- [Accepted work-entry decisions and organizational memory design](docs/WORK-CONTEXT-AND-MEMORY.md)
- [Interactive preview](prototype/index.html)

## Product contract

Inputs: management OKRs, KPI definitions and actual-data sources, and employee work narratives with optional evidence.

Outputs: automatically generated process views and evidence-backed target-versus-actual comparisons.

The interface has three views: **Work**, **Goals**, and **Review**. Employees are never required to select a taxonomy, map each activity to a goal, draw a process, or approve every generated relationship. Supported associations are applied automatically; uncertain evidence remains identifiable, with optional correction.

A relevant activity is not a measured business outcome. Missing measurements remain unavailable rather than being inferred from activity counts.

Accepted entry direction: optional **Related work**, **Result/output**, and **Next dependency**, with **Continue this work** as the first pilot improvement. The service maintains connected case histories and process knowledge as records accumulate. The LLM Wiki pattern informs this memory design; operational states, measurements and permissions remain explicit structured records. These are planning decisions, not implemented features in the current preview.

## View the concept locally

Open `prototype/index.html` in a modern browser. Alternatively, run:

```sh
python3 -m http.server 8000 --directory prototype --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000`.

The preview uses synthetic examples and temporary in-page state. Automatic links are prepared examples, not live AI analysis. Refreshing clears changes. No production service or customer data is connected.

## Development direction

1. Define the independent data model and use synthetic fixtures.
2. Build narrative capture, automatic associations, process discovery, and reproducible outcome calculations.
3. Add company isolation, onboarding, subscription access, and usage accounting.
4. Validate with an explicitly scoped manufacturing pilot.

See [AGENTS.md](AGENTS.md) for project boundaries that apply to future development.
