import type { CardTier, GemColor, GemMap, SplendorCard, SplendorNoble } from "./types.ts";

function cost(
  emerald = 0,
  diamond = 0,
  sapphire = 0,
  onyx = 0,
  ruby = 0
): GemMap {
  return { emerald, diamond, sapphire, onyx, ruby };
}

function makeCard(
  id: string,
  tier: CardTier,
  bonus: GemColor,
  points: number,
  c: GemMap
): SplendorCard {
  return { id, tier, bonus, points, cost: c };
}

/**
 * Full 90-Card Official Splendor Development Card Deck:
 * - 40 Tier 1 cards (8 per gem color)
 * - 30 Tier 2 cards (6 per gem color)
 * - 20 Tier 3 cards (4 per gem color)
 */
export const SPLENDOR_CARDS: readonly SplendorCard[] = [
  // ================= TIER 1 (40 Cards) =================
  // Onyx (Black) bonus
  makeCard("t1-onyx-1", 1, "onyx", 0, cost(1, 1, 1, 0, 1)),
  makeCard("t1-onyx-2", 1, "onyx", 0, cost(1, 1, 2, 0, 1)),
  makeCard("t1-onyx-3", 1, "onyx", 0, cost(0, 2, 2, 0, 1)),
  makeCard("t1-onyx-4", 1, "onyx", 0, cost(1, 0, 0, 1, 3)),
  makeCard("t1-onyx-5", 1, "onyx", 0, cost(2, 0, 0, 0, 1)),
  makeCard("t1-onyx-6", 1, "onyx", 0, cost(2, 2, 0, 0, 0)),
  makeCard("t1-onyx-7", 1, "onyx", 0, cost(3, 0, 0, 0, 0)),
  makeCard("t1-onyx-8", 1, "onyx", 1, cost(0, 0, 4, 0, 0)),

  // Sapphire (Blue) bonus
  makeCard("t1-sapp-1", 1, "sapphire", 0, cost(1, 1, 0, 1, 1)),
  makeCard("t1-sapp-2", 1, "sapphire", 0, cost(1, 1, 0, 1, 2)),
  makeCard("t1-sapp-3", 1, "sapphire", 0, cost(2, 1, 0, 0, 2)),
  makeCard("t1-sapp-4", 1, "sapphire", 0, cost(3, 0, 1, 0, 1)),
  makeCard("t1-sapp-5", 1, "sapphire", 0, cost(0, 1, 0, 2, 0)),
  makeCard("t1-sapp-6", 1, "sapphire", 0, cost(2, 0, 0, 2, 0)),
  makeCard("t1-sapp-7", 1, "sapphire", 0, cost(0, 0, 0, 3, 0)),
  makeCard("t1-sapp-8", 1, "sapphire", 1, cost(0, 0, 0, 0, 4)),

  // Diamond (White) bonus
  makeCard("t1-diam-1", 1, "diamond", 0, cost(1, 0, 1, 1, 1)),
  makeCard("t1-diam-2", 1, "diamond", 0, cost(2, 0, 1, 1, 1)),
  makeCard("t1-diam-3", 1, "diamond", 0, cost(2, 0, 2, 1, 0)),
  makeCard("t1-diam-4", 1, "diamond", 0, cost(0, 3, 1, 1, 0)),
  makeCard("t1-diam-5", 1, "diamond", 0, cost(0, 0, 0, 1, 2)),
  makeCard("t1-diam-6", 1, "diamond", 0, cost(0, 0, 2, 2, 0)),
  makeCard("t1-diam-7", 1, "diamond", 0, cost(0, 0, 3, 0, 0)),
  makeCard("t1-diam-8", 1, "diamond", 1, cost(4, 0, 0, 0, 0)),

  // Emerald (Green) bonus
  makeCard("t1-emer-1", 1, "emerald", 0, cost(0, 1, 1, 1, 1)),
  makeCard("t1-emer-2", 1, "emerald", 0, cost(0, 1, 1, 2, 1)),
  makeCard("t1-emer-3", 1, "emerald", 0, cost(0, 0, 1, 2, 2)),
  makeCard("t1-emer-4", 1, "emerald", 0, cost(1, 1, 3, 0, 0)),
  makeCard("t1-emer-5", 1, "emerald", 0, cost(0, 2, 1, 0, 0)),
  makeCard("t1-emer-6", 1, "emerald", 0, cost(0, 0, 2, 0, 2)),
  makeCard("t1-emer-7", 1, "emerald", 0, cost(0, 0, 0, 0, 3)),
  makeCard("t1-emer-8", 1, "emerald", 1, cost(0, 0, 0, 4, 0)),

  // Ruby (Red) bonus
  makeCard("t1-ruby-1", 1, "ruby", 0, cost(1, 1, 1, 1, 0)),
  makeCard("t1-ruby-2", 1, "ruby", 0, cost(1, 2, 1, 1, 0)),
  makeCard("t1-ruby-3", 1, "ruby", 0, cost(1, 2, 0, 2, 0)),
  makeCard("t1-ruby-4", 1, "ruby", 0, cost(0, 1, 0, 3, 1)),
  makeCard("t1-ruby-5", 1, "ruby", 0, cost(1, 0, 2, 0, 0)),
  makeCard("t1-ruby-6", 1, "ruby", 0, cost(0, 2, 0, 0, 2)),
  makeCard("t1-ruby-7", 1, "ruby", 0, cost(0, 3, 0, 0, 0)),
  makeCard("t1-ruby-8", 1, "ruby", 1, cost(0, 4, 0, 0, 0)),

  // ================= TIER 2 (30 Cards) =================
  // Onyx
  makeCard("t2-onyx-1", 2, "onyx", 1, cost(2, 3, 2, 0, 0)),
  makeCard("t2-onyx-2", 2, "onyx", 1, cost(3, 3, 0, 2, 0)),
  makeCard("t2-onyx-3", 2, "onyx", 2, cost(4, 0, 1, 0, 2)),
  makeCard("t2-onyx-4", 2, "onyx", 2, cost(5, 0, 0, 0, 3)),
  makeCard("t2-onyx-5", 2, "onyx", 2, cost(0, 5, 0, 0, 0)),
  makeCard("t2-onyx-6", 2, "onyx", 3, cost(0, 0, 0, 6, 0)),

  // Sapphire
  makeCard("t2-sapp-1", 2, "sapphire", 1, cost(2, 0, 2, 0, 3)),
  makeCard("t2-sapp-2", 2, "sapphire", 1, cost(3, 0, 2, 3, 0)),
  makeCard("t2-sapp-3", 2, "sapphire", 2, cost(0, 5, 3, 0, 0)),
  makeCard("t2-sapp-4", 2, "sapphire", 2, cost(0, 2, 0, 4, 1)),
  makeCard("t2-sapp-5", 2, "sapphire", 2, cost(0, 0, 5, 0, 0)),
  makeCard("t2-sapp-6", 2, "sapphire", 3, cost(0, 0, 6, 0, 0)),

  // Diamond
  makeCard("t2-diam-1", 2, "diamond", 1, cost(3, 0, 0, 2, 2)),
  makeCard("t2-diam-2", 2, "diamond", 1, cost(0, 2, 3, 0, 3)),
  makeCard("t2-diam-3", 2, "diamond", 2, cost(1, 0, 0, 2, 4)),
  makeCard("t2-diam-4", 2, "diamond", 2, cost(0, 0, 0, 3, 5)),
  makeCard("t2-diam-5", 2, "diamond", 2, cost(0, 0, 0, 0, 5)),
  makeCard("t2-diam-6", 2, "diamond", 3, cost(0, 6, 0, 0, 0)),

  // Emerald
  makeCard("t2-emer-1", 2, "emerald", 1, cost(0, 3, 2, 0, 2)),
  makeCard("t2-emer-2", 2, "emerald", 1, cost(2, 2, 3, 0, 0)),
  makeCard("t2-emer-3", 2, "emerald", 2, cost(0, 4, 2, 1, 0)),
  makeCard("t2-emer-4", 2, "emerald", 2, cost(3, 0, 5, 0, 0)),
  makeCard("t2-emer-5", 2, "emerald", 2, cost(5, 0, 0, 0, 0)),
  makeCard("t2-emer-6", 2, "emerald", 3, cost(6, 0, 0, 0, 0)),

  // Ruby
  makeCard("t2-ruby-1", 2, "ruby", 1, cost(0, 2, 0, 3, 2)),
  makeCard("t2-ruby-2", 2, "ruby", 1, cost(0, 0, 3, 3, 2)),
  makeCard("t2-ruby-3", 2, "ruby", 2, cost(2, 1, 4, 0, 0)),
  makeCard("t2-ruby-4", 2, "ruby", 2, cost(0, 3, 0, 5, 0)),
  makeCard("t2-ruby-5", 2, "ruby", 2, cost(0, 0, 0, 5, 0)),
  makeCard("t2-ruby-6", 2, "ruby", 3, cost(0, 0, 0, 0, 6)),

  // ================= TIER 3 (20 Cards) =================
  // Onyx
  makeCard("t3-onyx-1", 3, "onyx", 3, cost(5, 3, 3, 0, 3)),
  makeCard("t3-onyx-2", 3, "onyx", 4, cost(0, 0, 0, 0, 7)),
  makeCard("t3-onyx-3", 3, "onyx", 4, cost(3, 0, 0, 3, 6)),
  makeCard("t3-onyx-4", 3, "onyx", 5, cost(0, 0, 0, 3, 7)),

  // Sapphire
  makeCard("t3-sapp-1", 3, "sapphire", 3, cost(3, 3, 0, 5, 3)),
  makeCard("t3-sapp-2", 3, "sapphire", 4, cost(0, 7, 0, 0, 0)),
  makeCard("t3-sapp-3", 3, "sapphire", 4, cost(0, 6, 3, 3, 0)),
  makeCard("t3-sapp-4", 3, "sapphire", 5, cost(0, 7, 3, 0, 0)),

  // Diamond
  makeCard("t3-diam-1", 3, "diamond", 3, cost(3, 0, 3, 3, 5)),
  makeCard("t3-diam-2", 3, "diamond", 4, cost(0, 0, 0, 7, 0)),
  makeCard("t3-diam-3", 3, "diamond", 4, cost(0, 3, 0, 6, 3)),
  makeCard("t3-diam-4", 3, "diamond", 5, cost(0, 3, 0, 7, 0)),

  // Emerald
  makeCard("t3-emer-1", 3, "emerald", 3, cost(0, 5, 3, 3, 3)),
  makeCard("t3-emer-2", 3, "emerald", 4, cost(0, 0, 7, 0, 0)),
  makeCard("t3-emer-3", 3, "emerald", 4, cost(3, 3, 6, 0, 0)),
  makeCard("t3-emer-4", 3, "emerald", 5, cost(3, 0, 7, 0, 0)),

  // Ruby
  makeCard("t3-ruby-1", 3, "ruby", 3, cost(3, 3, 5, 3, 0)),
  makeCard("t3-ruby-2", 3, "ruby", 4, cost(7, 0, 0, 0, 0)),
  makeCard("t3-ruby-3", 3, "ruby", 4, cost(6, 0, 3, 0, 3)),
  makeCard("t3-ruby-4", 3, "ruby", 5, cost(7, 0, 0, 0, 3)),
];

