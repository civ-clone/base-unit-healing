import { HitPoints, Movement } from '@civ-clone/core-unit/Yields';
import healingRules, { HealingOptions, healAmount } from '../lib/healingRules';
import damagedMovementRules, {
  damagedMovement,
} from '../lib/damagedMovementRules';
import Action from '@civ-clone/core-unit/Action';
import City from '@civ-clone/core-city/City';
import CityRegistry from '@civ-clone/core-city/CityRegistry';
import Criterion from '@civ-clone/core-rule/Criterion';
import Effect from '@civ-clone/core-rule/Effect';
import Generator from '@civ-clone/core-world-generator/Generator';
import LandMass from '@civ-clone/core-world/LandMass';
import LandMassRegistry from '@civ-clone/core-world/LandMassRegistry';
import Moved from '@civ-clone/core-unit/Rules/Moved';
import MovedThisTurn from '../lib/MovedThisTurn';
import Player from '@civ-clone/core-player/Player';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Terrain from '@civ-clone/core-terrain/Terrain';
import Tile from '@civ-clone/core-world/Tile';
import TurnStart from '@civ-clone/core-player/Rules/TurnStart';
import Unit from '@civ-clone/core-unit/Unit';
import UnitImprovementRegistry from '@civ-clone/core-unit-improvement/UnitImprovementRegistry';
import UnitRegistry from '@civ-clone/core-unit/UnitRegistry';
import World from '@civ-clone/core-world/World';
import { Yield as YieldRule } from '@civ-clone/core-unit/Rules/Yield';
import YieldValue from '@civ-clone/core-yield/Yield';
import { expect } from 'chai';

// The numbers are OpenCiv2's (github.com/richardpenman/civ2, read at 49f26ec), `civ_heal_units`, as a game passes
//  them: a step is a tenth of a unit's hit points; 1 step resting, 2 on a fortress; +1 for a land unit within 3 squares
//  of its nearest own city on the same land mass, +2 if that city has the land facility; ×2 in its own city; a full
//  heal in its own city with the facility for its domain, or for an air unit on an airbase; and units of one kind that
//  moved (outside a city or airbase) lose a step a turn, but never their last hit point. `unit_max_moves`: moves ×
//  hit points left / maximum in thirds of a move, truncated, rounded up to a whole move, at least 1 on land and 2 at
//  sea, with air units exempt.

type Domain = 'land' | 'sea' | 'air' | 'hover';

class Move extends Action {}

