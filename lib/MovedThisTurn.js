"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MovedThisTurn = void 0;
const UnitImprovement_1 = require("@civ-clone/core-unit-improvement/UnitImprovement");
/**
 * The unit moved during its player's last turn, so it doesn't heal at the start of the next (see `healingRules`). Only
 *  a unit that moved has one, and only until its player's next turn starts, so a unit at rest carries nothing extra
 *  and saves nothing extra. A game that saves needs it in its `AvailableUnitImprovementRegistry`.
 */
class MovedThisTurn extends UnitImprovement_1.default {
}
exports.MovedThisTurn = MovedThisTurn;
exports.default = MovedThisTurn;
//# sourceMappingURL=MovedThisTurn.js.map