import type { TutorialGameId, TutorialLesson } from "../tutorials/types.ts";

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
        "Place your 2nd settlement and road on the map, or click Perform step.",
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
