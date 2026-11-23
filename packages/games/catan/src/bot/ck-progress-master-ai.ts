import { getPlayerGoodCount } from "../cities-and-knights/helpers.ts";
import { TERRAIN_TO_COMMODITY } from "../config/cities-knights-config.ts";
import {
  NUMBER_TOKEN_PIPS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import { getPlayerResourceCount } from "../rules/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  COMMODITIES,
  type ImprovementDiscipline,
  type ProgressCardType,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { getOpponentProgressCardCountFair } from "./utils.ts";

export function scoreMasterMainProgressCard(
  state: CatanState,
  player: CatanPlayerState,
  act: Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }>,
  cType: ProgressCardType,
  opponents: readonly CatanPlayerState[],
  maxResBank: number,
  maxCommBank: number,
  ratios: Record<TradeGoodType, number>,
  myVisibleVp: number,
  hasCitySlotForDiscipline: (d: ImprovementDiscipline) => boolean
): number {
  const playerId = player.id;
  let s = -1;

  switch (cType) {
    case "irrigation": {
      const fieldsSpots = Object.entries(state.buildings).filter(
        ([vId, b]) =>
          b.ownerId === playerId &&
          (state.topology.vertices[vId]?.adjacentHexIds ?? []).some(
            (h) => state.hexes[h]?.terrain === "fields"
          )
      ).length;
      if (fieldsSpots > 0) s = 22 + fieldsSpots * 14;
      break;
    }
    case "mining": {
      const mtnSpots = Object.entries(state.buildings).filter(
        ([vId, b]) =>
          b.ownerId === playerId &&
          (state.topology.vertices[vId]?.adjacentHexIds ?? []).some(
            (h) => state.hexes[h]?.terrain === "mountains"
          )
      ).length;
      if (mtnSpots > 0) s = 24 + mtnSpots * 15;
      break;
    }
    case "road_building":
      s = 36;
      break;
    case "resource_monopoly": {
      const res = act.params?.resource;
      if (res) {
        const oppHeld = Math.max(
          0,
          maxResBank - state.bank[res] - player.resources[res]
        );
        const estGain = Math.min(oppHeld, opponents.length * 2) * 0.72;
        const resWeight = res === "ore" || res === "grain" ? 1.35 : 1.05;
        if (oppHeld >= 3) {
          s = 16 + estGain * 8.5 * resWeight;
        }
      }
      break;
    }
    case "trade_monopoly": {
      const comm = act.params?.commodity;
      if (comm) {
        const oppHeld = Math.max(
          0,
          maxCommBank -
            state.commodityBank[comm] -
            player.commodities[comm]
        );
        const disc: ImprovementDiscipline =
          comm === "paper"
            ? "science"
            : comm === "coin"
              ? "politics"
              : "trade";
        const nextLv = player.cityImprovements[disc] + 1;
        const completesUpgrade =
          hasCitySlotForDiscipline(disc) &&
          player.commodities[comm] < nextLv &&
          player.commodities[comm] + Math.min(oppHeld, opponents.length) >=
            nextLv;
        if (oppHeld >= 1) {
          s =
            18 +
            Math.min(oppHeld, opponents.length) * 13 +
            (completesUpgrade ? 24 : 0) +
            (comm === "paper" ? 6 : 0);
        }
      }
      break;
    }
    case "commercial_harbor": {
      const totalOppComms = COMMODITIES.reduce(
        (sum, c) =>
          sum +
          Math.max(
            0,
            maxCommBank - state.commodityBank[c] - player.commodities[c]
          ),
        0
      );
      if (totalOppComms >= 2) {
        const spareRes =
          player.resources.brick +
          player.resources.lumber +
          player.resources.wool;
        s = 20 + Math.min(3, totalOppComms) * 7 + Math.min(4, spareRes);
      }
      break;
    }
    case "merchant_fleet": {
      const g = act.params?.good;
      if (g && ratios[g] > 2) {
        const count = getPlayerGoodCount(player, g);
        if (count >= 4) s = 38 + (count >> 1) * 5;
        else if (count >= 2) s = 24;
      }
      break;
    }
    case "merchant": {
      const hId = act.params?.hexId;
      if (hId) {
        const h = state.hexes[hId];
        const res = h ? TERRAIN_TO_RESOURCE[h.terrain] : null;
        const pips = h?.numberToken
          ? NUMBER_TOKEN_PIPS[h.numberToken] ?? 0
          : 0;
        const held = res ? player.resources[res] : 0;
        s =
          (state.merchantOwnerId === playerId ? 15 : 34) +
          pips * 1.8 +
          held * 3.5;
      }
      break;
    }
    case "master_merchant": {
      const tId = act.params?.targetPlayerId;
      const opp = opponents.find((o) => o.id === tId);
      if (opp) {
        const oppCards = getPlayerResourceCount(opp);
        const oppCities = Object.values(state.buildings).filter(
          (b) => b.ownerId === opp.id && b.type === "city"
        ).length;
        if (oppCards >= 2) {
          s =
            22 +
            Math.min(2, oppCards) * 10 +
            Math.min(4, oppCards) * 2 +
            oppCities * 2.5;
        }
      }
      break;
    }
    case "spy": {
      const tId = act.params?.targetPlayerId;
      const opp = opponents.find((o) => o.id === tId);
      if (opp) {
        const pCount = getOpponentProgressCardCountFair(opp);
        const oppVp = computePlayerVictoryPoints(state, opp.id, true);
        if (pCount >= 1) {
          s = 25 + pCount * 5 + oppVp * 1.5;
        }
      }
      break;
    }
    case "deserter": {
      const tId = act.params?.targetPlayerId;
      const opp = opponents.find((o) => o.id === tId);
      if (opp) {
        const oppKnights = Object.values(state.knights).filter(
          (k) => k.ownerId === opp.id
        );
        if (oppKnights.length > 0) {
          const minOppLevel = Math.min(...oppKnights.map((k) => k.level));
          const anyActive = oppKnights.some((k) => k.active);
          const oppVp = computePlayerVictoryPoints(state, opp.id, true);
          s = 30 + minOppLevel * 12 + (anyActive ? 6 : 0) + oppVp * 1.2;
        }
      }
      break;
    }
    case "saboteur": {
      const richOpps = opponents.filter(
        (o) =>
          computePlayerVictoryPoints(state, o.id, true) >= myVisibleVp &&
          getPlayerResourceCount(o) >= 4
      ).length;
      if (richOpps >= 1) s = 20 + richOpps * 11;
      break;
    }
    case "wedding": {
      const aheadWithCards = opponents.filter(
        (o) =>
          computePlayerVictoryPoints(state, o.id, true) > myVisibleVp &&
          getPlayerResourceCount(o) >= 2
      ).length;
      if (aheadWithCards >= 1) s = 22 + aheadWithCards * 12;
      break;
    }
    case "bishop": {
      const hId = act.params?.hexId;
      if (hId) {
        const h = state.hexes[hId];
        const pips = h?.numberToken
          ? NUMBER_TOKEN_PIPS[h.numberToken] ?? 0
          : 0;
        const verts = state.topology.hexes[hId]?.cornerVertexIds ?? [];
        const selfTouch = verts.some(
          (v) => state.buildings[v]?.ownerId === playerId
        );
        if (!selfTouch) {
          const oppCardOwners: Record<string, true> = {};
          let oppOwnerCount = 0;
          let blockedOppPips = 0;
          for (const v of verts) {
            const b = state.buildings[v];
            if (b && b.ownerId !== playerId) {
              const o = state.players.find((p) => p.id === b.ownerId)!;
              if (getPlayerResourceCount(o) > 0 && !oppCardOwners[o.id]) {
                oppCardOwners[o.id] = true;
                oppOwnerCount += 1;
              }
              blockedOppPips += pips * (b.type === "city" ? 2 : 1);
            }
          }
          s = 18 + oppOwnerCount * 11 + blockedOppPips * 1.4;
        }
      }
      break;
    }
    case "inventor": {
      const h1Id = act.params?.hexId1;
      const h2Id = act.params?.hexId2;
      if (h1Id && h2Id) {
        const h1 = state.hexes[h1Id];
        const h2 = state.hexes[h2Id];
        const p1Pips = h1?.numberToken
          ? NUMBER_TOKEN_PIPS[h1.numberToken] ?? 0
          : 0;
        const p2Pips = h2?.numberToken
          ? NUMBER_TOKEN_PIPS[h2.numberToken] ?? 0
          : 0;
        const pipDeltaForH1 = p2Pips - p1Pips;
        if (pipDeltaForH1 !== 0) {
          const netWeightOnHex = (hexId: string): number => {
            const hex = state.hexes[hexId]!;
            const commMult =
              TERRAIN_TO_COMMODITY[hex.terrain] === "paper"
                ? 1.45
                : TERRAIN_TO_COMMODITY[hex.terrain]
                  ? 1.2
                  : 1.0;
            let w = 0;
            for (const v of state.topology.hexes[hexId]?.cornerVertexIds ??
              []) {
              const b = state.buildings[v];
              if (!b) continue;
              const bVal = b.type === "city" ? 2.2 * commMult : 1.0;
              if (b.ownerId === playerId) w += bVal;
              else w -= bVal * 0.75;
            }
            return w;
          };
          const netGain =
            pipDeltaForH1 * (netWeightOnHex(h1Id) - netWeightOnHex(h2Id));
          if (netGain >= 3.0) {
            s = 18 + netGain * 4.5;
          }
        }
      }
      break;
    }
    case "diplomat": {
      const eId = act.params?.edgeId;
      if (
        eId &&
        state.edges[eId]?.ownerId &&
        state.edges[eId]!.ownerId !== playerId
      ) {
        const oppId = state.edges[eId]!.ownerId;
        const oppVp = computePlayerVictoryPoints(state, oppId, true);
        s =
          20 +
          oppVp * 1.2 +
          (state.longestRoadOwnerId === oppId ? 12 : 0);
      }
      break;
    }
    case "intrigue": {
      const vId = act.params?.vertexId;
      if (vId && state.knights[vId]) {
        const k = state.knights[vId]!;
        s = 22 + k.level * 8 + (k.active ? 5 : 0);
      }
      break;
    }
    default:
      s = -1;
  }

  if (player.progressCards.length >= 4 && s >= 10) s += 8;
  return s;
}
