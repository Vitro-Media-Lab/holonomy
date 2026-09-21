# Escalation Block 1 — Levels 1 to 10

Companion to `design/progression.json` (machine-readable intent) and
`tools/audit.mjs` (checks built levels against it).

## What the medium can actually do

Measured with the solver, not assumed:

| fact | value |
| --- | --- |
| distinct needle states | 4 |
| distinct demands a slot can make | `0`, `+90`, `-90`, `180`. There is no `270`. |
| orientation tax, 90-degree demands | 1 to 7 steps |
| orientation tax, 180-degree demands | 0 to 10 steps |
| placements where `+90` and `-90` cost different amounts | 60.6% |
| a band loop round the cube | 4 corners, 16 steps, **zero** net rotation |

Two consequences drive the whole block:

1. **The state space is shallow.** Four needle values means a determined
   player can brute-force the answer by level six. Difficulty cannot come from
   the needle; it comes from the **step budget**, which is what makes a wrong
   route unrecoverable rather than merely annoying.
2. **Handedness is a placement property, not an object property.** Adding a
   gate or a mirror to an open cube does not make `+90` cost more than `-90`,
   because you can always wrap a different corner instead. Choosing where the
   slot goes does.

## The secondary element: the mirror

Introduced at L4. A passive tile that reflects the carried needle across its
own axis when the player arrives on it.

Chosen over a one-way gate after building and testing both. The gate
constrains routes but adds no new algebra, and measurement showed it cannot
separate the two handednesses even at the tightest budget. The mirror can:

- **It supplies sign.** The cube gives rotation away freely but has no way to
  give you a direction of rotation. `M · R · M = R⁻¹`.
- **It does not commute.** Verified: from needle `+X`, mirror-then-corner
  gives `-Z`; corner-then-mirror gives `+Z`. Same ingredients, different
  answer. Nothing else in the game behaves this way.
- **It is an involution.** Two passes cancel, which is a puzzle in itself.

## The matrix

### L1 — Two Steps, Nine Steps *(built, audited)*

- **Layout** — One face in play. Spawn, key, slot in a straight line on `+Y`:
  `(1,0) → (1,1) → (1,2)`. Every other face open and empty.
- **Constraint** — Budget 10. The key hands you `+X`; the slot wants `+Z`.
  Walking the straight line delivers `+X` unchanged, so the slot refuses.
  Turning cannot help: the lock reads the needle, and only the ground turns it.
- **Secondary element** — none.
- **Logic leap** — The player treats the goal as a place, and is blocked by
  standing on it while it refuses them. Required realization: arrival has a
  *state* as well as a location, and only the shape of the route sets it.
- **Measured** — reach 2, solve 9, tax +7, solution visits 3 faces.

### L2 — The Long Way Is Shorter

- **Layout** — Key on `+Y`, slot on `+Z`. A wall spine splits the top face so
  the two ways off it diverge early and never reconverge.
- **Constraint** — Budget equals the long route exactly. The short route
  arrives 90 degrees wrong, and the corrective detour costs more than the gap
  between the two routes. No recovery.
- **Secondary element** — none.
- **Logic leap** — Reflex path-length optimization. The block is "I found the
  short way, why is it wrong". Realization: the two sides of the wall are not
  mirror images. One passes a cube corner; the other does not. Count corners.

### L3 — Three Ways, One Move

- **Layout** — Key on `+Y`, slot on `-Y`, the opposite pole. Open cube; three
  obviously distinct routes across three different pairs of side faces.
- **Constraint** — Generous budget, all three routes fit, all three deliver
  the same needle because each wraps the same corner count mod 4.
- **Secondary element** — none.
- **Logic leap** — "My clever route must be the special one." Realization: a
  route wrapping one corner and a route wrapping five are the same move. The
  map is not the thing.

### L4 — The Flip

- **Layout** — Walls reduce the board to a single corridor from key to slot.
  One mirror sits on it, unavoidable.
- **Constraint** — Budget permits only the corridor, so the mirror cannot be
  designed around. The route's corner count is no longer the whole story.
