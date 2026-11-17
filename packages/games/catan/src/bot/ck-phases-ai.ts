import { TERRAIN_TO_COMMODITY } from "../config/cities-knights-config.ts";
import {
  NUMBER_TOKEN_PIPS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import { getPlayerResourceCount } from "../rules/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import type { ImprovementDiscipline } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";

export function chooseCkPillagedCityAction(
  state: CatanState,
  legalActions: CatanAction[]
): CatanAction {
  const pillageActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "SELECT_PILLAGED_CITY" }> =>
      a.type === "SELECT_PILLAGED_CITY"
  );
  if (pillageActs.length <= 1) return legalActions[0]!;

  // Sacrifice the city with the lowest total resource + commodity pip value
  return pillageActs.reduce<{ act: CatanAction; val: number }>(
    (worst, act) => {
      const vNode = state.topology.vertices[act.vertexId];
      const val = (vNode?.adjacentHexIds ?? []).reduce<number>((sum, hId) => {
        const tile = state.hexes[hId];
        if (!tile?.numberToken) return sum;
        const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
        const comm = TERRAIN_TO_COMMODITY[tile.terrain];
        return sum + pips * (comm ? 2.2 : 1.0);
      }, 0);
      return val < worst.val ? { act, val } : worst;
    },
    { act: pillageActs[0]!, val: Infinity }
  ).act;
}

export function chooseCkProgressSelectionAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[]
): CatanAction {
  const deckPicks = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "SELECT_PROGRESS_DECK" }> =>
      a.type === "SELECT_PROGRESS_DECK"
  );
  if (deckPicks.length > 0) {
    if ((player.botDifficulty ?? "smart") === "master") {
      const sci = deckPicks.find((d) => d.discipline === "science");
      if (
        sci &&
        state.progressDecks.science.length > 0 &&
        player.cityImprovements.science < 4
      ) {
        return sci;
      }
      const oppTotalCards = state.players
        .filter((p) => p.id !== player.id)
        .reduce((acc, o) => acc + getPlayerResourceCount(o), 0);
      const trd = deckPicks.find((d) => d.discipline === "trade");
      if (trd && oppTotalCards >= 10) return trd;
      const pol = deckPicks.find((d) => d.discipline === "politics");
      return sci ?? trd ?? pol ?? deckPicks[0]!;
    }
    const prefOrder: ImprovementDiscipline[] = [
      "science",
      "trade",
      "politics",
    ];
    for (const d of prefOrder) {
      const match = deckPicks.find((a) => a.discipline === d);
      if (match) return match;
    }
    return deckPicks[0]!;
  }

  const discardPicks = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "DISCARD_PROGRESS_CARD" }> =>
      a.type === "DISCARD_PROGRESS_CARD"
  );
  if (discardPicks.length > 0) {
    const keepValue = (cardId: string): number => {
      const c = player.progressCards.find((x) => x.id === cardId);
      if (!c) return 0;
      switch (c.type) {
        case "merchant":
        case "mining":
        case "irrigation":
        case "resource_monopoly":
        case "trade_monopoly":
        case "alchemist":
        case "road_building":
        case "medicine":
        case "crane":
        case "smith":
        case "warlord":
          return 10;
        case "engineer":
        case "spy":
        case "bishop":
        case "master_merchant":
        case "wedding":
          return 7;
        default:
          return 3;
      }
    };
    return discardPicks.reduce<{ act: CatanAction; val: number }>(
      (lowest, act) => {
        const v = keepValue(act.cardId);
        return v < lowest.val ? { act, val: v } : lowest;
      },
      { act: discardPicks[0]!, val: Infinity }
    ).act;
  }

  return legalActions[0]!;
}

export function chooseCkAlchemistPreRollAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[]
): CatanAction | null {
  const alchActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
      a.type === "PLAY_PROGRESS_CARD" &&
      player.progressCards.find((c) => c.id === a.cardId)?.type === "alchemist"
  );
  if (alchActs.length === 0) return null;

  const evalRollTotal = (total: number): { myGain: number; oppGain: number } => {
    if (total === 7) return { myGain: 0, oppGain: 0 };
    return state.topology.hexOrder.reduce<{ myGain: number; oppGain: number }>(
      (acc, hId) => {
        if (hId === state.robberHexId) return acc;
        const tile = state.hexes[hId];
        if (!tile || tile.numberToken !== total) return acc;
        const res = TERRAIN_TO_RESOURCE[tile.terrain];
        const comm = TERRAIN_TO_COMMODITY[tile.terrain];
        if (!res && tile.terrain !== "gold") return acc;
        const hNode = state.topology.hexes[hId]!;
        return hNode.cornerVertexIds.reduce<{ myGain: number; oppGain: number }>(
          (inner, vId) => {
            const b = state.buildings[vId];
            if (!b) return inner;
            const yieldVal =
              b.type === "city" ? (comm ? 2.8 : 2.0) : 1.0;
            if (b.ownerId === player.id) {
              return { myGain: inner.myGain + yieldVal, oppGain: inner.oppGain };
            }
            return { myGain: inner.myGain, oppGain: inner.oppGain + yieldVal };
          },
          acc
        );
      },
      { myGain: 0, oppGain: 0 }
    );
  };

  let bestAct: CatanAction | null = null;
  let bestScore = 2.5;
  for (const act of alchActs) {
    const d1 = act.params?.die1 ?? 0;
    const d2 = act.params?.die2 ?? 0;
    const total = d1 + d2;
    if (total === 7) continue;
    const { myGain, oppGain } = evalRollTotal(total);
    if (myGain <= 0) continue;
    // Red die `d2` triggers Progress Cards on `d2 <= level + 1`; pick low `d2` if we have upgrades or high `d2 = 6` to deny opponents!
    const myMaxImp = Math.max(
      player.cityImprovements.trade,
      player.cityImprovements.politics,
      player.cityImprovements.science
    );
    const redBonus =
      myMaxImp >= 1 && d2 <= myMaxImp + 1
        ? 0.8
        : myMaxImp === 0 && d2 === 6
          ? 0.5
          : 0;
    const score = myGain * 3.2 - oppGain * 0.45 + redBonus;
    if (score > bestScore) {
      bestScore = score;
      bestAct = act;
    }
  }
  return bestAct;
}
