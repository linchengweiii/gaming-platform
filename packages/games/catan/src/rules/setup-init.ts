import {
  type PlayerDescriptor,
  createRngState,
  nextIntPure,
} from "@gaming-platform/core";
import { generateCatanBoardPure } from "../board/generator.ts";
import {
  createDevCardDeckPure,
  isExpanded56Scenario,
} from "../board/helpers.ts";
import {
  createProgressDecksPure,
  emptyCityImprovements,
  emptyCommodities,
  emptyMetropolises,
  emptyTurnDiscounts,
} from "../cities-and-knights/helpers.ts";
import {
  BANK_LIMITS,
  DEFAULT_MAX_TURNS,
  DEFAULT_PIECE_LIMITS,
  PLAYER_COLORS,
} from "../config/costs-and-limits.ts";
import { SCENARIO_CATALOG } from "../config/scenarios-config.ts";
import type { CatanConfig } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { emptyResources } from "./helpers.ts";

export function resolveDefaultConfig(
  playerCount: number,
  partial?: Partial<CatanConfig>
): CatanConfig {
  const defaultScenario =
    partial?.scenarioId ?? (playerCount >= 5 ? "big_island_5_6" : "standard");
  const descriptor =
    SCENARIO_CATALOG[defaultScenario] ?? SCENARIO_CATALOG.standard;

  const enable56PlayerExtension = Boolean(
    partial?.enable56PlayerExtension ??
      (playerCount >= 5 || isExpanded56Scenario(defaultScenario))
  );

  const enableCitiesAndKnights = Boolean(
    partial?.enableCitiesAndKnights ?? descriptor.enableCitiesAndKnights ?? false
  );
  const ckTargetBonus =
    enableCitiesAndKnights && !descriptor.enableCitiesAndKnights
      ? descriptor.enableSeafarers
        ? 2
        : 3
      : 0;

  const targetVp =
    partial?.targetVictoryPoints ??
    descriptor.defaultTargetVp +
      ckTargetBonus +
      (partial?.enableHarbormaster ? 1 : 0);

  return {
    scenarioId: defaultScenario,
    targetVictoryPoints: targetVp,
    balancedNumbers: partial?.balancedNumbers ?? true,
    enable56PlayerExtension,
    enableSpecialBuildingPhase:
      partial?.enableSpecialBuildingPhase ??
      (enable56PlayerExtension || descriptor.enableSpecialBuildingPhase),
    enableSeafarers: partial?.enableSeafarers ?? descriptor.enableSeafarers,
    enableCitiesAndKnights,
    enableHarbormaster: partial?.enableHarbormaster ?? false,
    enableCityWalls: partial?.enableCityWalls ?? enableCitiesAndKnights,
    enableFriendlyRobber: partial?.enableFriendlyRobber ?? false,
    startingPlayerIndex: partial?.startingPlayerIndex,
    randomizeStartingPlayer: partial?.randomizeStartingPlayer,
    maxTurns: partial?.maxTurns ?? DEFAULT_MAX_TURNS,
  };
}

/**
 * Initializes a new Catan game state purely from `playerDescriptors`, `partialConfig`, and `seed`.
 */
