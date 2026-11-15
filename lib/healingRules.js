"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healingRules = exports.decayAmount = exports.healAmount = exports.nearestOwnCity = exports.tileDistance = void 0;
const CityRegistry_1 = require("@civ-clone/core-city/CityRegistry");
const LandMassRegistry_1 = require("@civ-clone/core-world/LandMassRegistry");
const UnitImprovementRegistry_1 = require("@civ-clone/core-unit-improvement/UnitImprovementRegistry");
const UnitRegistry_1 = require("@civ-clone/core-unit/UnitRegistry");
const Criterion_1 = require("@civ-clone/core-rule/Criterion");
const Effect_1 = require("@civ-clone/core-rule/Effect");
const High_1 = require("@civ-clone/core-rule/Priorities/High");
const Moved_1 = require("@civ-clone/core-unit/Rules/Moved");
const MovedThisTurn_1 = require("./MovedThisTurn");
const TurnStart_1 = require("@civ-clone/core-player/Rules/TurnStart");
/** `Tile.distanceFrom`, the world's own measure. */
const tileDistance = (from, to) => from.distanceFrom(to);
exports.tileDistance = tileDistance;
/** Whether `unit` has `Improvement`. */
const hasImprovement = (unitImprovementRegistry, unit, Improvement) => unitImprovementRegistry
    .getByUnit(unit)
    .some((unitImprovement) => unitImprovement instanceof Improvement);
/**
 * The player's own city nearest `unit` on its land mass, and how far it is: the city it is in at distance 0, and none
 *  for a unit on a square with no land mass (at sea) unless it is in a city. The first of equally near cities.
 */
const nearestOwnCity = (cityRegistry, landMassRegistry, unit, distance = exports.tileDistance) => {
    const tile = unit.tile(), city = cityRegistry.getByTile(tile);
    if (city !== null && city.player() === unit.player()) {
        return [city, 0];
    }
    const landMass = landMassRegistry.getByTile(tile);
    if (landMass === null) {
        return null;
    }
    let nearest = null;
    cityRegistry
        .getByPlayer(unit.player())
        .filter((candidate) => landMass.hasTile(candidate.tile()))
        .forEach((candidate) => {
        const away = distance(tile, candidate.tile());
        if (nearest === null || away < nearest[1]) {
            nearest = [candidate, away];
        }
    });
    return nearest;
};
exports.nearestOwnCity = nearestOwnCity;
/**
 * How much damage `unit`, having rested, heals at the start of its player's turn (OpenCiv2, `civ_heal_units`):
 *
 * 1. `restSteps`, plus the `nearCity` bonus within its distance of the nearest own city on the same land mass;
 * 2. times `inCityMultiplier` in one of the player's own cities;
 * 3. each step `trunc(maximum / stepsPerMaximum)` hit points;
 * 4. all of it if `fullHeal` says so;
 *
 * never more than the damage it has.
 */
const healAmount = (cityRegistry, landMassRegistry, unit, { stepsPerMaximum, restSteps, nearCity, inCityMultiplier, fullHeal = () => false, distance = exports.tileDistance, }) => {
    var _a;
    const damage = unit.damage();
    if (damage <= 0) {
        return 0;
    }
    const [, maximum] = unit.hitPoints(), nearest = (0, exports.nearestOwnCity)(cityRegistry, landMassRegistry, unit, distance), city = nearest !== null && nearest[1] === 0 ? nearest[0] : null;
    if (fullHeal(unit, city)) {
        return damage;
    }
    let steps = restSteps(unit);
    if (nearCity !== undefined &&
        nearest !== null &&
        nearest[1] <= nearCity.distance &&
        ((_a = nearCity.appliesTo) !== null && _a !== void 0 ? _a : (() => true))(unit)) {
        steps += nearCity.steps(unit, nearest[0]);
    }
    if (city !== null) {
        steps *= inCityMultiplier;
    }
    return Math.min(damage, Math.max(0, Math.trunc(maximum / stepsPerMaximum) * steps));
};
exports.healAmount = healAmount;
/**
 * The damage `unit`, having moved, takes from `decay` (OpenCiv2, `civ_heal_units`): a step a turn, but never so much
 *  that it has no hit points left. 0 for a unit it doesn't apply to.
 */
const decayAmount = (unit, { stepsPerMaximum, decay }) => {
    if (decay === undefined || !decay.appliesTo(unit)) {
        return 0;
    }
    const [remaining, maximum] = unit.hitPoints();
    return Math.max(0, Math.min(Math.trunc(maximum / stepsPerMaximum) * decay.steps, remaining - 1));
};
exports.decayAmount = decayAmount;
/**
 * A ruleset's healing rules:
 *
 * - a `Moved` rule that marks a unit that moved (`countsAsMove`) with `MovedThisTurn`;
 * - a `TurnStart` rule, `High` so it comes before a game's own rule that gives units their moves, that for each of the
 *   player's units takes the mark off and then heals a unit that had none (`healAmount`), or applies `decay` to one
 *   that had it (`decayAmount`).
 */
const healingRules = ({ cityRegistry = CityRegistry_1.instance, landMassRegistry = LandMassRegistry_1.instance, unitImprovementRegistry = UnitImprovementRegistry_1.instance, unitRegistry = UnitRegistry_1.instance, }, options) => {
    const { prefix, countsAsMove = (unit, action) => action.from() !== action.to(), } = options, id = (name) => prefix === undefined ? [] : [`${prefix}:${name}`];
    return [
        new Moved_1.default(...id('unit/moved/healing'), new Criterion_1.default((unit) => !unit.destroyed()), new Criterion_1.default(countsAsMove), new Criterion_1.default((unit) => !hasImprovement(unitImprovementRegistry, unit, MovedThisTurn_1.default)), new Effect_1.default((unit) => unitImprovementRegistry.register(new MovedThisTurn_1.default(unit)))),
        new TurnStart_1.default(...id('player/turn-start/heal-units'), new High_1.default(), new Effect_1.default((player) => unitRegistry.getByPlayer(player).forEach((unit) => {
            if (unit.destroyed()) {
                return;
            }
            const marks = unitImprovementRegistry
                .getByUnit(unit)
                .filter((unitImprovement) => unitImprovement instanceof MovedThisTurn_1.default);
            if (marks.length > 0) {
                unitImprovementRegistry.unregister(...marks);
                const decay = (0, exports.decayAmount)(unit, options);
                if (decay > 0) {
                    unit.setDamage(unit.damage() + decay);
                }
                return;
            }
            const heal = (0, exports.healAmount)(cityRegistry, landMassRegistry, unit, options);
            if (heal > 0) {
                unit.setDamage(unit.damage() - heal);
            }
        }))),
    ];
};
exports.healingRules = healingRules;
exports.default = exports.healingRules;
//# sourceMappingURL=healingRules.js.map