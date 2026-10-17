
- Project-level aggregate (multi-PPE) totals live in src/lib/project-totals.ts and only sum results of calculateEnergyCosts; never duplicate cost formulas there. Why: single-analysis engine stays the one source of truth.
- Unit tests run with `npx vitest run --root . src/lib`. Why: no test script in package.json.
