
- Hierarchy: client_projects → analysis_groups (one savings analysis) → energy_analyses rows (one PPE each). Aggregates, PPE selection, duplicate-PPE checks and the multi-PPE report are scoped to a single analysis_groups row; never sum across groups. Why: a client can hold independent alternative offers.
- energy_analyses.analysis_group_id is filled by a DB trigger when missing (creates a group with id = row id) and must point to a group of the same client project. Why: keeps old app versions and legacy rows (backfilled the same way) working.
- Aggregate (multi-PPE) totals live in src/lib/project-totals.ts and only sum results of calculateEnergyCosts; never duplicate cost formulas there. Why: single-PPE engine stays the one source of truth.
- Unit tests run with `npx vitest run --root . src/lib`. Why: no test script in package.json.
