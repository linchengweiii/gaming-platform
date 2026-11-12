# Gaming Platform Architecture

## 1. Design Principles

1. **Pure Deterministic Game State Machines**: Every board game implements `GameEngine<TState, TConfig, TAction, TEvent, TPlayerView>` in `packages/core`. Game engines have zero I/O or network dependencies; given `(state, playerId, action)`, they deterministically produce `(nextState, events)`.
2. **Single Source of Truth Across Client & Server**: Both `apps/server` (multiplayer rooms) and `apps/web` (visual board, legal move highlighting, and local sandbox inspector) import `@gaming-platform/core` and `@gaming-platform/catan` directly.
3. **Continuous Invariant Validation**: Every game engine exposes `checkInvariants(state)` which verifies conservation laws, board topology rules (e.g. Catan's Distance Rule, non-negative bank & player resources, road/ship connectivity), and Victory Point accounting after every action.

## 2. Hex Grid Topology (`packages/core/src/hex.ts`)

Catan's board is modeled on a pointy-top Axial Hex Grid `(q, r)`:
- **Hexes**: Identified by `"q,r"`.
- **Canonical Vertices**: Each hex has 6 corners, shared among up to 3 hexes. Every corner maps uniquely to a canonical vertex `"{q},{r}:N"` (northern corner) or `"{q},{r}:S"` (southern corner). A standard 19-hex board has exactly **54 unique vertices**.
- **Canonical Edges**: Each hex has 6 sides, shared between 2 hexes. Every side maps uniquely to one of 3 canonical directions per hex: `"{q},{r}:NE"`, `"{q},{r}:E"`, or `"{q},{r}:SE"`. A standard 19-hex board has exactly **72 unique edges**.

## 3. Supported Catan Scenarios & Expansions (`packages/games/catan`)

- **Standard Catan (3–4 Players)**: 19 terrain hexes, 18 number tokens (balanced 6/8 spacing), 9 harbors, 10 VP target.
- **5–6 Player Extension**: 30 terrain hexes, 28 number tokens, 11 harbors, expanded bank (24 per resource) & 34 dev cards, plus the **Special Building Phase** between turns.
- **Seafarers: Heading for New Shores**: Main island + offshore Gold-rich island chain, **Ships** (`1 wool + 1 lumber`), moving open ships, **Pirate Fleet**, **Gold River** hexes (choose any resource on production), and **+2 Bonus VP** for colonizing new islands (12 VP target).
- **Seafarers: Four Islands**: 4 distinct island groups separated by sea lanes (12 VP target).
- **Seafarers: Fog Islands**: Uncharted `fog` tiles across the central sea channel that dynamically reveal terrain + number tokens and grant free resource rewards when explored by road or ship (12 VP target).
- **Modular Variants**:
  - **Harbormaster** (+2 VP card awarded for 3+ harbor points on coastal settlements/cities)
  - **City Walls** (`2 brick`, +2 hand limit before discarding on a `7`, up to 3 walls per player)
  - **Friendly Robber** (Robber/Pirate cannot target hexes of players with <= 2 visible VP)
