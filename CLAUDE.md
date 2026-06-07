# CLAUDE.md — standing instructions for build sessions in this repository

## What this is

Public repository for simulation engines and acceptance harnesses for a bitcoin
education product. Published for verifiability: every behavioral claim an engine
makes is a named assertion in its test battery, and every run replays
bit-identically from its recorded seed and config. If it isn't asserted, it
isn't claimed.

## Where authority lives

Governing documents are in the private sibling repo, expected at
`../interactive-engines-internal/`:

- `docs/emergence_sim_acceptance_criteria_v2_1.md` — the criteria (highest authority)
- `docs/emergence_engine_spec_v3.md` — the engine spec
- `DECISIONS.md` — the decisions register

Authority order: **criteria > spec > code.** Where they conflict, the upstream
document wins and the downstream artifact is wrong.

**Never change an engine rule, a constant's value, or a spec behavior without a
register entry authorizing it.** If the spec is ambiguous, or implementing it
faithfully seems wrong, STOP and report the ambiguity — do not pick an
interpretation, do not improvise a fix, do not cite an amendment that isn't in
DECISIONS.md or the spec. Ambiguities are findings to surface, not gaps to fill.

Do not read anything under `../interactive-engines-internal/archive/` — it is a
sealed record of a prior abandoned attempt and must not inform this build.

## Currently in force (D-008 gate lifted; register D-013–D-020)

The spec-v2 independent review has returned and been fully triaged through the
register: 68/68 findings ruled, deferred ledger empty (D-020). Governing
documents: `emergence_sim_acceptance_criteria_v2_1.md` (tag `criteria-v2.1`)
and `emergence_engine_spec_v3.md` (tag `spec-v3`); criteria govern the spec,
the spec governs the engine, conflicts resolve upstream-wins (D-001). Build
order in force (spec v3 §15):

1. Assertion harness skeleton against criteria v2.1
2. Reference engine (TypeScript strict, platform-pure, per spec §11 — RNG
   tape included)
3. A-series ablations green (A1, A2, A6, A8, A9 especially)
4. C0 feasibility campaign — every TBD logged in the register before the
   campaign that tests it (H6), tuned-class constants with sweep artifacts
5. D-series on the synthesis configuration
6. Minimal probe surface — named I7 milestone — and the first human sessions
   (I8 records, I9 probe)
7. Only then: full surfaces, copy, remaining I-series gates

Cautions: the review report's Appendix A hand-execution is NOT a reference
trace for v3 — it ran on phantom rulings since overruled (partner reuse,
fractional seed events, the old step order). Pinned deterministic traces come
from PROJECT_SEED on the v3 engine only; functional test seeds are documented
at point of use and chosen for event coverage, never story. When the spec is
ambiguous, stop and escalate for a register entry (D-012) — never improvise a
rule.

## Hard technical constraints (register D-011)

- TypeScript, `strict: true`, everywhere.
- The engine is **platform-pure**: no DOM, React, Node, or host APIs; no `Date`;
  no I/O. It is a state machine: (config, seed) in, state and events out. It
  must behave identically under V8 (web/Node) and Hermes (React Native).
- **No transcendental math in the engine** — `Math.exp`, `Math.pow`,
  `Math.log`, `Math.sin`, etc. are implementation-defined and break
  cross-platform replay. Permitted: IEEE-754 basic arithmetic, comparisons,
  integer ops, `Math.imul`, bit shifts, `Math.min/max/abs/floor/trunc`.
  Recency decay is a per-round multiplicative factor, never `exp(-λ·age)`.
- **No `Math.random` anywhere** — engine or harness. All randomness flows from
  the seeded PRNG, and every run records `{seed, config hash, engine version,
  criteria version}` and replays bit-identically.

## Seed rules (register D-010)

- `harness/project-seed.ts` exports PROJECT_SEED, pre-registered at commit
  `b44824f` (tag `seed-preregistration`). All pinned deterministic reference
  traces use it, and whatever traces it produces are pinned as-is.
- Functional test seeds (a trace must exhibit a specific event, e.g. a fake
  reveal) are permitted: plain numbers, documented at point of use as chosen
  for event coverage. Selecting any seed for how its output looks as a story
  is prohibited.
- Do not explain PROJECT_SEED's value anywhere in this repo.

## Quality bar

- Assertions are named and commented to stand alone: a stranger reading the
  battery should understand what each check claims about the engine and why it
  matters, without access to the private docs.
- Distributional by default: behavioral claims are evaluated over ≥50 seeded
  runs per configuration. Single runs are anecdotes; the harness must be able
  to FAIL.
- Telemetry (per-good acceptance shares, goods-flow by channel, tally-input
  composition) is a permanent engine output that assertions consume — never a
  debug feature to strip.

## Boundaries

- Never copy private-repo document contents into this public repo. The public
  explanation layer is each engine's REFERENCE.md (written later, against the
  shipped engine, claims citing assertions) and VERIFYING.md.
- No product code, scenes, copy, or branding here.
- No human-subject session data here, ever.
- Commit messages: imperative mood, stating what and why. Tag document and
  engine versions when they ship.