- **Secondary element** — *mirror, introduced.* Its only job here is to exist
  and be counted: the route the player would otherwise pick now overshoots.
- **Logic leap** — Player assumes only corners change the needle. Realization:
  the board has its own way of turning what you carry, and it goes in the
  ledger before the route is chosen, not after.

### L5 — Twice Is Never

- **Layout** — The mirror sits on a junction the route can cross once or twice.
  A longer mirror-free detour also exists.
- **Constraint** — The demand is satisfiable by avoiding the mirror entirely
  or by crossing it exactly twice. The budget makes the two-crossing route the
  cheaper one.
- **Secondary element** — the mirror as an **involution**.
- **Logic leap** — Player treats the mirror as a hazard to route around.
  Realization: a mirror is its own undo. Two passes cost steps but cost no
  rotation, which beats the detour that avoids it.

### L6 — Two Corners

- **Layout** — Key and slot on opposite faces; walls remove every
  single-corner route between them.
- **Constraint** — 180 degrees demanded. Budget admits only routes wrapping
  exactly two corners.
- **Secondary element** — mirror present as a **decoy**: using it makes the
  arithmetic worse, and working out why is the level.
- **Logic leap** — Player hunts for one bigger loop. Realization: 180 is not a
  bigger corner, it is two corners, and corners add.

### L7 — The Wrong Way Round

- **Layout** — Slot placed at one of the 60.6% of positions where the two
  handednesses cost different amounts. The demanded sign is the dear one.
- **Constraint** — Budget admits the cheap handedness but not the expensive
  one. Walking it directly is impossible, not merely long.
- **Secondary element** — the mirror as a **bridge**. Flip, wrap the cheap
  corner, flip back.
- **Logic leap** — Player looks for a corner that turns the other way, fails
  to find one, and concludes the level is broken. Realization: you cannot buy
  the other sign, but you can borrow it. A reflection conjugates a rotation
  into its inverse.

### L8 — Order of Operations

- **Layout** — One mirror and one corner, both unavoidable. Two routes using
  exactly the same tiles in the opposite order.
- **Constraint** — Both routes cost identical steps and both fit the budget.
  Only one delivers the right needle.
- **Secondary element** — the mirror as a **non-commuting operator**.
- **Logic leap** — By now the player treats a route as a *set* of features to
  collect. Realization: these operations do not commute. The same ingredients
  in the other order are a different answer. This is the hardest leap in the
  block and it is why the mirror was chosen over a gate.

### L9 — The Free Band

- **Layout** — Key on a near face, slot on a far one. Walls force every short
  route to wrap exactly one corner.
- **Constraint** — The slot demands the needle **unchanged**. Every short
  route rotates it. The budget is conspicuously large: large enough for a full
  band loop, 16 steps, which nothing else on the board would justify.
- **Secondary element** — mirrors as decoys on the short routes, offering a
  tempting fix with the wrong parity.
- **Logic leap** — Player reads a big budget as generosity and a long route as
  waste. Realization: four corners cancel. The band loop is the only
  rotation-neutral route on the board, and the budget was the tell.

### L10 — Nothing Spare

- **Layout** — Whole cube in play. Walls define a heavily branched route
  graph. Two mirrors. Key and slot on faces never both near the camera.
- **Constraint** — Budget equals the optimal solution exactly. One route
  survives. Each decoy fails for a *different* reason: too long, wrong parity,
  right ingredients in the wrong order, three corners instead of one.
- **Secondary element** — two mirrors, so parity and order interact.
- **Logic leap** — Player wants to explore and correct. Realization: with zero
  slack there is no exploring. The route must be solved on the visible
  geometry before the first step. Undo is the only exploration permitted, and
  that is the point.

## Risks

- **L6 onward is brute-forceable** in principle: four needle states means
  guessing is cheap. The budget is the only thing stopping it. If playtesting
  shows guessing, tighten budgets before adding mechanics.
- **L8 may be too hard too early.** Non-commutativity is a genuine
  mathematical idea. If it stalls players, swap L8 and L9.
- **L10's exact budget is brutal** without undo. Undo is not a convenience
  here, it is load-bearing.
