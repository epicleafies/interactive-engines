/**
 * PROJECT_SEED is the shared pinned-trace seed for every engine in this
 * repository: all deterministic reference traces in the harnesses are
 * generated from it.
 *
 * Committed before any engine or harness code existed in this project,
 * and chosen blind: no trace had ever been generated from this seed as
 * of this commit. The traces it produces are pinned as-is.
 *
 * Functional test seeds (chosen so a trace exhibits a specific event)
 * are separate, documented at their point of use, and carry no such
 * commitment.
 */

export const PROJECT_SEED = 1231006505;