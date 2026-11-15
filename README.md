# base-unit-healing

Healing for damaged units (core-unit's `damage()`), and slower movement while damaged. A library: nothing registers on
import, and a game that registers none of it has units that never heal (nor, without a `CombatResolver` that deals
damage, need to).

## API

Deep-import the modules; there is no index.

- `lib/healingRules`: `healingRules({ cityRegistry, landMassRegistry, unitImprovementRegistry, unitRegistry },
  options): (Moved | TurnStart)[]`:
  - a `Moved` rule that marks a unit that moved with `MovedThisTurn`. What counts as moving is `countsAsMove(unit,
    action)`, by default an action to another square, attacks included; work and fortifying on its own square don't.
  - a `TurnStart` rule (`High`, so it comes before the game's rule that resets units' moves, which then reads the
    healed hit points) that, for each of the player's units, takes the mark off, then heals a unit that had none and
    applies `decay` to one that had it.
  - `healAmount(...)`, `decayAmount(...)` and `nearestOwnCity(...)`, the arithmetic.
- `lib/MovedThisTurn`: the mark, a `UnitImprovement`.
- `lib/damagedMovementRules`: `damagedMovementRules({ stepsPerMove, minimum, appliesTo?, id? })`, a unit `Yield` rule
  (`Low`, after the rules that set and add to movement) that lowers the `Movement` yield of a damaged unit, and
  `damagedMovement(...)`, its arithmetic.

### Healing options

| Option | What it is |
|---|---|
| `stepsPerMaximum` | A step heals the unit's maximum hit points over this, truncated |
| `restSteps(unit)` | Steps for resting, before any bonus (a fortress can give more) |
| `nearCity` | `{ distance, appliesTo?, steps(unit, city) }`: steps added within `distance` of the nearest of the player's own cities on the unit's land mass |
| `inCityMultiplier` | The steps are multiplied by this in one of the player's own cities |
| `fullHeal(unit, city)` | Heals fully where it is; `city` is the player's own city it is in, if any |
| `decay` | `{ appliesTo(unit), steps }`: damage a turn for units that moved, never past their last hit point |
| `distance(from, to)` | How far apart two squares are; `Tile.distanceFrom` by default |
| `prefix` | Rule ids `<prefix>:unit/moved/healing` and `<prefix>:player/turn-start/heal-units` |

The order follows OpenCiv2 (github.com/richardpenman/civ2, read at 49f26ec), `civ_heal_units`: rest steps plus the
near-city bonus, times the in-city multiplier, each step `maximum / stepsPerMaximum`; a full heal overrides it; never
more than the damage. Which facilities heal fully, and which units decay, are the game's: it passes them in.

### Slower movement

`movement × remaining / maximum`, counted in `stepsPerMove` steps of a move and truncated to a step, then rounded up to
a whole move, at least `minimum(unit)` moves (OpenCiv2, `unit_max_moves`). Unlike the original, a minimum never gives a
unit more than its undamaged movement (no unit in the original's data has fewer moves than its minimum). Only
`Movement`, what a unit's moves are reset to each turn, is changed, not the moves it has left.

## The mark is saved

`MovedThisTurn` exists only for a unit that moved, and only until its player's next turn, so units at rest carry and
save nothing extra. It is a `UnitImprovement`, so a game that saves registers it in its
`AvailableUnitImprovementRegistry`, as it does `Veteran` and `Fortified`. It is also sent to clients in a unit's
`improvements`, which a client should leave out of what it shows.