const setUp = () => {
  const ruleRegistry = new RuleRegistry(),
    unitRegistry = new UnitRegistry(),
    cityRegistry = new CityRegistry(),
    landMassRegistry = new LandMassRegistry(),
    unitImprovementRegistry = new UnitImprovementRegistry(),
    world = new World(new Generator(1, 10)),
    tiles = Array.from(
      { length: 10 },
      (_, x: number): Tile => new Tile(x, 0, new Terrain(), world)
    ),
    player = new Player(),
    stats = new Map<Unit, [Domain, number, number]>(),
    domain = (unit: Unit): Domain => stats.get(unit)![0],
    fortresses = new Set<Tile>(),
    airbases = new Set<Tile>(),
    facilities = new Map<City, Set<Domain>>(),
    unit = (
      tile: Tile,
      unitDomain: Domain = 'land',
      damage: number = 0,
      hitPoints: number = 10,
      movement: number = 1,
      owner: Player = player
    ): Unit => {
      const created = new Unit(null, owner, tile, ruleRegistry);

      stats.set(created, [unitDomain, hitPoints, movement]);
      created.setDamage(damage);
      unitRegistry.register(created);

      return created;
    },
    city = (tile: Tile, ...facilityFor: Domain[]): City => {
      const created = new City(player, tile, 'City', ruleRegistry);

      cityRegistry.register(created);
      facilities.set(created, new Set(facilityFor));

      return created;
    },
    options: HealingOptions = {
      prefix: 'test',
      // Squares along a row, as far apart as their columns.
      distance: (from: Tile, to: Tile): number => Math.abs(from.x() - to.x()),
      stepsPerMaximum: 10,
      restSteps: (unit: Unit): number => (fortresses.has(unit.tile()) ? 2 : 1),
      nearCity: {
        distance: 3,
        appliesTo: (unit: Unit): boolean => domain(unit) === 'land',
        steps: (unit: Unit, near: City): number =>
          facilities.get(near)!.has('land') ? 2 : 1,
      },
      inCityMultiplier: 2,
      fullHeal: (unit: Unit, inCity: City | null): boolean =>
        (inCity !== null && facilities.get(inCity)!.has(domain(unit))) ||
        (domain(unit) === 'air' && airbases.has(unit.tile())),
      decay: {
        appliesTo: (unit: Unit): boolean =>
          domain(unit) === 'hover' &&
          cityRegistry.getByTile(unit.tile()) === null &&
          !airbases.has(unit.tile()),
        steps: 1,
      },
    };

  // One row of 10 squares (`Generator` takes the height first). Squares 0 to 5 are one land mass, 6 to 7 another; 8 and 9 are sea.
  landMassRegistry.register(
    new LandMass(tiles.slice(0, 6)),
    new LandMass(tiles.slice(6, 8))
  );

  ruleRegistry.register(
    new YieldRule(
      new Criterion((unit: Unit): boolean => stats.has(unit)),
      new Effect((unit: Unit, unitYield: YieldValue): void => {
        const [, hitPoints, movement] = stats.get(unit)!;

        if (unitYield instanceof HitPoints) {
          unitYield.set(hitPoints);
        }

        if (unitYield instanceof Movement) {
          unitYield.set(movement);
        }
      })
    ),
    ...healingRules(
      {
        cityRegistry,
        landMassRegistry,
        unitImprovementRegistry,
        unitRegistry,
      },
      options
    )
  );

  const startTurn = (forPlayer: Player = player): void =>
      ruleRegistry.process(TurnStart, forPlayer),
    move = (moving: Unit, to: Tile = moving.tile()): void => {
      ruleRegistry.process(
        Moved,
        moving,
        new Move(moving.tile(), to, moving, ruleRegistry)
      );
    };

  return {
    airbases,
    city,
    cityRegistry,
    fortresses,
    landMassRegistry,
    move,
    options,
    player,
    ruleRegistry,
    startTurn,
    tiles,
    unit,
    unitImprovementRegistry,
  };
};

