import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import { LandMassRegistry } from '@civ-clone/core-world/LandMassRegistry';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { UnitImprovementRegistry } from '@civ-clone/core-unit-improvement/UnitImprovementRegistry';
import { UnitRegistry } from '@civ-clone/core-unit/UnitRegistry';
import Action from '@civ-clone/core-unit/Action';
import City from '@civ-clone/core-city/City';
import Moved from '@civ-clone/core-unit/Rules/Moved';
import Tile from '@civ-clone/core-world/Tile';
import TurnStart from '@civ-clone/core-player/Rules/TurnStart';
import Unit from '@civ-clone/core-unit/Unit';
export interface HealingDependencies {
  cityRegistry?: CityRegistry;
  landMassRegistry?: LandMassRegistry;
  ruleRegistry?: RuleRegistry;
  unitImprovementRegistry?: UnitImprovementRegistry;
  unitRegistry?: UnitRegistry;
}
/** A bonus for resting near one of the player's own cities. */
export interface NearCityBonus {
  /** How far from the city, at most (0 is in it). */
  distance: number;
  /** The units it applies to: all, without. */
  appliesTo?: (unit: Unit) => boolean;
  /** The steps it adds, given the city. */
  steps: (unit: Unit, city: City) => number;
}
/** Damage that units which moved take each turn, never enough to destroy them. */
export interface Decay {
  /** The units, on the square they are on, that take it. */
  appliesTo: (unit: Unit) => boolean;
  /** The steps of damage a turn. */
  steps: number;
}
export interface HealingOptions {
  /** The rules' ids are `<prefix>:unit/moved/healing` and `<prefix>:player/turn-start/heal-units`. Unnamed without. */
  prefix?: string;
  /** A step heals the unit's maximum hit points over this, truncated. */
  stepsPerMaximum: number;
  /** The steps a unit heals for resting where it is, before any bonus. */
  restSteps: (unit: Unit) => number;
  /** A bonus for resting near (or in) the nearest of the player's own cities on the same land mass. */
  nearCity?: NearCityBonus;
  /** What the steps are multiplied by in one of the player's own cities. */
  inCityMultiplier: number;
  /** Whether the unit heals fully where it is: `city` is the player's own city it is in, if any. */
  fullHeal?: (unit: Unit, city: City | null) => boolean;
  /** Damage for units that moved and so don't heal. */
  decay?: Decay;
  /** Whether a `Moved` action counts as moving: by default, when it is to another square (attacks included). */
  countsAsMove?: (unit: Unit, action: Action) => boolean;
  /** How far apart two squares are, for `nearCity`: `Tile.distanceFrom` by default. */
  distance?: (from: Tile, to: Tile) => number;
}
/** `Tile.distanceFrom`, the world's own measure. */
export declare const tileDistance: (from: Tile, to: Tile) => number;
/**
 * The player's own city nearest `unit` on its land mass, and how far it is: the city it is in at distance 0, and none
 *  for a unit on a square with no land mass (at sea) unless it is in a city. The first of equally near cities.
 */
export declare const nearestOwnCity: (
  cityRegistry: CityRegistry,
  landMassRegistry: LandMassRegistry,
  unit: Unit,
  distance?: (from: Tile, to: Tile) => number
) => [City, number] | null;
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
export declare const healAmount: (
  cityRegistry: CityRegistry,
  landMassRegistry: LandMassRegistry,
  unit: Unit,
  {
    stepsPerMaximum,
    restSteps,
    nearCity,
    inCityMultiplier,
    fullHeal,
    distance,
  }: HealingOptions
) => number;
/**
 * The damage `unit`, having moved, takes from `decay` (OpenCiv2, `civ_heal_units`): a step a turn, but never so much
 *  that it has no hit points left. 0 for a unit it doesn't apply to.
 */
export declare const decayAmount: (
  unit: Unit,
  { stepsPerMaximum, decay }: HealingOptions
) => number;
/**
 * A ruleset's healing rules:
 *
 * - a `Moved` rule that marks a unit that moved (`countsAsMove`) with `MovedThisTurn`;
 * - a `TurnStart` rule, `High` so it comes before a game's own rule that gives units their moves, that for each of the
 *   player's units takes the mark off and then heals a unit that had none (`healAmount`), or applies `decay` to one
 *   that had it (`decayAmount`).
 */
export declare const healingRules: (
  {
    cityRegistry,
    landMassRegistry,
    unitImprovementRegistry,
    unitRegistry,
  }: HealingDependencies,
  options: HealingOptions
) => (Moved | TurnStart)[];
export default healingRules;
