import type { GameEvent } from "@gaming-platform/core";
import { TERRAIN_TO_COMMODITY } from "../config/cities-knights-config.ts";
import { TERRAIN_TO_RESOURCE } from "../config/costs-and-limits.ts";
import {
  COMMODITIES,
  type CommodityMap,
  type CommodityType,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  type StateWithEvents,
  appendCatanEvent,
  totalResourceCount,
} from "./helpers.ts";

function distributeGoods<K extends string>(
  keys: readonly K[],
  demandsByKey: Record<K, Record<string, number>>,
  initialBank: Record<K, number>,
  players: CatanPlayerState[],
  addToPlayer: (p: CatanPlayerState, key: K, amt: number) => CatanPlayerState,
  summaryParts: string[],
  gainedPlayers: Set<string>
): Record<K, number> {
  const bank = { ...initialBank };
  for (const key of keys) {
    const playerDemands = demandsByKey[key];
    const demandingIds = Object.keys(playerDemands);
    if (demandingIds.length === 0) continue;

    let totalDemand = 0;
    for (const id of demandingIds) totalDemand += playerDemands[id]!;

    const grant = (pId: string, amt: number, partial: boolean) => {
      const idx = players.findIndex((pl) => pl.id === pId);
      const p = players[idx]!;
      players[idx] = addToPlayer(p, key, amt);
      bank[key] -= amt;
      gainedPlayers.add(pId);
      summaryParts.push(
        partial ? `${p.name} +${amt} ${key} (partial bank)` : `${p.name} +${amt} ${key}`
      );
    };

    if (bank[key] >= totalDemand) {
      for (const id of demandingIds) grant(id, playerDemands[id]!, false);
    } else if (demandingIds.length === 1 && bank[key] > 0) {
      grant(demandingIds[0]!, bank[key], true);
    }
  }
  return bank;
}

/**
 * Purely distributes resources (and Cities & Knights commodities + Aqueduct picks) on a non-7 roll.
 */
export function distributeRollResourcesPure(
  state: CatanState,
  rollTotal: number,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const owedByResource: Record<ResourceType, Record<string, number>> = {
    brick: {},
    lumber: {},
    wool: {},
    grain: {},
    ore: {},
  };
  const owedByCommodity: Record<CommodityType, Record<string, number>> = {
    paper: {},
    cloth: {},
    coin: {},
  };
  const goldOwed: Record<string, number> = {};

  for (const hId of state.topology.hexOrder) {
    if (hId === state.robberHexId) continue;
    const tile = state.hexes[hId]!;
    if (tile.numberToken !== rollTotal) continue;

    for (const vId of state.topology.hexes[hId]!.cornerVertexIds) {
      const b = state.buildings[vId];
      if (!b) continue;

      const amount = b.type === "city" ? 2 : 1;
      if (tile.terrain === "gold") {
        goldOwed[b.ownerId] = (goldOwed[b.ownerId] ?? 0) + amount;
        continue;
      }

      const res = TERRAIN_TO_RESOURCE[tile.terrain];
      if (!res) continue;

      const comm = state.config.enableCitiesAndKnights
        ? TERRAIN_TO_COMMODITY[tile.terrain]
        : null;
      if (b.type === "city" && comm) {
        owedByResource[res][b.ownerId] = (owedByResource[res][b.ownerId] ?? 0) + 1;
        owedByCommodity[comm][b.ownerId] =
          (owedByCommodity[comm][b.ownerId] ?? 0) + 1;
      } else {
        owedByResource[res][b.ownerId] =
          (owedByResource[res][b.ownerId] ?? 0) + amount;
      }
    }
  }

  const players = state.players.slice();
  const summaryParts: string[] = [];
  const gainedPlayers = new Set<string>();

  const nextBank = distributeGoods(
    RESOURCES,
    owedByResource,
    state.bank,
    players,
    (p, res, amt) => ({
      ...p,
      resources: { ...p.resources, [res]: p.resources[res] + amt },
    }),
    summaryParts,
    gainedPlayers
  ) as ResourceMap;

  const nextCommodityBank = state.config.enableCitiesAndKnights
    ? (distributeGoods(
        COMMODITIES,
        owedByCommodity,
        state.commodityBank,
        players,
        (p, comm, amt) => ({
          ...p,
          commodities: { ...p.commodities, [comm]: p.commodities[comm] + amt },
        }),
        summaryParts,
        gainedPlayers
      ) as CommodityMap)
    : state.commodityBank;

  const totalBankRemaining = totalResourceCount(nextBank);
  let nextGoldPicks = state.pendingGoldPicks;

  if (totalBankRemaining > 0) {
    const goldEntries = Object.entries(goldOwed).filter(([, count]) => count > 0);
    if (goldEntries.length > 0) {
      nextGoldPicks = { ...nextGoldPicks };
      for (const [pId, count] of goldEntries) {
        const p = players.find((pl) => pl.id === pId)!;
        nextGoldPicks[pId] = count;
        gainedPlayers.add(pId);
        summaryParts.push(`${p.name} +${count} Gold pick(s)`);
      }
    }

    // Science Level 3+ Aqueduct: if dice != 7 and player received 0 resources/commodities/gold, pick 1 free resource
    if (state.config.enableCitiesAndKnights) {
      for (const p of players) {
        if (p.cityImprovements.science >= 3 && !gainedPlayers.has(p.id)) {
          if (nextGoldPicks === state.pendingGoldPicks) {
            nextGoldPicks = { ...nextGoldPicks };
          }
          nextGoldPicks[p.id] = (nextGoldPicks[p.id] ?? 0) + 1;
          summaryParts.push(`${p.name} +1 Aqueduct pick`);
        }
      }
    }
  }

  const nextState: CatanState = {
    ...state,
    bank: nextBank,
    commodityBank: nextCommodityBank,
    players,
    pendingGoldPicks: nextGoldPicks,
  };

  if (summaryParts.length === 0) {
    return { state: nextState, emitted: emitted.slice() };
  }

  return appendCatanEvent(
    nextState,
    emitted,
    "RESOURCES_PRODUCED",
    `Production: ${summaryParts.join(", ")}.`
  );
}
