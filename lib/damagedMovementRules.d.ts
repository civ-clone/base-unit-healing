import Unit from '@civ-clone/core-unit/Unit';
import { Yield as UnitYield } from '@civ-clone/core-unit/Rules/Yield';
export interface DamagedMovementOptions {
  /** The rule's id. */
  id?: string;
  /** How many steps a move is counted in (a road's share of a move, say): the scaled moves are truncated to a step. */
  stepsPerMove: number;
  /** The fewest whole moves a damaged unit keeps (never more than it has undamaged). */
  minimum: (unit: Unit) => number;
  /** The units it applies to: all, without. */
  appliesTo?: (unit: Unit) => boolean;
}
/**
 * The moves a unit with `movement` moves undamaged has with `remaining` of `maximum` hit points left (OpenCiv2,
 *  `unit_max_moves`): `movement × remaining / maximum`, truncated to a step, then rounded up to a whole move, and at
 *  least `minimum` (but not above `movement`). A maximum below 1 counts as 1.
 */
export declare const damagedMovement: (
  movement: number,
  remaining: number,
  maximum: number,
  stepsPerMove: number,
  minimum: number
) => number;
/**
 * A unit `Yield` rule that slows a damaged unit down (see `damagedMovement`): it changes the `Movement` yield (what a
 *  unit's moves are reset to each turn), not the `Moves` a unit has left. It has `Low` priority, to come after the
 *  rules that set and add to a unit's movement; register it after any other `Low` ones.
 */
export declare const damagedMovementRules: ({
  id,
  stepsPerMove,
  minimum,
  appliesTo,
}: DamagedMovementOptions) => UnitYield[];
export default damagedMovementRules;
