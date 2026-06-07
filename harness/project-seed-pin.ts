/**
 * The PROJECT_SEED pinned reference trace (register entry D-032).
 *
 * This is the project's pinned deterministic trace: the emergence engine run
 * against the dedicated pinning fixture (engines/emergence/fixtures.ts) with
 * PROJECT_SEED. The trace was generated and pinned AS-IS (D-010) — no seed or
 * config was shopped for how the trace looks; the fixture's coverage rationale
 * was committed before this trace was ever inspected.
 *
 * From the pin commit forward (D-032), the following are register-gated — any
 * change requires a decisions-register entry AND an explicit re-pin of this
 * digest: the event payload schema (fields, types), the emission predicates, the
 * detector semantics, the pinning fixture itself, and the RNG tape. A change to
 * any of them moves these bytes; the pin assertion then fails until the register
 * entry and re-pin land. The full canonical trace is committed alongside this
 * module at harness/pins/project-seed-trace.json for independent inspection.
 *
 * Provenance: pinned against decisions-register D-001-D-032, origin/main head
 * 372885caccb546343dbe9021327f2a8c8f6d17b2.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run } from "../engines/emergence/index.ts";
import { pinningFixture } from "../engines/emergence/fixtures.ts";
import { serializeRun } from "./engine-adapter.ts";
import { PROJECT_SEED } from "./project-seed.ts";

const GOLDEN_PATH = fileURLToPath(new URL("./pins/project-seed-trace.json", import.meta.url));

/** Regenerate the canonical PROJECT_SEED trace from the current engine. */
export function projectSeedTrace(): string {
  return serializeRun(run(pinningFixture(), PROJECT_SEED));
}

/** SHA-256 of the canonical trace — the byte commitment. */
export function projectSeedDigest(trace = projectSeedTrace()): string {
  return createHash("sha256").update(trace).digest("hex");
}

/** The pinned digest. Re-pin (with a register entry) only when D-032's gated surfaces change. */
export const PINNED_DIGEST = "8550b39a24163385fd4597df20f913b9d282ff4b97aae7b21440244c5443e945";

/** Human-readable summary of the pinned run (the trace shows good 0 reaching dominance). */
export const PINNED_SUMMARY = {
  events: 1185,
  telemetryRounds: 120,
  dominantGood: 0,
  reachedCap: false,
} as const;

export interface PinCheck {
  readonly digestMatches: boolean;
  readonly goldenMatches: boolean;
  readonly currentDigest: string;
}

/** Verify the current engine reproduces the pinned trace, by digest and by golden bytes. */
export function verifyPin(): PinCheck {
  const trace = projectSeedTrace();
  const currentDigest = projectSeedDigest(trace);
  const golden = readFileSync(GOLDEN_PATH, "utf8");
  return {
    digestMatches: currentDigest === PINNED_DIGEST,
    goldenMatches: trace === golden,
    currentDigest,
  };
}
