# Repository Guidelines

## Architecture Overview

This repository is a TypeScript monorepo for an online multi-board-game platform featuring **Settlers of Catan** (Base Game, 5–6 Player Extensions across Base/Seafarers/Cities & Knights, Cities & Knights Expansion, Seafarers Expansion, Harbormaster, and City Walls), **7 Wonders** (3–7 Players, Day A & Night B Wonders, Ages I–III + Guilds), **Splendor**, and **Azul**.

- `packages/core/`: Game-agnostic platform primitives:
  - `rng.ts`: Deterministic seeded PRNG (`SeededRNG`)
  - `hex.ts`: Axial hex grid topology, canonical vertex/edge coordinates, pixel projection, and longest simple path graph algorithms
  - `engine/` (`engine.ts` barrel): Generic `GameEngine` state-machine contract, `GameRegistry`, `MatchSession` (with replay & undo/redo), and invariant verification
- `packages/games/catan/`: Pure, deterministic Catan engine plugin:
  - `config/`: Dedicated Catan configs (`costs-and-limits.ts`, `scenarios-config.ts`, `cities-knights-config.ts`, `bot-config.ts`)
  - `types/` (`types.ts` barrel): State, configuration, scenario presets, resources, commodities, progress cards, turn phases, and discriminated union actions
  - `board/` (`board.ts` barrel): Board & scenario generators (Standard 3–4P, 5–6P Big Island, Cities & Knights 3–4P & 5–6P, Seafarers 3–4P & 5–6P: Heading for New Shores, Four/Six Islands, Fog Islands)
  - `cities-and-knights/` (`cities-and-knights.ts` barrel): Pure Cities & Knights domain helpers (commodities, improvements, metropolises, knights, barbarian raids, and 54 Progress Cards)
  - `rules/` (`rules.ts` barrel): Legal action generator (`getLegalActions`), state transition reducer (`applyAction`), player redaction (`getPlayerView`), and invariant checker (`checkInvariants`)
  - `bot/` (`bot.ts` barrel): 4-tier AI bot (`easy`, `normal`, `smart`, `master`) operating strictly on redacted player views across base Catan and all expansions
  - `cli-sim.ts`: Fast CLI simulation runner for multi-game validation
- `packages/games/seven-wonders/`: Pure, deterministic 7 Wonders engine plugin (`@gaming-platform/seven-wonders`):
  - `config/`, `types.ts`, `cards/`, `rules/`, `bot/`: Official 3–7P simultaneous drafting, all 7 Wonders (Day A & Night B), Ages I–III + Guilds, Pareto neighbor commerce, Military Conflicts, Halikarnassus/Olympia/Babylon special phases, multi-wildcard Science optimizer, redaction, pre-reveal `UNSELECT_DRAFT_ACTION`, and 4-tier AI (`easy`–`master`)
- `packages/games/splendor/`: Pure, deterministic Splendor engine plugin (`config.ts`, `types.ts`, `cards.ts`, `rules/`, `bot/`) with 2–4P scaling, deck/blind-reserve redaction, and 4-tier lookahead AI
- `packages/games/azul/`: Pure, deterministic Azul engine plugin (`config.ts`, `types.ts`, `rules/`, `bot/`) with 2–4P Factory/Center drafting, wall chain scoring, bag conservation redaction, and 4-tier Negamax/MaxN AI
- `apps/server/`: HTTP + WebSocket multiplayer platform server (`config.ts`, `room-manager/`, `http-ws/`) supporting rooms, lobbies, multi-guest + local pass-and-play control, bots, per-viewer state redaction, and static web hosting
- `apps/web/`: Interactive pure-functional browser client (`src/config/`, `src/app/`, `src/catan-graphics/`, `src/views/`, `src/tutorials/`, `public/styles/`) featuring **Online Multiplayer**, **Offline Pass-and-Play**, **Interactive Live-Board Tutorials**, and **Reference Guides** for all 4 games
- `tests/`: Modular unit, expansion, parity snapshot, pure-functional + `<= 500`-line file-size constraint (`tests/parity/codebase-constraints.test.ts`), and full-game fuzz tests

## Code Organization & Readability Rules

- **Max 500 Lines Per File**: Keep every source, stylesheet, script, and test file strictly `<= 500` lines (enforced automatically in `tests/parity/codebase-constraints.test.ts`). Group related modules into cohesive subdirectories with clean barrel re-exports.
- **Dedicated Config Modules**: Place game constants, scaling tables, scenario definitions, palettes, and bot tuning weights in dedicated `config.ts` or `config/` modules rather than hardcoding them inside rule/view/controller logic.
- **Pure Functional Style**: Zero `class`, zero `this`, and zero OOP project `new` calls across `packages/`, `apps/`, and `scripts/`.

## Build, Test, and Validation Commands

- `make typecheck`: Run strict TypeScript validation across all packages and apps
- `make test` (or `bun test`): Run unit, invariant, and full-game bot simulation tests
- `make sim`: Run CLI bot match simulations across Base Catan, 5–6 Player, and Seafarers scenarios
- `make build`: Bundle the browser client into `apps/web/public/dist/app.js`
- `make run`: Build the web client and launch the HTTP + WebSocket platform server on `http://localhost:3000`

## Ponytail — Lazy Senior Dev Mode

Installed from [`DietrichGebert/ponytail`](https://github.com/DietrichGebert/ponytail) (`v5.3.3`). Workspace skills are in `.agents/skills/` (`/ponytail`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`).

You are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.

### Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

### The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.
- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.
