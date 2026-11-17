import type { GameEvent } from "@gaming-platform/core";
import {
  canPlayerUpgradeDiscipline,
  getEffectiveCityCost,
} from "../cities-and-knights/improvements.ts";
import {
  getLegalActivateKnightVertices,
  getLegalBuildKnightVertices,
  getLegalPromoteKnightVertices,
} from "../cities-and-knights/knights.ts";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import type { CatanAction } from "../types/actions.ts";
import { IMPROVEMENT_DISCIPLINES } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { checkAndAssignWinnerPure } from "./awards-and-vp.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  assertCanBuildInCurrentPhase,
  hasResources,
  subtractResourcesPure,
  updatePlayerById,
} from "./helpers.ts";
import {
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
  recordIslandSettlementPure,
} from "./network.ts";

export function getBuildActionsPure(
  state: CatanState,
  player: CatanPlayerState
): CatanAction[] {
  const settlementActions: CatanAction[] =
    player.settlementsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.settlement)
      ? getLegalSettlementVertices(state, player.id, false).map((vertexId) => ({
          type: "BUILD_SETTLEMENT",
          vertexId,
        }))
      : [];

  const cityCost = getEffectiveCityCost(player);
  const hasBorrowedCitySettlement = Object.values(state.buildings).some(
    (b) =>
      b.ownerId === player.id && b.type === "settlement" && b.borrowedCityPiece
  );
  const cityActions: CatanAction[] =
    (player.citiesRemaining > 0 || hasBorrowedCitySettlement) &&
    hasResources(player.resources, cityCost)
      ? Object.entries(state.buildings)
          .filter(([, b]) => b.ownerId === player.id && b.type === "settlement")
          .map(([vertexId]) => ({ type: "BUILD_CITY", vertexId }))
      : [];

  const cityWallActions: CatanAction[] =
    state.config.enableCityWalls &&
    player.cityWallsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.cityWall)
      ? Object.entries(state.buildings)
          .filter(
            ([, b]) => b.ownerId === player.id && b.type === "city" && !b.hasWall
          )
          .map(([vertexId]) => ({ type: "BUILD_CITY_WALL", vertexId }))
      : [];

  const devCardActions: CatanAction[] =
    !state.config.enableCitiesAndKnights &&
    state.devCardDeck.length > 0 &&
    hasResources(player.resources, BUILDING_COSTS.devCard)
      ? [{ type: "BUY_DEV_CARD" }]
      : [];

  const roadActions: CatanAction[] =
    player.roadsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.road)
      ? getLegalRoadEdges(state, player.id, null).map((edgeId) => ({
          type: "BUILD_ROAD",
          edgeId,
        }))
      : [];

  const shipActions: CatanAction[] =
    state.config.enableSeafarers &&
    player.shipsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.ship)
      ? getLegalShipEdges(state, player.id, null).map((edgeId) => ({
          type: "BUILD_SHIP",
          edgeId,
        }))
      : [];

  const ckBuildActions: CatanAction[] = state.config.enableCitiesAndKnights
    ? (() => {
        const upgradeActions: CatanAction[] = IMPROVEMENT_DISCIPLINES.flatMap(
          (discipline): CatanAction[] => {
            const check = canPlayerUpgradeDiscipline(state, player, discipline);
            if (!check.allowed) return [];
            if (check.claimsMetropolis) {
              return check.eligibleMetropolisVertices.map(
                (metropolisVertexId) => ({
                  type: "UPGRADE_CITY_IMPROVEMENT" as const,
                  discipline,
                  metropolisVertexId,
                })
              );
            }
            return [{ type: "UPGRADE_CITY_IMPROVEMENT" as const, discipline }];
          }
        );

        const buildKnightActions: CatanAction[] = hasResources(
          player.resources,
          BUILDING_COSTS.knight
        )
          ? getLegalBuildKnightVertices(state, player.id).map((vertexId) => ({
              type: "BUILD_KNIGHT" as const,
              vertexId,
            }))
          : [];

        const promoteKnightActions: CatanAction[] = hasResources(
          player.resources,
          BUILDING_COSTS.knight
        )
          ? getLegalPromoteKnightVertices(state, player.id, false).map(
              (vertexId) => ({
                type: "PROMOTE_KNIGHT" as const,
                vertexId,
              })
            )
          : [];

        const activateKnightActions: CatanAction[] = hasResources(
          player.resources,
          BUILDING_COSTS.activateKnight
        )
          ? getLegalActivateKnightVertices(state, player.id).map((vertexId) => ({
              type: "ACTIVATE_KNIGHT" as const,
              vertexId,
            }))
          : [];

        return [
          ...upgradeActions,
          ...buildKnightActions,
          ...promoteKnightActions,
          ...activateKnightActions,
        ];
      })()
    : [];

  return [
    ...settlementActions,
    ...cityActions,
    ...cityWallActions,
    ...devCardActions,
    ...roadActions,
    ...shipActions,
    ...ckBuildActions,
  ];
}

