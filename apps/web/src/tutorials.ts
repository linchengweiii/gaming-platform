import type { CatanAction, CatanState } from "@gaming-platform/catan";
import { CatanEngine } from "@gaming-platform/catan";
import type { SplendorAction, SplendorState } from "@gaming-platform/splendor";
import { GEM_COLORS, SplendorEngine } from "@gaming-platform/splendor";
import type {
  AzulAction,
  AzulDraftSource,
  AzulState,
  AzulTileColor,
} from "@gaming-platform/azul";
import { AzulEngine } from "@gaming-platform/azul";
import type {
  SevenWondersAction,
  SevenWondersState,
} from "@gaming-platform/seven-wonders";
import { SevenWondersEngine } from "@gaming-platform/seven-wonders";
import { renderAzulTile } from "./azul-view.ts";
import {
  renderActionPieceIconSvg,
  renderDevCardIllustrationSvg,
  renderDieSvg,
  renderEventDieSvg,
  renderMiniTradeGoodCardSvg,
} from "./catan-graphics.ts";
import {
  renderSwCoinSvg,
  renderSwResourceBadge,
  renderSwScienceIconSvg,
  renderSwShieldSvg,
} from "./seven-wonders-view.ts";
import { renderSplendorGemToken } from "./splendor-view.ts";

export type TutorialGameId = "catan" | "splendor" | "azul" | "seven_wonders";

export interface TutorialLesson {
  readonly index: number;
  readonly title: string;
  readonly body: string;
  readonly actionHint: string;
}

export interface GameGuideSection {
  readonly heading: string;
  readonly items: readonly string[];
}

export interface GameReferenceGuide {
  readonly gameId: TutorialGameId;
  readonly title: string;
  readonly playersBadge: string;
  readonly durationBadge: string;
  readonly objective: string;
  readonly sections: readonly GameGuideSection[];
}

export const TUTORIAL_SEEDS: Readonly<Record<TutorialGameId, string>> = {
  catan: "tutorial-catan-harbor-v6",
  splendor: "tutorial-splendor-market-v1",
  azul: "tutorial-azul-palace-v1",
  seven_wonders: "tutorial-seven-wonders-v2",
};

export const TUTORIAL_LESSONS: Readonly<
  Record<TutorialGameId, readonly TutorialLesson[]>
