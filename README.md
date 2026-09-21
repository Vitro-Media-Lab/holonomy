# Surface Walker

A puzzle game about walking on the outside of a solid, where going round a
corner turns what you are carrying.

**Play it: [holonomy.vitromedialab.com](https://holonomy.vitromedialab.com)**

## The idea

You walk tile by tile over the surface of a see-through polyhedron, viewed
from a camera that never rotates. You pick up a key that points somewhere, and
a slot wants that key pointing a particular way.

Turning on the spot is free and does nothing to the key. Only the **route**
turns it — because carrying something around a corner rotates it, and the
amount is fixed by the shape, not by the game. Walk a loop around one corner
of a cube and you come back to the tile you left facing ninety degrees off,
with nothing else changed.

So you can see where you need to go from the first move. The question is never
*how do I get there*, it is **which way round**, and the answer is counted in
corners enclosed rather than tiles walked.

That is holonomy, and it falls out of the movement rules rather than being
scripted, which is why it never contradicts itself.

## Controls

| key | |
| --- | --- |
| `W` | step forward one tile |
| `A` `D` | turn ninety degrees on the spot |
| `Z` | undo |
| `R` | restart the level |
| `N` `P` | change level |
| `C` | fix the view instead of following |
| `M` | mute |
| `` ` `` | debug panel (spoils the puzzle) |

## Running it

```bash
npm install
npm run dev      # play it
npm test         # 181 tests
npm run build
```

## How the levels are made

Levels are not placed by hand. A solver measures every arrangement on a solid
and the generator picks a rising curve from what it finds.

```bash
npm run worlds    # regenerate all 25 levels
npm run audit     # check every level against its declared intent
npm run verify    # replay every optimal route through the real game rules
```

Four numbers decide how hard a level is, and all four are measured:

| | |
| --- | --- |
| **tax** | extra steps the key's direction costs over merely arriving |
| **demand** | a quarter turn (one corner) or a half turn (two) |
| **gap** | how much worse the lazy answer is than the best one |
| **par** | how long the best answer is |

The ladder is calibrated **per solid**, because the same units mean different
things on different shapes: a dodecahedron tops out around a tax of 4 while an
octahedron reaches 10. Dense curvature makes rotation cheap to pick up, so —
counter-intuitively — the more gnarled a solid looks, the gentler it tends to
play.

## The worlds

| | solid | what it teaches |
| --- | --- | --- |
| **C** | cube | eight corners, all a quarter turn, exactly where you expect |
| **T** | tetrahedron | eight corners on only four faces, so half sit mid-face |
| **O** | octahedron | the six sharp points are **flat**; the corners are the middles of the triangles |
| **D** | dodecahedron | both signs — twenty corners that add, twelve saddles that subtract |
| **P** | polycubes | concave folds, up to a half turn of negative curvature at one vertex |

## How it works underneath

Any polyhedron is cut into four-sided tiles (Catmull–Clark topology, no
smoothing, so faces stay flat). Every tile then has four sides whatever the
solid, so one movement model serves all of them: turning is `±1 mod 4`,
stepping goes out one side and in the opposite one, and carrying a direction
across is one line of modular arithmetic.

Curvature stops being "the cube has corners" and becomes *a mesh vertex where
the tile count is not four* — three tiles is a quarter turn, four is flat,
five is a saddle. The engine checks itself with Gauss–Bonnet: total curvature
is exactly 720° on every solid at every subdivision, and any mistake in
subdivision, winding or adjacency shows up there immediately.

Adding a solid means typing its vertices; faces are found by hull. Polycubes
are built from a list of unit cells.

## Credits

No third-party assets. Geometry is generated, sound is synthesised with
WebAudio, and there are no textures, models or fonts to attribute.

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev).
