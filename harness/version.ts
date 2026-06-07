/**
 * Version stamps recorded on every run (criteria H1, H3, H4, H5).
 *
 * Every run a grading surface ever judges records which engine produced it and
 * which version of the acceptance criteria it was judged against, so a disputed
 * number can always be re-derived and re-checked after the fact. These strings
 * are part of each run's identity; bump ENGINE_VERSION when engine behavior
 * changes, and CRITERIA_VERSION when the harness is retargeted at a new criteria
 * document.
 */

/**
 * The reference engine's version. Bumped on any change that can alter an event
 * stream at a fixed seed. `0.0.0-skeleton` marks the pre-engine state: the
 * harness skeleton exists, the reference engine does not yet.
 */
export const ENGINE_VERSION = "0.0.0-skeleton";

/**
 * The acceptance-criteria document this harness asserts against. Matches the
 * internal repo's `emergence_sim_acceptance_criteria_v2_1.md` (tag
 * `criteria-v2.1`). QA output stamps this so a result can never be silently
 * compared against the wrong bar (H3).
 */
export const CRITERIA_VERSION = "criteria-v2.1";