export const SPLENDOR_NOBLES: readonly SplendorNoble[] = [
  { id: "noble-1", name: "Catherine de' Medici", points: 3, requirements: { emerald: 3, sapphire: 3, ruby: 3 } },
  { id: "noble-2", name: "Elisabeth of Austria", points: 3, requirements: { diamond: 3, sapphire: 3, onyx: 3 } },
  { id: "noble-3", name: "Isabella I of Castile", points: 3, requirements: { diamond: 4, onyx: 4 } },
  { id: "noble-4", name: "Niccolò Machiavelli", points: 3, requirements: { diamond: 4, sapphire: 4 } },
  { id: "noble-5", name: "Suleiman the Magnificent", points: 3, requirements: { emerald: 4, sapphire: 4 } },
  { id: "noble-6", name: "Anne of Brittany", points: 3, requirements: { emerald: 3, diamond: 3, sapphire: 3 } },
  { id: "noble-7", name: "Charles V", points: 3, requirements: { diamond: 3, onyx: 3, ruby: 3 } },
  { id: "noble-8", name: "Francis I of France", points: 3, requirements: { emerald: 3, onyx: 3, ruby: 3 } },
  { id: "noble-9", name: "Henry VIII", points: 3, requirements: { onyx: 4, ruby: 4 } },
  { id: "noble-10", name: "Mary Stuart", points: 3, requirements: { emerald: 4, ruby: 4 } },
];
