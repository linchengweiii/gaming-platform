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
  readonly tips: readonly string[];
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
      "First player to reach the target Victory Points (10 VP Base, 12–14 VP in Seafarers / Cities & Knights) on their turn wins immediately.",
    sections: [
      {
        heading: "Base turn flow & building costs",
        items: [
          "Roll 2d6: Every terrain hex matching the sum yields 1 card per Settlement and 2 per City. On a 7, hands >7 (>9 with City Walls) discard half and the active player moves the Robber/Pirate.",
          "Road (Brick+Lumber) · Settlement 1 VP (Brick+Lumber+Wool+Grain) · City 2 VP (2 Grain+3 Ore) · Dev Card (Wool+Grain+Ore).",
          "Awards: Longest Route (5+ connected roads/ships = +2 VP) · Largest Army (3+ Knights = +2 VP).",
        ],
      },
      {
        heading: "5–6 Player automatic scaling",
        items: [
          "Seating 5 or 6 players automatically expands the map, enlarges the bank (24/resource, 18/commodity), and enables the between-turn Special Building Phase.",
          "During Special Building, non-active players may build pieces using cards already in hand (no trading or rolling).",
        ],
      },
      {
        heading: "Seafarers scenarios",
        items: [
          "Ships (Wool+Lumber): Span sea or coastal hex edges. Roads and Ships only connect through a coastal Settlement or City!",
          "Open Ships: Once per turn, you may move the open end of an unpinned Ship built on an earlier turn. Settling a new foreign island awards +2 bonus VP; Gold River yields any 1 resource of choice.",
        ],
      },
      {
        heading: "Cities & Knights toggle",
        items: [
          "2nd setup piece is a City! Cities on Forest/Pasture/Mountains yield 1 resource + 1 Commodity (Paper/Cloth/Coin) to upgrade Trade, Politics, and Science.",
          "Level 3 Perks: Trading House (2:1 commodity bank trade), Fortress (Lv 3 Mighty Knights), Aqueduct (1 free resource on dry non-7 rolls). Level 4 claims a +2 VP pillage-immune Metropolis (stealable at Lv 5!).",
          "Barbarians advance on Ship event rolls and raid at 7/7: if Island Active Knights < Total Cities, lowest contributor(s) lose a City; otherwise top defender earns +1 VP.",
        ],
      },
    ],
    tips: [
      "Prioritize high-pip intersections (6, 8, 5, 9) with balanced Brick+Lumber OR Ore+Grain synergy (and Forest Paper in Cities & Knights for Aqueduct).",
      "Securing a 2:1 or 3:1 harbor early prevents hand clogs on 7s.",
      "Never accept trades with an opponent sitting within 2–3 VP of victory.",
    ],
  },
  splendor: {
    gameId: "splendor",
    title: "Splendor",
    playersBadge: "2–4 players",
    durationBadge: "15–25 min",
    objective:
      "Reach 15 or more Prestige Points to trigger the final round; highest total after equal turns wins (tiebreaker: fewest purchased cards).",
    sections: [
      {
        heading: "Choose 1 action on your turn",
        items: [
          "Take 3 gem tokens of 3 different colors from the bank.",
          "Take 2 gem tokens of the SAME color (only legal if at least 4 tokens of that color are in the bank).",
          "Reserve 1 face-up market card or blind deck card (max 3 reserved) and gain 1 Gold joker token.",
          "Buy 1 face-up market card or 1 of your reserved cards using tokens + permanent card bonuses.",
        ],
      },
      {
        heading: "Key rules",
        items: [
          "10-Token Hand Cap: If you end an action above 10 tokens (including Gold), return excess tokens down to 10.",
          "Permanent Discounts: Every purchased card reduces future costs of its gem color by 1 permanently.",
          "Royal Nobles (+3 pts): Automatically visit at end of turn (max 1 per turn) once your card bonuses meet their requirement.",
        ],
      },
    ],
    tips: [
      "Focus your first 4–5 mines on 2–3 colors that overlap with at least two Nobles and high-efficiency Tier 2/3 cards.",
      "Reserving a key 3–5 VP Tier 2/3 card denies it to opponents while banking a flexible Gold joker.",
    ],
  },
  azul: {
    gameId: "azul",
    title: "Azul",
    playersBadge: "2–4 players",
    durationBadge: "15–25 min",
    objective:
      "Score the most points tiling your 5×5 palace wall; game ends at the end of the round in which any player completes 1 horizontal row of 5 tiles (tiebreaker: most completed horizontal rows).",
    sections: [
      {
        heading: "Round phases",
        items: [
          "1. Factory Offer: Pick all tiles of 1 color from either a Factory (pushing leftovers to Center) or the Center Pool (first taker also claims the -1 First-Player marker).",
          "2. Pattern Placement: Place all drafted tiles onto 1 Pattern Line (capacities 1–5); any overflow drops onto your Floor Line (-1, -1, -2, -2, -2, -3, -3).",
          "3. Wall-Tiling: Completed Pattern Lines move 1 tile right onto the matching Wall slot and clear remaining tiles; incomplete lines carry over to next round.",
        ],
      },
      {
        heading: "Chain & endgame scoring",
        items: [
          "Isolated Wall tile: +1 pt.",
          "Horizontal and/or Vertical chain: Count ALL contiguously linked tiles horizontally + vertically!",
          "Endgame Bonuses: +2 pts per full horizontal row · +7 pts per full vertical column · +10 pts per complete set of 5 tiles of one color.",
        ],
      },
    ],
    tips: [
      "Build outward from the center columns (columns 2–4) so every new tile scores both horizontal and vertical chains.",
      "Count remaining tiles in Factories + Center so you don't get stuck eating 4+ overflow tiles (-8 pts) at the end of a round!",
    ],
  },
  seven_wonders: {
    gameId: "seven_wonders",
    title: "7 Wonders",
    playersBadge: "3–7 players",
    durationBadge: "20–30 min",
    objective:
      "Amass the highest combined Victory Points across 7 categories after Age III (tiebreaker: most Treasury coins).",
    sections: [
      {
        heading: "Simultaneous Age drafting",
        items: [
          "Each of the 3 Ages deals 7 cards per player. Everyone simultaneously chooses 1 card and passes the rest (Age I Clockwise, Age II Counter-Clockwise, Age III Clockwise).",
          "On Round 6 (2 cards left), play 1 card and discard the 7th card face-down (unless Babylon Side B Stage 2 lets you play it!).",
          "3 Ways to Use a Card: Build structure (pay cost or free chain) · Tuck face-down to build next Wonder stage · Sell for +3 coins.",
          "Neighbor Commerce: Buy missing Brown/Gray resources produced by West or East neighbor for 2 coins each (1 coin with Trading Post / Marketplace). Duplicate card names cannot be built twice.",
        ],
      },
      {
        heading: "All 7 scoring categories",
        items: [
          "1. Military (Red): Compare Shields vs West & East at end of each Age (+1/+3/+5 wins, -1 defeats).",
          "2. Treasury: +1 VP per 3 coins held at game end.",
          "3. Wonder: Direct VP printed on completed Wonder stages.",
          "4. Civilian (Blue): Direct flat VP (2–8 VP).",
          "5. Science (Green): (Compasses² + Gears² + Tablets²) + 7 × complete sets of all 3 symbols!",
          "6. Commerce (Yellow) & 7. Guilds (Purple): Bonus VP scaling with your or your neighbors' cards & stages.",
        ],
      },
    ],
    tips: [
      "Secure missing raw/manufactured resources or Trading Posts in Age I — starving for resources in Age III locks you out of 6–8 VP cards.",
      "Winning a 1-shield military lead over a tied neighbor in Age III is a +6 VP swing (+5 instead of 0, while handing them -1).",
      "Tucking a high-scoring Science or Guild card under your Wonder denies it to the neighbor receiving your hand!",
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

export function renderReferenceGuideModalPure(
  activeGameId: TutorialGameId,
  inActiveMatch: boolean
): string {
  const guide = GAME_REFERENCE_GUIDES[activeGameId];
  const allTabs: readonly { id: TutorialGameId; label: string }[] = [
    { id: "catan", label: "Settlers of Catan" },
    { id: "splendor", label: "Splendor" },
    { id: "azul", label: "Azul" },
    { id: "seven_wonders", label: "7 Wonders" },
  ];

  return `
    <div class="ga-guide-backdrop" id="ga-guide-backdrop" role="dialog" aria-modal="true" aria-label="${escapeHtml(guide.title)} how to play">
      <div class="ga-guide-dialog">
        <div class="ga-guide-dialog__head">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-family:var(--font-display);font-size:18px;font-weight:500;">How to play &amp; strategy guide</strong>
            <span class="ga-chip">${escapeHtml(guide.playersBadge)}</span>
            <span class="ga-chip">${escapeHtml(guide.durationBadge)}</span>
          </div>
          <button type="button" id="btn-close-guide" class="btn btn--secondary btn--sm">Close</button>
        </div>

        <div class="ga-tabs" style="align-self:flex-start;">
          ${allTabs
            .map(
              (t) => `
              <button type="button" data-guide-tab="${t.id}" class="ga-tab ${
                t.id === activeGameId ? "is-active" : ""
              }">${escapeHtml(t.label)}</button>
            `
            )
            .join("")}
        </div>

        <div class="ga-guide-objective">
          <span class="t-label muted">Objective</span>
          <p class="t-small" style="margin:4px 0 0;color:var(--ink);">${escapeHtml(guide.objective)}</p>
        </div>

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

        <div class="ga-guide-card">
          <strong style="font-size:13px;font-weight:500;color:var(--ink);">Grandmaster table tips</strong>
          <ul class="ga-guide-list">
            ${guide.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}
          </ul>
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