> = {
  catan: [
    {
      index: 0,
      title: "Place your 1st coastal or inland settlement",
      body: "Hex numbers show dice totals (2–12). Red 6 and 8 medallions have 5 probability pips and produce most often. Each settlement harvests 1 resource from adjacent tiles.",
      actionHint:
        "Click any pulsing intersection on the map (aim for three fertile hexes), or click Perform step.",
    },
    {
      index: 1,
      title: "Connect your opening road",
      body: "Roads link your settlements across hex edges. You must keep at least 2 edges between any two settlements (the Distance Rule).",
      actionHint:
        "Click a pulsing edge attached to your new settlement, or click Perform step.",
    },
    {
      index: 2,
      title: "Complete the snake draft & claim starting cards",
      body: "Draft order reverses for the 2nd settlement (1→2→3→4, then 4→3→2→1). Your 2nd settlement immediately grants 1 card from each adjacent terrain tile.",
      actionHint:
        "Place your 2nd settlement and road (or click Auto-place setup / Perform step).",
    },
    {
      index: 3,
      title: "Roll the dice to produce resources",
      body: "Every turn starts with a 2d6 roll. Every player with a settlement (+1) or city (+2) on that number harvests cards! Rolling 7 activates the Robber and halves hands over 7 cards.",
      actionHint: "Click Roll dice on the map to start production.",
    },
    {
      index: 4,
      title: "Trade with harbors or players & build",
      body: "During Main Phase, open Bank trade (4:1, or 3:1 / 2:1 on harbors) or Player trade, or click map spots and dock buttons to build Roads, Settlements (1 VP), Cities (2 VP), or Dev Cards.",
      actionHint:
        "Build a Road or open Bank trade / Player trade below the map (or click Perform step), then click End turn.",
    },
    {
      index: 5,
      title: "Race to 10 Victory Points",
      body: "Claim Longest Route (5+ connected roads = +2 VP) and Largest Army (3+ played Knights = +2 VP). Toggle Cities & Knights or Seafarers in Setup when ready for deeper scenarios!",
      actionHint:
        "Click Free play to dismiss this coach and finish the match at your own pace.",
    },
  ],
  splendor: [
    {
      index: 0,
      title: "Draft 3 distinct gems (or 2 matching gems)",
      body: "You win by reaching 15 Prestige Points. Start your engine by taking 3 tokens of different colors from the Gem Bank (or 2 of the same color when at least 4 sit in that stack). Max 10 tokens held.",
      actionHint:
        "Click 3 different gem chips in the Gem Bank and click Take gems (or click Perform step).",
    },
    {
      index: 1,
      title: "Reserve a card & claim a Gold joker",
      body: "Clicking Hold on any market card (or Draw hold on a deck) moves it into your private reserve (max 3) and awards 1 Gold token that substitutes for any gem color.",
      actionHint:
        "Click Hold on a card you want to save (or click Perform step to reserve with +1 Gold).",
    },
    {
      index: 2,
      title: "Buy Tier 1 mines for permanent discounts",
      body: "Every purchased card grants a permanent +1 gem bonus in its top-right corner! Card cost chips automatically show your net cost after discounts.",
      actionHint:
        "Draft any missing gems or click Buy on an affordable Tier 1 card (or click Perform step).",
    },
    {
      index: 3,
      title: "Attract Royal Nobles (+3 Prestige)",
      body: "Nobles at the top of the board are not bought with tokens — as soon as your permanent card bonuses match a Noble's requirements, one visits automatically at the end of your turn for +3 points.",
      actionHint:
        "Align your card bonus colors with the progress badges on the Nobles row.",
    },
    {
      index: 4,
      title: "Trigger the final round at 15+ Prestige",
      body: "Reaching 15 points finishes the current round so every player gets equal turns. Ties break in favor of the player who bought fewer development cards.",
      actionHint:
        "Click Free play to continue building your gem engine against the bots.",
    },
  ],
  azul: [
    {
      index: 0,
      title: "Pick all tiles of one color from a Factory",
      body: "Click any colored tile on Factory F1–F9 to select ALL tiles of that color on that display. The remaining tiles on that Factory will slide into the Center Pool.",
      actionHint:
        "Click a tile on any Factory display, then click a highlighted Pattern Line row (or click Perform step).",
    },
    {
      index: 1,
      title: "Fill Pattern Lines without wasting tiles",
      body: "Row 1 holds 1 tile up to Row 5 holding 5 tiles. Each row holds ONE color per round, and cannot hold a color already tiled on that Wall row. Live badges preview your +pts and any -flr overflow!",
      actionHint:
        "Draft tiles that cleanly complete a Pattern Line capacity (1 to 5).",
    },
    {
      index: 2,
      title: "Center Pool & the 1st-Player marker",
      body: "The first player to draft from the Center Pool takes the '1st' marker: it costs -1 on your Floor Line this round, but lets you draft first next round.",
      actionHint:
        "Weigh the -1 penalty against grabbing a large color cluster from Center.",
    },
    {
      index: 3,
      title: "Wall-tiling adjacency chains & Floor penalties",
      body: "When all Factories and Center empty, completed rows move 1 tile onto your 5×5 Wall! Isolated tiles score +1, while connected horizontal + vertical chains score every linked tile.",
      actionHint:
        "Cluster tiles near the center columns of your 5×5 Wall to multiply chain points.",
    },
    {
      index: 4,
      title: "Complete a horizontal row & claim endgame bonuses",
      body: "The game ends after the round in which anyone completes 1 full horizontal Wall row (+2 pts). Vertical columns score +7 pts, and collecting all 5 of one color scores +10 pts!",
      actionHint:
        "Click Free play to complete your palace mosaic against the bots.",
    },
  ],
  seven_wonders: [
    {
      index: 0,
      title: "Simultaneous drafting & your starting Wonder",
      body: "Across Ages I, II, and III, everyone picks 1 card from their 7-card hand simultaneously, then passes the remaining hand to their neighbor (Clockwise in Age I & III, Counter-Clockwise in Age II).",
      actionHint:
        "Inspect your Wonder's starting output and click Build on a free Brown or Gray resource card (or click Perform step).",
    },
    {
      index: 1,
      title: "Three ways to play every drafted card",
      body: "Every turn, any card in hand can be: (1) Built into your city, (2) Tucked face-down to construct your next Wonder Stage, or (3) Sold (+3c) for 3 Treasury coins.",
      actionHint:
        "Build another structure or sell an unusable card for +3 coins (or click Perform step).",
    },
    {
      index: 2,
      title: "Neighbor commerce (West & East trade)",
      body: "Missing a resource? You automatically buy missing Brown/Gray goods produced by your West or East neighbor for 2 coins each (or 1 coin with Trading Posts / Marketplace) — and your neighbor keeps the coins!",
      actionHint:
        "Check the West & East panels at the top to see what resources your neighbors sell.",
    },
    {
      index: 3,
      title: "Construct a Wonder Stage & unlock future chains",
      body: "You pay the stage's resource cost (shown on your Wonder card), NOT the tucked card's cost! Also watch 'Chains →' labels on Age I cards: owning the prerequisite lets you build upgraded Age II/III structures for 0 cost.",
      actionHint:
        "Click Wonder on any card while Stage 1 shows 'Ready' (or click Perform step to build Stage 1).",
    },
    {
      index: 4,
      title: "Military shields, Science sets & Purple Guilds",
      body: "At the end of each Age, compare Red Shields with West & East (+1/+3/+5 VP for wins, -1 for losses). Green Science scores n² per symbol + 7 per Compass-Gear-Tablet set! Age III adds high-scoring Purple Guilds.",
      actionHint:
        "Click Free play to lead your civilization through all three Ages!",
    },
  ],
};

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

