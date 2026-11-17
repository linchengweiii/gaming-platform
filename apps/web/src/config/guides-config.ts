import type { GameReferenceGuide, TutorialGameId } from "../tutorials/types.ts";

export const GAME_REFERENCE_GUIDES: Readonly<
  Record<TutorialGameId, GameReferenceGuide>
> = {
  catan: {
    gameId: "catan",
    title: "Settlers of Catan",
    playersBadge: "2–6 players",
    durationBadge: "25–45 min",
    objective:
      "First player to reach 10 Victory Points on their turn wins immediately (12 VP in Seafarers · 13 VP in Cities & Knights; custom VP supported in Setup).",
    sections: [
      {
        heading: "1. Setup & Snake Draft",
        items: [
          "Players draft in turn order (1→2→…→N) placing 1 Settlement + 1 attached Road/Ship, then reverse order (N→…→1) to place their 2nd Settlement + Road/Ship (2nd piece is a City in Cities & Knights).",
          "Starting resources: receive 1 resource card from every fertile terrain hex touching your 2nd placement (Hills=Brick, Forest=Lumber, Pasture=Wool, Fields=Grain, Mountains=Ore; Desert/Sea=none).",
          "Distance Rule: No two Settlements or Cities (yours or opponents') may ever occupy adjacent intersections — at least 2 edges must separate every building.",
        ],
      },
      {
        heading: "2. What You Can Do on Your Turn",
        items: [
          "Before rolling: You may optionally play 1 Development Card bought on an earlier turn (e.g. Knight to clear the Robber before production, or Alchemist in Cities & Knights).",
          "Step 1 — Roll Dice (2d6): Every player with a Settlement (+1 card) or City (+2 cards) touching hexes with that number collects resources. If the bank cannot fulfill everyone owed a specific resource (and >1 player is owed), nobody receives that resource on that roll.",
          "Step 2 — Main Phase (Trade, Build & Play Cards in any order): Make any number of Bank/Harbor or Player trades, construct Roads/Ships/Settlements/Cities/Walls/Dev Cards, and play at most 1 non-VP Dev Card per turn. Click End turn when done.",
        ],
      },
      {
        heading: "3. Rolling a 7, Robber & Trading",
        items: [
          "Rolling a 7: No terrain produces. Every player holding more than 7 cards (+2 per City Wall, max 13) must choose half their hand (rounded down) to discard.",
          "Move Robber (or Pirate): The roller MUST move the Robber to a different land hex (blocking all production on that hex while there) and steal 1 random card from 1 player with a building on it. With Friendly Robber enabled, you cannot place the Robber on a hex touching a player with ≤2 visible VP.",
          "Maritime & Domestic Trade: Trade 4 identical resources for any 1 with the Bank (4:1), 3:1 with a Generic Harbor, or 2:1 matching a Specialty Harbor. Player trades must involve the active player (rivals cannot trade with each other, and 0-card gifts are illegal).",
        ],
      },
      {
        heading: "4. Piece Supply, Networks & +2 VP Awards",
        items: [
          "Piece limits per player: 5 Settlements (1 VP each), 4 Cities (2 VP each; upgrades a Settlement and returns the Settlement piece to your supply), 15 Roads, 15 Ships (Seafarers), 3 City Walls.",
          "Network rules: New Roads must connect to your existing Road, Settlement, or City (unless blocked by a rival building). New Settlements must sit on your own Road/Ship network and obey the Distance Rule. An opponent building on an open intersection breaks an unbroken route!",
          "Special Awards (+2 VP each): Longest Route goes to the first player with 5+ continuous unbroken Roads/Ships (passes only when strictly exceeded). Largest Army goes to the first with 3+ played Knights (passes when strictly exceeded). Optional Harbormaster awards +2 VP at 3+ Harbor Points (+1 per Harbor Settlement, +2 per Harbor City).",
        ],
      },
      {
        heading: "5. Base Development Cards (25 Cards; 34 in 5–6P)",
        items: [
          "Buy for 1 Wool + 1 Grain + 1 Ore (drawn blind from deck; played cards stay out of the deck). You may play at most 1 action Dev Card per turn, and NEVER on the same turn you bought it.",
          "Knight (×14, or ×20 in 5–6P): Move the Robber (or Pirate) and steal 1 random card; stays face-up toward Largest Army (3+).",
          "Road Building (×2 / ×3): Immediately place up to 2 free Roads or Ships. Year of Plenty (×2 / ×3): Take any 2 resource cards of your choice from the bank. Monopoly (×2 / ×3): Name 1 resource; all opponents hand you every card of that resource they hold. Victory Point (×5): Worth +1 VP immediately (kept hidden from rivals until you win).",
        ],
      },
      {
        heading: "6. 5–6 Player Extension & City Walls",
        items: [
          "5–6 Players: Automatically uses larger 30-hex islands, larger resource/commodity/dev decks, and enables the between-turn Special Building Phase.",
          "Special Building Phase: After the active player ends their turn, each other player in clockwise order may build pieces or buy Dev Cards strictly from cards already in hand — NO Maritime/Player trading and NO playing Dev/Progress cards until your own turn.",
          "City Walls (2 Brick, max 3): Placed under any of your Cities; each Wall raises your safe hand limit on a 7 by +2 cards (9 / 11 / 13). If that City is pillaged, its Wall is destroyed too.",
        ],
      },
      {
        heading: "7. Seafarers Expansion (12 VP Target)",
        items: [
          "Ships (1 Lumber + 1 Wool): Placed on sea or coastal edges connected to your coastal Settlement/City or another Ship. Roads and Ships NEVER link directly — only a coastal Settlement/City connects a Road chain to a Ship chain.",
          "Moving Ships: Once per turn in Main Phase, you may move 1 open Ship (unattached at one end, not built this turn, and not pinned by the Pirate) to any legal sea/coastal edge.",
          "Pirate, Gold & Fog: Move the Pirate onto a sea hex on a 7 or Knight to block building/moving Ships on its 6 edges and steal 1 card from an adjacent ship owner. Gold Rivers produce any resource of your choice; reaching a Fog edge flips the tile (+1 reward if fertile); your 1st Settlement on each foreign island scores +2 bonus VP.",
        ],
      },
      {
        heading: "8. Cities & Knights Expansion (13 VP Target)",
        items: [
          "Commodities & Improvements: Replaces Base Dev Cards & Largest Army; 2nd setup piece is a City. Cities on Forest, Pasture, and Mountains yield 1 Resource + 1 Commodity (Paper, Cloth, Coin). Spend 1→5 matching Commodities to upgrade Science (Paper), Trade (Cloth), or Politics (Coin); Lv 4–5 requires owning a City.",
          "Lv 3 Perks & Metropolises (+2 VP): Lv 3 Trade unlocks 2:1 bank trade on all commodities; Lv 3 Politics unlocks Mighty (Lv 3) Knights; Lv 3 Science (Aqueduct) grants 1 chosen resource whenever a non-7 roll gives you nothing. First to Lv 4 claims that track's Metropolis (+2 VP, immune to pillage; stolen only by reaching Lv 5 first).",
          "Event Die, Barbarians, Knights & Progress Cards: Event Die has 3 Barbarian Ships (advances raid 0→7) and 3 colored City Gates (if Red Die ≤ your level in that gate's track, draw 1 Progress Card; max 4 in hand). At 7/7 Barbarians raid: if total Active Knight strength < total Cities, player(s) with lowest active strength lose 1 un-metropolised City to a Settlement; if Knights ≥ Cities, top defender gains +1 VP (ties draw 1 Progress Card). Robber stays dormant until the 1st raid. Recruit/Promote Knights (1 Wool + 1 Ore, max 2 Basic / 2 Strong / 2 Mighty) and Activate (1 Grain); active Knights can Move, Displace weaker rival Knights, or Chase the Robber on a later turn.",
        ],
      },
    ],
  },
  splendor: {
    gameId: "splendor",
    title: "Splendor",
    playersBadge: "2–4 players",
    durationBadge: "15–25 min",
    objective:
      "Reach 15+ Prestige Points to trigger the final round; after every player completes an equal number of turns, highest Prestige wins (tiebreaker: fewest purchased Development Cards).",
    sections: [
      {
        heading: "1. Setup & Player Scaling (2–4 Players)",
        items: [
          "Gem Bank scaling: 4 tokens per gem color in 2P, 5 per color in 3P, or 7 per color in 4P (Emerald, Sapphire, Ruby, Diamond, Onyx), plus always 5 Gold wild tokens.",
          "Card Market: Shuffle Tier 1 (40 cards), Tier 2 (30 cards), and Tier 3 (20 cards) separately and reveal 4 face-up cards per row (12 open market cards; refilled immediately whenever bought or held).",
          "Royal Nobles: Reveal Players + 1 Noble tiles (3 in 2P, 4 in 3P, 5 in 4P), each worth +3 Prestige Points.",
        ],
      },
      {
        heading: "2. What You Can Do on Your Turn (Pick 1 of 4)",
        items: [
          "Option A — Take 3 Distinct Gems: Take 1 token each of 3 different non-Gold colors (if only 1 or 2 non-Gold stacks remain in the bank, you may take 1 each from the remaining stacks).",
          "Option B — Take 2 Same-Color Gems: Take 2 tokens of a single non-Gold color — ONLY legal when that stack currently holds at least 4 tokens before you take.",
          "Option C — Hold (Reserve) 1 Card: Take any 1 face-up market card OR draw the blind top card of Tier 1/2/3 into your private reserve (max 3 reserved cards at once), and take +1 Gold joker if any Gold remains in the bank.",
          "Option D — Buy 1 Card: Purchase 1 face-up market card or 1 of your reserved cards by returning its required gems (minus your permanent bonuses) to the bank; Gold jokers pay for any missing color.",
        ],
      },
      {
        heading: "3. 10-Token Hand Cap & Engine Discounts",
        items: [
          "10-token limit: You may hold at most 10 tokens total (gems + Gold) at the end of your turn. If taking gems or Gold puts you above 10, immediately choose excess tokens to return down to 10.",
          "Permanent card bonuses: Every purchased Development Card stays in your tableau and provides a permanent -1 cost discount of its top-right gem icon on every future card you buy.",
          "Reserve rules: Reserved cards cannot be discarded — slots only free up when you buy those cards. Blind deck draws remain hidden from opponents until purchased.",
        ],
      },
      {
        heading: "4. Royal Nobles (+3 VP) & Endgame Tiebreaker",
        items: [
          "Automatic Noble check: At the end of your turn, if your permanent card bonuses (gem/Gold tokens do NOT count!) match a Noble tile, that Noble automatically visits you for +3 Prestige.",
          "One per turn: Attracting a Noble is free (not an action), and at most 1 Noble can visit per turn (if you qualify for multiple simultaneously, you choose which 1 visits).",
          "Equal-turn finish: Once anyone hits 15+ Prestige, play continues until the last player in turn order finishes the round. Most Prestige wins; ties go to whoever bought fewer Development Cards.",
        ],
      },
    ],
  },
  azul: {
    gameId: "azul",
    title: "Azul",
    playersBadge: "2–4 players",
    durationBadge: "15–25 min",
    objective:
      "Score the most points tiling your 5×5 Palace Wall; the match ends after the Wall-tiling phase in which any player completes at least 1 horizontal row of 5 tiles.",
    sections: [
      {
        heading: "1. Setup & Factory Scaling (2–4 Players)",
        items: [
          "100 resin tiles in the bag (20 each of Blue, Yellow, Red, Black, and Teal). Whenever the bag empties, discarded tiles from the lid reshuffle into the bag automatically.",
          "Factory Displays: Use 5 Factories in 2P, 7 in 3P, or 9 in 4P. At the start of each round, deal 4 tiles onto each Factory and place the '1st' Player marker in the Center Pool.",
          "Player Board: 5 Pattern Lines on the left (Row 1 holds 1 tile … Row 5 holds 5 tiles), a 5×5 colored Wall on the right, and a 7-slot penalty Floor Line at the bottom.",
        ],
      },
      {
        heading: "2. Phase 1 — Factory Offer (Drafting)",
        items: [
          "Starting with the holder of the '1st' marker, players take turns drafting until ALL Factories and the Center Pool are completely empty.",
          "Pick from a Factory: Choose 1 color on 1 Factory, take ALL tiles of that color, and push the remaining tiles on that Factory into the Center Pool.",
          "OR Pick from the Center Pool: Choose 1 color in the Center and take ALL tiles of that color. If you are the first player to take from Center this round, you also take the '1st' marker onto your Floor Line (-1 pt this round, and you draft 1st next round!).",
        ],
      },
      {
        heading: "3. Pattern Line Placement & Floor Penalties",
        items: [
          "All tiles drafted on your turn must be placed into ONE chosen Pattern Line (or dropped directly onto your Floor Line).",
          "Color & Wall restrictions: A Pattern Line may only hold 1 color at a time, and you CANNOT place a color into a Pattern Line if that same Wall row already has that color tiled.",
          "Overflow & Floor track: Extra tiles that do not fit in your chosen Pattern Line fall onto your Floor Line from left to right (-1, -1, -2, -2, -2, -3, -3 = max -14 pts; tiles beyond 7 slots go to the lid). Your total score never drops below 0.",
        ],
      },
      {
        heading: "4. Phase 2 — Wall-Tiling, Chain Scoring & Bonuses",
        items: [
          "Resolving rows (Row 1 → Row 5): Every FULL Pattern Line moves 1 tile across to its matching color slot on that Wall row (remaining tiles of that completed row discard to the lid). Incomplete Pattern Lines keep their tiles for next round!",
          "Adjacency chain scoring (scored immediately as each tile moves): Isolated tile (no orthogonal neighbors) = +1 pt. Connected tile = count ALL contiguous horizontal tiles (including the new tile) if linked horizontally, PLUS ALL contiguous vertical tiles (including the new tile) if linked vertically! Then subtract Floor Line penalties and clear the Floor.",
          "Endgame & Bonuses: If anyone has ≥1 full horizontal Wall row of 5 after Wall-tiling, add endgame bonuses: +2 pts per full horizontal row, +7 pts per full vertical column, and +10 pts per color with all 5 tiles on your Wall. Tiebreaker: most completed horizontal rows.",
        ],
      },
    ],
  },
  seven_wonders: {
    gameId: "seven_wonders",
    title: "7 Wonders",
    playersBadge: "3–7 players",
    durationBadge: "20–30 min",
    objective:
      "Lead your ancient city across Ages I, II, and III; highest total Victory Points across all 7 scoring categories after Age III wins (tiebreaker: most Treasury coins).",
    sections: [
      {
        heading: "1. Setup, Wonders & Age Decks (3–7 Players)",
        items: [
          "Each player receives 1 Wonder board (Day A or Night B side) producing 1 starting resource, plus 3 starting Treasury coins. Your immediate left and right players are your West and East neighbors.",
          "Age I, II, and III decks scale to exact player count (7 cards per player per Age). Age III removes Gray cards and shuffles in Players + 2 random Purple Guilds.",
        ],
      },
      {
        heading: "2. Simultaneous Round Flow (6 Turns per Age)",
        items: [
          "Each Age deals 7 cards per player. Everyone picks 1 card + action simultaneously (you can click Change pick freely until the final player locks in), then all choices resolve together.",
          "Hand passing direction: Pass remaining cards Clockwise (↻, to West) in Age I, Counter-Clockwise (↺, to East) in Age II, and Clockwise (↻) again in Age III.",
          "6th turn of each Age: From the final 2-card hand, everyone plays 1 card and discards the unplayed 7th card face-down (unless Babylon Night B Stage 2 is built).",
        ],
      },
      {
        heading: "3. Three Ways to Play Any Card",
        items: [
          "1. Build Structure: Place the card face-up in your city by paying its coin/resource cost — OR build for 0 cost if you already own the prerequisite card named under 'Chain →'! Duplicate rule: You can NEVER build two structures with the exact same name.",
          "2. Construct Wonder Stage: Tuck ANY card from hand face-down under your next unbuilt left-to-right Wonder Stage, paying the STAGE's resource cost (ignore the tucked card's printed cost). Stages are optional.",
          "3. Sell for Coins (+3c): Discard ANY card from hand face-down to gain +3 Treasury coins from the bank.",
        ],
      },
      {
        heading: "4. Resources & Neighbor Commerce (West & East)",
        items: [
          "Reusable goods: Brown raw materials (Wood, Stone, Clay, Ore) and Gray manufactured goods (Glass, Loom, Papyrus) produce every turn and are NEVER spent. Slash cards (e.g. Wood/Clay, Caravansery, Forum) provide 1 of the shown resources per turn.",
          "Buying from neighbors: Missing resources are automatically bought from your West or East neighbor for 2 coins per unit — or 1 coin with East/West Trading Post (Brown) or Marketplace (Gray). Neighbors CANNOT refuse a trade, and multiple players can buy the same resource on the same turn!",
          "Tradeable sources: Only Brown cards, Gray cards, and a neighbor's printed starting Wonder resource can be bought (Yellow/Wonder wildcard goods cannot be traded). Coins paid to a neighbor enter their Treasury at end of turn (usable next turn).",
        ],
      },
      {
        heading: "5. Military Conflicts & Special Wonder Powers",
        items: [
          "End-of-Age Wars: After Ages I, II, and III, compare your Red Shield total separately against West and against East. Higher Shields wins a +1 (Age I) / +3 (Age II) / +5 (Age III) Victory Token; lower Shields takes a -1 Defeat Token; ties award nothing.",
          "Special Wonders: Olympia A2 builds 1 card free per Age (B1 discounts West & East Brown trades to 1c; B3 copies a neighbor Guild); Halikarnassus builds 1 card free from the discard pile; Babylon B2 plays the 7th card each Age; Alexandria, Rhodes, Giza, and Ephesus grant wild goods, Shields, VP, and coins.",
        ],
      },
      {
        heading: "6. All 7 Endgame Scoring Categories",
        items: [
          "1. Military: Net sum of War Victory (+1/+3/+5) and Defeat (-1) tokens. 2. Treasury: +1 VP per complete set of 3 coins held (⌊coins / 3⌋). 3. Wonder: Printed Stage VP. 4. Civilian (Blue): Printed 2–8 VP.",
          "5. Science (Green): Count Compass (C), Gear (G), and Tablet (T) symbols (wildcards auto-optimized): score C² + G² + T² + 7 VP per (C, G, T) set of all three symbols!",
          "6. Commercial (Yellow) & 7. Guilds (Purple): Conditional VP based on card colors, stages, or tokens in your city or West/East neighbors. Tiebreaker: player with the most Treasury coins wins.",
        ],
      },
    ],
  },
};
