/**
 * A9 independent referee.
 *
 * Criteria A9 demands that an INDEPENDENT implementation reproduce every
 * accept/reject verdict from a decision trace's listed inputs alone — so that a
 * trace which decorates a verdict it cannot actually derive is caught. The whole
 * point is duplication: this file reimplements the acceptance rule (engine spec
 * §6.2) FRESH FROM THE SPEC TEXT and deliberately imports NO engine decision
 * code (no `evaluateAcceptance`, no `sizeCompatible`, nothing from
 * engines/emergence/decide.ts or divisibility.ts). If it imported the engine's
 * logic it could only ever agree with the engine, defeating the criterion.
 *
 * It consumes only the fields a DECISION_TRACE lists. If deriving the verdict
 * from §6.2's words ever disagrees with the engine in a way that traces back to a
 * genuine difference in reading the spec (not a bug in this file), that is a
 * D-012 escalation — not something to "fix" by peeking at the engine.
 *
 * §6.2, transcribed: a partner P holding gP, offered gO, accepts iff ALL of —
 *   - Value test: gO is P's want (direct clause), OR tally_P(gO) > tally_P(gP) + ε.
 *   - Condition gate: gO is not stale when taken as a bridge (a stale good is
 *     still acceptable as a direct want).
 *   - Divisibility: the size-compatibility table holds for the two classes.
 */

export type RefereeVerdict = "accept" | "reject";

/**
 * The divisibility compatibility table (engine spec §6.2), transcribed here by
 * hand from the table rows — fine matches anything; coarse matches coarse; a
 * whole lump clears only against fine.
 */
function divisibilityPasses(offered: string, held: string): boolean {
  const table: Record<string, boolean> = {
    "fine|fine": true,
    "fine|coarse": true,
    "fine|whole": true,
    "coarse|fine": true,
    "coarse|coarse": true,
    "coarse|whole": false,
    "whole|fine": true,
    "whole|coarse": false,
    "whole|whole": false,
  };
  const v = table[`${offered}|${held}`];
  if (v === undefined) throw new Error(`referee: unknown size-class pair ${offered}, ${held}`);
  return v;
}

/**
 * Reproduce the partner's verdict from the DECISION_TRACE's listed inputs alone.
 * The inputs map carries: offeredGood, heldGood, want, scoreOffered, scoreHeld,
 * epsilon, offeredStale, sizeOffered, sizeHeld. (offeredIsWant is also present,
 * but the referee re-derives it from offeredGood and want rather than trusting a
 * precomputed flag.)
 */
export function refereeVerdict(inputs: Readonly<Record<string, number | boolean | string>>): RefereeVerdict {
  const offeredGood = inputs.offeredGood as number;
  const want = inputs.want as number;
  const scoreOffered = inputs.scoreOffered as number;
  const scoreHeld = inputs.scoreHeld as number;
  const epsilon = inputs.epsilon as number;
  const offeredStale = inputs.offeredStale as boolean;
  const sizeOffered = inputs.sizeOffered as string;
  const sizeHeld = inputs.sizeHeld as string;

  const valueWant = offeredGood === want; // direct clause
  const valueBridge = scoreOffered > scoreHeld + epsilon; // bridge/tally clause
  const valueTestPass = valueWant || valueBridge;

  const conditionPass = valueWant || !offeredStale; // stale only blocks a bridge

  const divisibilityPass = divisibilityPasses(sizeOffered, sizeHeld);

  return valueTestPass && conditionPass && divisibilityPass ? "accept" : "reject";
}