export function computeSuggestedTutorialStepIndexPure(
  gameId: TutorialGameId,
  currentIndex: number,
  state: any,
  humanPlayerId: string
): number {
  const lessons = TUTORIAL_LESSONS[gameId];
  const maxIdx = lessons.length - 1;
  if (!state || currentIndex >= maxIdx) return Math.min(currentIndex, maxIdx);

  if (gameId === "catan") {
    const cState = state as CatanState;
    if (cState.phase === "SETUP_SETTLEMENT_1" && currentIndex < 0) return 0;
    if (cState.phase === "SETUP_ROAD_1" && currentIndex === 0) return 1;
    if (
      (cState.phase === "SETUP_SETTLEMENT_2" ||
        cState.phase === "SETUP_ROAD_2") &&
      currentIndex <= 1
    ) {
      return 2;
    }
    if (cState.phase === "PRE_ROLL" && currentIndex <= 2) return 3;
    if (cState.phase === "MAIN_PHASE" && currentIndex === 3) return 4;
    const myRoutes = Object.values(cState.edges).filter(
      (e) => e.ownerId === humanPlayerId
    ).length;
    const myBuildings = Object.values(cState.buildings).filter(
      (b) => b.ownerId === humanPlayerId
    ).length;
    if ((cState.turn >= 2 || myRoutes + myBuildings >= 5) && currentIndex === 4) {
      return 5;
    }
    return currentIndex;
  }

  if (gameId === "splendor") {
    const sState = state as SplendorState;
    const me = sState.players.find((p) => p.id === humanPlayerId);
    if (!me) return currentIndex;
    if (
      currentIndex === 3 &&
      (me.points >= 3 ||
        me.purchasedCards.length >= 3 ||
        sState.finalRoundTriggered ||
        sState.phase === "GAME_OVER")
    ) {
      return 4;
    }
    if (currentIndex === 2 && me.purchasedCards.length >= 1) return 3;
    if (
      currentIndex === 1 &&
      (me.reservedCards.length >= 1 || sState.round >= 3)
    ) {
      return 2;
    }
    if (currentIndex === 0 && sState.round >= 2) return 1;
    return currentIndex;
  }

  if (gameId === "azul") {
    const aState = state as AzulState;
    const me = aState.players.find((p) => p.id === humanPlayerId);
    if (!me) return currentIndex;
    const activeId = aState.players[aState.activePlayerIndex]?.id;
    const myDraftedTiles =
      me.patternLines.reduce((s, l) => s + l.count, 0) + me.floorLine.length;
    const anyRowNearDone = aState.players.some((p) =>
      p.wall.some((row) => row.filter((c) => c !== null).length >= 3)
    );
    if (
      aState.phase === "GAME_OVER" ||
      ((aState.round >= 3 || anyRowNearDone) && currentIndex >= 3)
    ) {
      return 4;
    }
    if (aState.round >= 2 && currentIndex < 3) return 3;
    if (
      currentIndex === 1 &&
      activeId === humanPlayerId &&
      aState.centerPool.length > 0 &&
      (aState.centerHasFirstPlayerMarker || aState.turn >= 9)
    ) {
      return 2;
    }
    if (
      currentIndex === 0 &&
      myDraftedTiles > 0 &&
      (activeId === humanPlayerId || aState.turn >= 5)
    ) {
      return 1;
    }
    return currentIndex;
  }

  // seven_wonders
  const swState = state as SevenWondersState;
  const me = swState.players.find((p) => p.id === humanPlayerId);
  if (!me) return currentIndex;
  if (
    (swState.age >= 2 ||
      (swState.draftRound >= 4 && me.builtWonderStages >= 1)) &&
    currentIndex < 4
  ) {
    return 4;
  }
  if (currentIndex === 3 && me.builtWonderStages >= 1) return 4;
  if (swState.draftRound >= 4 && currentIndex < 3) return 3;
  if (swState.draftRound >= 3 && currentIndex < 2) return 2;
  if (swState.draftRound >= 2 && currentIndex === 0) return 1;
  return currentIndex;
}

