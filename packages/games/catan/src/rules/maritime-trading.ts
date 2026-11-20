import type { GameEvent } from "@gaming-platform/core";
import {
  addCommoditiesPure,
  emptyCommodities,
  emptyTradeGoodMap,
  getBankGoodCount,
  getPlayerGoodCount,
  isCommodityType,
  subtractCommoditiesPure,
} from "../cities-and-knights/helpers.ts";
import { getPlayerGoodTradeRatios } from "../cities-and-knights/improvements.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  COMMODITIES,
  type CommodityMap,
  RESOURCES,
  type ResourceMap,
  TRADE_GOODS,
  type TradeGoodMap,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  emptyResources,
  subtractResourcesPure,
  updatePlayerById,
} from "./helpers.ts";

export function applyMaritimeTradePure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "MARITIME_TRADE" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Can only trade during your main phase");
  }
  if (currentState.activeTradeOffer) {
    throw new Error("Resolve the active domestic trade offer first");
  }
  const goodRatios = getPlayerGoodTradeRatios(currentState, playerId);

  const { giveBundle, receiveBundle } = (() => {
    if (action.giveMap || action.receiveMap) {
      const srcGive: Partial<TradeGoodMap> = action.giveMap ?? {
        [action.give]: action.giveAmount,
      };
      const srcRecv: Partial<TradeGoodMap> = action.receiveMap ?? {
        [action.receive]: action.receiveAmount ?? 1,
      };
      return TRADE_GOODS.reduce<{
        giveBundle: TradeGoodMap;
        receiveBundle: TradeGoodMap;
      }>(
        (acc, gType) => {
          const g = srcGive[gType] ?? 0;
          const w = srcRecv[gType] ?? 0;
          if (
            !Number.isInteger(g) ||
            g < 0 ||
            !Number.isInteger(w) ||
            w < 0
          ) {
            throw new Error(
              "Maritime trade quantities must be non-negative integers"
            );
          }
          if (
            !currentState.config.enableCitiesAndKnights &&
            isCommodityType(gType) &&
            (g > 0 || w > 0)
          ) {
            throw new Error(
              "Commodities are only available in Cities & Knights"
            );
          }
          return {
            giveBundle: { ...acc.giveBundle, [gType]: g },
            receiveBundle: { ...acc.receiveBundle, [gType]: w },
          };
        },
        { giveBundle: emptyTradeGoodMap(), receiveBundle: emptyTradeGoodMap() }
      );
    }

    const recvAmt = action.receiveAmount ?? 1;
    if (
      !Number.isInteger(action.giveAmount) ||
      action.giveAmount <= 0 ||
      !Number.isInteger(recvAmt) ||
      recvAmt <= 0
    ) {
      throw new Error("Maritime trade quantities must be positive integers");
    }
    if (
      !currentState.config.enableCitiesAndKnights &&
      (isCommodityType(action.give) || isCommodityType(action.receive))
    ) {
      throw new Error("Commodities are only available in Cities & Knights");
    }
    return {
      giveBundle: { ...emptyTradeGoodMap(), [action.give]: action.giveAmount },
      receiveBundle: { ...emptyTradeGoodMap(), [action.receive]: recvAmt },
    };
  })();

  const validated = TRADE_GOODS.reduce<{
    totalCredits: number;
    totalReceive: number;
    giveParts: string[];
    recvParts: string[];
  }>(
    (acc, gType) => {
      const g = giveBundle[gType];
      const w = receiveBundle[gType];
      if (g > 0 && w > 0) {
        throw new Error("Cannot trade a resource or commodity for itself");
      }
      const nextGive = (() => {
        if (g <= 0) {
          return { credits: acc.totalCredits, parts: acc.giveParts };
        }
        const expectedRatio = goodRatios[gType];
        if (g % expectedRatio !== 0) {
          throw new Error(
            `Expected ${gType} trade amount to be a multiple of ${expectedRatio} (${expectedRatio}:1)`
          );
        }
        if (getPlayerGoodCount(player, gType) < g) {
          throw new Error(`Not enough ${gType} for maritime trade`);
        }
        return {
          credits: acc.totalCredits + g / expectedRatio,
          parts: [...acc.giveParts, `${g} ${gType}`],
        };
      })();

      const nextRecv = (() => {
        if (w <= 0) {
          return { recv: acc.totalReceive, parts: acc.recvParts };
        }
        if (getBankGoodCount(currentState, gType) < w) {
          throw new Error(`Bank does not have ${w} ${gType}`);
        }
        return {
          recv: acc.totalReceive + w,
          parts: [...acc.recvParts, `${w} ${gType}`],
        };
      })();

      return {
        totalCredits: nextGive.credits,
        totalReceive: nextRecv.recv,
        giveParts: nextGive.parts,
        recvParts: nextRecv.parts,
      };
    },
    { totalCredits: 0, totalReceive: 0, giveParts: [], recvParts: [] }
  );

  if (
    validated.totalCredits <= 0 ||
    validated.totalCredits !== validated.totalReceive
  ) {
    throw new Error(
      `Maritime trade mismatch: ${validated.totalCredits} port trade(s) offered for ${validated.totalReceive} bank card(s)`
    );
  }

  const giveResDelta = RESOURCES.reduce<ResourceMap>(
    (acc, r) => ({ ...acc, [r]: giveBundle[r] }),
    emptyResources()
  );
  const recvResDelta = RESOURCES.reduce<ResourceMap>(
    (acc, r) => ({ ...acc, [r]: receiveBundle[r] }),
    emptyResources()
  );
  const giveCommDelta = COMMODITIES.reduce<CommodityMap>(
    (acc, c) => ({ ...acc, [c]: giveBundle[c] }),
    emptyCommodities()
  );
  const recvCommDelta = COMMODITIES.reduce<CommodityMap>(
    (acc, c) => ({ ...acc, [c]: receiveBundle[c] }),
    emptyCommodities()
  );

  const tradedState: CatanState = {
    ...currentState,
    bank: subtractResourcesPure(
      addResourcesPure(currentState.bank, giveResDelta),
      recvResDelta
    ),
    commodityBank: subtractCommoditiesPure(
      addCommoditiesPure(currentState.commodityBank, giveCommDelta),
      recvCommDelta
    ),
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: addResourcesPure(
        subtractResourcesPure(p.resources, giveResDelta),
        recvResDelta
      ),
      commodities: addCommoditiesPure(
        subtractCommoditiesPure(p.commodities, giveCommDelta),
        recvCommDelta
      ),
    })),
  };

  const singleGiveGood = TRADE_GOODS.filter((g) => giveBundle[g] > 0);
  const rateSuffix =
    singleGiveGood.length === 1
      ? ` (${goodRatios[singleGiveGood[0]!]}:1)`
      : "";

  const logged = appendCatanEvent(
    tradedState,
    [],
    "MARITIME_TRADE",
    `${player.name} traded ${validated.giveParts.join(" + ")} for ${validated.recvParts.join(" + ")}${rateSuffix}.`,
    playerId,
    action
  );
  return { state: logged.state, events: logged.emitted };
}