describe('healingRules', (): void => {
  it('should heal a resting unit a step (a tenth of its hit points) far from a city', (): void => {
    const { city, startTurn, tiles, unit } = setUp(),
      resting = unit(tiles[5], 'land', 5),
      larger = unit(tiles[5], 'land', 5, 20);

    city(tiles[0]);
    startTurn();

    expect(resting.damage()).to.equal(4);
    expect(larger.damage()).to.equal(3);
  });

  it('should heal 2 steps on a fortress', (): void => {
    const { fortresses, startTurn, tiles, unit } = setUp(),
      resting = unit(tiles[5], 'land', 5);

    fortresses.add(tiles[5]);
    startTurn();

    expect(resting.damage()).to.equal(3);
  });

  it('should add a step within 3 squares of the nearest own city on the same land mass, 2 with its facility', (): void => {
    const plain = setUp(),
      near = plain.unit(plain.tiles[3], 'land', 5),
      farther = plain.unit(plain.tiles[4], 'land', 5),
      ship = plain.unit(plain.tiles[3], 'sea', 5);

    plain.city(plain.tiles[0]);
    plain.startTurn();

    expect(near.damage()).to.equal(3);
    expect(farther.damage()).to.equal(4);
    expect(ship.damage()).to.equal(4);

    const equipped = setUp(),
      trained = equipped.unit(equipped.tiles[3], 'land', 5);

    equipped.city(equipped.tiles[0], 'land');
    equipped.startTurn();

    expect(trained.damage()).to.equal(2);
  });

  it("should ignore another land mass's cities and another player's", (): void => {
    const { city, player, startTurn, tiles, unit } = setUp(),
      otherPlayer = new Player(),
      across = unit(tiles[6], 'land', 5),
      foreign = unit(tiles[3], 'land', 5, 10, 1, otherPlayer);

    city(tiles[4]);
    startTurn();
    startTurn(otherPlayer);

    expect(across.damage()).to.equal(4);
    expect(foreign.damage()).to.equal(4);
    expect(player).not.to.equal(otherPlayer);
  });

  it('should double the steps in an own city, and heal fully with the facility for the unit', (): void => {
    const { city, startTurn, tiles, unit } = setUp(),
      soldier = unit(tiles[0], 'land', 9),
      ship = unit(tiles[0], 'sea', 9),
      plane = unit(tiles[0], 'air', 9),
      repaired = unit(tiles[2], 'sea', 9);

    city(tiles[0]);
    city(tiles[2], 'sea');
    startTurn();

    // (1 + 1) × 2 for a land unit, 1 × 2 for the others.
    expect(soldier.damage()).to.equal(5);
    expect(ship.damage()).to.equal(7);
    expect(plane.damage()).to.equal(7);
    expect(repaired.damage()).to.equal(0);
  });

  it('should heal an air unit fully on an airbase', (): void => {
    const { airbases, startTurn, tiles, unit } = setUp(),
      plane = unit(tiles[5], 'air', 9);

    airbases.add(tiles[5]);
    startTurn();

    expect(plane.damage()).to.equal(0);
    expect(Object.keys(plane)).not.to.include('_damage');
  });

  it('should not heal a unit that moved to another square in its last turn, and heal it the turn after', (): void => {
    const { move, startTurn, tiles, unit, unitImprovementRegistry } = setUp(),
      mover = unit(tiles[5], 'land', 5),
      stayer = unit(tiles[5], 'land', 5);

    move(mover, tiles[4]);
    // To its own square (fortifying, say) isn't a move.
    move(stayer);
    move(mover, tiles[5]);

    expect(
      unitImprovementRegistry
        .getByUnit(mover)
        .filter((improvement) => improvement instanceof MovedThisTurn).length
    ).to.equal(1);
    expect(unitImprovementRegistry.getByUnit(stayer)).to.deep.equal([]);

    startTurn();

    expect(mover.damage()).to.equal(5);
    expect(stayer.damage()).to.equal(4);
    expect(unitImprovementRegistry.getByUnit(mover)).to.deep.equal([]);

    startTurn();

    expect(mover.damage()).to.equal(4);
  });

  it('should apply decay to units that moved, never past their last hit point', (): void => {
    const { city, move, startTurn, tiles, unit } = setUp(),
      hovering = unit(tiles[5], 'hover', 0),
      nearlyGone = unit(tiles[5], 'hover', 9),
      inCity = unit(tiles[0], 'hover', 0),
      resting = unit(tiles[5], 'hover', 5);

    city(tiles[0]);
    [hovering, nearlyGone, inCity].forEach((moved: Unit): void =>
      move(moved, tiles[4])
    );
    startTurn();

    expect(hovering.damage()).to.equal(1);
    expect(nearlyGone.damage()).to.equal(9);
    expect(inCity.damage()).to.equal(0);
    expect(resting.damage()).to.equal(4);
  });

  it('should leave undamaged and destroyed units alone, keeping no damage field', (): void => {
    const { startTurn, tiles, unit } = setUp(),
      healthy = unit(tiles[5]),
      destroyed = unit(tiles[5], 'land', 5);

    destroyed.setDestroyed();
    startTurn();

    expect(Object.keys(healthy)).not.to.include('_damage');
    expect(destroyed.damage()).to.equal(5);
  });

  it('should measure the distance to a city with `Tile.distanceFrom` when the game gives no measure', (): void => {
    const { city, cityRegistry, landMassRegistry, options, tiles, unit } =
        setUp(),
      { distance, ...withoutDistance } = options,
      near = unit(tiles[3], 'land', 5),
      far = unit(tiles[4], 'land', 5);

    city(tiles[0]);

    expect(distance).to.be.a('function');
    expect(tiles[3].distanceFrom(tiles[0])).to.equal(3);
    expect(
      healAmount(cityRegistry, landMassRegistry, near, withoutDistance)
    ).to.equal(2);
    expect(
      healAmount(cityRegistry, landMassRegistry, far, withoutDistance)
    ).to.equal(1);
  });

  it('should name its rules with the prefix', (): void => {
    const { options } = setUp(),
      rules = healingRules({}, options);

    expect(rules.map((rule) => rule.id())).to.deep.equal([
      'test:unit/moved/healing',
      'test:player/turn-start/heal-units',
    ]);
  });
});