export function chooseRecommendedTutorialActionPure(
  gameId: TutorialGameId,
  state: any,
  actingPlayerId: string,
  stepIndex = 0,
  azulSelectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null = null
): CatanAction | SplendorAction | AzulAction | SevenWondersAction | null {
  if (gameId === "catan") {
    const cState = state as CatanState;
    if (cState.phase === "MAIN_PHASE" && stepIndex === 4) {
      const legal = CatanEngine.getLegalActions(cState, actingPlayerId);
      const settle = legal.find((a) => a.type === "BUILD_SETTLEMENT");
      if (settle) return settle;
      const road = legal.find((a) => a.type === "BUILD_ROAD");
      if (road) return road;
      const maritime = legal.find((a) => a.type === "MARITIME_TRADE");
      if (maritime) return maritime;
    }
    return CatanEngine.chooseBotAction(cState, actingPlayerId);
  }

  if (gameId === "splendor") {
    const sState = state as SplendorState;
    const legal = SplendorEngine.getLegalActions(sState, actingPlayerId);
    if (stepIndex === 0 || sState.round === 1) {
      const threeGems = legal.find(
        (a) =>
          a.type === "TAKE_GEMS" &&
          GEM_COLORS.filter((c) => (a.gems[c] ?? 0) > 0).length === 3
      );
      if (threeGems) return threeGems;
    }
    if (stepIndex === 1) {
      const marketReserves = legal.filter(
        (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
          a.type === "RESERVE_CARD" && Boolean(a.cardId)
      );
      if (marketReserves.length > 0) {
        const allMarket = [
          ...sState.market[3],
          ...sState.market[2],
          ...sState.market[1],
        ];
        const sorted = [...marketReserves].sort((a, b) => {
          const ca = allMarket.find((c) => c.id === a.cardId);
          const cb = allMarket.find((c) => c.id === b.cardId);
          const sa = (ca ? (ca.tier === 2 ? 30 : ca.tier === 3 ? 20 : 5) + ca.points * 4 : 0);
          const sb = (cb ? (cb.tier === 2 ? 30 : cb.tier === 3 ? 20 : 5) + cb.points * 4 : 0);
          return sb - sa;
        });
        return sorted[0]!;
      }
    }
    if (stepIndex === 2) {
      const buyAct = legal.find((a) => a.type === "PURCHASE_CARD");
      if (buyAct) return buyAct;
    }
    return SplendorEngine.chooseBotAction(sState, actingPlayerId);
  }

  if (gameId === "azul") {
    const aState = state as AzulState;
    if (azulSelectedDraft) {
      const legal = AzulEngine.getLegalActions(aState, actingPlayerId).filter(
        (a) =>
          a.color === azulSelectedDraft.color &&
          a.source.kind === azulSelectedDraft.source.kind &&
          (a.source.kind === "center" ||
            (azulSelectedDraft.source.kind === "factory" &&
              a.source.factoryIndex === azulSelectedDraft.source.factoryIndex))
      );
      const me = aState.players.find((p) => p.id === actingPlayerId);
      const srcTiles =
        azulSelectedDraft.source.kind === "factory"
          ? aState.factories[azulSelectedDraft.source.factoryIndex] ?? []
          : aState.centerPool;
      const pickedCount = srcTiles.filter(
        (c) => c === azulSelectedDraft.color
      ).length;
      if (me && legal.length > 0) {
        const ranked = [...legal].sort((a, b) => {
          const scoreLine = (act: AzulAction): number => {
            if (act.targetLine === "floor") return -pickedCount * 6 - 10;
            const line = me.patternLines[act.targetLine]!;
            const space = line.capacity - line.count;
            const placed = Math.min(space, pickedCount);
            const overflow = Math.max(0, pickedCount - space);
            const completes = line.count + placed === line.capacity;
            return (
              placed * 4 -
              overflow * 6 +
              (completes ? 6 : -(space - placed) * 1.5)
            );
          };
          return scoreLine(b) - scoreLine(a);
        });
        return ranked[0]!;
      }
      if (legal[0]) return legal[0];
    }
    return AzulEngine.chooseBotAction(aState, actingPlayerId);
  }

  const swState = state as SevenWondersState;
  const swLegal = SevenWondersEngine.getLegalActions(swState, actingPlayerId);
  const swPlayer = swState.players.find((p) => p.id === actingPlayerId);
  if (stepIndex === 0 && swPlayer) {
    const freeResBuild = swLegal.find(
      (a) =>
        a.type === "SELECT_DRAFT_ACTION" &&
        a.kind === "build" &&
        (a.payment?.leftCoins ?? 0) + (a.payment?.rightCoins ?? 0) === 0 &&
        ["brown", "gray"].includes(
          swPlayer.hand.find((c) => c.id === a.cardId)?.color ?? ""
        )
    );
    if (freeResBuild) return freeResBuild;
  }
  if (stepIndex === 3) {
    const wonderBuild = swLegal.find(
      (a) => a.type === "SELECT_DRAFT_ACTION" && a.kind === "wonder"
    );
    if (wonderBuild) return wonderBuild;
  }
  return SevenWondersEngine.chooseBotAction(swState, actingPlayerId);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderTutorialCoachBannerPure(
  gameId: TutorialGameId,
  stepIndex: number,
  canPerformStepNow: boolean,
  liveState?: any,
  liftAbovePopup = false
): string {
  const lessons = TUTORIAL_LESSONS[gameId];
  const clamped = Math.max(0, Math.min(lessons.length - 1, stepIndex));
  const lesson = lessons[clamped]!;
  const isFinalFreePlayLesson = clamped >= lessons.length - 1;
  const gameTitle = GAME_REFERENCE_GUIDES[gameId].title;

  const contextualHint = (() => {
    if (gameId === "catan" && liveState) {
      const phase = (liveState as CatanState).phase;
      if (phase === "DISCARD_ON_SEVEN") {
        return "A 7 was rolled! Select half your hand in the dock below to discard (or click Perform step).";
      }
      if (phase === "MOVE_ROBBER_OR_PIRATE") {
        return "A 7 was rolled! Click any highlighted hex on the map to move the Robber (or click Perform step).";
      }
      if (phase === "STEAL_RESOURCE") {
        return "Choose an adjacent opponent settlement/city to steal 1 random card from (or click Perform step).";
      }
    }
    if (gameId === "seven_wonders" && clamped === 3 && liveState) {
      const sw = liveState as SevenWondersState;
      const human = sw.players.find((p) => !p.isBot);
      if (human) {
        if (human.builtWonderStages >= 1) {
          return "Stage 1 is already built! Build another structure or click Next → for endgame scoring tips.";
        }
        const canBuildWonderNow = SevenWondersEngine.getLegalActions(
          sw,
          human.id
        ).some((a) => a.type === "SELECT_DRAFT_ACTION" && a.kind === "wonder");
        if (!canBuildWonderNow) {
          return "Stage 1 still needs missing resources — build a resource/commerce card or sell for +3c first (or click Perform step).";
        }
      }
    }
    return lesson.actionHint;
  })();

  return `
    <div class="ga-tutorial-coach${liftAbovePopup ? " ga-tutorial-coach--lifted" : ""}" role="region" aria-label="${escapeHtml(gameTitle)} interactive tutorial">
      <div class="ga-tutorial-coach__top">
        <div style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="ga-chip ga-chip--accent ga-num">Tutorial ${clamped + 1}/${lessons.length}</span>
          <strong style="font-size:13px;font-weight:500;color:var(--ink);">${escapeHtml(lesson.title)}</strong>
        </div>
        <div style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <button type="button" id="btn-tutorial-prev" class="btn btn--secondary btn--sm" ${
            clamped === 0 ? "disabled" : ""
          }>← Prev</button>
          <button type="button" id="btn-tutorial-next" class="btn btn--secondary btn--sm" ${
            isFinalFreePlayLesson ? "disabled" : ""
          }>Next →</button>
          ${
            isFinalFreePlayLesson
              ? ""
              : `<button type="button" id="btn-tutorial-auto-step" class="btn btn--primary btn--sm" ${
                  !canPerformStepNow ? "disabled" : ""
                }>Perform step</button>`
          }
          <button type="button" data-open-guide="${gameId}" class="btn btn--secondary btn--sm">Rules sheet</button>
          <button type="button" id="btn-tutorial-dismiss" class="btn ${
            isFinalFreePlayLesson ? "btn--primary" : "btn--secondary"
          } btn--sm">Free play</button>
          <button type="button" id="btn-tutorial-exit" class="btn btn--secondary btn--sm">Exit tutorial</button>
        </div>
      </div>
      <div class="ga-tutorial-coach__body">
        <span>${escapeHtml(lesson.body)}</span>
        <span class="ga-tutorial-coach__hint">${escapeHtml(contextualHint)}</span>
      </div>
    </div>
  `;
}

function renderGameVisualReferenceHtml(gameId: TutorialGameId): string {
  if (gameId === "catan") {
    const mini = (good: Parameters<typeof renderMiniTradeGoodCardSvg>[0]) =>
      renderMiniTradeGoodCardSvg(good, 28, 18);
    return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">Round structure (on your turn)</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("knight", "#dc2626", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>0. Pre-roll (optional)</strong>
              <span>Play 1 earlier Dev / Alchemist card</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderDieSvg(3, 22)}${renderDieSvg(5, 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>1. Roll 2d6</strong>
              <span>+1 Settle · +2 City · 7 = &gt;7 discard &amp; Robber</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("maritime_trade", "#38bdf8", 22)}${renderActionPieceIconSvg("domestic_trade", "#fde047", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>2. Trade</strong>
              <span>4:1 Bank · 3:1 / 2:1 Harbors · Players</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("settlement", "#ff4a1f", 22)}${renderActionPieceIconSvg("city", "#ff4a1f", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>3. Build &amp; play</strong>
              <span>Build pieces &amp; play ≤1 Dev Card</span>
            </div>
          </div>
        </div>

        <div class="ga-guide-section-label">Building costs &amp; per-player limits</div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("road", "#ff4a1f", 20)}<strong style="font-size:12px;">Road (×15)</strong></span>
            <span class="ga-guide-recipe__cards">${mini("brick")}${mini("lumber")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("ship", "#38bdf8", 20)}<strong style="font-size:12px;">Ship (×15)</strong></span>
            <span class="ga-guide-recipe__cards">${mini("lumber")}${mini("wool")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("settlement", "#ff4a1f", 20)}<strong style="font-size:12px;">Settle (×5 · 1 VP)</strong></span>
            <span class="ga-guide-recipe__cards">${mini("brick")}${mini("lumber")}${mini("wool")}${mini("grain")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("city", "#ff4a1f", 20)}<strong style="font-size:12px;">City (×4 · 2 VP)</strong></span>
            <span class="ga-guide-recipe__cards"><span class="t-label ga-num">2×</span>${mini("grain")}<span class="t-label ga-num">3×</span>${mini("ore")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("dev_card", "#fbbf24", 20)}<strong style="font-size:12px;">Dev Card</strong></span>
            <span class="ga-guide-recipe__cards">${mini("wool")}${mini("grain")}${mini("ore")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("wall", "#fde68a", 20)}<strong style="font-size:12px;">Wall (×3 · +2 cap)</strong></span>
            <span class="ga-guide-recipe__cards"><span class="t-label ga-num">2×</span>${mini("brick")}</span>
          </div>
        </div>

        <div class="ga-guide-section-label">Base Development Card deck (25 cards · 34 in 5–6P · play on a later turn)</div>
        <div class="ga-guide-dev-grid">
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Knight</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×14</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("knight")}</div>
            <span class="ga-guide-dev-card__desc">Move Robber/Pirate &amp; steal 1; 3+ = Largest Army (+2 VP).</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Road Building</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("road_building")}</div>
            <span class="ga-guide-dev-card__desc">Place up to 2 free Roads or Ships immediately.</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Year of Plenty</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("year_of_plenty")}</div>
            <span class="ga-guide-dev-card__desc">Take any 2 resource cards directly from the bank.</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Monopoly</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("monopoly")}</div>
            <span class="ga-guide-dev-card__desc">Name 1 resource; rivals give you ALL they hold.</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">Victory Point</strong>
              <span class="ga-chip ga-chip--warn ga-num" style="height:20px;padding:0 6px;">×5</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("victory_point")}</div>
            <span class="ga-guide-dev-card__desc">Counts +1 VP immediately (hidden from rivals).</span>
          </div>
        </div>

        <div class="ga-guide-section-label">Cities &amp; Knights — City commodities, Event Die &amp; Knights</div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe" title="Forest cities produce 1 Lumber + 1 Paper (upgrades Science)">
            <span class="ga-guide-recipe__cards">${mini("lumber")}<span class="t-label muted">+</span>${mini("paper")}</span>
            <span class="t-label" style="color:#4ade80;">Forest → Paper (Science)</span>
          </div>
          <div class="ga-guide-recipe" title="Pasture cities produce 1 Wool + 1 Cloth (upgrades Trade)">
            <span class="ga-guide-recipe__cards">${mini("wool")}<span class="t-label muted">+</span>${mini("cloth")}</span>
            <span class="t-label" style="color:#a3e635;">Pasture → Cloth (Trade)</span>
          </div>
          <div class="ga-guide-recipe" title="Mountain cities produce 1 Ore + 1 Coin (upgrades Politics)">
            <span class="ga-guide-recipe__cards">${mini("ore")}<span class="t-label muted">+</span>${mini("coin")}</span>
            <span class="t-label" style="color:#cbd5e1;">Mountain → Coin (Politics)</span>
          </div>
          <div class="ga-guide-recipe" title="Barbarian Ship on Event Die (3 of 6 faces) advances the raid counter toward 7/7">
            <span class="ga-guide-recipe__left">${renderEventDieSvg("barbarian", 22)}<strong style="font-size:12px;">Barbarian Ship</strong></span>
            <span class="t-label ga-num">Raid at 7/7</span>
          </div>
          <div class="ga-guide-recipe" title="City Gate on Event Die + Red Die ≤ your Improvement level draws 1 Progress Card">
            <span class="ga-guide-recipe__cards">${renderEventDieSvg("trade", 20)}${renderEventDieSvg("politics", 20)}${renderEventDieSvg("science", 20)}</span>
            <span class="t-label">Red Die ≤ Lv → Progress</span>
          </div>
          <div class="ga-guide-recipe" title="Recruit/Promote Knight: 1 Wool + 1 Ore · Activate: 1 Grain · Lv 4 City = Metropolis (+2 VP)">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("knight_piece", "#38bdf8", 20)}${renderActionPieceIconSvg("metropolis", "#f59e0b", 20)}</span>
            <span class="t-label">${mini("wool")}${mini("ore")} · Act ${mini("grain")}</span>
          </div>
        </div>
      </div>
    `;
  }

  if (gameId === "splendor") {
    return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">On your turn — choose 1 of 4 actions</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("emerald", 1, 24)}${renderSplendorGemToken("sapphire", 1, 24)}${renderSplendorGemToken("ruby", 1, 24)}</span>
            <div class="ga-guide-flow__copy">
              <strong>Take 3 distinct</strong>
              <span>1 each of 3 non-Gold colors</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("diamond", 2, 26)}</span>
            <div class="ga-guide-flow__copy">
              <strong>OR Take 2 same</strong>
              <span>Requires ≥4 in that stack</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("gold", 1, 26)}</span>
            <div class="ga-guide-flow__copy">
              <strong>OR Hold 1 card</strong>
              <span>Market or blind deck (≤3) + 1 Gold</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon"><span class="ga-chip ga-chip--accent ga-num">+VP</span></span>
            <div class="ga-guide-flow__copy">
              <strong>OR Buy 1 card</strong>
              <span>Permanent -1 gem cost bonus</span>
            </div>
          </div>
        </div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Gem stacks by players</strong>
            <span class="t-label ga-num">2P: 4 · 3P: 5 · 4P: 7 (+5 Gold)</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">End-of-turn limits</strong>
            <span class="t-label ga-num">≤10 tokens · ≤3 held cards</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Nobles &amp; Finish</strong>
            <span class="ga-chip ga-chip--warn ga-num">+3 VP auto · 15+ VP end</span>
          </div>
        </div>
      </div>
    `;
  }

  if (gameId === "azul") {
    return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">Round phases</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("blue", 22)}${renderAzulTile("blue", 22)}${renderAzulTile("yellow", 22, false, true)}</span>
            <div class="ga-guide-flow__copy">
              <strong>1. Pick 1 color</strong>
              <span>Take all matching; rest → Center</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("red", 22)}${renderAzulTile("red", 22)}${renderAzulTile("red", 22, false, false, "", true)}</span>
            <div class="ga-guide-flow__copy">
              <strong>2. Fill 1 row (1–5)</strong>
              <span>1 color/row · excess → Floor</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("teal", 22)}${renderAzulTile("black", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>3. Tile Wall chains</strong>
              <span>Full rows move 1 tile &amp; score H+V</span>
            </div>
          </div>
        </div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Factories &amp; Floor</strong>
            <span class="t-label ga-num">2P:5 3P:7 4P:9 · -1,-1,-2,-2,-2,-3,-3</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">Row / Column bonus</strong>
            <span class="ga-chip ga-chip--ok ga-num">+2 Row (ends) · +7 Col</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">All 5 of 1 Color</strong>
            <span class="ga-chip ga-chip--warn ga-num">+10 pts</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="ga-guide-visual">
      <div class="ga-guide-section-label">Simultaneous turn — pick 1 card, then pass hand (↻ Age I/III · ↺ Age II)</div>
      <div class="ga-guide-flow">
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon">${renderSwResourceBadge("wood", 1, true)}${renderSwResourceBadge("glass", 1, true)}</span>
          <div class="ga-guide-flow__copy">
            <strong>1. Build structure</strong>
            <span>Own goods, Chain →, or neighbor 2c/1c</span>
          </div>
        </div>
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon"><span class="ga-chip ga-chip--warn">▲ Stage</span></span>
          <div class="ga-guide-flow__copy">
            <strong>2. Build Wonder</strong>
            <span>Pay stage cost; tuck card face-down</span>
          </div>
        </div>
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon">${renderSwCoinSvg(20)}<span class="t-label ga-num" style="color:#fde047;">+3c</span></span>
          <div class="ga-guide-flow__copy">
            <strong>3. Sell card</strong>
            <span>Discard any card for 3 coins</span>
          </div>
        </div>
      </div>
      <div class="ga-guide-recipes">
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwShieldSvg(18)}<strong style="font-size:12px;">Military (Age I/II/III)</strong></span>
          <span class="t-label ga-num">+1/+3/+5 win · -1 loss</span>
        </div>
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwScienceIconSvg("compass", 16)}${renderSwScienceIconSvg("gear", 16)}${renderSwScienceIconSvg("tablet", 16)}</span>
          <span class="t-label ga-num">C²+G²+T² + 7×sets</span>
        </div>
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwCoinSvg(17)}<strong style="font-size:12px;">7 VP Categories</strong></span>
          <span class="t-label ga-num">3c=+1 · Blue · Yellow · Guilds</span>
        </div>
      </div>
    </div>
  `;
}

export function renderReferenceGuideModalPure(
  activeGameId: TutorialGameId,
  inActiveMatch: boolean
): string {
  const guide = GAME_REFERENCE_GUIDES[activeGameId];

  return `
    <div class="ga-guide-backdrop" id="ga-guide-backdrop" role="dialog" aria-modal="true" aria-label="${escapeHtml(guide.title)} how to play">
      <div class="ga-guide-dialog">
        <div class="ga-guide-dialog__head">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-family:var(--font-display);font-size:18px;font-weight:500;">${escapeHtml(guide.title)} — How to play</strong>
            <span class="ga-chip">${escapeHtml(guide.playersBadge)}</span>
            <span class="ga-chip">${escapeHtml(guide.durationBadge)}</span>
          </div>
          <button type="button" id="btn-close-guide" class="btn btn--secondary btn--sm">Close</button>
        </div>

        <div class="ga-guide-objective">
          <span class="t-label muted">Goal</span>
          <p class="t-small" style="margin:2px 0 0;color:var(--ink);">${escapeHtml(guide.objective)}</p>
        </div>

        ${renderGameVisualReferenceHtml(activeGameId)}

        <div class="ga-guide-grid">
          ${guide.sections
            .map(
              (sec) => `
              <div class="ga-guide-card">
                <strong style="font-size:13px;font-weight:500;color:var(--ink);">${escapeHtml(sec.heading)}</strong>
                <ul class="ga-guide-list">
                  ${sec.items
                    .map((item) => `<li>${escapeHtml(item)}</li>`)
                    .join("")}
                </ul>
              </div>
            `
            )
            .join("")}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--line);">
          <span class="t-small muted">${
            inActiveMatch
              ? "Close this sheet anytime to resume your current match."
              : "Want a guided hands-on walkthrough on a live board?"
          }</span>
          <div style="display:inline-flex;gap:8px;">
            ${
              inActiveMatch
                ? `<button type="button" id="btn-resume-from-guide" class="btn btn--primary btn--sm">Resume match</button>`
                : `<button type="button" data-start-tutorial="${activeGameId}" class="btn btn--primary btn--sm">Launch interactive ${escapeHtml(
                    guide.title
                  )} tutorial</button>`
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
