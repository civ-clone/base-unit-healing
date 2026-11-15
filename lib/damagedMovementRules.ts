import { Movement, Moves } from '@civ-clone/core-unit/Yields';
import Criterion from '@civ-clone/core-rule/Criterion';
import Effect from '@civ-clone/core-rule/Effect';
import Low from '@civ-clone/core-rule/Priorities/Low';
import Unit from '@civ-clone/core-unit/Unit';
import { Yield as UnitYield } from '@civ-clone/core-unit/Rules/Yield';
import YieldValue from '@civ-clone/core-yield/Yield';

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
export const damagedMovement = (
  movement: number,
  remaining: number,
  maximum: number,
  stepsPerMove: number,
  minimum: number
): number => {
  const steps = Math.round(movement * stepsPerMove),
    scaled = Math.trunc((steps * remaining) / Math.max(1, maximum)),
    rounded =
      scaled % stepsPerMove === 0
        ? scaled
        : scaled + stepsPerMove - (scaled % stepsPerMove);

  return Math.min(
    movement,
    Math.max(Math.round(minimum * stepsPerMove), rounded) / stepsPerMove
  );
};

/**
 * A unit `Yield` rule that slows a damaged unit down (see `damagedMovement`): it changes the `Movement` yield (what a
 *  unit's moves are reset to each turn), not the `Moves` a unit has left. It has `Low` priority, to come after the
 *  rules that set and add to a unit's movement; register it after any other `Low` ones.
 */
export const damagedMovementRules = ({
  id,
  stepsPerMove,
  minimum,
  appliesTo = () => true,
}: DamagedMovementOptions): UnitYield[] => [
  new UnitYield(
    ...((id === undefined ? [] : [id]) as string[]),
    new Low(),
    new Criterion(
      (unit: Unit, unitYield: YieldValue): boolean =>
        unitYield instanceof Movement && !(unitYield instanceof Moves)
    ),
    new Criterion((unit: Unit): boolean => unit.damage() > 0),
    new Criterion((unit: Unit): boolean => appliesTo(unit)),
    new Effect((unit: Unit, unitYield: YieldValue): void => {
      const movement = unitYield.value();

      if (movement <= 0) {
        return;
      }

      const [remaining, maximum] = unit.hitPoints(),
        moves = damagedMovement(
          movement,
          remaining,
          maximum,
          stepsPerMove,
          minimum(unit)
        );

      if (moves !== movement) {
        unitYield.add(moves - movement, 'damage');
      }
    })
  ),
];

export default damagedMovementRules;
