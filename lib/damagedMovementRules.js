"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.damagedMovementRules = exports.damagedMovement = void 0;
const Yields_1 = require("@civ-clone/core-unit/Yields");
const Criterion_1 = require("@civ-clone/core-rule/Criterion");
const Effect_1 = require("@civ-clone/core-rule/Effect");
const Low_1 = require("@civ-clone/core-rule/Priorities/Low");
const Yield_1 = require("@civ-clone/core-unit/Rules/Yield");
/**
 * The moves a unit with `movement` moves undamaged has with `remaining` of `maximum` hit points left (OpenCiv2,
 *  `unit_max_moves`): `movement × remaining / maximum`, truncated to a step, then rounded up to a whole move, and at
 *  least `minimum` (but not above `movement`). A maximum below 1 counts as 1.
 */
const damagedMovement = (movement, remaining, maximum, stepsPerMove, minimum) => {
    const steps = Math.round(movement * stepsPerMove), scaled = Math.trunc((steps * remaining) / Math.max(1, maximum)), rounded = scaled % stepsPerMove === 0
        ? scaled
        : scaled + stepsPerMove - (scaled % stepsPerMove);
    return Math.min(movement, Math.max(Math.round(minimum * stepsPerMove), rounded) / stepsPerMove);
};
exports.damagedMovement = damagedMovement;
/**
 * A unit `Yield` rule that slows a damaged unit down (see `damagedMovement`): it changes the `Movement` yield (what a
 *  unit's moves are reset to each turn), not the `Moves` a unit has left. It has `Low` priority, to come after the
 *  rules that set and add to a unit's movement; register it after any other `Low` ones.
 */
const damagedMovementRules = ({ id, stepsPerMove, minimum, appliesTo = () => true, }) => [
    new Yield_1.Yield(...(id === undefined ? [] : [id]), new Low_1.default(), new Criterion_1.default((unit, unitYield) => unitYield instanceof Yields_1.Movement && !(unitYield instanceof Yields_1.Moves)), new Criterion_1.default((unit) => unit.damage() > 0), new Criterion_1.default((unit) => appliesTo(unit)), new Effect_1.default((unit, unitYield) => {
        const movement = unitYield.value();
        if (movement <= 0) {
            return;
        }
        const [remaining, maximum] = unit.hitPoints(), moves = (0, exports.damagedMovement)(movement, remaining, maximum, stepsPerMove, minimum(unit));
        if (moves !== movement) {
            unitYield.add(moves - movement, 'damage');
        }
    })),
];
exports.damagedMovementRules = damagedMovementRules;
exports.default = exports.damagedMovementRules;
//# sourceMappingURL=damagedMovementRules.js.map