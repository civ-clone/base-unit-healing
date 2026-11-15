import UnitImprovement from '@civ-clone/core-unit-improvement/UnitImprovement';

/**
 * The unit moved during its player's last turn, so it doesn't heal at the start of the next (see `healingRules`). Only
 *  a unit that moved has one, and only until its player's next turn starts, so a unit at rest carries nothing extra
 *  and saves nothing extra. A game that saves needs it in its `AvailableUnitImprovementRegistry`.
 */
export class MovedThisTurn extends UnitImprovement {}

export default MovedThisTurn;
