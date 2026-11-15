import {
  CityRegistry,
  instance as cityRegistryInstance,
} from '@civ-clone/core-city/CityRegistry';
import {
  LandMassRegistry,
  instance as landMassRegistryInstance,
} from '@civ-clone/core-world/LandMassRegistry';
import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import {
  UnitImprovementRegistry,
  instance as unitImprovementRegistryInstance,
} from '@civ-clone/core-unit-improvement/UnitImprovementRegistry';
import {
  UnitRegistry,
  instance as unitRegistryInstance,
} from '@civ-clone/core-unit/UnitRegistry';
import Action from '@civ-clone/core-unit/Action';
import City from '@civ-clone/core-city/City';
import Criterion from '@civ-clone/core-rule/Criterion';
import Effect from '@civ-clone/core-rule/Effect';
import High from '@civ-clone/core-rule/Priorities/High';
import Moved from '@civ-clone/core-unit/Rules/Moved';
import MovedThisTurn from './MovedThisTurn';
import Player from '@civ-clone/core-player/Player';
import Tile from '@civ-clone/core-world/Tile';
import TurnStart from '@civ-clone/core-player/Rules/TurnStart';
import Unit from '@civ-clone/core-unit/Unit';
import UnitImprovement from '@civ-clone/core-unit-improvement/UnitImprovement';

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
export const tileDistance = (from: Tile, to: Tile): number =>
  from.distanceFrom(to);

/** Whether `unit` has `Improvement`. */
const hasImprovement = (
  unitImprovementRegistry: UnitImprovementRegistry,
  unit: Unit,
  Improvement: typeof UnitImprovement
): boolean =>
  unitImprovementRegistry
    .getByUnit(unit)
    .some(
      (unitImprovement: UnitImprovement): boolean =>
        unitImprovement instanceof Improvement
    );

/**
 * The player's own city nearest `unit` on its land mass, and how far it is: the city it is in at distance 0, and none
 *  for a unit on a square with no land mass (at sea) unless it is in a city. The first of equally near cities.
 */
export const nearestOwnCity = (
  cityRegistry: CityRegistry,
  landMassRegistry: LandMassRegistry,
  unit: Unit,
  distance: (from: Tile, to: Tile) => number = tileDistance
): [City, number] | null => {
  const tile = unit.tile(),
    city = cityRegistry.getByTile(tile);

  if (city !== null && city.player() === unit.player()) {
    return [city, 0];
  }

  const landMass = landMassRegistry.getByTile(tile);

  if (landMass === null) {
    return null;
  }

  let nearest: [City, number] | null = null;

  cityRegistry
    .getByPlayer(unit.player())
    .filter((candidate: City): boolean => landMass.hasTile(candidate.tile()))
    .forEach((candidate: City): void => {
      const away = distance(tile, candidate.tile());

      if (nearest === null || away < nearest[1]) {
        nearest = [candidate, away];
      }
    });

  return nearest;
};

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
export const healAmount = (
  cityRegistry: CityRegistry,
  landMassRegistry: LandMassRegistry,
  unit: Unit,
  {
    stepsPerMaximum,
    restSteps,
    nearCity,
    inCityMultiplier,
    fullHeal = () => false,
    distance = tileDistance,
  }: HealingOptions
): number => {
  const damage = unit.damage();

  if (damage <= 0) {
    return 0;
  }

  const [, maximum] = unit.hitPoints(),
    nearest = nearestOwnCity(cityRegistry, landMassRegistry, unit, distance),
    city = nearest !== null && nearest[1] === 0 ? nearest[0] : null;

  if (fullHeal(unit, city)) {
    return damage;
  }

  let steps = restSteps(unit);

  if (
    nearCity !== undefined &&
    nearest !== null &&
    nearest[1] <= nearCity.distance &&
    (nearCity.appliesTo ?? (() => true))(unit)
  ) {
    steps += nearCity.steps(unit, nearest[0]);
  }

  if (city !== null) {
    steps *= inCityMultiplier;
  }

  return Math.min(
    damage,
    Math.max(0, Math.trunc(maximum / stepsPerMaximum) * steps)
  );
};

/**
 * The damage `unit`, having moved, takes from `decay` (OpenCiv2, `civ_heal_units`): a step a turn, but never so much
 *  that it has no hit points left. 0 for a unit it doesn't apply to.
 */
export const decayAmount = (
  unit: Unit,
  { stepsPerMaximum, decay }: HealingOptions
): number => {
  if (decay === undefined || !decay.appliesTo(unit)) {
    return 0;
  }

  const [remaining, maximum] = unit.hitPoints();

  return Math.max(
    0,
    Math.min(Math.trunc(maximum / stepsPerMaximum) * decay.steps, remaining - 1)
  );
};

/**
 * A ruleset's healing rules:
 *
 * - a `Moved` rule that marks a unit that moved (`countsAsMove`) with `MovedThisTurn`;
 * - a `TurnStart` rule, `High` so it comes before a game's own rule that gives units their moves, that for each of the
 *   player's units takes the mark off and then heals a unit that had none (`healAmount`), or applies `decay` to one
 *   that had it (`decayAmount`).
 */
export const healingRules = (
  {
    cityRegistry = cityRegistryInstance,
    landMassRegistry = landMassRegistryInstance,
    unitImprovementRegistry = unitImprovementRegistryInstance,
    unitRegistry = unitRegistryInstance,
  }: HealingDependencies,
  options: HealingOptions
): (Moved | TurnStart)[] => {
  const {
      prefix,
      countsAsMove = (unit: Unit, action: Action): boolean =>
        action.from() !== action.to(),
    } = options,
    id = (name: string): string[] =>
      prefix === undefined ? [] : [`${prefix}:${name}`];

  return [
    new Moved(
      ...id('unit/moved/healing'),
      new Criterion((unit: Unit): boolean => !unit.destroyed()),
      new Criterion(countsAsMove),
      new Criterion(
        (unit: Unit): boolean =>
          !hasImprovement(unitImprovementRegistry, unit, MovedThisTurn)
      ),
      new Effect((unit: Unit): void =>
        unitImprovementRegistry.register(new MovedThisTurn(unit))
      )
    ),
    new TurnStart(
      ...id('player/turn-start/heal-units'),
      new High(),
      new Effect((player: Player): void =>
        unitRegistry.getByPlayer(player).forEach((unit: Unit): void => {
          if (unit.destroyed()) {
            return;
          }

          const marks = unitImprovementRegistry
            .getByUnit(unit)
            .filter(
              (unitImprovement: UnitImprovement): boolean =>
                unitImprovement instanceof MovedThisTurn
            );

          if (marks.length > 0) {
            unitImprovementRegistry.unregister(...marks);

            const decay = decayAmount(unit, options);

            if (decay > 0) {
              unit.setDamage(unit.damage() + decay);
            }

            return;
          }

          const heal = healAmount(
            cityRegistry,
            landMassRegistry,
            unit,
            options
          );

          if (heal > 0) {
            unit.setDamage(unit.damage() - heal);
          }
        })
      )
    ),
  ];
};

export default healingRules;