export function initCatanGame(
  playerDescriptors: readonly PlayerDescriptor[],
  partialConfig?: Partial<CatanConfig>,
  seed: number | string = Date.now()
): CatanState {
  if (playerDescriptors.length < 2 || playerDescriptors.length > 6) {
    throw new Error("Catan requires between 2 and 6 players");
  }

  const config = resolveDefaultConfig(playerDescriptors.length, partialConfig);
  const rng0 = createRngState(seed);
  const [board, rng1] = generateCatanBoardPure(config, rng0);
  const isExpanded =
    playerDescriptors.length >= 5 ||
    Boolean(config.enable56PlayerExtension) ||
    isExpanded56Scenario(config.scenarioId);
  const bankPerResource = isExpanded
    ? BANK_LIMITS.expandedPerResource
    : BANK_LIMITS.standardPerResource;
  const bankPerCommodity = config.enableCitiesAndKnights
    ? isExpanded
      ? BANK_LIMITS.expandedPerCommodity
      : BANK_LIMITS.standardPerCommodity
    : 0;

  const players: CatanPlayerState[] = playerDescriptors.map((p, idx) => ({
    id: p.id,
    name: p.name,
    color: p.color || PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
    isBot: Boolean(p.isBot),
    botDifficulty: p.botDifficulty ?? "smart",
    resources: emptyResources(),
    commodities: emptyCommodities(),
    devCards: [],
    progressCards: [],
    publicProgressVpCards: [],
    cityImprovements: emptyCityImprovements(),
    defenderPoints: 0,
    basicKnightsRemaining: config.enableCitiesAndKnights
      ? DEFAULT_PIECE_LIMITS.basicKnights
      : 0,
    strongKnightsRemaining: config.enableCitiesAndKnights
      ? DEFAULT_PIECE_LIMITS.strongKnights
      : 0,
    mightyKnightsRemaining: config.enableCitiesAndKnights
      ? DEFAULT_PIECE_LIMITS.mightyKnights
      : 0,
    activeTurnDiscounts: emptyTurnDiscounts(),
    knightsPlayed: 0,
    roadsRemaining: DEFAULT_PIECE_LIMITS.roads,
    shipsRemaining: config.enableSeafarers ? DEFAULT_PIECE_LIMITS.ships : 0,
    settlementsRemaining: DEFAULT_PIECE_LIMITS.settlements,
    citiesRemaining: DEFAULT_PIECE_LIMITS.cities,
    cityWallsRemaining: config.enableCityWalls
      ? DEFAULT_PIECE_LIMITS.cityWalls
      : 0,
    longestRoadLength: 0,
    harborPoints: 0,
    bonusVictoryPoints: 0,
    settledIslandIds: [],
    homeIslandIds: [],
    hasPlayedDevCardThisTurn: false,
    hasMovedShipThisTurn: false,
  }));

  const [devCardDeck, rng2] = createDevCardDeckPure(isExpanded, rng1);
  const [startingPlayerIndex, rng3] =
    typeof config.startingPlayerIndex === "number" &&
    Number.isFinite(config.startingPlayerIndex)
      ? [
          ((Math.trunc(config.startingPlayerIndex) % players.length) +
            players.length) %
            players.length,
          rng2,
        ]
      : config.randomizeStartingPlayer
        ? nextIntPure(rng2, 0, players.length - 1)
        : [0, rng2];

  const [progressDecks, rng4] = config.enableCitiesAndKnights
    ? createProgressDecksPure(rng3)
    : [{ trade: [], politics: [], science: [] }, rng3];

  const scenarioTitle =
    config.enableCitiesAndKnights &&
    !SCENARIO_CATALOG[config.scenarioId].enableCitiesAndKnights
      ? `${SCENARIO_CATALOG[config.scenarioId].name} + Cities & Knights`
      : SCENARIO_CATALOG[config.scenarioId].name;

  return {
    gameId: "catan",
    config,
    rngState: rng4,
    turn: 1,
    phase: "SETUP_SETTLEMENT_1",
    phaseAfterRobber: "MAIN_PHASE",
    phaseAfterDiscard: "MOVE_ROBBER_OR_PIRATE",
    startingPlayerIndex,
    activePlayerIndex: startingPlayerIndex,
    specialBuildPlayerIndex: null,
    lastSetupSettlementVertexId: null,
    players,
    bank: {
      brick: bankPerResource,
      lumber: bankPerResource,
      wool: bankPerResource,
      grain: bankPerResource,
      ore: bankPerResource,
    },
    commodityBank: {
      paper: bankPerCommodity,
      cloth: bankPerCommodity,
      coin: bankPerCommodity,
    },
    devCardDeck: config.enableCitiesAndKnights ? [] : devCardDeck,
    progressDecks,
    topology: board.topology,
    hexes: board.hexes,
    harbors: board.harbors,
    buildings: {},
    edges: {},
    knights: {},
    metropolises: emptyMetropolises(),
    barbarianPosition: 0,
    barbarianAttacksCount: 0,
    merchantHexId: null,
    merchantOwnerId: null,
    robberHexId: board.robberHexId,
    pirateHexId: board.pirateHexId,
    fogPool: board.fogPool,
    lastRoll: null,
    pendingRollResolution: null,
    pendingPillageSelections: [],
    pendingDefenderDeckPicks: [],
    pendingProgressDiscards: [],
    pendingDiscards: {},
    pendingGoldPicks: {},
    stealCandidates: [],
    freeRoadsRemaining: 0,
    pendingCkInteraction: null,
    activeTradeOffer: null,
    longestRoadOwnerId: null,
    longestRoadLength: 0,
    largestArmyOwnerId: null,
    largestArmySize: 0,
    harbormasterOwnerId: null,
    harbormasterPoints: 0,
    winnerId: null,
    eventLog: [
      {
        id: "evt-0",
        timestamp: 0,
        turn: 1,
        type: "GAME_STARTED",
        message: `Started ${scenarioTitle} with ${players.length} players (${players[startingPlayerIndex]!.name} goes first · Target: ${config.targetVictoryPoints} VP).`,
      },
    ],
  };
}
