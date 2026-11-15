# Repository Guidelines

## Architecture Overview

This repository is a TypeScript monorepo for an online multi-board-game platform, starting with **Catan** (Base Game, 5–6 Player Extensions across Base/Seafarers/Cities & Knights, Cities & Knights Expansion, Seafarers Expansion, Harbormaster, and City Walls), **Splendor**, and **Azul**.

- `packages/core/`: Game-agnostic platform primitives:
  - `rng.ts`: Deterministic seeded PRNG (`SeededRNG`)
  - `hex.ts`: Axial hex grid topology, canonical vertex/edge coordinates, pixel projection, and longest simple path graph algorithms
  - `engine.ts`: Generic `GameEngine` state-machine contract, `GameRegistry`, `MatchSession` (with replay & undo/redo), and invariant verification
- `packages/games/catan/`: Pure, deterministic Catan engine plugin:
  - `types.ts`: State, configuration, scenario presets, resources, commodities, progress cards, turn phases, and discriminated union actions
  - `board.ts`: Board & scenario generators (Standard 3–4P, 5–6P Big Island, Cities & Knights 3–4P & 5–6P, Seafarers 3–4P & 5–6P: Heading for New Shores, Four/Six Islands, Fog Islands)
  - `cities-and-knights.ts`: Pure Cities & Knights domain helpers (commodities, improvements, metropolises, knights, barbarian raids, and 54 Progress Cards)
  - `rules.ts`: Legal action generator (`getLegalActions`), state transition reducer (`applyAction`), player redaction (`getPlayerView`), and invariant checker (`checkInvariants`)
  - `bot.ts`: Heuristic AI bot supporting base Catan and all expansions
  - `cli-sim.ts`: Fast CLI simulation runner for multi-game validation
- `apps/server/`: HTTP + WebSocket multiplayer platform server (rooms, lobbies, bots, real-time state sync, static web hosting)
- `apps/web/`: Interactive browser client featuring both an instant **Visual Sandbox / Inspector** (hotseat + bot simulator + time-travel undo) and an **Online Multiplayer Lobby**
- `tests/`: Unit, expansion, and full-game fuzz tests

## Build, Test, and Validation Commands

- `make typecheck`: Run strict TypeScript validation across all packages and apps
- `make test` (or `bun test`): Run unit, invariant, and full-game bot simulation tests
- `make sim`: Run CLI bot match simulations across Base Catan, 5–6 Player, and Seafarers scenarios
- `make build`: Bundle the browser client into `apps/web/public/dist/app.js`
- `make run`: Build the web client and launch the HTTP + WebSocket platform server on `http://localhost:3000`
