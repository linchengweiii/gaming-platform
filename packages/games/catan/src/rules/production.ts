import type { GameEvent } from "@gaming-platform/core";
import { addCommoditiesPure } from "../cities-and-knights/helpers.ts";
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
  addResourcesPure,
  appendCatanEvent,
  totalResourceCount,
  updatePlayerById,
} from "./helpers.ts";

/**
 * Purely distributes resources (and Cities & Knights commodities + Aqueduct picks) on a non-7 roll.
 */
export function distributeRollResourcesPure(
  state: CatanState,
  rollTotal: number,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const demands = state.topology.hexOrder.reduce<{
    owedByResource: Record<ResourceType, Record<string, number>>;
    owedByCommodity: Record<CommodityType, Record<string, number>>;
    goldOwed: Record<string, number>;
  }>(
    (acc, hId) => {
      if (hId === state.robberHexId) return acc;
      const tile = state.hexes[hId]!;
      if (tile.numberToken !== rollTotal) return acc;

      const hNode = state.topology.hexes[hId]!;
      return hNode.cornerVertexIds.reduce((inner, vId) => {
        const b = state.buildings[vId];
        if (!b) return inner;

        if (tile.terrain === "gold") {
          const amount = b.type === "city" ? 2 : 1;
          return {
            ...inner,
            goldOwed: {
              ...inner.goldOwed,
              [b.ownerId]: (inner.goldOwed[b.ownerId] ?? 0) + amount,
            },
          };
        }

        const res = TERRAIN_TO_RESOURCE[tile.terrain];
        if (!res) return inner;

        const comm = state.config.enableCitiesAndKnights
          ? TERRAIN_TO_COMMODITY[tile.terrain]
          : null;

        if (b.type === "city" && comm) {
          return {
            ...inner,
            owedByResource: {
              ...inner.owedByResource,
              [res]: {
                ...inner.owedByResource[res],
                [b.ownerId]: (inner.owedByResource[res][b.ownerId] ?? 0) + 1,
              },
            },
            owedByCommodity: {
              ...inner.owedByCommodity,
              [comm]: {
                ...inner.owedByCommodity[comm],
                [b.ownerId]:
                  (inner.owedByCommodity[comm][b.ownerId] ?? 0) + 1,
              },
            },
          };
        }

        const amount = b.type === "city" ? 2 : 1;
        return {
          ...inner,
          owedByResource: {
            ...inner.owedByResource,
            [res]: {
              ...inner.owedByResource[res],
              [b.ownerId]: (inner.owedByResource[res][b.ownerId] ?? 0) + amount,
            },
          },
        };
      }, acc);
    },
    {
      owedByResource: { brick: {}, lumber: {}, wool: {}, grain: {}, ore: {} },
      owedByCommodity: { paper: {}, cloth: {}, coin: {} },
      goldOwed: {},
    }
  );

  const resourceDistribution = RESOURCES.reduce<{
    bank: ResourceMap;
    players: CatanPlayerState[];
    summaryParts: string[];
    gainedPlayers: ReadonlySet<string>;
  }>(
    (acc, res) => {
      const playerDemands = demands.owedByResource[res];
      const demandingPlayerIds = Object.keys(playerDemands);
      if (demandingPlayerIds.length === 0) return acc;

      const totalDemand = Object.values(playerDemands).reduce<number>(
        (a, b) => a + b,
        0
      );
      if (acc.bank[res] >= totalDemand) {
        return Object.entries(playerDemands).reduce((inner, [pId, amt]) => {
          const p = inner.players.find((pl) => pl.id === pId)!;
          const nextSet = new Set(inner.gainedPlayers);
          nextSet.add(pId);
          return {
            bank: { ...inner.bank, [res]: inner.bank[res] - amt },
            players: updatePlayerById(inner.players, pId, (pl) => ({
              ...pl,
              resources: addResourcesPure(pl.resources, { [res]: amt }),
            })),
            summaryParts: [...inner.summaryParts, `${p.name} +${amt} ${res}`],
            gainedPlayers: nextSet,
          };
        }, acc);
      }

      if (demandingPlayerIds.length === 1 && acc.bank[res] > 0) {
        const pId = demandingPlayerIds[0]!;
        const p = acc.players.find((pl) => pl.id === pId)!;
        const amt = acc.bank[res];
        const nextSet = new Set(acc.gainedPlayers);
        nextSet.add(pId);
        return {
          bank: { ...acc.bank, [res]: 0 },
          players: updatePlayerById(acc.players, pId, (pl) => ({
            ...pl,
            resources: addResourcesPure(pl.resources, { [res]: amt }),
          })),
          summaryParts: [
            ...acc.summaryParts,
            `${p.name} +${amt} ${res} (partial bank)`,
          ],
          gainedPlayers: nextSet,
        };
      }

      return acc;
    },
    {
      bank: state.bank,
      players: state.players,
      summaryParts: [],
      gainedPlayers: new Set<string>(),
    }
  );

  const commodityDistribution = state.config.enableCitiesAndKnights
    ? COMMODITIES.reduce<{
        commodityBank: CommodityMap;
        players: CatanPlayerState[];
        summaryParts: string[];
        gainedPlayers: ReadonlySet<string>;
      }>(
        (acc, comm) => {
          const playerDemands = demands.owedByCommodity[comm];
          const demandingPlayerIds = Object.keys(playerDemands);
          if (demandingPlayerIds.length === 0) return acc;

          const totalDemand = Object.values(playerDemands).reduce<number>(
            (a, b) => a + b,
            0
          );
          if (acc.commodityBank[comm] >= totalDemand) {
            return Object.entries(playerDemands).reduce(
              (inner, [pId, amt]) => {
                const p = inner.players.find((pl) => pl.id === pId)!;
                const nextSet = new Set(inner.gainedPlayers);
                nextSet.add(pId);
                return {
                  commodityBank: {
                    ...inner.commodityBank,
                    [comm]: inner.commodityBank[comm] - amt,
                  },
                  players: updatePlayerById(inner.players, pId, (pl) => ({
                    ...pl,
                    commodities: addCommoditiesPure(pl.commodities, {
                      [comm]: amt,
                    }),
                  })),
                  summaryParts: [
                    ...inner.summaryParts,
                    `${p.name} +${amt} ${comm}`,
                  ],
                  gainedPlayers: nextSet,
                };
              },
              acc
            );
          }

          if (demandingPlayerIds.length === 1 && acc.commodityBank[comm] > 0) {
            const pId = demandingPlayerIds[0]!;
            const p = acc.players.find((pl) => pl.id === pId)!;
            const amt = acc.commodityBank[comm];
            const nextSet = new Set(acc.gainedPlayers);
            nextSet.add(pId);
            return {
              commodityBank: { ...acc.commodityBank, [comm]: 0 },
              players: updatePlayerById(acc.players, pId, (pl) => ({
                ...pl,
                commodities: addCommoditiesPure(pl.commodities, {
                  [comm]: amt,
                }),
              })),
              summaryParts: [
                ...acc.summaryParts,
                `${p.name} +${amt} ${comm} (partial bank)`,
              ],
              gainedPlayers: nextSet,
            };
          }

          return acc;
        },
        {
          commodityBank: state.commodityBank,
          players: resourceDistribution.players,
          summaryParts: resourceDistribution.summaryParts,
          gainedPlayers: resourceDistribution.gainedPlayers,
        }
      )
    : {
        commodityBank: state.commodityBank,
        players: resourceDistribution.players,
        summaryParts: resourceDistribution.summaryParts,
        gainedPlayers: resourceDistribution.gainedPlayers,
      };

  const totalBankRemaining = totalResourceCount(resourceDistribution.bank);
  const goldDistribution =
    totalBankRemaining > 0
      ? Object.entries(demands.goldOwed).reduce<{
          pendingGoldPicks: Record<string, number>;
          summaryParts: string[];
          gainedPlayers: ReadonlySet<string>;
        }>(
          (acc, [pId, count]) => {
            if (count <= 0) return acc;
            const p = commodityDistribution.players.find((pl) => pl.id === pId)!;
            const nextSet = new Set(acc.gainedPlayers);
            nextSet.add(pId);
            return {
              pendingGoldPicks: { ...acc.pendingGoldPicks, [pId]: count },
              summaryParts: [
                ...acc.summaryParts,
                `${p.name} +${count} Gold pick(s)`,
              ],
              gainedPlayers: nextSet,
            };
          },
          {
            pendingGoldPicks: state.pendingGoldPicks,
            summaryParts: commodityDistribution.summaryParts,
            gainedPlayers: commodityDistribution.gainedPlayers,
          }
        )
      : {
          pendingGoldPicks: state.pendingGoldPicks,
          summaryParts: commodityDistribution.summaryParts,
          gainedPlayers: commodityDistribution.gainedPlayers,
        };

  // Science Level 3+ Aqueduct: if dice != 7 and player received 0 resources/commodities/gold, pick 1 free resource
  const aqueductDistribution =
    state.config.enableCitiesAndKnights && totalBankRemaining > 0
      ? commodityDistribution.players.reduce<{
          pendingGoldPicks: Record<string, number>;
          summaryParts: string[];
        }>(
          (acc, p) => {
            if (
              p.cityImprovements.science >= 3 &&
              !goldDistribution.gainedPlayers.has(p.id)
            ) {
              return {
                pendingGoldPicks: {
                  ...acc.pendingGoldPicks,
                  [p.id]: (acc.pendingGoldPicks[p.id] ?? 0) + 1,
                },
                summaryParts: [
                  ...acc.summaryParts,
                  `${p.name} +1 Aqueduct pick`,
                ],
              };
            }
            return acc;
          },
          {
            pendingGoldPicks: goldDistribution.pendingGoldPicks,
            summaryParts: goldDistribution.summaryParts,
          }
        )
      : {
          pendingGoldPicks: goldDistribution.pendingGoldPicks,
          summaryParts: goldDistribution.summaryParts,
        };

  const nextState: CatanState = {
    ...state,
    bank: resourceDistribution.bank,
    commodityBank: commodityDistribution.commodityBank,
    players: commodityDistribution.players,
    pendingGoldPicks: aqueductDistribution.pendingGoldPicks,
  };

  if (aqueductDistribution.summaryParts.length === 0) {
    return { state: nextState, emitted: emitted.slice() };
  }

  return appendCatanEvent(
    nextState,
    emitted,
    "RESOURCES_PRODUCED",
    `Production: ${aqueductDistribution.summaryParts.join(", ")}.`
  );
}