export function applyBuildSettlementPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_SETTLEMENT" }>
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  if (!hasResources(player.resources, BUILDING_COSTS.settlement)) {
    throw new Error("Insufficient resources for settlement");
  }
  const legal = getLegalSettlementVertices(currentState, playerId, false);
  if (!legal.includes(action.vertexId)) {
    throw new Error(`Illegal settlement vertex ${action.vertexId}`);
  }

  const builtState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.settlement),
    buildings: {
      ...currentState.buildings,
      [action.vertexId]: {
        ownerId: playerId,
        type: "settlement",
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(p.resources, BUILDING_COSTS.settlement),
      settlementsRemaining: p.settlementsRemaining - 1,
    })),
  };

  const islandRecorded = recordIslandSettlementPure(
    builtState,
    action.vertexId,
    playerId,
    false,
    []
  );
  const logged = appendCatanEvent(
    islandRecorded.state,
    islandRecorded.emitted,
    "SETTLEMENT_BUILT",
    `${player.name} built a settlement.`,
    playerId,
    { vertexId: action.vertexId }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyBuildCityPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_CITY" }>
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  const existing = currentState.buildings[action.vertexId];
  if (!existing || existing.ownerId !== playerId || existing.type !== "settlement") {
    throw new Error("Can only upgrade your own settlement to a city");
  }
  const otherBorrowedVId =
    Object.entries(currentState.buildings).find(
      ([vId, b]) =>
        vId !== action.vertexId &&
        b.ownerId === playerId &&
        b.type === "settlement" &&
        b.borrowedCityPiece
    )?.[0] ?? null;
  const usesBorrowedPiece = Boolean(
    existing.borrowedCityPiece || otherBorrowedVId !== null
  );
  if (!usesBorrowedPiece && player.citiesRemaining <= 0) {
    throw new Error("No cities remaining");
  }

  const cityCost = getEffectiveCityCost(player);
  if (!hasResources(player.resources, cityCost)) {
    throw new Error("Insufficient resources for city");
  }

  const upgradedVertexBuilding = {
    ownerId: existing.ownerId,
    type: "city" as const,
    ...(existing.hasWall ? { hasWall: true } : {}),
    ...(existing.metropolis ? { metropolis: existing.metropolis } : {}),
  };
  const nextBuildings: CatanState["buildings"] = {
    ...currentState.buildings,
    [action.vertexId]: upgradedVertexBuilding,
    ...(!existing.borrowedCityPiece && otherBorrowedVId !== null
      ? {
          [otherBorrowedVId]: {
            ownerId: playerId,
            type: "settlement" as const,
          },
        }
      : {}),
  };

  const upgradedState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, cityCost),
    buildings: nextBuildings,
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(p.resources, cityCost),
      activeTurnDiscounts: {
        ...p.activeTurnDiscounts,
        medicine: false,
      },
      citiesRemaining: usesBorrowedPiece
        ? p.citiesRemaining
        : p.citiesRemaining - 1,
      settlementsRemaining: usesBorrowedPiece
        ? p.settlementsRemaining
        : p.settlementsRemaining + 1,
    })),
  };

  const logged = appendCatanEvent(
    upgradedState,
    [],
    "CITY_BUILT",
    `${player.name} upgraded a settlement to a city!`,
    playerId,
    { vertexId: action.vertexId }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyBuildCityWallPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_CITY_WALL" }>
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  if (!currentState.config.enableCityWalls || player.cityWallsRemaining <= 0) {
    throw new Error("City walls unavailable");
  }
  if (!hasResources(player.resources, BUILDING_COSTS.cityWall)) {
    throw new Error("Insufficient resources for city wall");
  }
  const existing = currentState.buildings[action.vertexId];
  if (
    !existing ||
    existing.ownerId !== playerId ||
    existing.type !== "city" ||
    existing.hasWall
  ) {
    throw new Error("Must build a city wall under an unwalled city you own");
  }

  const walledState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.cityWall),
    buildings: {
      ...currentState.buildings,
      [action.vertexId]: {
        ...existing,
        hasWall: true,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(p.resources, BUILDING_COSTS.cityWall),
      cityWallsRemaining: p.cityWallsRemaining - 1,
    })),
  };

  const logged = appendCatanEvent(
    walledState,
    [],
    "CITY_WALL_BUILT",
    `${player.name} fortified a city with City Walls (+2 safe hand limit).`,
    playerId,
    { vertexId: action.vertexId }
  );
  return { state: logged.state, events: logged.emitted };
}
