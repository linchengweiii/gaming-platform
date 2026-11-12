# Game Arena — Multi-Board-Game Platform (Catan, Splendor, Azul)

A TypeScript monorepo for an online multi-board-game platform featuring pure, deterministic state-machine engines, executable specification test suites, heuristic AI bots, and rich interactive SVG/HTML5 board graphics.

## Supported Board Games

### 1. 🏝️ Settlers of Catan (Base Game + Extensions & Expansions)
- **Standard Catan (3–4 Players)**: 19 hexes, 9 harbors, balanced 6/8 tokens, Longest Road, Largest Army, Maritime & Domestic trading, Development Cards.
- **5–6 Player Extension (Big Island)**: 30-hex island, 11 harbors, expanded bank & dev deck, and between-turn **Special Building Phase**.
- **Catan: Seafarers Expansion**:
  - **Ships & Shipping Routes** (`1 wool + 1 lumber`), moving open ships (`MOVE_SHIP`), and unified Longest Trade Route.
  - **Pirate Fleet** (sea hex blockades & ship stealing).
  - **Gold River Hexes** (choose any resource on production).
  - **Scenarios**: *Heading for New Shores* (+2 Bonus VP for colonizing foreign islands), *The Four Islands*, and *The Fog Islands* (dynamic fog tile exploration & discovery rewards).
- **Modular Variants**: **Harbormaster** (+2 VP for 3+ harbor points), **City Walls** (*Cities & Knights* +2 hand limit per wall on a `7`), and **Friendly Robber**.

### 2. 💎 Splendor
- **90 Authentic Development Cards** across **Tier 1 (40)**, **Tier 2 (30)**, and **Tier 3 (20)** + **10 Royal Nobles** (+3 VP each).
- **Gem & Noble Scaling** for 2, 3, and 4 players (`4 / 5 / 7` gems per color + `5` Gold Jokers).
- Full rules: Take 3 distinct gems, Take 2 same gems (requires ≥ 4 in bank), Reserve card (+1 Gold Joker, max 3 reserved), Purchase card (permanent bonuses + tokens + Gold Jokers), 10-token hand limit return phase, Noble visits, 15+ Prestige final-round completion, and fewest-cards tiebreaker.

### 3. 🟦 Azul
- **100 Ceramic Azulejo Tiles** (`20` each of `blue`, `yellow`, `red`, `black`, `teal`), **5 / 7 / 9 Factory Displays** (for 2P / 3P / 4P), Center Pool, and **First Player Penalty Marker (`-1`)**.
- Full rules: Factory & Center drafting, Pattern Lines (`1..5` capacities), Wall row color-exclusion rule, Floor Line overflow penalties (`-1,-1,-2,-2,-2,-3,-3`), Wall-Tiling contiguous horizontal + vertical chain scoring, full-row game-end trigger, and Endgame Bonuses (`+2` per row, `+7` per column, `+10` per 5-of-a-color set).

## Quick Start

```bash
# 1. Run strict TypeScript validation across all packages & apps
make typecheck

# 2. Run all 33 unit, invariant, and executable specification tests
make test

# 3. Run CLI full-game bot simulations across Catan, Splendor, and Azul
make sim

# 4. Bundle the web client and launch the platform server on http://localhost:3000
make run
```
