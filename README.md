# Game Arena — Multi-Board-Game Platform (Catan, Splendor, Azul)

A TypeScript monorepo for an online multi-board-game platform featuring pure, deterministic state-machine engines, executable specification test suites, heuristic AI bots, and rich interactive SVG/HTML5 board graphics.

## Supported Board Games

### 1. 🏝️ Settlers of Catan (Base Game + Extensions & Expansions)
- **Standard Catan (3–4 Players)**: 19 hexes, 9 harbors, balanced 6/8 tokens, Longest Road, Largest Army, Maritime & Domestic trading, Development Cards.
- **5–6 Player Extensions (Base, Seafarers & Cities & Knights)**: Expanded islands & marine maps, 24 per resource / 18 per commodity bank supplies, and between-turn **Special Building Phase** across all expansions.
- **Catan: Cities & Knights Expansion (3–4P & 5–6P, combinable with Seafarers)**:
  - **Commodities & City Improvements**: Collect **Paper**, **Cloth**, and **Coin** from Forest, Pasture, and Mountains cities to upgrade **Trade** (Trading House), **Politics** (Fortress), and **Science** (Aqueduct) from Level 1 to Level 5 and claim the 3 **Metropolises** (+2 VP, immune to Barbarian pillage).
  - **Knights & Barbarian Fleet**: Recruit, promote, activate, move, and displace **Basic**, **Strong**, and **Mighty Knights**; chase the Robber; and defend Catan on the 7-step Barbarian Track to earn **Defender of Catan** (+1 VP) or risk vulnerable City pillage.
  - **54 Official Progress Cards & Merchant**: Full Trade, Politics, and Science Progress Decks (18 cards each) plus the **Merchant** pawn (+1 VP & 2:1 resource trade).
- **Catan: Seafarers Expansion (3–4P & 5–6P)**:
  - **Ships & Shipping Routes** (`1 wool + 1 lumber`), moving open ships (`MOVE_SHIP`), and unified Longest Trade Route.
  - **Pirate Fleet** (sea hex blockades & ship stealing) and **Gold River Hexes** (choose any resource on production).
  - **Scenarios**: *Heading for New Shores* (3–4P & 5–6P), *The Four Islands* / *The Six Islands* (5–6P), and *The Fog Islands* (3–4P & 5–6P dynamic fog tile exploration & discovery rewards).
- **Modular Variants**: **Harbormaster** (+2 VP for 3+ harbor points), **City Walls** (+2 hand limit per wall on a `7`), and **Friendly Robber**.

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
