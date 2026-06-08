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

- `docs/emergence_sim_acceptance_criteria_v2_3.md` — the criteria (highest authority)
- `docs/emergence_engine_spec_v3_4.md` — the engine spec
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

## Currently in force (steps 1–3 complete; code-review gate LIFTED at D-049; post-gate-lift engine batch in progress)

Build-order steps 1–3 are complete and the independent engine code review is
closed: its 42 findings were triaged (D-038–D-045), criteria v2.3 and engine
spec v3.4 adopted (D-046/D-047), and the **D-036 gate lifted at D-049** — the
freeze on engine, harness, campaign, and register commits is released. Build
sessions in this repository are no longer paused.

The current work is the post-gate-lift change list (in
`../interactive-engines-internal/docs/reviews/`), run **serially in dependency
order, not ID order**:

1. §11 RNG-tape reconciliation (production-first per D-038; the engine already
   draws this way — no behavior change).
2. The trace/hash-touching changes: remove `RunResult.dominantGood` and
   re-express the `CAP_REACHED` gate against a has-dominated predicate (D-040);
   `RunRecord` stores the full configuration, not a hash (D-042); validator
   bounds `DOM_SUSTAIN ≥ 1` and `SEED_CAP ≤ DOM_THRESHOLD − D5 margin`
   (D-043/D-041).
3. The **single confirmatory re-pin** (D-032: rationale before inspection,
   provenance line naming the v3.4 register state and a verifiable origin head).
   Before it, confirm `dominantGood` is not in the hashed serialization — if it
   is, the re-pin is real (new digest), not confirmatory.
4. Everything else: the harness honesty fixes (D-041 — unstub the false-pending
   assertions, distributional G2/G3, enforce the SEED_CAP/D5 margin, lift the
   D7 battery checks, the `report.ts` INCOMPLETE footnote), the new assertions
   (D8/B14/G7/G4 against criteria v2.3), dead-code removal, comment/type
   corrections, and `CRITERIA_VERSION` → `criteria-v2.3`.

Do not parallelize and do not re-pin twice: every trace/hash-touching change
lands before the single re-pin (step 3).

Governing documents: `emergence_sim_acceptance_criteria_v2_3.md` (tag
`criteria-v2.3`) and `emergence_engine_spec_v3_4.md` (tag `spec-v3.4`); criteria
govern the spec, the spec governs the engine, conflicts resolve upstream-wins
(D-001).

A-series status (corrected per D-041/V-39 — the prior "audit A-series is green"
overstated): A2, A6, A8(a,b), and A9 are asserted green; A1, A3, A5, A7, A8(c)
are pending and get wired by the honesty fixes in step 4. The PROJECT_SEED
trace is pinned at `da636ef`, refreshed by the single re-pin in step 3.

After this batch lands and the re-pin holds (spec v3.4 §15):

4. C0 feasibility campaign — the held registration ratifies, consuming the
   C2/C5 demonstration configs (D-055) and the MAX_GOODS/MAX_PARTICIPANTS caps
   (D-052); every TBD logged in the register before the campaign that tests it
   (H6), tuned-class constants with sweep artifacts.
5. D-series on the synthesis configuration.
6. Minimal probe surface — named I7 milestone — and the first human sessions
   (I8 records, I9 probe).
7. Only then: full surfaces, copy, remaining I-series gates.

Cautions: the spec-v2 review report's Appendix A hand-execution is NOT a
reference trace — it ran on phantom rulings since overruled (partner reuse,
fractional seed events, the old step order). Pinned deterministic traces come
from PROJECT_SEED on the current engine only; functional test seeds are
documented at point of use and chosen for event coverage, never story. When the
spec is ambiguous, stop and escalate for a register entry (D-012) — never
improvise a rule.

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
  the seeded PRNG, and every run records `{seed, full configuration, engine
  version, criteria version}` (the full configuration, not a hash of it — D-042)
  and replays bit-identically from its record alone.

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