describe('damagedMovement', (): void => {
  // 3 moves, counted in thirds.
  it('should truncate to a third, then round up to a whole move (`unit_max_moves`)', (): void => {
    // 9 × 20 / 30 = 6: 2 moves.
    expect(damagedMovement(3, 20, 30, 3, 1)).to.equal(2);
    // 9 × 15 / 30 = 4.5 → 4 → 6: 2 moves.
    expect(damagedMovement(3, 15, 30, 3, 1)).to.equal(2);
    // 9 × 7 / 10 = 6.3 → 6: 2 moves, where rounding 2.1 moves up would give 3.
    expect(damagedMovement(3, 7, 10, 3, 1)).to.equal(2);
    // 9 × 8 / 10 = 7.2 → 7 → 9: 3 moves.
    expect(damagedMovement(3, 8, 10, 3, 1)).to.equal(3);
  });

  it('should keep the minimum, but never more than the undamaged moves', (): void => {
    expect(damagedMovement(3, 1, 30, 3, 1)).to.equal(1);
    // 5 moves at sea, a third of its hit points left: 5 → 6 → 2 moves, the minimum there.
    expect(damagedMovement(5, 10, 30, 3, 2)).to.equal(2);
    expect(damagedMovement(5, 1, 30, 3, 2)).to.equal(2);
    expect(damagedMovement(1, 1, 10, 3, 2)).to.equal(1);
  });
});

describe('damagedMovementRules', (): void => {
  const setUpMovement = () => {
    const ruleRegistry = new RuleRegistry(),
      world = new World(new Generator(1, 1)),
      tile = new Tile(0, 0, new Terrain(), world),
      exempt = new Set<Unit>(),
      unit = (damage: number, movement: number = 3): Unit => {
        const created = new Unit(null, new Player(), tile, ruleRegistry);

        created.setDamage(damage);
        stats.set(created, movement);

        return created;
      },
      stats = new Map<Unit, number>();

    ruleRegistry.register(
      // Registered first, but `Low`: it still comes after the rules below.
      ...damagedMovementRules({
        id: 'test:unit/yield/damaged-movement',
        stepsPerMove: 3,
        minimum: (): number => 1,
        appliesTo: (unit: Unit): boolean => !exempt.has(unit),
      }),
      new YieldRule(
        new Criterion((unit: Unit): boolean => stats.has(unit)),
        new Effect((unit: Unit, unitYield: YieldValue): void => {
          if (unitYield instanceof HitPoints) {
            unitYield.set(30);
          }

          if (unitYield instanceof Movement) {
            unitYield.set(stats.get(unit)!);
          }
        })
      )
    );

    return { exempt, unit };
  };

  it("should slow a damaged unit's movement, not its moves left", (): void => {
    const { unit } = setUpMovement(),
      damaged = unit(15);

    damaged.moves().set(3);

    expect(damaged.movement().value()).to.equal(2);
    expect(damaged.moves().value()).to.equal(3);
  });

  it('should leave undamaged and exempt units at full movement', (): void => {
    const { exempt, unit } = setUpMovement(),
      healthy = unit(0),
      flying = unit(20, 10);

    exempt.add(flying);

    expect(healthy.movement().value()).to.equal(3);
    expect(flying.movement().value()).to.equal(10);
  });
});
