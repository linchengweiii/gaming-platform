# Repository Guidelines

## Architecture Overview

This repository is a TypeScript monorepo for an online multi-board-game platform featuring **Settlers of Catan** (Base Game, 5–6 Player Extensions across Base/Seafarers/Cities & Knights, Cities & Knights Expansion, Seafarers Expansion, Harbormaster, and City Walls), **7 Wonders** (3–7 Players, Day A & Night B Wonders, Ages I–III + Guilds), **Splendor**, and **Azul**.

- `packages/core/`: Game-agnostic platform primitives:
  - `rng.ts`: Deterministic seeded PRNG (`SeededRNG`)
  - `hex.ts`: Axial hex grid topology, canonical vertex/edge coordinates, pixel projection, and longest simple path graph algorithms
  - `engine.ts`: Generic `GameEngine` state-machine contract, `GameRegistry`, `MatchSession` (with replay & undo/redo), and invariant verification
- `packages/games/catan/`: Pure, deterministic Catan engine plugin:
  - `types.ts`: State, configuration, scenario presets, resources, commodities, progress cards, turn phases, and discriminated union actions
  - `board.ts`: Board & scenario generators (Standard 3–4P, 5–6P Big Island, Cities & Knights 3–4P & 5–6P, Seafarers 3–4P & 5–6P: Heading for New Shores, Four/Six Islands, Fog Islands)
  - `cities-and-knights.ts`: Pure Cities & Knights domain helpers (commodities, improvements, metropolises, knights, barbarian raids, and 54 Progress Cards)
  - `rules.ts`: Legal action generator (`getLegalActions`), state transition reducer (`applyAction`), player redaction (`getPlayerView`), and invariant checker (`checkInvariants`)
  - `bot.ts`: 4-tier AI bot (`easy`, `normal`, `smart`, `master`) operating strictly on redacted player views across base Catan and all expansions
  - `cli-sim.ts`: Fast CLI simulation runner for multi-game validation
- `packages/games/seven-wonders/`: Pure, deterministic 7 Wonders engine plugin (`@gaming-platform/seven-wonders`):
  - `types.ts`, `cards.ts`, `rules.ts`, `bot.ts`: Official 3–7P simultaneous drafting, all 7 Wonders (Day A & Night B), Ages I–III + Guilds, Pareto neighbor commerce, Military Conflicts, Halikarnassus/Olympia/Babylon special phases, multi-wildcard Science optimizer, redaction, pre-reveal `UNSELECT_DRAFT_ACTION`, and 4-tier AI (`easy`–`master`)
- `packages/games/splendor/`: Pure, deterministic Splendor engine plugin (`types.ts`, `cards.ts`, `rules.ts`, `bot.ts`) with 2–4P scaling, deck/blind-reserve redaction, and 4-tier lookahead AI
- `packages/games/azul/`: Pure, deterministic Azul engine plugin (`types.ts`, `rules.ts`, `bot.ts`) with 2–4P Factory/Center drafting, wall chain scoring, bag conservation redaction, and 4-tier Negamax/MaxN AI
- `apps/server/`: HTTP + WebSocket multiplayer platform server (rooms, lobbies, multi-guest + local pass-and-play control, bots, per-viewer state redaction, static web hosting)
- `apps/web/`: Interactive pure-functional browser client (`app.ts`, `catan-graphics.ts`, `seven-wonders-view.ts`, `splendor-view.ts`, `azul-view.ts`, `tutorials.ts`) featuring **Online Multiplayer**, **Offline Pass-and-Play**, **Interactive Live-Board Tutorials**, and **Reference Guides** for all 4 games
- `tests/`: Unit, expansion, parity snapshot, pure-functional audit, and full-game fuzz tests

## Build, Test, and Validation Commands

- `make typecheck`: Run strict TypeScript validation across all packages and apps
- `make test` (or `bun test`): Run unit, invariant, and full-game bot simulation tests
- `make sim`: Run CLI bot match simulations across Base Catan, 5–6 Player, and Seafarers scenarios
- `make build`: Bundle the browser client into `apps/web/public/dist/app.js`
- `make run`: Build the web client and launch the HTTP + WebSocket platform server on `http://localhost:3000`
