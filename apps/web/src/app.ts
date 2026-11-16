import {
  type BotDifficulty,
  type MatchSession,
  type PlayerDescriptor,
  createMatchSession,
} from "@gaming-platform/core";
import {
  BARBARIAN_TRACK_STEPS,
  BUILDING_COSTS,
  COMMODITIES,
  type CatanAction,
  CatanEngine,
  type CatanState,
  type CommodityMap,
  type CommodityType,
  IMPROVEMENT_DISCIPLINES,
  type ImprovementDiscipline,
  PLAYER_COLORS,
  PROGRESS_CARD_CATALOG,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  SCENARIO_CATALOG,
  SELECTABLE_SCENARIO_IDS,
  type ScenarioId,
  TERRAIN_TO_COMMODITY,
  TERRAIN_TO_RESOURCE,
  TRADE_GOODS,
  type TradeGoodMap,
  type TradeGoodType,
  canPlayerUpgradeDiscipline,
  computePlayerVictoryPoints,
  emptyCommodities,
  emptyResources,
  getBarbarianStrength,
  getBankGoodCount,
  getDiplomatRemovableRoadEdges,
  getEffectiveCityCost,
  getLegalActivateKnightVertices,
  getLegalBuildKnightVertices,
  getLegalChaseRobberActions,
  getLegalMoveKnightActions,
  getLegalMoveShipActions,
  getLegalPirateHexes,
  getLegalPromoteKnightVertices,
  getLegalRoadEdges,
  getLegalRobberHexes,
  getLegalSettlementVertices,
  getLegalShipEdges,
  getNextActingPlayerId,
  getPlayerActiveKnightStrength,
  getPlayerGoodCount,
  getPlayerGoodTradeRatios,
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  getPlayerVulnerableCities,
  getTotalActiveKnightStrength,
  hasCommodities,
  hasResources,
  isCommodityType,
  isExpanded56Scenario,
  toBaseMapScenarioId,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  type GemColor,
  SplendorEngine,
  type SplendorState,
  type TokenColor,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import {
  type AzulDraftSource,
  AzulEngine,
  type AzulState,
  type AzulTargetLine,
  type AzulTileColor,
  getAzulActingPlayerId,
} from "@gaming-platform/azul";
import {
  COMMODITY_META,
  DISCIPLINE_META,
  RESOURCE_META,
  TRADE_GOOD_META,
  getBoardSpotPercentPosition,
  renderActionPieceIconSvg,
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
  renderCommodityGlyphSvg,
  renderDieSvg,
  renderEventDieSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
  renderResourceGlyphSvg,
  renderRollDiceButtonGraphicSvg,
  renderTradeGoodGlyphSvg,
} from "./catan-graphics.ts";
import {
  renderSplendorActionDock,
  renderSplendorBoardView,
  renderSplendorPlayerCard,
} from "./splendor-view.ts";
import {
  renderAzulActionDock,
  renderAzulBoardView,
  renderAzulPlayerCard,
} from "./azul-view.ts";
import {
  type SevenWondersAction,
  SevenWondersEngine,
  type SevenWondersState,
  canPlayerUnselectDraftPick,
  getSevenWondersActingPlayerId,
} from "@gaming-platform/seven-wonders";
import {
  renderSevenWondersActionDock,
  renderSevenWondersBoardView,
  renderSevenWondersPlayerCard,
} from "./seven-wonders-view.ts";
import {
  GAME_REFERENCE_GUIDES,
  TUTORIAL_LESSONS,
  TUTORIAL_SEEDS,
  chooseRecommendedTutorialActionPure,
  computeSuggestedTutorialStepIndexPure,
  renderReferenceGuideModalPure,
  renderTutorialCoachBannerPure,
} from "./tutorials.ts";

export type SupportedGameId = "catan" | "splendor" | "azul" | "seven_wonders";
export type AppViewMode = "login" | "lobby" | "room_setup" | "in_game";

export interface MultiGamePlatformAppOptions {
  startAtLogin?: boolean;
  forceLocalMode?: boolean;
  staticHostOnly?: boolean;
}

export interface GuestSession {
  readonly id: string;
  readonly name: string;
  readonly mode: "guest";
}

const GUEST_STORAGE_KEY = "ga_guest_session";
const DEVICE_GUESTS_STORAGE_KEY = "ga_device_guests";
const ACTIVE_ROOM_STORAGE_KEY = "ga_active_room_id";

export type BuildMode =
  | null
  | "road"
  | "ship"
  | "settlement"
  | "city"
  | "wall"
  | "move_ship"
  | "knight"
  | "promote_knight"
  | "activate_knight"
  | "move_knight"
  | "chase_robber"
  | "city_upgrades"
  | "progress_card"
  | "maritime_trade"
  | "domestic_trade"
  | "year_of_plenty"
  | "monopoly";

export interface BoardSpotSelection {
  readonly kind: "edge" | "vertex" | "hex";
  readonly id: string;
}

export interface ClientRoomConfig {
  scenarioId: ScenarioId;
  enable56PlayerExtension?: boolean;
  enableHarbormaster: boolean;
  enableCityWalls: boolean;
  enableFriendlyRobber: boolean;
  enableCitiesAndKnights: boolean;
  wonderSideMode?: "random" | "day" | "night";
}

export interface ClientRoom {
  roomId: string;
  name: string;
  gameId: SupportedGameId;
  isOfflineLocal: boolean;
  ownerId: string;
  ownerName: string;
  status: "lobby" | "in_progress" | "finished";
  humanPlayers: PlayerDescriptor[];
  botCount: number;
  allBots: boolean;
  botDifficulty: BotDifficulty;
  startingPlayerMode: string; // "random" | "first" | playerId
  autoStepBots: boolean;
  players: PlayerDescriptor[];
  config: ClientRoomConfig;
  seed: string;
  matchCounter: number;
  session: MatchSession<any, any, any> | null;
  remoteState: any | null;
  remoteActingPlayerId: string | null;
  canUndo: boolean;
  undoableSteps: number;
  canRedo: boolean;
  step: number;
  offlinePlayerIds?: string[];
}

export interface CreateLocalRoomOptions {
  readonly name?: string;
  readonly customRoomId?: string;
  readonly gameId: SupportedGameId;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly isOfflineLocal?: boolean;
  readonly botCount?: number;
  readonly allBots?: boolean;
  readonly botDifficulty?: BotDifficulty;
  readonly startingPlayerMode?: string;
  readonly scenarioId?: ScenarioId;
  readonly enable56PlayerExtension?: boolean;
  readonly enableHarbormaster?: boolean;
  readonly enableCityWalls?: boolean;
  readonly enableFriendlyRobber?: boolean;
  readonly enableCitiesAndKnights?: boolean;
  readonly wonderSideMode?: "random" | "day" | "night";
  readonly customSeed?: string;
  readonly autoStart?: boolean;
}

export interface AppModel {
  readonly viewMode: AppViewMode;
  readonly lobbyGameFilter: SupportedGameId;
  readonly lobbyHeroEnteredOnce: boolean;
  readonly loginHeroEnteredOnce: boolean;
  readonly useServerBackend: boolean;
  readonly staticHostOnly: boolean;
  readonly serverReachable: boolean;
  readonly isAuthenticated: boolean;
  readonly addingAdditionalGuest: boolean;
  readonly returnViewAfterAddGuest: AppViewMode;
  readonly loginDraftName: string;
  readonly loginErrorMsg: string;
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly editingGuestName: boolean;
  readonly guestRenameDraft: string;
  readonly deviceGuests: GuestSession[];
  readonly localFriendDraftName: string;
  readonly hidePassAndPlayHand: boolean;
  readonly createRoomName: string;
  readonly createRoomGameId: SupportedGameId;
  readonly createRoomMode: "online" | "offline";
  readonly pendingInviteRoomId: string | null;
  readonly copiedRoomLinkId: string | null;
  readonly rooms: Readonly<Record<string, ClientRoom>>;
  readonly roomOrder: readonly string[];
  readonly nextRoomNum: number;
  readonly activeRoomId: string;
  readonly buildMode: BuildMode;
  readonly selectedBoardSpot: BoardSpotSelection | null;
  readonly setupEdgeKind: "road" | "ship";
  readonly robberOrPirateMode: "robber" | "pirate";
  readonly selectedMoveFromEdgeId: string | null;
  readonly selectedMoveKnightFromVertexId: string | null;
  readonly selectedChaseKnightVertexId: string | null;
  readonly discardSelection: ResourceMap;
  readonly discardCommodities: CommodityMap;
  readonly tradeGiveRes: ResourceType;
  readonly tradeReceiveRes: ResourceType;
  readonly maritimeGive: ResourceMap;
  readonly maritimeWant: ResourceMap;
  readonly maritimeCommGive: CommodityMap;
  readonly maritimeCommWant: CommodityMap;
  readonly domesticGive: ResourceMap;
  readonly domesticWant: ResourceMap;
  readonly domesticCommGive: CommodityMap;
  readonly domesticCommWant: CommodityMap;
  readonly domesticTargetPlayerId: string;
  readonly selectedMetropolisVertexId: string | null;
  readonly selectedProgressCardId: string | null;
  readonly alchemistDie1: number;
  readonly alchemistDie2: number;
  readonly inventorHex1: string | null;
  readonly smithVertex1: string | null;
  readonly deserterTargetPlayerId: string | null;
  readonly yopRes1: ResourceType;
  readonly yopRes2: ResourceType;
  readonly monoRes: ResourceType;
  readonly splendorDraftGems: Partial<Record<GemColor, number>>;
  readonly azulSelectedDraft: {
    readonly source: AzulDraftSource;
    readonly color: AzulTileColor;
  } | null;
  readonly azulInspectedPlayerId: string | null;
  readonly sevenWondersSelectedCardId: string | null;
  readonly sevenWondersInspectedPlayerId: string | null;
  readonly activeTutorial: {
    readonly roomId: string;
    readonly gameId: SupportedGameId;
    readonly stepIndex: number;
    readonly maxAutoStepIndex: number;
  } | null;
  readonly guideModalGameId: SupportedGameId | null;
  readonly sidebarSettingsExpanded: boolean;
  readonly autoPlayBots: boolean;
  readonly autoRespondBotsToHuman: boolean;
  readonly autoPlaySpeedMs: number;
}

const BOT_DIFFICULTY_META: Record<
  BotDifficulty,
  { label: string; badge: string; desc: string }
> = {
  easy: {
    label: "Casual",
    badge: "Easy",
    desc: "Relaxed decisions and generous domestic trading.",
  },
  normal: {
    label: "Balanced",
    badge: "Normal",
    desc: "Steady resource production and standard port play.",
  },
  smart: {
    label: "Tactical",
    badge: "Smart",
    desc: "Scarcity tracking, harbor synergies, and counter-robber.",
  },
  master: {
    label: "Grandmaster",
    badge: "Master",
    desc: "Evolved weights, leader embargo trading, and multi-port combos.",
  },
};

const USER_PROFILES: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  readonly roleHint: string;
}> = [
  { id: "p1", name: "Player 1 (You)", roleHint: "Host seat" },
  { id: "guest-2", name: "Guest 2", roleHint: "Guest seat" },
  { id: "guest-3", name: "Guest 3", roleHint: "Guest seat" },
];

const DRAWN_ARROW_SVG = `<svg class="m-arrow" viewBox="0 0 12 12" aria-hidden="true"><path class="m-arrow__stem" d="M1 6h8"/><path class="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5"/></svg>`;

const DROPDOWN_CHEV_SVG = `<svg class="ga-dropdown__chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const DROPDOWN_CHECK_SVG = `<svg class="ga-dropdown__check" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.6 7.3L5.6 10.3L11.4 3.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

interface DropdownOption {
  value: string;
  label: string;
  meta?: string;
}

interface DropdownSpec {
  id: string;
  value: string;
  options: DropdownOption[];
  disabled?: boolean;
  size?: "md" | "sm";
  inline?: boolean;
  align?: "start" | "end";
  direction?: "down" | "up";
  title?: string;
}

export function escapeAttr(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderDropdown(spec: DropdownSpec): string {
  const selectedOpt =
    spec.options.find((o) => o.value === spec.value) ?? spec.options[0]!;
  const classes = [
    "ga-dropdown",
    spec.size === "sm" ? "ga-dropdown--sm" : "",
    spec.inline ? "ga-dropdown--inline" : "",
    spec.align === "end" ? "ga-dropdown--end" : "",
    spec.direction === "up" ? "ga-dropdown--up" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const disAttr = spec.disabled ? "disabled" : "";
  const titleAttr = spec.title ? ` title="${escapeAttr(spec.title)}"` : "";

  return `
    <div class="${classes}" data-dropdown-root="${spec.id}">
      <select id="${spec.id}" class="ga-dropdown__native" tabindex="-1" aria-hidden="true" ${disAttr}>
        ${spec.options
          .map(
            (opt) =>
              `<option value="${escapeAttr(opt.value)}" ${
                opt.value === selectedOpt.value ? "selected" : ""
              }>${escapeAttr(opt.label)}</option>`
          )
          .join("")}
      </select>
      <button
        type="button"
        id="${spec.id}-btn"
        class="ga-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="${spec.id}-menu"
        ${disAttr}${titleAttr}
      >
        <span class="ga-dropdown__label-group">
          <span class="ga-dropdown__value">${selectedOpt.label}</span>
          ${
            selectedOpt.meta
              ? `<span class="ga-dropdown__meta">${selectedOpt.meta}</span>`
              : `<span class="ga-dropdown__meta" hidden></span>`
          }
        </span>
        ${DROPDOWN_CHEV_SVG}
      </button>
      <div id="${spec.id}-menu" class="ga-dropdown__menu" role="listbox" hidden>
        ${spec.options
          .map(
            (opt) => `
          <button
            type="button"
            class="ga-dropdown__option"
            role="option"
            data-dropdown-value="${escapeAttr(opt.value)}"
            data-dropdown-label="${escapeAttr(opt.label)}"
            data-dropdown-meta="${escapeAttr(opt.meta ?? "")}"
            aria-selected="${opt.value === selectedOpt.value ? "true" : "false"}"
          >
            <span>${opt.label}</span>
            <span class="ga-dropdown__option-right">
              ${opt.meta ? `<span class="ga-dropdown__meta">${opt.meta}</span>` : ""}
              ${DROPDOWN_CHECK_SVG}
            </span>
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

const BRAND_MARK_SVG = `
  <svg class="ga-brand__mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#222427" stroke="rgba(239,240,241,0.16)" stroke-width="1"/>
    <polygon points="16,5 25.5,10.5 25.5,21.5 16,27 6.5,21.5 6.5,10.5" fill="none" stroke="#eff0f1" stroke-width="1.8" stroke-linejoin="round"/>
    <polygon points="16,10.2 20.8,13 20.8,19 16,21.8 11.2,19 11.2,13" fill="#ff4a1f"/>
  </svg>
`;

export function formatPhaseLabel(phase: string): string {
  const clean = phase.replace(/_/g, " ").toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Pure Functional Core: Selectors & State Reducers
 */
export function getEngineForGamePure(gameId: SupportedGameId): any {
  if (gameId === "splendor") return SplendorEngine;
  if (gameId === "azul") return AzulEngine;
  if (gameId === "seven_wonders") return SevenWondersEngine;
  return CatanEngine;
}

export function getActingPlayerIdPure(
  gameId: SupportedGameId,
  state: any
): string | null {
  if (gameId === "splendor") return getSplendorActingPlayerId(state);
  if (gameId === "azul") return getAzulActingPlayerId(state);
  if (gameId === "seven_wonders") return getSevenWondersActingPlayerId(state);
  return getNextActingPlayerId(state);
}

export function getRoomBoundsPure(room: {
  readonly gameId: SupportedGameId;
  readonly config: { readonly scenarioId: ScenarioId };
}): { minPlayers: number; maxPlayers: number } {
  if (room.gameId === "catan") {
    const sc = SCENARIO_CATALOG[room.config.scenarioId];
    return { minPlayers: sc.minPlayers, maxPlayers: sc.maxPlayers };
  }
  if (room.gameId === "seven_wonders") {
    return { minPlayers: 3, maxPlayers: 7 };
  }
  return { minPlayers: 2, maxPlayers: 4 };
}

export function roomUsesServerPure(
  model: Pick<AppModel, "useServerBackend">,
  room: Pick<ClientRoom, "isOfflineLocal">
): boolean {
  return model.useServerBackend && !room.isOfflineLocal;
}

export function getRoomByIdPure(
  model: Readonly<AppModel>,
  roomId: string
): ClientRoom | undefined {
  return model.rooms[roomId];
}

export function getRoomListPure(
  model: Readonly<AppModel>
): readonly ClientRoom[] {
  return model.roomOrder
    .map((id) => model.rooms[id])
    .filter((r): r is ClientRoom => Boolean(r));
}

export function getActiveRoomPure(model: Readonly<AppModel>): ClientRoom {
  return model.rooms[model.activeRoomId] ?? getRoomListPure(model)[0]!;
}

export function getRoomStatePure(
  model: Pick<AppModel, "useServerBackend">,
  room: ClientRoom
): any | null {
  if (roomUsesServerPure(model, room)) {
    return room.remoteState;
  }
  return room.session?.getState() ?? null;
}

export function canControlPlayerOnDevicePure(
  model: Pick<AppModel, "useServerBackend" | "currentUserId">,
  room: ClientRoom,
  playerId: string | null
): boolean {
  if (!playerId) return false;
  const seat = room.players.find((p) => p.id === playerId);
  if (!seat) return false;
  if (seat.isBot) {
    return Boolean(room.allBots);
  }
  if (!roomUsesServerPure(model, room) && room.isOfflineLocal) {
    return true;
  }
  return (
    playerId === model.currentUserId ||
    seat.controllerId === model.currentUserId
  );
}

export function setRoomInModelPure(
  model: Readonly<AppModel>,
  room: ClientRoom
): AppModel {
  const exists = Object.prototype.hasOwnProperty.call(model.rooms, room.roomId);
  return {
    ...model,
    rooms: {
      ...model.rooms,
      [room.roomId]: room,
    },
    roomOrder: exists ? model.roomOrder : [...model.roomOrder, room.roomId],
  };
}

export function updateRoomInModelPure(
  model: Readonly<AppModel>,
  roomId: string,
  updater: (room: ClientRoom) => ClientRoom
): AppModel {
  const existing = model.rooms[roomId];
  if (!existing) return model;
  return setRoomInModelPure(model, updater(existing));
}

export function removeRoomFromModelPure(
  model: Readonly<AppModel>,
  roomId: string
): AppModel {
  if (!Object.prototype.hasOwnProperty.call(model.rooms, roomId)) {
    return model;
  }
  const nextOrder = model.roomOrder.filter((id) => id !== roomId);
  const nextRooms = Object.fromEntries(
    nextOrder
      .map((id) => [id, model.rooms[id]!] as const)
      .filter((entry) => Boolean(entry[1]))
  );
  return {
    ...model,
    rooms: nextRooms,
    roomOrder: nextOrder,
  };
}

export function upsertDeviceGuestListPure(
  deviceGuests: readonly GuestSession[],
  session: GuestSession
): GuestSession[] {
  const idx = deviceGuests.findIndex((g) => g.id === session.id);
  if (idx >= 0) {
    return deviceGuests.map((g, i) => (i === idx ? session : g));
  }
  return [...deviceGuests, session];
}

export function rebuildRoomSeatsPure(room: Readonly<ClientRoom>): ClientRoom {
  if (room.status === "in_progress") {
    return { ...room };
  }

  const bounds = getRoomBoundsPure(room);
  const adjustedBotCountForBigIsland =
    room.gameId === "catan" &&
    (isExpanded56Scenario(room.config.scenarioId) ||
      Boolean(room.config.enable56PlayerExtension)) &&
    room.humanPlayers.length + room.botCount < 5
      ? Math.max(room.botCount, 5 - room.humanPlayers.length)
      : room.botCount;

  const computeSeats = (): {
    humanPlayers: PlayerDescriptor[];
    botCount: number;
    players: PlayerDescriptor[];
  } => {
    if (room.allBots) {
      const clampedBots = Math.max(
        bounds.minPlayers,
        Math.min(bounds.maxPlayers, adjustedBotCountForBigIsland || 4)
      );
      const botPlayers: PlayerDescriptor[] = Array.from(
        { length: clampedBots },
        (_, i) => ({
          id: `p${i + 1}`,
          name: `Bot ${i + 1}`,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        })
      );
      return {
        humanPlayers: [...room.humanPlayers],
        botCount: clampedBots,
        players: botPlayers,
      };
    }

    const seededHumans =
      room.humanPlayers.length === 0 && room.ownerId
        ? [
            {
              id: room.ownerId,
              name: room.ownerName,
              color: PLAYER_COLORS[0]!,
              isBot: false,
            },
          ]
        : room.humanPlayers;
    const trimmedHumans = seededHumans.slice(0, bounds.maxPlayers);
    const maxBots = Math.max(0, bounds.maxPlayers - trimmedHumans.length);
    const clampedBots = Math.max(
      0,
      Math.min(maxBots, adjustedBotCountForBigIsland)
    );

    const humanSeats: PlayerDescriptor[] = trimmedHumans.map((h, idx) => ({
      ...h,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
      isBot: false,
    }));

    const botSeats = Array.from({ length: clampedBots }, (_, b) => b).reduce<
      PlayerDescriptor[]
    >((acc, b) => {
      const idx = humanSeats.length + acc.length;
      const defaultId = `p${idx + 1}`;
      const taken =
        humanSeats.some((p) => p.id === defaultId) ||
        acc.some((p) => p.id === defaultId);
      const finalId = taken ? `bot-${b + 1}` : defaultId;
      return [
        ...acc,
        {
          id: finalId,
          name: `Bot ${b + 1}`,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        },
      ];
    }, []);

    return {
      humanPlayers: trimmedHumans,
      botCount: clampedBots,
      players: [...humanSeats, ...botSeats],
    };
  };

  const { humanPlayers, botCount, players } = computeSeats();
  const startingPlayerMode =
    room.startingPlayerMode !== "random" &&
    room.startingPlayerMode !== "first" &&
    !players.some((p) => p.id === room.startingPlayerMode)
      ? "random"
      : room.startingPlayerMode;

  return {
    ...room,
    config: { ...room.config },
    humanPlayers,
    botCount,
    players,
    startingPlayerMode,
  };
}

export const GAME_TITLE_BY_ID: Readonly<Record<SupportedGameId, string>> = {
  catan: "Settlers of Catan",
  splendor: "Splendor",
  azul: "Azul",
  seven_wonders: "7 Wonders",
};

export function computeClientRoomHashPure(
  counter: number,
  nowMs: number,
  salt: string,
  existingRooms: Readonly<Record<string, unknown>> = {}
): string {
  const hashOnce = (input: string): string => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    return (h & 0xffffff).toString(16).padStart(6, "0");
  };

  for (let attempt = 0; attempt < 64; attempt++) {
    const candidate = hashOnce(`${counter}:${nowMs}:${salt}:${attempt}`);
    if (!existingRooms[candidate]) {
      return candidate;
    }
  }
  return `${hashOnce(`${counter}:${nowMs}:${salt}`)}${counter}`;
}

export function formatRoomHashLabelPure(roomId: string): string {
  const raw = roomId.trim().replace(/^#+/, "");
  if (/^[0-9a-f]{6,10}$/i.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  return `#${computeClientRoomHashPure(0, 0, raw)}`;
}

export function extractInviteRoomHashFromLocationPure(
  search: string,
  hash: string
): string | null {
  const cleanToken = (val: string): string | null => {
    let decoded = val;
    try {
      decoded = decodeURIComponent(val);
    } catch {
      decoded = val;
    }
    const stripped = decoded.trim().replace(/^#+/, "");
    if (!stripped || !/^[A-Za-z0-9_-]{3,40}$/.test(stripped)) {
      return null;
    }
    return /^[0-9A-Fa-f]{6,10}$/.test(stripped)
      ? stripped.toLowerCase()
      : stripped;
  };

  const trimmedHash = (hash ?? "").trim().replace(/^#+/, "");
  if (trimmedHash) {
    if (trimmedHash.includes("=")) {
      const params = new URLSearchParams(trimmedHash);
      const fromParam = params.get("room");
      if (fromParam) {
        const cleaned = cleanToken(fromParam);
        if (cleaned) return cleaned;
      }
    } else {
      const direct = cleanToken(trimmedHash);
      if (direct) return direct;
    }
  }

  const trimmedSearch = (search ?? "").trim().replace(/^\?+/, "");
  if (trimmedSearch) {
    const params = new URLSearchParams(trimmedSearch);
    const fromSearch = params.get("room");
    if (fromSearch) {
      const cleaned = cleanToken(fromSearch);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

export function buildRoomShareUrlPure(
  origin: string,
  pathname: string,
  search: string,
  roomId: string
): string {
  const cleanId = roomId.trim().replace(/^#+/, "");
  const params = new URLSearchParams((search ?? "").replace(/^\?+/, ""));
  params.delete("room");
  const nextSearch = params.toString();
  return `${origin}${pathname}${nextSearch ? `?${nextSearch}` : ""}#room=${encodeURIComponent(cleanId)}`;
}

export function resolveClientRoomIdPure(
  model: Readonly<AppModel>,
  rawRoomId: string
): string {
  const cleaned = rawRoomId.trim().replace(/^#+/, "");
  if (model.rooms[cleaned]) return cleaned;
  const lower = cleaned.toLowerCase();
  if (model.rooms[lower]) return lower;
  const byDisplayHash = model.roomOrder.find(
    (id) =>
      model.rooms[id] &&
      formatRoomHashLabelPure(id).slice(1).toLowerCase() === lower
  );
  return byDisplayHash ?? (/^[0-9A-Fa-f]{6,10}$/.test(cleaned) ? lower : cleaned);
}

export function createLocalRoomPure(
  model: Readonly<AppModel>,
  opts: CreateLocalRoomOptions,
  nowMs: number = Date.now()
): { readonly model: AppModel; readonly room: ClientRoom } {
  const roomId =
    opts.customRoomId ??
    computeClientRoomHashPure(
      model.nextRoomNum,
      nowMs,
      `${opts.gameId}:${opts.ownerId}:${opts.customSeed ?? ""}`,
      model.rooms
    );
  const roomName = opts.name?.trim() || formatRoomHashLabelPure(roomId);
  const allBots = opts.allBots ?? false;
  const botDifficulty: BotDifficulty = opts.botDifficulty ?? "master";
  const humanPlayers: PlayerDescriptor[] = allBots
    ? []
    : [
        {
          id: opts.ownerId,
          name: opts.ownerName,
          color: PLAYER_COLORS[0]!,
          isBot: false,
        },
      ];

  const baseRoom: ClientRoom = {
    roomId,
    name: roomName,
    gameId: opts.gameId,
    isOfflineLocal: opts.isOfflineLocal ?? true,
    ownerId: opts.ownerId,
    ownerName: opts.ownerName,
    status: "lobby",
    humanPlayers,
    botCount: opts.botCount ?? (allBots ? 4 : 0),
    allBots,
    botDifficulty,
    startingPlayerMode: opts.startingPlayerMode ?? "random",
    autoStepBots: true,
    players: [],
    config: (() => {
      const scId = opts.scenarioId ?? "standard";
      const isCkPreset = Boolean(SCENARIO_CATALOG[scId]?.enableCitiesAndKnights);
      const is56Preset = isExpanded56Scenario(scId);
      return {
        scenarioId: scId,
        ...(opts.enable56PlayerExtension !== undefined
          ? { enable56PlayerExtension: opts.enable56PlayerExtension }
          : is56Preset
            ? { enable56PlayerExtension: true }
            : {}),
        enableHarbormaster: opts.enableHarbormaster ?? false,
        enableCityWalls:
          opts.enableCityWalls ??
          Boolean(opts.enableCitiesAndKnights || isCkPreset),
        enableFriendlyRobber: opts.enableFriendlyRobber ?? false,
        enableCitiesAndKnights: opts.enableCitiesAndKnights ?? isCkPreset,
        ...(opts.wonderSideMode ? { wonderSideMode: opts.wonderSideMode } : {}),
      };
    })(),
    seed: opts.customSeed ?? `arena-${roomId}-${nowMs % 10000}`,
    matchCounter: 0,
    session: null,
    remoteState: null,
    remoteActingPlayerId: null,
    canUndo: false,
    undoableSteps: 0,
    canRedo: false,
    step: 0,
  };

  const rebuilt = rebuildRoomSeatsPure(baseRoom);
  const nextModel = setRoomInModelPure(
    {
      ...model,
      nextRoomNum: model.nextRoomNum + 1,
    },
    rebuilt
  );
  return { model: nextModel, room: rebuilt };
}

const INITIAL_LOBBY_ROOM_SEEDS: readonly CreateLocalRoomOptions[] = [
  {
    customRoomId: "room-1",
    gameId: "catan",
    ownerId: "p1",
    ownerName: "Player 1 (You)",
    botCount: 3,
    startingPlayerMode: "first",
    scenarioId: "standard",
    autoStart: false,
  },
  {
    customRoomId: "room-2",
    gameId: "catan",
    ownerId: "host-nemo",
    ownerName: "Captain Nemo",
    botCount: 3,
    scenarioId: "seafarers_four_islands",
    enableHarbormaster: true,
    autoStart: false,
  },
  {
    customRoomId: "room-3",
    gameId: "splendor",
    ownerId: "host-lorenzo",
    ownerName: "Lorenzo",
    botCount: 3,
    autoStart: false,
  },
  {
    customRoomId: "room-4",
    gameId: "azul",
    ownerId: "host-manuel",
    ownerName: "Manuel",
    botCount: 3,
    autoStart: false,
  },
  {
    customRoomId: "room-5",
    gameId: "seven_wonders",
    ownerId: "host-hypatia",
    ownerName: "Hypatia",
    botCount: 3,
    autoStart: false,
  },
];

export function seedInitialLobbyRoomsPure(
  model: Readonly<AppModel>,
  nowMs: number = Date.now()
): AppModel {
  return INITIAL_LOBBY_ROOM_SEEDS.reduce(
    (accModel, seedOpts) => createLocalRoomPure(accModel, seedOpts, nowMs).model,
    model
  );
}

export function upsertRoomFromSummaryPure(
  model: Readonly<AppModel>,
  summary: any,
  remoteState?: any,
  remoteActingPlayerId?: string | null
): { readonly model: AppModel; readonly room: ClientRoom } {
  const existing = model.rooms[summary.roomId];
  const players: PlayerDescriptor[] = Array.isArray(summary.players)
    ? summary.players
    : [];
  const humanPlayers = players.filter((p) => !p.isBot);
  const botCount =
    typeof summary.botCount === "number"
      ? summary.botCount
      : players.filter((p) => p.isBot).length;
  const cfg = summary.config ?? {};

  const room: ClientRoom = {
    roomId: summary.roomId,
    name: summary.name ?? "Table",
    gameId: (summary.gameId as SupportedGameId) ?? "catan",
    isOfflineLocal: false,
    ownerId: summary.ownerId ?? "p1",
    ownerName: summary.ownerName ?? "Host",
    status: summary.status ?? "lobby",
    humanPlayers,
    botCount,
    allBots: Boolean(summary.allBots),
    botDifficulty:
      (summary.botDifficulty as BotDifficulty) ??
      (cfg.botDifficulty as BotDifficulty) ??
      "master",
    startingPlayerMode: summary.startingPlayerMode ?? "random",
    autoStepBots:
      summary.autoStepBots !== undefined ? Boolean(summary.autoStepBots) : true,
    players,
    config: (() => {
      const scId = (cfg.scenarioId as ScenarioId) ?? "standard";
      const isCkPreset = Boolean(SCENARIO_CATALOG[scId]?.enableCitiesAndKnights);
      const is56Preset = isExpanded56Scenario(scId);
      return {
        scenarioId: scId,
        ...(cfg.enable56PlayerExtension !== undefined || is56Preset
          ? {
              enable56PlayerExtension: Boolean(
                cfg.enable56PlayerExtension || is56Preset
              ),
            }
          : {}),
        enableHarbormaster: Boolean(cfg.enableHarbormaster),
        enableCityWalls: Boolean(
          cfg.enableCityWalls || cfg.enableCitiesAndKnights || isCkPreset
        ),
        enableFriendlyRobber: Boolean(cfg.enableFriendlyRobber),
        enableCitiesAndKnights: Boolean(
          cfg.enableCitiesAndKnights || isCkPreset
        ),
        ...(cfg.wonderSideMode
          ? { wonderSideMode: cfg.wonderSideMode as "random" | "day" | "night" }
          : {}),
      };
    })(),
    seed: existing?.seed ?? summary.roomId,
    matchCounter: existing?.matchCounter ?? 0,
    session: existing?.session ?? null,
    remoteState:
      remoteState !== undefined ? remoteState : (existing?.remoteState ?? null),
    remoteActingPlayerId:
      remoteActingPlayerId !== undefined
        ? remoteActingPlayerId
        : (existing?.remoteActingPlayerId ?? null),
    canUndo:
      summary.canUndo !== undefined
        ? Boolean(summary.canUndo)
        : (existing?.canUndo ?? false),
    undoableSteps:
      typeof summary.undoableSteps === "number"
        ? summary.undoableSteps
        : (existing?.undoableSteps ?? 0),
    canRedo:
      summary.canRedo !== undefined
        ? Boolean(summary.canRedo)
        : (existing?.canRedo ?? false),
    step:
      typeof summary.step === "number" ? summary.step : (existing?.step ?? 0),
    ...(Array.isArray(summary.offlinePlayerIds) &&
    summary.offlinePlayerIds.length > 0
      ? { offlinePlayerIds: summary.offlinePlayerIds.slice() }
      : {}),
  };

  const nextModel = setRoomInModelPure(
    {
      ...model,
      autoRespondBotsToHuman: room.autoStepBots,
    },
    room
  );
  return { model: nextModel, room };
}

export function syncOnlineLobbyRoomsPure(
  model: Readonly<AppModel>,
  summaries: readonly any[]
): AppModel {
  const incomingIds = new Set(summaries.map((s) => s.roomId));
  const prunedModel = model.roomOrder.reduce<AppModel>((acc, id) => {
    const existing = acc.rooms[id];
    if (existing && !existing.isOfflineLocal && !incomingIds.has(id)) {
      return removeRoomFromModelPure(acc, id);
    }
    return acc;
  }, model);

  return summaries.reduce<AppModel>(
    (acc, s) => upsertRoomFromSummaryPure(acc, s).model,
    prunedModel
  );
}

export function resetSubModesPure(model: Readonly<AppModel>): AppModel {
  return {
    ...model,
    buildMode: null,
    selectedBoardSpot: null,
    setupEdgeKind: "road",
    robberOrPirateMode: "robber",
    selectedMoveFromEdgeId: null,
    selectedMoveKnightFromVertexId: null,
    selectedChaseKnightVertexId: null,
    discardSelection: emptyResources(),
    discardCommodities: emptyCommodities(),
    maritimeGive: emptyResources(),
    maritimeWant: emptyResources(),
    maritimeCommGive: emptyCommodities(),
    maritimeCommWant: emptyCommodities(),
    domesticGive: emptyResources(),
    domesticWant: emptyResources(),
    domesticCommGive: emptyCommodities(),
    domesticCommWant: emptyCommodities(),
    domesticTargetPlayerId: "all",
    selectedMetropolisVertexId: null,
    selectedProgressCardId: null,
    inventorHex1: null,
    smithVertex1: null,
    deserterTargetPlayerId: null,
    splendorDraftGems: {},
    azulSelectedDraft: null,
    azulInspectedPlayerId: null,
    sevenWondersSelectedCardId: null,
    sevenWondersInspectedPlayerId: null,
  };
}

export function switchTradeModePure(
  model: Readonly<AppModel>,
  nextMode: "maritime_trade" | "domestic_trade" | null
): AppModel {
  const syncedWants = (() => {
    const marTotal =
      totalResourceCount(model.maritimeWant) +
      totalCommodityCount(model.maritimeCommWant);
    const domTotal =
      totalResourceCount(model.domesticWant) +
      totalCommodityCount(model.domesticCommWant);
    if (model.buildMode === "domestic_trade" && nextMode === "maritime_trade") {
      return {
        maritimeWant: { ...model.domesticWant },
        domesticWant: { ...model.domesticWant },
        maritimeCommWant: { ...model.domesticCommWant },
        domesticCommWant: { ...model.domesticCommWant },
      };
    }
    if (model.buildMode === "maritime_trade" && nextMode === "domestic_trade") {
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
        maritimeCommWant: { ...model.maritimeCommWant },
        domesticCommWant: { ...model.maritimeCommWant },
      };
    }
    if (nextMode === "maritime_trade") {
      if (marTotal === 0 && domTotal > 0) {
        return {
          maritimeWant: { ...model.domesticWant },
          domesticWant: { ...model.domesticWant },
          maritimeCommWant: { ...model.domesticCommWant },
          domesticCommWant: { ...model.domesticCommWant },
        };
      }
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
        maritimeCommWant: { ...model.maritimeCommWant },
        domesticCommWant: { ...model.maritimeCommWant },
      };
    }
    if (domTotal === 0 && marTotal > 0) {
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
        maritimeCommWant: { ...model.maritimeCommWant },
        domesticCommWant: { ...model.maritimeCommWant },
      };
    }
    return {
      maritimeWant: { ...model.domesticWant },
      domesticWant: { ...model.domesticWant },
      maritimeCommWant: { ...model.domesticCommWant },
      domesticCommWant: { ...model.domesticCommWant },
    };
  })();

  const nextMaritimeGive = RESOURCES.reduce<ResourceMap>(
    (acc, r) => ({
      ...acc,
      [r]: syncedWants.maritimeWant[r] > 0 ? 0 : model.maritimeGive[r],
    }),
    emptyResources()
  );

  const nextDomesticGive = RESOURCES.reduce<ResourceMap>(
    (acc, r) => ({
      ...acc,
      [r]: syncedWants.domesticWant[r] > 0 ? 0 : model.domesticGive[r],
    }),
    emptyResources()
  );

  const nextMaritimeCommGive = COMMODITIES.reduce<CommodityMap>(
    (acc, c) => ({
      ...acc,
      [c]: syncedWants.maritimeCommWant[c] > 0 ? 0 : model.maritimeCommGive[c],
    }),
    emptyCommodities()
  );

  const nextDomesticCommGive = COMMODITIES.reduce<CommodityMap>(
    (acc, c) => ({
      ...acc,
      [c]: syncedWants.domesticCommWant[c] > 0 ? 0 : model.domesticCommGive[c],
    }),
    emptyCommodities()
  );

  return {
    ...model,
    selectedBoardSpot: null,
    maritimeWant: syncedWants.maritimeWant,
    domesticWant: syncedWants.domesticWant,
    maritimeCommWant: syncedWants.maritimeCommWant,
    domesticCommWant: syncedWants.domesticCommWant,
    maritimeGive: nextMaritimeGive,
    domesticGive: nextDomesticGive,
    maritimeCommGive: nextMaritimeCommGive,
    domesticCommGive: nextDomesticCommGive,
    buildMode: nextMode,
  };
}

export function setSharedTradeWantPure(
  model: Readonly<AppModel>,
  resource: ResourceType,
  amount: number
): AppModel {
  const clamped = Math.max(0, amount);
  return {
    ...model,
    maritimeWant: { ...model.maritimeWant, [resource]: clamped },
    domesticWant: { ...model.domesticWant, [resource]: clamped },
    maritimeGive:
      clamped > 0
        ? { ...model.maritimeGive, [resource]: 0 }
        : { ...model.maritimeGive },
    domesticGive:
      clamped > 0
        ? { ...model.domesticGive, [resource]: 0 }
        : { ...model.domesticGive },
  };
}

export function setSharedTradeGoodWantPure(
  model: Readonly<AppModel>,
  good: TradeGoodType,
  amount: number
): AppModel {
  if (!isCommodityType(good)) {
    return setSharedTradeWantPure(model, good, amount);
  }
  const clamped = Math.max(0, amount);
  return {
    ...model,
    maritimeCommWant: { ...model.maritimeCommWant, [good]: clamped },
    domesticCommWant: { ...model.domesticCommWant, [good]: clamped },
    maritimeCommGive:
      clamped > 0
        ? { ...model.maritimeCommGive, [good]: 0 }
        : { ...model.maritimeCommGive },
    domesticCommGive:
      clamped > 0
        ? { ...model.domesticCommGive, [good]: 0 }
        : { ...model.domesticCommGive },
  };
}

export function toggleSplendorDraftGemPure(
  draftGems: Readonly<Partial<Record<GemColor, number>>>,
  state: SplendorState,
  color: GemColor
): Partial<Record<GemColor, number>> {
  const current = draftGems[color] ?? 0;
  const distinctSelected = (Object.keys(draftGems) as GemColor[]).filter(
    (k) => (draftGems[k] ?? 0) > 0
  );

  if (current === 0) {
    if (distinctSelected.length >= 3) {
      return { ...draftGems };
    }
    const normalized = distinctSelected.reduce<Partial<Record<GemColor, number>>>(
      (acc, k) => ({
        ...acc,
        [k]: 1,
      }),
      {}
    );
    return { ...normalized, [color]: 1 };
  }

  if (current === 1 && distinctSelected.length === 1 && state.bank[color] >= 4) {
    return { ...draftGems, [color]: 2 };
  }

  return Object.fromEntries(
    (Object.entries(draftGems) as Array<[GemColor, number | undefined]>).filter(
      ([k, v]) => k !== color && v !== undefined && v > 0
    )
  ) as Partial<Record<GemColor, number>>;
}

export function createInitialAppModelPure(
  options: MultiGamePlatformAppOptions | undefined,
  env: {
    readonly isStaticHost: boolean;
    readonly isBrowserHttp: boolean;
    readonly randomGuestSuffix: number;
    readonly deviceGuests: readonly GuestSession[];
    readonly savedGuest: GuestSession | null;
    readonly nowMs: number;
    readonly locationSearch?: string;
    readonly locationHash?: string;
  }
): AppModel {
  const staticHostOnly = env.isStaticHost;
  const useServerBackend = env.isBrowserHttp && !env.isStaticHost;
  const serverReachable = !env.isStaticHost;
  const createRoomMode: "online" | "offline" = useServerBackend
    ? "online"
    : "offline";
  const initialDraftName = `Guest ${env.randomGuestSuffix}`;
  const pendingInviteRoomId = extractInviteRoomHashFromLocationPure(
    env.locationSearch ?? "",
    env.locationHash ?? ""
  );

  const authInit = ((): {
    currentUserId: string;
    currentUserName: string;
    loginDraftName: string;
    deviceGuests: GuestSession[];
    isAuthenticated: boolean;
    viewMode: AppViewMode;
  } => {
    if (env.savedGuest) {
      return {
        currentUserId: env.savedGuest.id,
        currentUserName: env.savedGuest.name,
        loginDraftName: env.savedGuest.name,
        deviceGuests: upsertDeviceGuestListPure(
          env.deviceGuests,
          env.savedGuest
        ),
        isAuthenticated: true,
        viewMode: "lobby",
      };
    }
    if (options?.startAtLogin !== undefined) {
      const isAuth = !options.startAtLogin;
      const guests = isAuth
        ? upsertDeviceGuestListPure(env.deviceGuests, {
            id: "p1",
            name: "Player 1 (You)",
            mode: "guest",
          })
        : [...env.deviceGuests];
      return {
        currentUserId: "p1",
        currentUserName: "Player 1 (You)",
        loginDraftName: initialDraftName,
        deviceGuests: guests,
        isAuthenticated: isAuth,
        viewMode: options.startAtLogin ? "login" : "lobby",
      };
    }
    if (env.isBrowserHttp || env.isStaticHost) {
      return {
        currentUserId: "p1",
        currentUserName: "Player 1 (You)",
        loginDraftName: initialDraftName,
        deviceGuests: [...env.deviceGuests],
        isAuthenticated: false,
        viewMode: "login",
      };
    }
    return {
      currentUserId: "p1",
      currentUserName: "Player 1 (You)",
      loginDraftName: initialDraftName,
      deviceGuests: upsertDeviceGuestListPure(env.deviceGuests, {
        id: "p1",
        name: "Player 1 (You)",
        mode: "guest",
      }),
      isAuthenticated: true,
      viewMode: "lobby",
    };
  })();

  const baseModel: AppModel = {
    viewMode: authInit.viewMode,
    lobbyGameFilter: "catan",
    lobbyHeroEnteredOnce: false,
    loginHeroEnteredOnce: false,
    useServerBackend,
    staticHostOnly,
    serverReachable,
    isAuthenticated: authInit.isAuthenticated,
    addingAdditionalGuest: false,
    returnViewAfterAddGuest: "lobby",
    loginDraftName: authInit.loginDraftName,
    loginErrorMsg: "",
    currentUserId: authInit.currentUserId,
    currentUserName: authInit.currentUserName,
    editingGuestName: false,
    guestRenameDraft: "",
    deviceGuests: authInit.deviceGuests,
    localFriendDraftName: "",
    hidePassAndPlayHand: false,
    createRoomName: "",
    createRoomGameId: "catan",
    createRoomMode,
    pendingInviteRoomId,
    copiedRoomLinkId: null,
    rooms: {},
    roomOrder: [],
    nextRoomNum: 1,
    activeRoomId: "room-1",
    buildMode: null,
    selectedBoardSpot: null,
    setupEdgeKind: "road",
    robberOrPirateMode: "robber",
    selectedMoveFromEdgeId: null,
    selectedMoveKnightFromVertexId: null,
    selectedChaseKnightVertexId: null,
    discardSelection: emptyResources(),
    discardCommodities: emptyCommodities(),
    tradeGiveRes: "brick",
    tradeReceiveRes: "ore",
    maritimeGive: emptyResources(),
    maritimeWant: emptyResources(),
    maritimeCommGive: emptyCommodities(),
    maritimeCommWant: emptyCommodities(),
    domesticGive: emptyResources(),
    domesticWant: emptyResources(),
    domesticCommGive: emptyCommodities(),
    domesticCommWant: emptyCommodities(),
    domesticTargetPlayerId: "all",
    selectedMetropolisVertexId: null,
    selectedProgressCardId: null,
    alchemistDie1: 4,
    alchemistDie2: 3,
    inventorHex1: null,
    smithVertex1: null,
    deserterTargetPlayerId: null,
    yopRes1: "grain",
    yopRes2: "ore",
    monoRes: "ore",
    splendorDraftGems: {},
    azulSelectedDraft: null,
    azulInspectedPlayerId: null,
    sevenWondersSelectedCardId: null,
    sevenWondersInspectedPlayerId: null,
    activeTutorial: null,
    guideModalGameId: null,
    sidebarSettingsExpanded: false,
    autoPlayBots: false,
    autoRespondBotsToHuman: true,
    autoPlaySpeedMs: 150,
  };

  if (!useServerBackend && !staticHostOnly) {
    return seedInitialLobbyRoomsPure(baseModel, env.nowMs);
  }
  return baseModel;
}

export function resolveGuestSignInPure(
  model: Readonly<AppModel>,
  rawName: string | undefined,
  randomToken: string,
  nowMs: number,
  existingGuestId?: string
):
  | { readonly ok: false; readonly model: AppModel }
  | {
      readonly ok: true;
      readonly model: AppModel;
      readonly session: GuestSession;
    } {
  const clean = (rawName ?? model.loginDraftName).trim();
  if (!clean) {
    return {
      ok: false,
      model: {
        ...model,
        loginErrorMsg: "Enter a guest display name to continue.",
      },
    };
  }

  const trimmedName = clean.slice(0, 28);
  const matchedById = existingGuestId
    ? model.deviceGuests.find((g) => g.id === existingGuestId)
    : undefined;
  const matchedByName = !matchedById
    ? model.deviceGuests.find(
        (g) => g.name.toLowerCase() === trimmedName.toLowerCase()
      )
    : undefined;

  const session: GuestSession = matchedById
    ? { id: matchedById.id, name: trimmedName, mode: "guest" }
    : matchedByName
      ? { id: matchedByName.id, name: trimmedName, mode: "guest" }
      : {
          id: `guest-${randomToken}-${nowMs % 10000}`,
          name: trimmedName,
          mode: "guest",
        };

  const withGuest: AppModel = {
    ...model,
    currentUserId: session.id,
    currentUserName: session.name,
    loginDraftName: session.name,
    loginErrorMsg: "",
    isAuthenticated: true,
    addingAdditionalGuest: false,
    deviceGuests: upsertDeviceGuestListPure(model.deviceGuests, session),
    viewMode: "lobby",
  };

  const firstRoom = withGuest.rooms["room-1"];
  const withClaimedRoom1 =
    !withGuest.useServerBackend &&
    withGuest.roomOrder.length > 0 &&
    firstRoom &&
    firstRoom.status === "lobby" &&
    firstRoom.ownerId === "p1"
      ? setRoomInModelPure(
          withGuest,
          rebuildRoomSeatsPure({
            ...firstRoom,
            ownerId: session.id,
            ownerName: session.name,
            humanPlayers: [
              {
                id: session.id,
                name: session.name,
                color: PLAYER_COLORS[0]!,
                isBot: false,
              },
            ],
          })
        )
      : withGuest;

  return { ok: true, model: withClaimedRoom1, session };
}

export function addOfflineLocalFriendPure(
  model: Readonly<AppModel>,
  roomId: string,
  rawName: string,
  randomToken: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room) return model;
  const cleanName = rawName.trim() || `Player ${room.humanPlayers.length + 1}`;
  const bounds = getRoomBoundsPure(room);
  if (room.humanPlayers.length >= bounds.maxPlayers) return model;

  const localId = `local-${randomToken}-${room.humanPlayers.length + 1}`;
  const nextHuman: PlayerDescriptor = {
    id: localId,
    name: cleanName.slice(0, 28),
    color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
    isBot: false,
    controllerId: room.ownerId,
  };

  const rebuilt = rebuildRoomSeatsPure({
    ...room,
    humanPlayers: [...room.humanPlayers, nextHuman],
  });

  return setRoomInModelPure(
    {
      ...model,
      localFriendDraftName: "",
    },
    rebuilt
  );
}

export function removeOfflinePlayerPure(
  model: Readonly<AppModel>,
  roomId: string,
  targetPlayerId: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room || targetPlayerId === room.ownerId) return model;

  const rebuilt = rebuildRoomSeatsPure({
    ...room,
    humanPlayers: room.humanPlayers.filter((p) => p.id !== targetPlayerId),
  });
  return setRoomInModelPure(model, rebuilt);
}

export function enterOfflineRoomPure(
  model: Readonly<AppModel>,
  roomId: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room) return model;

  if (room.status === "lobby" || room.status === "finished") {
    const alreadySeated = room.humanPlayers.some(
      (p) => p.id === model.currentUserId
    );
    const bounds = getRoomBoundsPure(room);
    const updatedRoom =
      !alreadySeated &&
      !room.allBots &&
      room.humanPlayers.length < bounds.maxPlayers
        ? rebuildRoomSeatsPure({
            ...room,
            humanPlayers: [
              ...room.humanPlayers,
              {
                id: model.currentUserId,
                name: model.currentUserName,
                color:
                  PLAYER_COLORS[
                    room.humanPlayers.length % PLAYER_COLORS.length
                  ]!,
                isBot: false,
              },
            ],
          })
        : room;

    return resetSubModesPure(
      setRoomInModelPure(
        {
          ...model,
          activeRoomId: roomId,
          viewMode: "room_setup",
        },
        updatedRoom
      )
    );
  }

  return resetSubModesPure({
    ...model,
    activeRoomId: roomId,
    viewMode: "in_game",
  });
}

export function leaveOfflineRoomPure(
  model: Readonly<AppModel>,
  roomId: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room) return model;

  if (room.status !== "in_progress") {
    const remainingHumans = room.humanPlayers.filter(
      (p) =>
        p.id !== model.currentUserId && p.controllerId !== model.currentUserId
    );
    if (remainingHumans.length === 0 && !room.allBots) {
      const removed = removeRoomFromModelPure(model, room.roomId);
      const nextActive = removed.roomOrder[0] ?? "";
      return resetSubModesPure({
        ...removed,
        activeRoomId: nextActive,
        viewMode: "lobby",
      });
    }
    const nextOwnerId =
      room.ownerId === model.currentUserId && remainingHumans.length > 0
        ? remainingHumans[0]!.id
        : room.ownerId;
    const nextOwnerName =
      room.ownerId === model.currentUserId && remainingHumans.length > 0
        ? remainingHumans[0]!.name
        : room.ownerName;
    const rebuilt = rebuildRoomSeatsPure({
      ...room,
      ownerId: nextOwnerId,
      ownerName: nextOwnerName,
      humanPlayers: remainingHumans,
    });
    return resetSubModesPure(
      setRoomInModelPure(
        {
          ...model,
          viewMode: "lobby",
        },
        rebuilt
      )
    );
  }

  return resetSubModesPure({
    ...model,
    viewMode: "lobby",
  });
}

export function signOutGuestFromModelPure(
  model: Readonly<AppModel>,
  targetGuestId: string,
  fallbackDraftSuffix: number
): {
  readonly model: AppModel;
  readonly removedRoomIds: readonly string[];
  readonly switchedToGuest: GuestSession | null;
} {
  if (!targetGuestId) {
    return { model, removedRoomIds: [], switchedToGuest: null };
  }

  const remainingDeviceGuests = model.deviceGuests.filter(
    (g) => g.id !== targetGuestId
  );
  const toBotName = (name: string): string =>
    name.endsWith(" (Bot)") ? name : `${name} (Bot)`;

  const swept = model.roomOrder.reduce<{
    readonly model: AppModel;
    readonly removedRoomIds: readonly string[];
  }>(
    (acc, roomId) => {
      const room = acc.model.rooms[roomId];
      if (!room) return acc;

      const isOwnedOrSeated =
        room.ownerId === targetGuestId ||
        room.humanPlayers.some(
          (p) => p.id === targetGuestId || p.controllerId === targetGuestId
        ) ||
        room.players.some(
          (p) =>
            !p.isBot &&
            (p.id === targetGuestId || p.controllerId === targetGuestId)
        );

      if (!isOwnedOrSeated) return acc;

      const remainingHumans = room.humanPlayers.filter(
        (p) => p.id !== targetGuestId && p.controllerId !== targetGuestId
      );

      if (remainingHumans.length === 0 && !room.allBots) {
        return {
          model: removeRoomFromModelPure(acc.model, roomId),
          removedRoomIds: [...acc.removedRoomIds, roomId],
        };
      }

      const nextOwnerId =
        room.ownerId === targetGuestId && remainingHumans.length > 0
          ? remainingHumans[0]!.id
          : room.ownerId;
      const nextOwnerName =
        room.ownerId === targetGuestId && remainingHumans.length > 0
          ? remainingHumans[0]!.name
          : room.ownerName;

      if (room.status !== "in_progress") {
        const rebuilt = rebuildRoomSeatsPure({
          ...room,
          ownerId: nextOwnerId,
          ownerName: nextOwnerName,
          humanPlayers: remainingHumans,
        });
        return {
          model: setRoomInModelPure(acc.model, rebuilt),
          removedRoomIds: acc.removedRoomIds,
        };
      }

      const leavingSeatIds = new Set(
        room.players
          .filter(
            (p) =>
              !p.isBot &&
              (p.id === targetGuestId || p.controllerId === targetGuestId)
          )
          .map((p) => p.id)
      );

      const nextPlayers: PlayerDescriptor[] = room.players.map((p) =>
        leavingSeatIds.has(p.id)
          ? {
              id: p.id,
              name: toBotName(p.name),
              color: p.color,
              isBot: true,
              botDifficulty: room.botDifficulty,
            }
          : p
      );

      const nextSession = room.session
        ? (() => {
            const curState = room.session.getState();
            if (!curState || !Array.isArray(curState.players)) {
              return room.session;
            }
            const updatedState = {
              ...curState,
              players: curState.players.map((sp: any) =>
                leavingSeatIds.has(sp.id)
                  ? {
                      ...sp,
                      name: toBotName(sp.name),
                      isBot: true,
                      botDifficulty: room.botDifficulty,
                    }
                  : sp
              ),
            };
            const engine = getEngineForGamePure(room.gameId);
            return createMatchSession(engine, updatedState, true);
          })()
        : null;

      const nextRemoteState =
        room.remoteState && Array.isArray(room.remoteState.players)
          ? {
              ...room.remoteState,
              players: room.remoteState.players.map((sp: any) =>
                leavingSeatIds.has(sp.id)
                  ? {
                      ...sp,
                      name: toBotName(sp.name),
                      isBot: true,
                      botDifficulty: room.botDifficulty,
                    }
                  : sp
              ),
            }
          : room.remoteState;

      const updatedRoom: ClientRoom = {
        ...room,
        ownerId: nextOwnerId,
        ownerName: nextOwnerName,
        humanPlayers: remainingHumans,
        botCount: nextPlayers.filter((p) => p.isBot).length,
        players: nextPlayers,
        session: nextSession,
        remoteState: nextRemoteState,
      };

      return {
        model: setRoomInModelPure(acc.model, updatedRoom),
        removedRoomIds: acc.removedRoomIds,
      };
    },
    { model: { ...model, deviceGuests: remainingDeviceGuests }, removedRoomIds: [] }
  );

  const fallbackActiveRoomId = swept.model.rooms[swept.model.activeRoomId]
    ? swept.model.activeRoomId
    : (swept.model.roomOrder[0] ?? "");

  if (targetGuestId !== model.currentUserId) {
    return {
      model: {
        ...swept.model,
        activeRoomId: fallbackActiveRoomId,
      },
      removedRoomIds: swept.removedRoomIds,
      switchedToGuest: null,
    };
  }

  if (remainingDeviceGuests.length > 0 && model.viewMode !== "login") {
    const nextGuest = remainingDeviceGuests[0]!;
    const activeStillHasNextGuest = Boolean(
      fallbackActiveRoomId &&
        swept.model.rooms[fallbackActiveRoomId]?.players.some(
          (p) => p.id === nextGuest.id || p.controllerId === nextGuest.id
        )
    );
    return {
      model: resetSubModesPure({
        ...swept.model,
        isAuthenticated: true,
        addingAdditionalGuest: false,
        loginErrorMsg: "",
        currentUserId: nextGuest.id,
        currentUserName: nextGuest.name,
        activeRoomId: fallbackActiveRoomId,
        viewMode: activeStillHasNextGuest ? model.viewMode : "lobby",
      }),
      removedRoomIds: swept.removedRoomIds,
      switchedToGuest: nextGuest,
    };
  }

  return {
    model: resetSubModesPure({
      ...swept.model,
      isAuthenticated: false,
      addingAdditionalGuest: false,
      loginErrorMsg: "",
      loginDraftName: `Guest ${fallbackDraftSuffix}`,
      activeRoomId: fallbackActiveRoomId,
      viewMode: "login",
    }),
    removedRoomIds: swept.removedRoomIds,
    switchedToGuest: null,
  };
}

export function renameGuestInModelPure(
  model: Readonly<AppModel>,
  guestId: string,
  rawNewName: string
):
  | { readonly ok: false; readonly model: AppModel }
  | {
      readonly ok: true;
      readonly model: AppModel;
      readonly session: GuestSession;
    } {
  const cleanName = rawNewName.trim().slice(0, 28);
  if (!cleanName || !guestId) {
    return { ok: false, model };
  }

  const session: GuestSession = {
    id: guestId,
    name: cleanName,
    mode: "guest",
  };

  const withProfile: AppModel = {
    ...model,
    currentUserName:
      model.currentUserId === guestId ? cleanName : model.currentUserName,
    loginDraftName:
      model.currentUserId === guestId ? cleanName : model.loginDraftName,
    editingGuestName: false,
    guestRenameDraft: "",
    deviceGuests: upsertDeviceGuestListPure(model.deviceGuests, session),
  };

  const mapStatePlayerName = (snap: any): any =>
    snap && Array.isArray(snap.players)
      ? {
          ...snap,
          players: snap.players.map((sp: any) =>
            !sp.isBot && sp.id === guestId ? { ...sp, name: cleanName } : sp
          ),
        }
      : snap;

  const updatedModel = withProfile.roomOrder.reduce<AppModel>((acc, roomId) => {
    const room = acc.rooms[roomId];
    if (!room) return acc;

    const matchesRoom =
      room.ownerId === guestId ||
      room.humanPlayers.some((p) => p.id === guestId) ||
      room.players.some((p) => !p.isBot && p.id === guestId);

    if (!matchesRoom) return acc;

    const nextOwnerName =
      room.ownerId === guestId ? cleanName : room.ownerName;
    const nextHumans = room.humanPlayers.map((p) =>
      p.id === guestId ? { ...p, name: cleanName } : p
    );
    const nextPlayers = room.players.map((p) =>
      !p.isBot && p.id === guestId ? { ...p, name: cleanName } : p
    );
    const nextSession = room.session
      ? room.session.cloneWithMappedSnapshots
        ? room.session.cloneWithMappedSnapshots(mapStatePlayerName)
        : createMatchSession(
            getEngineForGamePure(room.gameId),
            mapStatePlayerName(room.session.getState()),
            true
          )
      : null;
    const nextRemoteState = room.remoteState
      ? mapStatePlayerName(room.remoteState)
      : null;

    return setRoomInModelPure(acc, {
      ...room,
      ownerName: nextOwnerName,
      humanPlayers: nextHumans,
      players: nextPlayers,
      session: nextSession,
      remoteState: nextRemoteState,
    });
  }, withProfile);

  return { ok: true, model: updatedModel, session };
}

export function startOfflineRoomMatchPure(
  model: Readonly<AppModel>,
  roomId: string
): { readonly started: boolean; readonly model: AppModel } {
  const existing = model.rooms[roomId];
  if (!existing) return { started: false, model };

  const rebuilt = rebuildRoomSeatsPure(existing);
  const bounds = getRoomBoundsPure(rebuilt);
  if (rebuilt.players.length < bounds.minPlayers) {
    return { started: false, model: setRoomInModelPure(model, rebuilt) };
  }

  const engine = getEngineForGamePure(rebuilt.gameId);
  const startSpec = ((): {
    startingPlayerIndex: number | undefined;
    randomizeStartingPlayer: boolean;
  } => {
    if (rebuilt.startingPlayerMode === "first") {
      return { startingPlayerIndex: 0, randomizeStartingPlayer: false };
    }
    if (rebuilt.startingPlayerMode === "random") {
      return { startingPlayerIndex: undefined, randomizeStartingPlayer: true };
    }
    const idx = rebuilt.players.findIndex(
      (p) => p.id === rebuilt.startingPlayerMode
    );
    return idx >= 0
      ? { startingPlayerIndex: idx, randomizeStartingPlayer: false }
      : { startingPlayerIndex: undefined, randomizeStartingPlayer: true };
  })();

  const engineConfig =
    rebuilt.gameId === "catan"
      ? {
          scenarioId: rebuilt.config.scenarioId,
          enable56PlayerExtension: Boolean(
            rebuilt.players.length >= 5 ||
              isExpanded56Scenario(rebuilt.config.scenarioId)
          ),
          enableHarbormaster: rebuilt.config.enableHarbormaster,
          enableCityWalls: rebuilt.config.enableCityWalls,
          enableFriendlyRobber: rebuilt.config.enableFriendlyRobber,
          enableCitiesAndKnights: rebuilt.config.enableCitiesAndKnights,
          startingPlayerIndex: startSpec.startingPlayerIndex,
          randomizeStartingPlayer: startSpec.randomizeStartingPlayer,
        }
      : rebuilt.gameId === "seven_wonders"
        ? {
            wonderSideMode: rebuilt.config.wonderSideMode ?? "random",
            startingPlayerIndex: startSpec.startingPlayerIndex,
            randomizeStartingPlayer: startSpec.randomizeStartingPlayer,
          }
        : {
            startingPlayerIndex: startSpec.startingPlayerIndex,
            randomizeStartingPlayer: startSpec.randomizeStartingPlayer,
          };

  const matchSeed =
    rebuilt.matchCounter === 0
      ? rebuilt.seed
      : `${rebuilt.seed}-g${rebuilt.matchCounter}`;
  const initialState = engine.initGame(
    rebuilt.players,
    engineConfig,
    matchSeed
  );
  const session = createMatchSession(engine, initialState, true);

  const startedRoom: ClientRoom = {
    ...rebuilt,
    matchCounter: rebuilt.matchCounter + 1,
    session,
    status: "in_progress",
  };

  return {
    started: true,
    model: resetSubModesPure(
      setRoomInModelPure(
        {
          ...model,
          activeRoomId: roomId,
          viewMode: "in_game",
        },
        startedRoom
      )
    ),
  };
}

export function startInteractiveTutorialPure(
  model: Readonly<AppModel>,
  gameId: SupportedGameId,
  nowMs: number = Date.now()
): { readonly model: AppModel; readonly roomId: string } {
  const gameTitles: Record<SupportedGameId, string> = {
    catan: "Catan",
    splendor: "Splendor",
    azul: "Azul",
    seven_wonders: "7 Wonders",
  };
  const cleanedRooms = Object.fromEntries(
    Object.entries(model.rooms).filter(
      ([, r]) => !(r.isOfflineLocal && r.name.endsWith("— Guided Tutorial"))
    )
  );
  const cleanedOrder = model.roomOrder.filter((id) => id in cleanedRooms);
  const cleanedModel: AppModel = {
    ...model,
    rooms: cleanedRooms,
    roomOrder: cleanedOrder,
  };
  const created = createLocalRoomPure(
    cleanedModel,
    {
      name: `${gameTitles[gameId]} — Guided Tutorial`,
      gameId,
      ownerId: model.currentUserId,
      ownerName: model.currentUserName,
      isOfflineLocal: true,
      botCount: 3,
      botDifficulty: "normal",
      startingPlayerMode: "first",
      scenarioId: "standard",
      wonderSideMode: "day",
      customSeed: TUTORIAL_SEEDS[gameId],
    },
    nowMs
  );
  const started = startOfflineRoomMatchPure(created.model, created.room.roomId);
  return {
    roomId: created.room.roomId,
    model: {
      ...started.model,
      guideModalGameId: null,
      activeTutorial: {
        roomId: created.room.roomId,
        gameId,
        stepIndex: 0,
        maxAutoStepIndex: 0,
      },
    },
  };
}

export function stepSetupBotsRecursive(
  session: MatchSession<any, any, any>,
  remainingGuard: number
): void {
  if (remainingGuard <= 0) return;
  const state = session.getState();
  if (!state.phase.startsWith("SETUP_")) return;
  const actorId = getNextActingPlayerId(state);
  if (!actorId) return;
  const action = CatanEngine.chooseBotAction(state, actorId);
  if (!action) return;
  session.dispatch(actorId, action);
  stepSetupBotsRecursive(session, remainingGuard - 1);
}

/**
 * Pure Functional View Renderers (Zero DOM Mutation, Zero `this`)
 */
export function renderLoginViewPure(model: Readonly<AppModel>): string {
  const enterAttr = model.loginHeroEnteredOnce ? "" : "data-enter";
  const heroTitle = model.addingAdditionalGuest
    ? "Add another guest on this computer."
    : "Enter Game Arena as a guest.";
  const heroLead = model.addingAdditionalGuest
    ? "Create a second guest profile on this computer to host another table or join an open room."
    : "Sign in as a guest to host an online table, represent multiple hosts on one computer, or play offline with local friends.";

  return `
      <header class="ga-nav">
        <div class="ga-nav__inner">
          <div class="ga-brand" role="banner">
            ${BRAND_MARK_SVG}
            <div class="ga-brand__meta">
              <span>Game Arena</span>
              <span class="ga-brand__sub">Online and local tabletop rooms</span>
            </div>
          </div>
          <div class="ga-toolbar">
            <span class="ga-chip ga-chip--ok">Guest access</span>
          </div>
        </div>
      </header>

      <main class="wrap ga-login-shell" ${enterAttr}>
        <div class="ga-login-copy">
          <h1 class="ga-lobby-hero__title">${heroTitle}</h1>
          <p class="t-lead muted">${heroLead}</p>
          <dl class="ga-lobby-stats">
            <div class="ga-lobby-stat">
              <dt>Board games</dt>
              <dd class="ga-num">4</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>Seats per table</dt>
              <dd class="ga-num">2–7</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>Play modes</dt>
              <dd class="ga-num">Online · Local</dd>
            </div>
          </dl>
        </div>

        <form id="form-guest-login" class="ga-surface-card ga-login-card" novalidate>
          <div class="ga-section-bar">
            <h2>${model.addingAdditionalGuest ? "New guest profile" : "Guest sign-in"}</h2>
            <span class="ga-chip ga-chip--accent">Guest mode</span>
          </div>

          ${
            model.pendingInviteRoomId && !model.addingAdditionalGuest
              ? `<div class="ga-notice ga-notice--accent">
                   Joining room <strong class="ga-num">${escapeAttr(
                     formatRoomHashLabelPure(model.pendingInviteRoomId)
                   )}</strong> — enter your display name below to join directly.
                 </div>`
              : ""
          }

          <div class="ga-field">
            <label for="inp-guest-name">Guest display name</label>
            <input
              type="text"
              id="inp-guest-name"
              class="ga-input"
              maxlength="28"
              value="${escapeAttr(model.loginDraftName)}"
              placeholder="Enter your display name"
              autocomplete="nickname"
            />
          </div>

          ${
            model.loginErrorMsg
              ? `<div id="login-error" class="ga-login-error" role="alert">${escapeAttr(model.loginErrorMsg)}</div>`
              : ""
          }

          <div style="display: flex; flex-direction: column; gap: var(--s-2);">
            <button type="submit" id="btn-guest-login" class="btn btn--primary" style="width: 100%;">
              ${
                model.addingAdditionalGuest
                  ? "Save and switch guest"
                  : model.pendingInviteRoomId
                    ? `Join ${escapeAttr(formatRoomHashLabelPure(model.pendingInviteRoomId))}`
                    : "Continue as guest"
              }${DRAWN_ARROW_SVG}
            </button>

            ${
              !model.addingAdditionalGuest
                ? `
                  <button type="button" id="btn-start-solo-game" class="btn btn--secondary" style="width: 100%;">
                    Start solo game with bots
                  </button>
                  <button type="button" id="btn-start-offline-local" class="btn btn--secondary" style="width: 100%;">
                    Play offline with local friends
                  </button>
                `
                : `<button type="button" id="btn-cancel-add-guest" class="btn btn--secondary" style="width: 100%;">Cancel</button>`
            }
          </div>

          ${
            model.deviceGuests.length > 0
              ? `
                <div class="ga-saved-guests">
                  <span class="t-label muted">Guests on this computer</span>
                  <div class="ga-saved-guests__list">
                    ${model.deviceGuests
                      .map(
                        (g) => `
                          <span style="display: inline-flex; align-items: center; gap: 2px;">
                            <button type="button" data-select-saved-guest="${escapeAttr(g.id)}" class="btn btn--secondary btn--sm">
                              ${escapeAttr(g.name)}
                            </button>
                            <button type="button" data-remove-saved-guest="${escapeAttr(g.id)}" class="btn btn--secondary btn--sm" aria-label="Sign out and remove ${escapeAttr(g.name)}" title="Sign out and remove ${escapeAttr(g.name)}">×</button>
                          </span>
                        `
                      )
                      .join("")}
                  </div>
                </div>
              `
              : ""
          }

          <p class="t-small muted">
            Play solo against tabletop bots, pass and play offline with local friends, or add multiple guest profiles on one computer.
          </p>
        </form>
      </main>
    `;
}

export function renderTopbarUserSelectorPure(model: Readonly<AppModel>): string {
  const allRooms = getRoomListPure(model);
  const candidateProfiles: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly fallbackMeta: string;
  }> = [
    {
      id: model.currentUserId,
      name: model.currentUserName,
      fallbackMeta: "Active",
    },
    ...model.deviceGuests.map((g) => ({
      id: g.id,
      name: g.name,
      fallbackMeta: "Guest",
    })),
    ...(!model.useServerBackend && !model.staticHostOnly
      ? USER_PROFILES.map((u) => ({
          id: u.id,
          name: u.name,
          fallbackMeta: u.roleHint,
        }))
      : []),
  ];

  const options = candidateProfiles.reduce<{
    readonly seen: ReadonlySet<string>;
    readonly list: DropdownOption[];
  }>(
    (acc, candidate) => {
      if (!candidate.id || acc.seen.has(candidate.id)) {
        return acc;
      }
      const hostedCount = allRooms.filter(
        (r) => r.ownerId === candidate.id
      ).length;
      const nextSeen = new Set(acc.seen);
      nextSeen.add(candidate.id);
      return {
        seen: nextSeen,
        list: [
          ...acc.list,
          {
            value: candidate.id,
            label: candidate.name,
            meta:
              hostedCount > 0
                ? hostedCount === 1
                  ? "1 room"
                  : `${hostedCount} rooms`
                : candidate.fallbackMeta,
          },
        ],
      };
    },
    { seen: new Set<string>(), list: [] }
  ).list;

  return `
      <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">
        ${
          model.staticHostOnly
            ? `<span class="ga-chip ga-chip--ok">Solo and local play</span>`
            : model.useServerBackend && !model.serverReachable
              ? `<span class="ga-chip ga-chip--warn">Offline mode</span>`
              : ""
        }
        <label class="ga-inline-label" for="sel-user-identity-btn">Guest</label>
        ${
          model.editingGuestName
            ? `<form id="form-rename-guest" style="display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                 <input
                   type="text"
                   id="inp-rename-guest"
                   class="ga-input"
                   maxlength="28"
                   value="${escapeAttr(model.guestRenameDraft)}"
                   aria-label="Guest display name"
                   placeholder="Display name"
                   style="height: 30px; width: 144px; padding: 0 8px; font-size: 13px;"
                 />
                 <button type="submit" id="btn-save-guest-name" class="btn btn--primary btn--sm">Save</button>
                 <button type="button" id="btn-cancel-guest-name" class="btn btn--secondary btn--sm">Cancel</button>
               </form>`
            : `${renderDropdown({
                id: "sel-user-identity",
                value: model.currentUserId,
                size: "sm",
                inline: true,
                align: "end",
                title: "Switch between guest profiles on this computer",
                options,
              })}
              <button type="button" id="btn-edit-guest-name" class="btn btn--secondary btn--sm" title="Rename ${escapeAttr(model.currentUserName)}">Rename</button>`
        }
        <button type="button" id="btn-add-guest" class="btn btn--secondary btn--sm">New guest</button>
        <button type="button" id="btn-sign-out" class="btn btn--secondary btn--sm" title="End ${escapeAttr(model.currentUserName)}'s guest session and clean up their rooms">Sign out</button>
      </div>
    `;
}

export function renderLobbyViewPure(model: Readonly<AppModel>): string {
  const allRooms = getRoomListPure(model);
  const isUserInRoom = (r: ClientRoom): boolean =>
    Boolean(
      (r.ownerId && r.ownerId === model.currentUserId) ||
        r.humanPlayers.some((p) => p.id === model.currentUserId)
    );
  const isVisibleLobbyRoom = (r: ClientRoom): boolean =>
    r.status === "lobby" || r.status === "finished" || isUserInRoom(r);
  const countOpenForGame = (g: SupportedGameId): number =>
    allRooms.filter((r) => r.gameId === g && r.status === "lobby").length;

  const roomsList = allRooms
    .filter((r) => r.gameId === model.lobbyGameFilter && isVisibleLobbyRoom(r))
    .sort((a, b) => {
      const aOpen = a.status === "lobby" ? 0 : 1;
      const bOpen = b.status === "lobby" ? 0 : 1;
      return aOpen - bOpen;
    });

  const effectiveMode: "online" | "offline" =
    !model.useServerBackend || !model.serverReachable
      ? "offline"
      : model.createRoomMode;
  const modeOptions: DropdownOption[] =
    model.useServerBackend && model.serverReachable
      ? [
          { value: "online", label: "Online room", meta: "Live sync" },
          {
            value: "offline",
            label: "Offline local",
            meta: "Solo & friends",
          },
        ]
      : [
          {
            value: "offline",
            label: "Offline local",
            meta: "Solo & friends",
          },
        ];

  const renderOpenBadge = (g: SupportedGameId, seats: string): string => {
    const cnt = countOpenForGame(g);
    return cnt > 0
      ? `<span style="display:inline-flex;align-items:center;gap:5px;"><span class="ga-chip ga-chip--ok ga-num">${cnt} open</span><span class="ga-chip">${seats}</span></span>`
      : `<span class="ga-chip">${seats}</span>`;
  };

  return `
      <header class="ga-nav">
        <div class="ga-nav__inner">
          <div class="ga-brand" role="banner">
            ${BRAND_MARK_SVG}
            <div class="ga-brand__meta">
              <span>Game Arena</span>
              <span class="ga-brand__sub">Online and local tabletop rooms</span>
            </div>
          </div>
          <div class="ga-toolbar">
            ${renderTopbarUserSelectorPure(model)}
          </div>
        </div>
      </header>

      <div class="wrap ga-lobby-shell">
        <div style="display: flex; flex-direction: column; gap: var(--s-3);">
          <div class="ga-filter-grid">
            <div class="game-select-card ${
              model.lobbyGameFilter === "catan" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="catan">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">Settlers of Catan</span>
                  ${renderOpenBadge("catan", "2–6P")}
                </div>
                <span class="game-select-card__desc">Base island, 5–6 player extension, Seafarers, Cities &amp; Knights, and Harbormaster.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="catan" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="catan" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "splendor" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="splendor">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">Splendor</span>
                  ${renderOpenBadge("splendor", "2–4P")}
                </div>
                <span class="game-select-card__desc">Draft gem tokens, acquire mine cards across three tiers, and earn 15 prestige points.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="splendor" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="splendor" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "azul" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="azul">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">Azul</span>
                  ${renderOpenBadge("azul", "2–4P")}
                </div>
                <span class="game-select-card__desc">Draft ceramic tiles from factory displays to score rows and columns on a 5×5 wall.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="azul" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="azul" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "seven_wonders" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="seven_wonders">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">7 Wonders</span>
                  ${renderOpenBadge("seven_wonders", "3–7P")}
                </div>
                <span class="game-select-card__desc">Draft structures across three Ages, trade with neighbors, wage war, and build your Wonder.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="seven_wonders" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="seven_wonders" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>
          </div>
        </div>

        <div class="ga-surface-card">
          <div class="ga-section-bar">
            <div style="display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <h2>Open rooms</h2>
              <span class="ga-chip ga-num">${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} · ${roomsList.length}</span>
            </div>
            <div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${renderDropdown({
                id: "sel-create-room-mode",
                value: effectiveMode,
                size: "sm",
                inline: true,
                align: "end",
                title: "Choose online multiplayer or offline local table",
                options: modeOptions,
              })}
              <button type="button" id="btn-create-room" class="btn btn--primary btn--sm">
                + Create ${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} room
              </button>
            </div>
          </div>

          ${
            roomsList.length === 0
              ? `
                <div class="ga-empty-rooms">
                  <p class="t-body" style="color: var(--ink); font-weight: 500;">No open ${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} rooms right now.</p>
                  <p class="t-small muted">Click <strong>+ Create ${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} room</strong> above to open a room with a shareable invite link.</p>
                </div>
              `
              : `
                <div class="rooms-grid">
                  ${roomsList
                    .map((r) => {
                      const isOwner = Boolean(
                        r.ownerId && r.ownerId === model.currentUserId
                      );
                      const isJoinedGuest =
                        !isOwner &&
                        r.humanPlayers.some(
                          (p) => p.id === model.currentUserId
                        );
                      const hashLabel = formatRoomHashLabelPure(r.roomId);
                      const isCopied = model.copiedRoomLinkId === r.roomId;
                      const gameBadge =
                        r.gameId === "catan"
                          ? `Catan · ${SCENARIO_CATALOG[r.config.scenarioId].name}`
                          : r.gameId === "splendor"
                            ? "Splendor"
                            : r.gameId === "seven_wonders"
                              ? "7 Wonders"
                              : "Azul";
                      const statusBadge =
                        r.status === "lobby"
                          ? `<span class="ga-chip ga-chip--ok">Open</span>`
                          : r.status === "in_progress"
                            ? `<span class="ga-chip ga-chip--warn">In progress</span>`
                            : `<span class="ga-chip">Finished</span>`;
                      const modeChip = r.isOfflineLocal
                        ? `<span class="ga-chip ga-chip--ok">Offline local</span>`
                        : `<span class="ga-chip">Online room</span>`;
                      const hostChipLabel = isOwner
                        ? "Owner: You · editable"
                        : `Host: ${escapeAttr(r.ownerName)}`;
                      const humanCount = r.players.filter(
                        (p) => !p.isBot
                      ).length;
                      const botCount = r.players.length - humanCount;
                      const seatSummary =
                        humanCount === 0
                          ? `${botCount} ${botCount === 1 ? "bot" : "bots"}`
                          : `${r.players.length} ${r.players.length === 1 ? "player" : "players"} (${humanCount} ${humanCount === 1 ? "human" : "humans"}, ${botCount} ${botCount === 1 ? "bot" : "bots"})`;
                      const bounds = getRoomBoundsPure(r);
                      const canDirectStart =
                        isOwner && r.players.length >= bounds.minPlayers;

                      return `
                        <div class="room-card ${isOwner ? "owned-by-me" : ""}">
                          <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                              <span class="room-card__title ga-num">Room ${escapeAttr(hashLabel)}</span>
                              ${statusBadge}
                            </div>
                            <div class="room-card__meta">
                              ${modeChip}
                              <span class="ga-chip">${gameBadge}</span>
                              <span class="ga-chip ${isOwner ? "ga-chip--accent" : ""}">
                                ${hostChipLabel}
                              </span>
                              ${
                                isJoinedGuest
                                  ? `<span class="ga-chip ga-chip--ok">Joined</span>`
                                  : ""
                              }
                            </div>
                            <div class="room-card__seats">
                              ${seatSummary}: ${r.players
                                .map((p) => escapeAttr(p.name))
                                .join(", ")}
                            </div>
                          </div>

                          <div class="room-card__actions">
                            ${
                              r.status === "lobby" || r.status === "finished"
                                ? `<button type="button" data-join-room="${escapeAttr(r.roomId)}" class="btn ${
                                    isOwner
                                      ? "btn--primary"
                                      : "btn--secondary"
                                  } btn--sm" style="flex: 1;">
                                    ${
                                      isOwner
                                        ? r.status === "finished"
                                          ? "Configure rematch"
                                          : "Configure setup"
                                        : isJoinedGuest
                                          ? "Open room"
                                          : "Join room"
                                    }
                                  </button>
                                  ${
                                    !r.isOfflineLocal
                                      ? `<button type="button" data-copy-room-link="${escapeAttr(r.roomId)}" class="btn btn--secondary btn--sm ga-num" title="Copy direct invite link for Room ${escapeAttr(hashLabel)}">${isCopied ? "Copied ✓" : "Copy link"}</button>`
                                      : ""
                                  }
                                  ${
                                    isOwner
                                      ? `<button type="button" data-start-room-direct="${escapeAttr(r.roomId)}" class="btn btn--secondary btn--sm" ${
                                          !canDirectStart ? "disabled" : ""
                                        }>Start match</button>`
                                      : ""
                                  }`
                                : `<button type="button" data-join-room="${escapeAttr(r.roomId)}" class="btn ${
                                    isOwner || isJoinedGuest
                                      ? "btn--primary"
                                      : "btn--secondary"
                                  } btn--sm" style="flex: 1;">
                                    ${
                                      isOwner || isJoinedGuest
                                        ? "Rejoin match"
                                        : "Spectate"
                                    }
                                  </button>`
                            }
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              `
          }
        </div>
      </div>
      ${
        model.guideModalGameId
          ? renderReferenceGuideModalPure(model.guideModalGameId, false)
          : ""
      }
    `;
}

export function renderRoomHeaderPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  activeTab: "setup" | "game"
): string {
  const hasMatchState = Boolean(getRoomStatePure(model, room));
  const hashLabel = formatRoomHashLabelPure(room.roomId);
  const isCopied = model.copiedRoomLinkId === room.roomId;
  const statusChip =
    room.status === "in_progress"
      ? `<span class="ga-chip ga-chip--warn">In progress</span>`
      : room.status === "finished"
        ? `<span class="ga-chip ga-chip--ok">Finished</span>`
        : `<span class="ga-chip">Pre-game</span>`;

  return `
      <header class="ga-nav ga-nav--room">
        <div class="ga-nav__inner">
          <div class="ga-nav__left">
            <button type="button" id="btn-back-lobby" class="ga-brand">
              ${BRAND_MARK_SVG}
              <div class="ga-brand__meta">
                <span class="ga-num">Room ${escapeAttr(hashLabel)}</span>
                <span class="ga-brand__sub">Host: ${escapeAttr(room.ownerName || "Host")} · Back to lobby</span>
              </div>
            </button>

            <div class="ga-tabs" role="navigation" aria-label="Room pages">
              <button type="button" id="tab-setup-page" class="ga-tab ${
                activeTab === "setup" ? "is-active" : ""
              }">Setup</button>
              <button type="button" id="tab-game-page" class="ga-tab ${
                activeTab === "game" ? "is-active" : ""
              }" ${!hasMatchState ? "disabled" : ""}>Game</button>
            </div>

            ${statusChip}
            ${
              room.isOfflineLocal
                ? `<span class="ga-chip ga-chip--ok">Offline local</span>`
                : `<button type="button" id="btn-copy-room-link" data-copy-room-link="${escapeAttr(
                    room.roomId
                  )}" class="btn btn--secondary btn--sm ga-num" title="Copy shareable invite link (${escapeAttr(
                    hashLabel
                  )})">${isCopied ? "Copied ✓" : "Share link"}</button>`
            }
          </div>

          <div class="ga-toolbar">
            ${renderTopbarUserSelectorPure(model)}
          </div>
        </div>
      </header>
    `;
}

export function getStartingPlayerSummaryLabelPure(
  room: ClientRoom,
  state: any
): string {
  if (state && typeof state.startingPlayerIndex === "number") {
    const starter = state.players?.[state.startingPlayerIndex];
    if (starter) {
      return `First turn: ${starter.name}`;
    }
  }
  if (room.startingPlayerMode === "random") {
    return "First turn: Random player";
  }
  if (room.startingPlayerMode === "first") {
    return `First turn: ${room.players[0]?.name ?? "Seat 1"}`;
  }
  const chosen = room.players.find((p) => p.id === room.startingPlayerMode);
  return `First turn: ${chosen?.name ?? "Random player"}`;
}

export function getRoomSetupSummaryDataPure(
  model: Readonly<AppModel>,
  room: ClientRoom
): {
  gameTitle: string;
  formatTitle: string;
  formatDescription: string;
  targetLabel: string;
  seatsLabel: string;
  seatsSubLabel: string;
  ruleChips: string[];
} {
  const state = getRoomStatePure(model, room);
  const humanCount = room.players.filter((p) => !p.isBot).length;
  const botCount = room.players.length - humanCount;
  const diffLabel = BOT_DIFFICULTY_META[room.botDifficulty].label.toLowerCase();
  const seatsLabel = `${room.players.length} ${room.players.length === 1 ? "player" : "players"}`;
  const seatsSubLabel = room.allBots
    ? `All-bot simulation (${diffLabel})`
    : `${humanCount} ${humanCount === 1 ? "human" : "humans"}, ${botCount} ${diffLabel} ${botCount === 1 ? "bot" : "bots"}`;
  const firstTurnChip = getStartingPlayerSummaryLabelPure(room, state);
  const modeLabel = room.isOfflineLocal
    ? "Offline pass and play"
    : "Online multiplayer";

  if (room.gameId === "splendor") {
    const pts = state?.config?.targetPoints ?? 15;
    return {
      gameTitle: "Splendor",
      formatTitle: "Renaissance gem market",
      formatDescription:
        "Draft gem tokens, purchase tier 1–3 development cards, and attract noble patrons.",
      targetLabel: `${pts} prestige points`,
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        firstTurnChip,
        "90 development cards",
        "10-token limit",
      ],
    };
  }

  if (room.gameId === "azul") {
    return {
      gameTitle: "Azul",
      formatTitle: "Evora palace mosaic",
      formatDescription:
        "Draft ceramic tiles from factory displays onto pattern lines to tile a 5×5 wall.",
      targetLabel: "Complete 1 horizontal row",
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        firstTurnChip,
        "100 ceramic tiles",
        "5×5 mosaic wall",
      ],
    };
  }

  if (room.gameId === "seven_wonders") {
    const sideMode = room.config.wonderSideMode ?? "random";
    const wonderChip =
      sideMode === "day"
        ? "Wonder Side A (Day)"
        : sideMode === "night"
          ? "Wonder Side B (Night)"
          : "Random Day/Night Wonders";
    return {
      gameTitle: "7 Wonders",
      formatTitle: "Ancient world drafting",
      formatDescription:
        "Draft cards simultaneously across three Ages, trade with West and East neighbors, wage military conflicts, and raise your Wonder.",
      targetLabel: "Highest VP after Age III",
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        "Simultaneous drafting",
        wonderChip,
        "3 Ages · 6 picks/Age",
      ],
    };
  }

  const sc = SCENARIO_CATALOG[room.config.scenarioId];
  const isCk = Boolean(
    sc.enableCitiesAndKnights || room.config.enableCitiesAndKnights
  );
  const is56Active = Boolean(
    room.players.length >= 5 ||
      isExpanded56Scenario(room.config.scenarioId)
  );
  const targetVp =
    state?.config?.targetVictoryPoints ??
    (isCk && !sc.enableCitiesAndKnights
      ? Math.max(13, sc.defaultTargetVp + (sc.enableSeafarers ? 2 : 3))
      : sc.defaultTargetVp);
  const expansionChips = [
    is56Active ? "5–6P Extension (expanded map & bank)" : "",
    isCk
      ? "Cities & Knights (Metropolises, Knights & Progress)"
      : "",
    sc.enableSeafarers ? "Seafarers ships and islands" : "",
    sc.enableSpecialBuildingPhase || is56Active ? "Special building phase" : "",
    room.config.enableHarbormaster ? "Harbormaster (+2 VP)" : "",
    room.config.enableCityWalls || isCk
      ? "City walls (+2 safe hand)"
      : "",
    room.config.enableFriendlyRobber ? "Friendly robber" : "",
  ].filter(Boolean);
  const ruleChips: string[] = [
    modeLabel,
    firstTurnChip,
    ...(expansionChips.length > 0 ? expansionChips : ["Standard island rules"]),
  ];

  return {
    gameTitle: "Settlers of Catan",
    formatTitle: sc.name,
    formatDescription: sc.description,
    targetLabel: `${targetVp} victory points`,
    seatsLabel,
    seatsSubLabel,
    ruleChips,
  };
}

export function renderSetupSummaryCardPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  isOwner: boolean
): string {
  const info = getRoomSetupSummaryDataPure(model, room);
  const badgeLabel =
    room.status === "in_progress"
      ? "Match active"
      : `Joined as ${escapeAttr(model.currentUserName)}`;
  const noticeCopy =
    room.status === "in_progress"
      ? "A match is currently underway. Table setup unlocks once the game concludes."
      : `Hosted by <strong>${escapeAttr(room.ownerName || "Room host")}</strong>. Review the match setup summary below while waiting for the host to start.`;

  return `
      <div class="ga-surface-card ga-setup-summary">
        <div class="ga-section-bar">
          <h2>Setup summary</h2>
          <span class="ga-chip ${isOwner ? "ga-chip--accent" : ""}">${badgeLabel}</span>
        </div>

        <div class="ga-notice">
          ${noticeCopy}
        </div>

        <div class="ga-summary-grid">
          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Board game</span>
            <span class="ga-summary-cell__value">${info.gameTitle}</span>
            <span class="ga-summary-cell__sub">Host: ${escapeAttr(room.ownerName || "Host")}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Victory target</span>
            <span class="ga-summary-cell__value ga-num">${info.targetLabel}</span>
            <span class="ga-summary-cell__sub ga-num">Room ${escapeAttr(formatRoomHashLabelPure(room.roomId))}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Scenario and format</span>
            <span class="ga-summary-cell__value">${info.formatTitle}</span>
            <span class="ga-summary-cell__sub">${info.formatDescription}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Seats and control</span>
            <span class="ga-summary-cell__value ga-num">${info.seatsLabel}</span>
            <span class="ga-summary-cell__sub">${info.seatsSubLabel}</span>
          </div>
        </div>

        <div class="ga-summary-rules">
          <span class="ga-summary-cell__label">Active rules and expansions</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${info.ruleChips
              .map((chip) => `<span class="ga-chip ga-chip--accent">${escapeAttr(chip)}</span>`)
              .join("")}
          </div>
        </div>
      </div>
    `;
}

export function renderRoomSetupViewPure(
  model: Readonly<AppModel>,
  room: ClientRoom
): {
  readonly html: string;
  readonly canEditSetup: boolean;
  readonly maxBots: number;
  readonly bounds: { minPlayers: number; maxPlayers: number };
} {
  const isOwner = Boolean(room.ownerId && room.ownerId === model.currentUserId);
  const isEditablePhase =
    room.status === "lobby" || room.status === "finished";
  const canEditSetup = isOwner && isEditablePhase;
  const bounds = getRoomBoundsPure(room);
  const humanCount = room.humanPlayers.length;
  const maxBots = room.allBots
    ? bounds.maxPlayers
    : Math.max(0, bounds.maxPlayers - humanCount);
  const minBots = room.allBots ? bounds.minPlayers : 0;

  const botCountOptions: DropdownOption[] = Array.from(
    { length: Math.max(0, maxBots - minBots + 1) },
    (_, idx) => {
      const b = minBots + idx;
      const totalP = room.allBots ? b : humanCount + b;
      return {
        value: String(b),
        label: room.allBots
          ? `${b} bots`
          : b === 0
            ? "0 bots (humans only)"
            : `${b} ${b === 1 ? "bot" : "bots"}`,
        meta: `${totalP} ${totalP === 1 ? "player" : "players"}`,
      };
    }
  );

  const effectiveStartingValue =
    room.startingPlayerMode === "first" && room.players[0]
      ? room.players[0].id
      : room.startingPlayerMode;

  const startingPlayerOptions: DropdownOption[] = [
    { value: "random", label: "Random player", meta: "Fair draw" },
    ...room.players.map((p, idx) => ({
      value: p.id,
      label: `Seat ${idx + 1} · ${p.name}`,
      meta: p.isBot
        ? "Bot"
        : p.id === room.ownerId
          ? "Host"
          : p.controllerId || room.isOfflineLocal
            ? "Local player"
            : "Guest",
    })),
  ];

  const enoughPlayersToStart = room.players.length >= bounds.minPlayers;
  const hasMatchState = Boolean(getRoomStatePure(model, room));
  const isSeatedHuman = room.humanPlayers.some(
    (p) => p.id === model.currentUserId
  );

  const editableFormCard = `
      <div class="ga-surface-card">
        <div class="ga-section-bar">
          <h2>Match configuration</h2>
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="ga-chip ga-num">Room ${escapeAttr(formatRoomHashLabelPure(room.roomId))}</span>
            <span class="ga-chip ga-chip--ok">Owner editable</span>
          </div>
        </div>

        ${
          room.status === "finished"
            ? `<div class="ga-notice ga-notice--accent">
                 The previous match has finished. Adjust any rules below and start the next game.
               </div>`
            : ""
        }

        <div class="ga-field">
          <label for="setup-sel-game-btn">Board game</label>
          ${renderDropdown({
            id: "setup-sel-game",
            value: room.gameId,
            options: [
              {
                value: "catan",
                label: "Settlers of Catan",
                meta: "2–6P",
              },
              { value: "splendor", label: "Splendor", meta: "2–4P" },
              { value: "azul", label: "Azul", meta: "2–4P" },
              {
                value: "seven_wonders",
                label: "7 Wonders",
                meta: "3–7P",
              },
            ],
          })}
        </div>

        ${
          room.gameId === "seven_wonders"
            ? `
          <div class="ga-field">
            <label for="setup-sel-wonderside-btn">Wonder boards</label>
            ${renderDropdown({
              id: "setup-sel-wonderside",
              value: room.config.wonderSideMode ?? "random",
              options: [
                {
                  value: "random",
                  label: "Random Day (A) or Night (B)",
                  meta: "Official mix",
                },
                {
                  value: "day",
                  label: "Day side (A) — balanced classic",
                  meta: "3 stages",
                },
                {
                  value: "night",
                  label: "Night side (B) — asymmetric powers",
                  meta: "2–4 stages",
                },
              ],
            })}
            <p class="t-small muted">Choose symmetric 3-stage Day boards, asymmetric Night powers, or a random flip per seat.</p>
          </div>
        `
            : ""
        }

        ${
          room.gameId === "catan"
            ? (() => {
                const mapScenarioId = toBaseMapScenarioId(room.config.scenarioId);
                return `
          <div class="ga-field">
            <label for="setup-sel-scenario-btn">Catan scenario</label>
            ${renderDropdown({
              id: "setup-sel-scenario",
              value: mapScenarioId,
              options: SELECTABLE_SCENARIO_IDS.map((id) => {
                const sc = SCENARIO_CATALOG[id];
                return {
                  value: sc.id,
                  label: sc.name,
                  meta: `${sc.minPlayers}–${sc.maxPlayers}P`,
                };
              }),
            })}
            <p class="t-small muted">${
              SCENARIO_CATALOG[mapScenarioId].description
            }${
              room.players.length >= 5
                ? " (5–6 Player Extension active automatically.)"
                : ""
            }</p>
          </div>
        `;
              })()
            : ""
        }

        <div class="ga-field">
          <label for="setup-sel-bots-btn">Bots to add</label>
          ${renderDropdown({
            id: "setup-sel-bots",
            value: String(room.botCount),
            options: botCountOptions,
          })}
          <p class="t-small muted">
            ${
              room.allBots
                ? `${room.botCount} bots seated (${bounds.minPlayers}–${bounds.maxPlayers} players required).`
                : `${humanCount} ${humanCount === 1 ? "human" : "humans"} + ${room.botCount} ${room.botCount === 1 ? "bot" : "bots"} = <strong>${room.players.length} total ${room.players.length === 1 ? "player" : "players"}</strong> (${bounds.minPlayers}–${bounds.maxPlayers} required).`
            }
          </p>
        </div>

        <div class="ga-field">
          <label for="setup-sel-starting-player-btn">Starting player</label>
          ${renderDropdown({
            id: "setup-sel-starting-player",
            value: startingPlayerOptions.some(
              (o) => o.value === effectiveStartingValue
            )
              ? effectiveStartingValue
              : "random",
            options: startingPlayerOptions,
          })}
          <p class="t-small muted">Any seated guest, local friend, or bot can take the opening turn.</p>
        </div>

        <div class="ga-field">
          <label for="setup-sel-bot-difficulty-btn">Bot strength</label>
          ${renderDropdown({
            id: "setup-sel-bot-difficulty",
            value: room.botDifficulty,
            options: (
              ["easy", "normal", "smart", "master"] as BotDifficulty[]
            ).map((d) => ({
              value: d,
              label: BOT_DIFFICULTY_META[d].label,
              meta: BOT_DIFFICULTY_META[d].badge,
            })),
          })}
          <p class="t-small muted">${BOT_DIFFICULTY_META[room.botDifficulty].desc}</p>
        </div>

        ${
          room.gameId === "catan"
            ? (() => {
                const ckChecked =
                  room.config.enableCitiesAndKnights ||
                  Boolean(
                    SCENARIO_CATALOG[room.config.scenarioId]
                      .enableCitiesAndKnights
                  );
                return `
        <div>
          <label class="ga-check-row" for="setup-chk-citiesknights">
            <span>Cities &amp; Knights (commodities, knights, metropolises &amp; progress cards)</span>
            <input type="checkbox" id="setup-chk-citiesknights" ${
              ckChecked ? "checked" : ""
            } />
          </label>
          <label class="ga-check-row" for="setup-chk-harbormaster">
            <span>Harbormaster (+2 VP at 3 harbor points)</span>
            <input type="checkbox" id="setup-chk-harbormaster" ${
              room.config.enableHarbormaster ? "checked" : ""
            } />
          </label>
          <label class="ga-check-row" for="setup-chk-citywalls">
            <span>City walls (+2 safe hand limit on 7)</span>
            <input type="checkbox" id="setup-chk-citywalls" ${
              room.config.enableCityWalls || ckChecked ? "checked" : ""
            } ${ckChecked ? "disabled" : ""} />
          </label>
          <label class="ga-check-row" for="setup-chk-friendlyrobber">
            <span>Friendly robber (protects players at 2 VP or below)</span>
            <input type="checkbox" id="setup-chk-friendlyrobber" ${
              room.config.enableFriendlyRobber ? "checked" : ""
            } />
          </label>
        </div>
        `;
              })()
            : ""
        }
      </div>
    `;

  const html = `
      ${renderRoomHeaderPure(model, room, "setup")}

      <div class="ga-room-shell">
        ${canEditSetup ? editableFormCard : renderSetupSummaryCardPure(model, room, isOwner)}

        <aside class="ga-surface-card">
          <div class="ga-section-bar">
            <h2>Table seats (${room.players.length}/${bounds.maxPlayers})</h2>
            <span class="t-label muted">${
              room.status === "lobby"
                ? "Pre-game"
                : room.status === "in_progress"
                  ? "In progress"
                  : "Finished"
            }</span>
          </div>

          ${
            !room.isOfflineLocal
              ? `<div class="ga-invite-bar">
                   <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                     <span class="t-label" style="color:var(--ink);font-weight:500;">Invite friends via direct link</span>
                     <span class="t-label muted ga-num" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#room=${escapeAttr(
                       room.roomId
                     )}</span>
                   </div>
                   <button type="button" data-copy-room-link="${escapeAttr(
                     room.roomId
                   )}" class="btn btn--secondary btn--sm ga-num">${
                     model.copiedRoomLinkId === room.roomId
                       ? "Copied ✓"
                       : "Copy invite link"
                   }</button>
                 </div>`
              : ""
          }

          <div class="ga-seat-list">
            ${room.players
              .map(
                (p, i) => `
              <div class="ga-seat-row">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="player-dot" style="background: ${p.color}"></span>
                  <span style="font-weight: 500;">Seat ${i + 1} · ${escapeAttr(p.name)}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                  ${
                    p.id === room.ownerId
                      ? `<span class="ga-chip ga-chip--accent">Owner</span>`
                      : ""
                  }
                  ${
                    p.id === model.currentUserId
                      ? `<span class="ga-chip ga-chip--ok">You</span>`
                      : ""
                  }
                  ${
                    room.offlinePlayerIds?.includes(p.id)
                      ? `<span class="ga-chip ga-chip--warn" title="Temporarily disconnected — waiting to reconnect">Offline</span>`
                      : ""
                  }
                  <span class="ga-chip">${
                    p.isBot
                      ? `Bot · ${
                          BOT_DIFFICULTY_META[
                            p.botDifficulty ?? room.botDifficulty
                          ].badge
                        }`
                      : p.controllerId ||
                          (room.isOfflineLocal && p.id !== room.ownerId)
                        ? "Local player"
                        : "Guest"
                  }</span>
                  ${
                    canEditSetup && !p.isBot && p.id !== room.ownerId
                      ? `<button type="button" data-remove-player="${escapeAttr(p.id)}" class="btn btn--secondary btn--sm">Remove</button>`
                      : ""
                  }
                </div>
              </div>
            `
              )
              .join("")}
          </div>

          ${
            canEditSetup && !room.allBots
              ? `
                ${
                  room.humanPlayers.length < bounds.maxPlayers
                    ? `
                      <div class="ga-field" style="margin-top: var(--s-2);">
                        <label for="inp-local-friend-name">Add local friend on this computer</label>
                        <div class="ga-local-friend-bar">
                          <input
                            type="text"
                            id="inp-local-friend-name"
                            class="ga-input"
                            maxlength="28"
                            value="${escapeAttr(model.localFriendDraftName)}"
                            placeholder="Friend's name"
                          />
                          <button type="button" id="btn-add-local-friend" class="btn btn--secondary btn--sm">Add player</button>
                        </div>
                      </div>
                    `
                    : ""
                }
                <div class="ga-seat-bot-controls">
                  <span class="t-label muted">Bots added: <strong style="color: var(--ink);">${room.botCount}</strong></span>
                  <div style="display: inline-flex; gap: 6px;">
                    <button type="button" id="btn-seat-remove-bot" class="btn btn--secondary btn--sm" ${
                      room.botCount <= 0 ? "disabled" : ""
                    }>Remove bot</button>
                    <button type="button" id="btn-seat-add-bot" class="btn btn--secondary btn--sm" ${
                      room.botCount >= maxBots ? "disabled" : ""
                    }>Add bot</button>
                  </div>
                </div>
              `
              : ""
          }

          <div style="display: flex; flex-direction: column; gap: var(--s-2); margin-top: var(--s-2);">
            ${
              room.status === "in_progress"
                ? `
                  <p class="t-small muted">
                    Return to the active board to continue playing.
                  </p>
                  <button type="button" id="btn-return-active-game" class="btn btn--primary" style="width: 100%;">
                    Return to game board${DRAWN_ARROW_SVG}
                  </button>
                `
                : canEditSetup
                  ? `
                    <p class="t-small muted">
                      ${
                        enoughPlayersToStart
                          ? "Starting the match locks these rules until the game concludes."
                          : `Add ${bounds.minPlayers - room.players.length} more ${bounds.minPlayers - room.players.length === 1 ? "player or bot" : "players or bots"} to reach the ${bounds.minPlayers}-player minimum.`
                      }
                    </p>
                    <button type="button" id="btn-launch-match" class="btn btn--primary" style="width: 100%;" ${
                      !enoughPlayersToStart ? "disabled" : ""
                    }>
                      ${
                        room.status === "finished"
                          ? "Start next game"
                          : "Start match"
                      }${DRAWN_ARROW_SVG}
                    </button>
                    ${
                      hasMatchState
                        ? `<button type="button" id="btn-return-active-game" class="btn btn--secondary" style="width: 100%;">View finished board</button>`
                        : ""
                    }
                    ${
                      isSeatedHuman
                        ? `<button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">Leave room</button>`
                        : ""
                    }
                  `
                  : roomUsesServerPure(model, room)
                    ? `
                      <div class="ga-notice">
                        Waiting for <strong>${escapeAttr(room.ownerName || "the host")}</strong> to start the match. Your board opens automatically as soon as the game begins.
                      </div>
                      ${
                        hasMatchState
                          ? `<button type="button" id="btn-return-active-game" class="btn btn--secondary" style="width: 100%;">View finished board</button>`
                          : ""
                      }
                      <button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">
                        Leave room
                      </button>
                    `
                    : `
                      <p class="t-small muted">
                        Enter the board to play with the host's configured table rules.
                      </p>
                      <button type="button" id="btn-launch-match" class="btn btn--primary" style="width: 100%;">
                        Enter game board${DRAWN_ARROW_SVG}
                      </button>
                      ${
                        isSeatedHuman
                          ? `<button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">Leave room</button>`
                          : ""
                      }
                    `
            }
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:4px;border-top:1px solid var(--line);">
              <button type="button" data-open-guide="${room.gameId}" class="btn btn--secondary btn--sm">How to play</button>
              <button type="button" data-start-tutorial="${room.gameId}" class="btn btn--secondary btn--sm">Interactive tutorial</button>
            </div>
          </div>
        </aside>
      </div>
      ${
        model.guideModalGameId
          ? renderReferenceGuideModalPure(model.guideModalGameId, false)
          : ""
      }
    `;

  return { html, canEditSetup, maxBots, bounds };
}

export function renderCostPipStripPure(cost: Partial<ResourceMap>): string {
  const pips = RESOURCES.flatMap((r) =>
    Array.from(
      { length: cost[r] ?? 0 },
      () =>
        `<span class="cost-pip res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r, 11)}</span>`
    )
  );
  return `<span class="cost-pip-strip">${pips.join("")}</span>`;
}

export function renderResourceColumnHeadersPure(
  playerResources?: ResourceMap,
  showBank?: ResourceMap,
  tradeRatios?: Record<ResourceType, number>
): string {
  return `
      <div class="ga-res-matrix__row-label">Resource</div>
      ${RESOURCES.map((r) => {
        const ratio = tradeRatios?.[r];
        return `
        <div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${RESOURCE_META[r].label}</span>
            ${
              playerResources
                ? `<span class="ga-res-col-head__have">×${playerResources[r]}</span>`
                : showBank
                  ? `<span class="ga-res-col-head__have">${showBank[r]}</span>`
                  : ""
            }
          </div>
          <div class="ga-res-col-head__card-wrap">
            ${renderMiniResourceCardSvg(r, 48, 30)}
            ${
              ratio !== undefined
                ? `<span class="ga-res-col-head__rate ${
                    ratio < 4 ? "is-port" : ""
                  }" title="${ratio}:1 harbor rate">${ratio}:1</span>`
                : ""
            }
          </div>
        </div>
      `;
      }).join("")}
    `;
}

export function renderTradeGoodColumnHeadersPure(
  player?: Pick<CatanState["players"][number], "resources" | "commodities">,
  bankState?: Pick<CatanState, "bank" | "commodityBank">,
  tradeRatios?: Record<TradeGoodType, number>
): string {
  return `
      <div class="ga-res-matrix__row-label">Goods</div>
      ${TRADE_GOODS.map((g) => {
        const meta = TRADE_GOOD_META[g];
        const ratio = tradeRatios?.[g];
        const haveVal = player ? getPlayerGoodCount(player, g) : undefined;
        const bankVal = bankState ? getBankGoodCount(bankState, g) : undefined;
        return `
        <div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${meta.label}</span>
            ${
              haveVal !== undefined
                ? `<span class="ga-res-col-head__have">×${haveVal}</span>`
                : bankVal !== undefined
                  ? `<span class="ga-res-col-head__have">${bankVal}</span>`
                  : ""
            }
          </div>
          <div class="ga-res-col-head__card-wrap">
            ${renderMiniTradeGoodCardSvg(g, 42, 26)}
            ${
              ratio !== undefined
                ? `<span class="ga-res-col-head__rate ${
                    ratio < 4 ? "is-port" : ""
                  }" title="${ratio}:1 trade rate">${ratio}:1</span>`
                : ""
            }
          </div>
        </div>
      `;
      }).join("")}
    `;
}

export function hasTradeGoodsForOfferPure(
  player: Pick<CatanState["players"][number], "resources" | "commodities">,
  offer: {
    readonly want: Partial<ResourceMap>;
    readonly wantCommodities?: Partial<CommodityMap>;
  }
): boolean {
  return (
    hasResources(player.resources, offer.want) &&
    hasCommodities(player.commodities, offer.wantCommodities)
  );
}

export function renderCatanBarbarianHudPure(
  state: CatanState,
  viewerPlayer?: CatanState["players"][number] | null
): string {
  if (!state.config.enableCitiesAndKnights) {
    return "";
  }
  const defStrength = getTotalActiveKnightStrength(state);
  const barbStrength = getBarbarianStrength(state);
  const isSafe = defStrength >= barbStrength;
  const stepDots = Array.from({ length: BARBARIAN_TRACK_STEPS + 1 }, (_, i) => {
    const isHere = i === state.barbarianPosition;
    const isAttack = i === BARBARIAN_TRACK_STEPS;
    return `<span class="barb-track-dot ${isHere ? "is-ship" : ""} ${
      isAttack ? "is-target" : ""
    }"></span>`;
  }).join("");

  const personalRiskHtml = (() => {
    if (!viewerPlayer || isSafe || barbStrength === 0) return "";
    const myVulnCities = getPlayerVulnerableCities(state, viewerPlayer.id);
    if (myVulnCities.length === 0) {
      return `<span class="ga-chip ga-chip--ok" style="height: 18px; padding: 0 5px; font-size: 10px;" title="You have no unprotected cities on the island">Cities safe</span>`;
    }
    const contenderStrengths = state.players
      .filter((p) => getPlayerVulnerableCities(state, p.id).length > 0)
      .map((p) => getPlayerActiveKnightStrength(state, p.id));
    const minStr = Math.min(...contenderStrengths);
    const myStr = getPlayerActiveKnightStrength(state, viewerPlayer.id);
    if (myStr <= minStr) {
      return `<span class="ga-chip ga-chip--danger" style="height: 18px; padding: 0 5px; font-size: 10px;" title="Your active knights (${myStr}) tie for lowest among unprotected city owners — activate a knight before step 7!">At risk</span>`;
    }
    return `<span class="ga-chip ga-chip--ok" style="height: 18px; padding: 0 5px; font-size: 10px;" title="Another player with an unprotected city has fewer active knights (${minStr} vs your ${myStr})">Cities safe</span>`;
  })();

  const metroPills = IMPROVEMENT_DISCIPLINES.map((disc) => {
    const m = state.metropolises[disc];
    const dMeta = DISCIPLINE_META[disc];
    const owner = m.ownerId
      ? state.players.find((p) => p.id === m.ownerId)
      : undefined;
    return `<span class="ck-metro-pill" style="--metro-accent: ${dMeta.accent};" title="${
      dMeta.label
    } Metropolis (+2 VP): ${
      owner ? `${owner.name} (Lv ${m.level})` : "Unclaimed (reach Lv 4)"
    }">
      ${
        owner
          ? `<span class="player-dot" style="background: ${owner.color}; width: 6px; height: 6px;"></span>`
          : ""
      }
      <span>${dMeta.shortCode}</span>
    </span>`;
  }).join("");

  return `
    <div class="map-barbarian-hud">
      <div class="map-barbarian-hud__top">
        <span class="map-barbarian-hud__title">Fleet ${state.barbarianPosition}/${BARBARIAN_TRACK_STEPS}</span>
        <div style="display: inline-flex; align-items: center; gap: 4px;">
          ${personalRiskHtml}
          <span class="ga-chip ${
            isSafe ? "ga-chip--ok" : "ga-chip--danger"
          } ga-num" style="height: 19px; padding: 0 6px; font-size: 10.5px;" title="Total active knight strength (${defStrength}) vs total island cities (${barbStrength})">
            ⚔ ${defStrength} vs 🏰 ${barbStrength}
          </span>
        </div>
      </div>
      <div class="barb-track-bar" aria-hidden="true">${stepDots}</div>
      <div class="map-barbarian-hud__metros">
        <span class="t-label muted" style="font-size: 10.5px;">Metropolises</span>
        <div style="display: inline-flex; gap: 4px;">${metroPills}</div>
      </div>
    </div>
  `;
}

export function renderCatanMapDiceHudPure(state: CatanState): string {
  if (!state.lastRoll) {
    return `
        <div class="map-dice-hud">
          <div class="map-dice-hud__row">
            ${renderRollDiceButtonGraphicSvg(28)}
            <span class="t-label muted">Roll dice to produce</span>
          </div>
        </div>
      `;
  }

  const { die1, die2, total, eventFace } = state.lastRoll;
  const isSeven = total === 7;
  const rollStats = isSeven
    ? {
        producedByRes: {} as Partial<Record<ResourceType, number>>,
        producedByComm: {} as Partial<Record<CommodityType, number>>,
        goldHexes: 0,
        blockedHexes: 0,
      }
    : state.topology.hexOrder.reduce<{
        readonly producedByRes: Partial<Record<ResourceType, number>>;
        readonly producedByComm: Partial<Record<CommodityType, number>>;
        readonly goldHexes: number;
        readonly blockedHexes: number;
      }>(
        (acc, hId) => {
          const tile = state.hexes[hId]!;
          if (tile.numberToken !== total) return acc;
          if (state.robberHexId === hId) {
            return { ...acc, blockedHexes: acc.blockedHexes + 1 };
          }
          if (tile.terrain === "gold") {
            return { ...acc, goldHexes: acc.goldHexes + 1 };
          }
          const res = TERRAIN_TO_RESOURCE[tile.terrain];
          if (!res) return acc;
          const comm = state.config.enableCitiesAndKnights
            ? TERRAIN_TO_COMMODITY[tile.terrain]
            : null;
          const hasAdjacentCity =
            Boolean(comm) &&
            state.topology.hexes[hId]!.cornerVertexIds.some(
              (vId) => state.buildings[vId]?.type === "city"
            );
          return {
            ...acc,
            producedByRes: {
              ...acc.producedByRes,
              [res]: (acc.producedByRes[res] ?? 0) + 1,
            },
            producedByComm:
              comm && hasAdjacentCity
                ? {
                    ...acc.producedByComm,
                    [comm]: (acc.producedByComm[comm] ?? 0) + 1,
                  }
                : acc.producedByComm,
          };
        },
        { producedByRes: {}, producedByComm: {}, goldHexes: 0, blockedHexes: 0 }
      );

  const prodEntries = RESOURCES.filter(
    (r) => (rollStats.producedByRes[r] ?? 0) > 0
  );
  const commEntries = state.config.enableCitiesAndKnights
    ? COMMODITIES.filter((c) => (rollStats.producedByComm[c] ?? 0) > 0)
    : [];
  const sevenLabel =
    state.config.enableCitiesAndKnights && state.barbarianAttacksCount < 1
      ? "7 rolled · robber dormant until 1st attack"
      : "7 rolled · robber active";
  const yieldsHtml = isSeven
    ? `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#ef4444", 18)} ${sevenLabel}</span>`
    : prodEntries.length > 0 || commEntries.length > 0 || rollStats.goldHexes > 0
      ? [
          ...prodEntries.map(
            (r) =>
              `<span class="map-yield-chip" title="${RESOURCE_META[r].label} hex produced">${renderMiniResourceCardSvg(r, 36, 23)}${
                (rollStats.producedByRes[r] ?? 0) > 1
                  ? ` ×${rollStats.producedByRes[r]}`
                  : ""
              }</span>`
          ),
          ...commEntries.map(
            (c) =>
              `<span class="map-yield-chip" title="${COMMODITY_META[c].label} commodity produced">${renderMiniTradeGoodCardSvg(c, 36, 23)}</span>`
          ),
          rollStats.goldHexes > 0
            ? `<span class="map-yield-chip">${renderActionPieceIconSvg("year_of_plenty", "#facc15", 18)} Gold ×${rollStats.goldHexes}</span>`
            : "",
        ]
          .filter(Boolean)
          .join("")
      : rollStats.blockedHexes > 0
        ? `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#f87171", 16)} Blocked by robber</span>`
        : `<span class="t-label muted">No matching island hex</span>`;

  const eventDieHtml =
    state.config.enableCitiesAndKnights && eventFace
      ? `\n          ${renderEventDieSvg(eventFace, 34)}`
      : "";

  return `
      <div class="map-dice-hud ${isSeven ? "map-dice-hud--seven" : "map-dice-hud--rolled"}">
        <div class="map-dice-hud__row">
          ${renderDieSvg(die1, 34)}
          ${renderDieSvg(die2, 34)}${eventDieHtml}
          <span class="map-dice-hud__total ${isSeven ? "map-dice-hud__total--seven" : ""}">= ${total}</span>
        </div>
        <div class="map-dice-hud__yields">
          ${yieldsHtml}
        </div>
      </div>
    `;
}

export function renderMissingCostBadgePure(
  have: ResourceMap,
  cost: ResourceMap
): string {
  const missing = RESOURCES.flatMap((r) =>
    Array.from(
      { length: Math.max(0, (cost[r] ?? 0) - (have[r] ?? 0)) },
      () =>
        `<span class="cost-pip res-${r}" title="Need ${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r, 11)}</span>`
    )
  );
  return `<span class="cost-pip-strip">${missing.join("")}</span>`;
}

export function renderCatanSpotPopoverPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[]
): string {
  if (
    !model.selectedBoardSpot ||
    !actingPlayer ||
    state.phase === "GAME_OVER"
  ) {
    return "";
  }

  const spot = model.selectedBoardSpot;
  const { xPct, yPct } = getBoardSpotPercentPosition(state, spot);
  const belowClass = yPct < 36 ? "map-spot-popover--below" : "";
  const pColor = actingPlayer.color;

  const details = ((): {
    readonly valid: boolean;
    readonly titleHtml: string;
    readonly actionItems: readonly string[];
    readonly hintHtml: string;
  } => {
    if (spot.kind === "edge") {
      const eNode = state.topology.edges[spot.id];
      if (!eNode) {
        return { valid: false, titleHtml: "", actionItems: [], hintHtml: "" };
      }
      const route = state.edges[spot.id];
      const hasSea = eNode.adjacentHexIds.some(
        (hId) => state.hexes[hId]?.terrain === "sea"
      );
      const hasLand = eNode.adjacentHexIds.some((hId) => {
        const t = state.hexes[hId]?.terrain;
        return t && t !== "sea" && t !== "fog";
      });
      const spotKindLabel =
        hasSea && hasLand
          ? "Coastal edge"
          : hasSea
            ? "Sea lane"
            : "Island path";
      const titleHtml = `${renderActionPieceIconSvg(hasSea && !hasLand ? "ship" : "road", pColor, 18)} <span>${spotKindLabel}</span>`;

      const canBuildRoadHere = legalActions.some(
        (a) => a.type === "BUILD_ROAD" && a.edgeId === spot.id
      );
      const canBuildShipHere = legalActions.some(
        (a) => a.type === "BUILD_SHIP" && a.edgeId === spot.id
      );
      const canSetupRoadHere = legalActions.some(
        (a) =>
          a.type === "PLACE_SETUP_EDGE" &&
          a.edgeId === spot.id &&
          a.edgeKind === "road"
      );
      const canSetupShipHere = legalActions.some(
        (a) =>
          a.type === "PLACE_SETUP_EDGE" &&
          a.edgeId === spot.id &&
          a.edgeKind === "ship"
      );
      const moveFromHere = legalActions.some(
        (a) => a.type === "MOVE_SHIP" && a.fromEdgeId === spot.id
      );
      const moveToHere = model.selectedMoveFromEdgeId
        ? legalActions.some(
            (a) =>
              a.type === "MOVE_SHIP" &&
              a.fromEdgeId === model.selectedMoveFromEdgeId &&
              a.toEdgeId === spot.id
          )
        : false;

      const actionItems = [
        canSetupRoadHere
          ? `<button type="button" data-spot-action="setup_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("road", pColor, 18)} <span>Place starting road</span></button>`
          : "",
        canSetupShipHere
          ? `<button type="button" data-spot-action="setup_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("ship", pColor, 18)} <span>Place starting ship</span></button>`
          : "",
        canBuildRoadHere
          ? `<button type="button" data-spot-action="build_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("road", pColor, 18)} Build road</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">Free</span>` : renderCostPipStripPure(BUILDING_COSTS.road)}
          </button>`
          : "",
        canBuildShipHere
          ? `<button type="button" data-spot-action="build_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("ship", pColor, 18)} Build ship</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">Free</span>` : renderCostPipStripPure(BUILDING_COSTS.ship)}
          </button>`
          : "",
        moveToHere
          ? `<button type="button" data-spot-action="complete_move_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>Sail ship here</span></button>`
          : "",
        moveFromHere
          ? `<button type="button" data-spot-action="start_move_ship" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>Move this ship</span></button>`
          : "",
      ].filter(Boolean);

      const hintHtml = (() => {
        if (actionItems.length > 0) return "";
        if (route) {
          const owner = state.players.find((p) => p.id === route.ownerId);
          return `<div class="t-label muted" style="display: flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg(route.type, owner?.color ?? pColor, 18)} <span>${owner?.name ?? "Player"} ${route.type}</span></div>`;
        }
        const roadGeomOk = getLegalRoadEdges(
          state,
          actingPlayer.id,
          null
        ).includes(spot.id);
        const shipGeomOk =
          state.config.enableSeafarers &&
          getLegalShipEdges(state, actingPlayer.id, null).includes(spot.id);
        if (
          roadGeomOk &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.road)
        ) {
          return `
              <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span>Road needs</span>
                ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.road)}
              </div>
              ${
                state.phase === "MAIN_PHASE" && legalActions.length > 0
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                  : ""
              }
            `;
        }
        if (
          shipGeomOk &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.ship)
        ) {
          return `
              <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span>Ship needs</span>
                ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.ship)}
              </div>
              ${
                state.phase === "MAIN_PHASE" && legalActions.length > 0
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                  : ""
              }
            `;
        }
        return `<div class="t-label muted">Connect a road or ship to build on this edge.</div>`;
      })();

      return { valid: true, titleHtml, actionItems, hintHtml };
    }

    if (spot.kind === "vertex") {
      const vNode = state.topology.vertices[spot.id];
      if (!vNode) {
        return { valid: false, titleHtml: "", actionItems: [], hintHtml: "" };
      }
      const existing = state.buildings[spot.id];
      const existingKnight = state.config.enableCitiesAndKnights
        ? state.knights[spot.id]
        : undefined;
      const harbor = state.harbors.find((h) => {
        const he = state.topology.edges[h.edgeId];
        return he && (he.v1 === spot.id || he.v2 === spot.id);
      });
      const spotTitle = harbor
        ? harbor.type === "generic"
          ? "3:1 Harbor spot"
          : `2:1 ${RESOURCE_META[harbor.type].label} port`
        : existing
          ? existing.metropolis
            ? `${DISCIPLINE_META[existing.metropolis].label} Metropolis`
            : existing.type === "city"
              ? "Fortified city"
              : "Settlement"
          : existingKnight
            ? `${
                existingKnight.level === 3
                  ? "Mighty"
                  : existingKnight.level === 2
                    ? "Strong"
                    : "Basic"
              } knight (${existingKnight.active ? "active" : "inactive"})`
            : "Island intersection";
      const titleHtml = `${renderActionPieceIconSvg(
        existing?.metropolis
          ? "metropolis"
          : existingKnight
            ? "knight_piece"
            : existing?.type === "city"
              ? "city"
              : "settlement",
        existing
          ? state.players.find((p) => p.id === existing.ownerId)?.color ?? pColor
          : existingKnight
            ? state.players.find((p) => p.id === existingKnight.ownerId)?.color ??
              pColor
            : pColor,
        18
      )} <span>${spotTitle}</span>`;

      const canSetupSettleHere = legalActions.some(
        (a) => a.type === "PLACE_SETUP_SETTLEMENT" && a.vertexId === spot.id
      );
      const canSettleHere = legalActions.some(
        (a) => a.type === "BUILD_SETTLEMENT" && a.vertexId === spot.id
      );
      const canCityHere = legalActions.some(
        (a) => a.type === "BUILD_CITY" && a.vertexId === spot.id
      );
      const canWallHere = legalActions.some(
        (a) => a.type === "BUILD_CITY_WALL" && a.vertexId === spot.id
      );
      const canPillageHere =
        state.config.enableCitiesAndKnights &&
        legalActions.some(
          (a) => a.type === "SELECT_PILLAGED_CITY" && a.vertexId === spot.id
        );
      const canBuildKnightHere =
        state.config.enableCitiesAndKnights &&
        legalActions.some(
          (a) => a.type === "BUILD_KNIGHT" && a.vertexId === spot.id
        );
      const canPromoteKnightHere =
        state.config.enableCitiesAndKnights &&
        legalActions.some(
          (a) => a.type === "PROMOTE_KNIGHT" && a.vertexId === spot.id
        );
      const canActivateKnightHere =
        state.config.enableCitiesAndKnights &&
        legalActions.some(
          (a) => a.type === "ACTIVATE_KNIGHT" && a.vertexId === spot.id
        );
      const canMoveKnightFromHere =
        state.config.enableCitiesAndKnights &&
        legalActions.some(
          (a) => a.type === "MOVE_KNIGHT" && a.fromVertexId === spot.id
        );
      const canMoveKnightToHere =
        state.config.enableCitiesAndKnights &&
        model.selectedMoveKnightFromVertexId
          ? legalActions.some(
              (a) =>
                a.type === "MOVE_KNIGHT" &&
                a.fromVertexId === model.selectedMoveKnightFromVertexId &&
                a.toVertexId === spot.id
            )
          : false;
      const canChaseFromHere =
        state.config.enableCitiesAndKnights &&
        legalActions.some(
          (a) => a.type === "CHASE_ROBBER_WITH_KNIGHT" && a.vertexId === spot.id
        );
      const effectiveCityCost = state.config.enableCitiesAndKnights
        ? getEffectiveCityCost(actingPlayer)
        : BUILDING_COSTS.city;
      const setupPieceLabel =
        state.config.enableCitiesAndKnights &&
        state.phase === "SETUP_SETTLEMENT_2"
          ? "Place starting city"
          : "Place starting settlement";

      const actionItems = [
        canSetupSettleHere
          ? `<button type="button" data-spot-action="setup_settlement" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg(state.config.enableCitiesAndKnights && state.phase === "SETUP_SETTLEMENT_2" ? "city" : "settlement", pColor, 18)} <span>${setupPieceLabel}</span></button>`
          : "",
        canPillageHere
          ? `<button type="button" data-spot-action="pillage_city" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", "#ef4444", 18)} <span>Downgrade this city</span></button>`
          : "",
        canSettleHere
          ? `<button type="button" data-spot-action="build_settlement" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("settlement", pColor, 18)} Build settlement</span>
            ${renderCostPipStripPure(BUILDING_COSTS.settlement)}
          </button>`
          : "",
        canCityHere
          ? `<button type="button" data-spot-action="build_city" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("city", pColor, 18)} Upgrade city</span>
            ${renderCostPipStripPure(effectiveCityCost)}
          </button>`
          : "",
        canWallHere
          ? `<button type="button" data-spot-action="build_wall" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("wall", pColor, 18)} Build city wall</span>
            ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
          </button>`
          : "",
        canBuildKnightHere
          ? `<button type="button" data-spot-action="build_knight" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("knight_piece", pColor, 18)} Recruit knight</span>
            ${renderCostPipStripPure(BUILDING_COSTS.knight)}
          </button>`
          : "",
        canActivateKnightHere
          ? `<button type="button" data-spot-action="activate_knight" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("activate_knight", pColor, 18)} Activate knight</span>
            ${renderCostPipStripPure(BUILDING_COSTS.activateKnight)}
          </button>`
          : "",
        canPromoteKnightHere
          ? `<button type="button" data-spot-action="promote_knight" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("promote_knight", pColor, 18)} Promote knight</span>
            ${renderCostPipStripPure(BUILDING_COSTS.knight)}
          </button>`
          : "",
        canMoveKnightToHere
          ? `<button type="button" data-spot-action="complete_move_knight" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_knight", pColor, 18)} <span>March knight here</span></button>`
          : "",
        canMoveKnightFromHere
          ? `<button type="button" data-spot-action="start_move_knight" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_knight", pColor, 18)} <span>Move this knight</span></button>`
          : "",
        canChaseFromHere
          ? `<button type="button" data-spot-action="start_chase_robber" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("chase_robber", pColor, 18)} <span>Chase robber</span></button>`
          : "",
      ].filter(Boolean);

      const hintHtml = (() => {
        if (actionItems.length > 0) return "";
        const effCityCost = state.config.enableCitiesAndKnights
          ? getEffectiveCityCost(actingPlayer)
          : BUILDING_COSTS.city;
        if (
          existing &&
          existing.ownerId === actingPlayer.id &&
          existing.type === "settlement" &&
          !hasResources(actingPlayer.resources, effCityCost)
        ) {
          return `
            <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span>City upgrade needs</span>
              ${renderMissingCostBadgePure(actingPlayer.resources, effCityCost)}
            </div>
            ${
              state.phase === "MAIN_PHASE" && legalActions.length > 0
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                : ""
            }
          `;
        }
        if (
          !existing &&
          getLegalSettlementVertices(state, actingPlayer.id, false).includes(
            spot.id
          ) &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.settlement)
        ) {
          return `
            <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span>Settlement needs</span>
              ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.settlement)}
            </div>
            ${
              state.phase === "MAIN_PHASE" && legalActions.length > 0
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                : ""
            }
          `;
        }
        if (existing) {
          const owner = state.players.find((p) => p.id === existing.ownerId);
          return `<div class="t-label muted">${owner?.name ?? "Player"} ${existing.type}${existing.hasWall ? " · walled" : ""}</div>`;
        }
        const adjOccupied = vNode.adjacentVertexIds.some((nbV) =>
          Boolean(state.buildings[nbV])
        );
        return `<div class="t-label muted">${
          adjOccupied
            ? "Distance rule: adjacent intersection occupied."
            : "Connect your road or ship to settle here."
        }</div>`;
      })();

      return { valid: true, titleHtml, actionItems, hintHtml };
    }

    const tile = state.hexes[spot.id];
    if (!tile) {
      return { valid: false, titleHtml: "", actionItems: [], hintHtml: "" };
    }
    const res = TERRAIN_TO_RESOURCE[tile.terrain];
    const terrainName =
      tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1);
    const titleHtml = `${
      res
        ? renderMiniResourceCardSvg(res, 32, 20)
        : renderActionPieceIconSvg(
            tile.terrain === "sea" ? "ship" : "robber",
            pColor,
            18
          )
    } <span>${terrainName}${tile.numberToken ? ` · #${tile.numberToken}` : ""}</span>`;

    const canRobHere = legalActions.some(
      (a) => a.type === "MOVE_ROBBER" && a.hexId === spot.id
    );
    const canPirateHere = legalActions.some(
      (a) => a.type === "MOVE_PIRATE" && a.hexId === spot.id
    );
    const canPlayKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
    const chaseCandidate = state.config.enableCitiesAndKnights
      ? legalActions.find(
          (
            a
          ): a is Extract<CatanAction, { type: "CHASE_ROBBER_WITH_KNIGHT" }> =>
            a.type === "CHASE_ROBBER_WITH_KNIGHT" &&
            a.hexId === spot.id &&
            (!model.selectedChaseKnightVertexId ||
              a.vertexId === model.selectedChaseKnightVertexId)
        )
      : undefined;

    const actionItems = [
      canRobHere
        ? `<button type="button" data-spot-action="move_robber" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", pColor, 18)} <span>Move robber here</span></button>`
        : "",
      canPirateHere
        ? `<button type="button" data-spot-action="move_pirate" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("pirate", pColor, 18)} <span>Move pirate here</span></button>`
        : "",
      chaseCandidate
        ? `<button type="button" data-spot-action="complete_chase_robber" data-spot-id="${spot.id}" data-chase-vertex="${chaseCandidate.vertexId}" data-chase-target="${chaseCandidate.targetKind ?? "robber"}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("chase_robber", pColor, 18)} <span>Chase ${chaseCandidate.targetKind ?? "robber"} here</span></button>`
        : "",
      canPlayKnight &&
      ((tile.terrain !== "sea" && state.robberHexId !== spot.id) ||
        (tile.terrain === "sea" &&
          state.config.enableSeafarers &&
          state.pirateHexId !== spot.id))
        ? `<button type="button" data-spot-action="play_knight" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("knight", pColor, 18)} <span>Play knight card</span></button>`
        : "",
    ].filter(Boolean);

    const hintHtml =
      actionItems.length === 0
        ? `<div class="t-label muted">${
            state.robberHexId === spot.id
              ? "Robber currently blocks this tile."
              : state.pirateHexId === spot.id
                ? "Pirate ship currently blocks this sea."
                : res
                  ? `Produces ${RESOURCE_META[res].label.toLowerCase()} on roll ${tile.numberToken}.`
                  : "No resource yield on this tile."
          }</div>`
        : "";

    return { valid: true, titleHtml, actionItems, hintHtml };
  })();

  if (!details.valid) return "";

  return `
      <div class="map-spot-popover ${belowClass}" style="left: ${xPct.toFixed(1)}%; top: ${yPct.toFixed(1)}%;">
        <div class="map-spot-popover__head">
          <div class="map-spot-popover__title">${details.titleHtml}</div>
          <button type="button" id="btn-close-spot-popover" class="map-spot-popover__close" aria-label="Close spot menu">×</button>
        </div>
        <div class="map-spot-popover__actions">
          ${details.actionItems.join("")}
          ${details.hintHtml}
        </div>
      </div>
    `;
}

export function renderActiveTradeOfferCardPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: CatanState,
  actingPlayer: CatanState["players"][number],
  canManageMyTrade = false
): string {
  const offer = state.activeTradeOffer!;
  const fromP = state.players.find((p) => p.id === offer.fromPlayerId)!;
  const isResponder = actingPlayer.id !== offer.fromPlayerId;
  const canRespond =
    isResponder &&
    (!actingPlayer.isBot || room.allBots) &&
    canControlPlayerOnDevicePure(model, room, actingPlayer.id);
  const canManage = !canRespond && canManageMyTrade;
  const acceptedIds = offer.acceptedBy ?? [];
  const acceptedPartners = acceptedIds
    .map((pid) => state.players.find((p) => p.id === pid))
    .filter((p): p is CatanState["players"][number] => Boolean(p));
  const targetedOpponents = state.players.filter(
    (p) =>
      p.id !== offer.fromPlayerId &&
      (offer.toPlayerId === null || offer.toPlayerId === p.id)
  );
  const pendingResponders = targetedOpponents.filter(
    (p) => !acceptedIds.includes(p.id) && !offer.declinedBy.includes(p.id)
  );

  const statusLabel = canRespond
    ? `${escapeAttr(actingPlayer.name)} responding`
    : acceptedPartners.length > 0
      ? pendingResponders.length > 0
        ? "Select partner now or wait for others"
        : "Select partner to complete trade"
      : "Awaiting player response";

  const responderChipsHtml = canManage
    ? `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 5px;">
          ${targetedOpponents
            .map((op) => {
              const didAccept = acceptedIds.includes(op.id);
              const didDecline = offer.declinedBy.includes(op.id);
              const chipCls = didAccept
                ? "ga-chip ga-chip--ok"
                : didDecline
                  ? "ga-chip"
                  : "ga-chip ga-chip--warn";
              const stateText = didAccept
                ? "Accepted"
                : didDecline
                  ? "Declined"
                  : "Responding...";
              return `<span class="${chipCls}" style="display: inline-flex; align-items: center; gap: 5px;">
                <span class="player-dot" style="background: ${op.color}; width: 7px; height: 7px;"></span>
                ${escapeAttr(op.name)} · ${stateText}
              </span>`;
            })
            .join("")}
        </div>`
    : "";

  const tradeOfferMatrixHtml = state.config.enableCitiesAndKnights
    ? `<div class="ga-res-matrix ga-res-matrix--ck">
        ${renderTradeGoodColumnHeadersPure(
          canRespond ? actingPlayer : canManage ? fromP : undefined
        )}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--give"></span>Gives
        </div>
        ${TRADE_GOODS.map((g) => {
          const amt = isCommodityType(g)
            ? offer.giveCommodities?.[g] ?? 0
            : offer.give[g] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-give" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `+${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--want"></span>Wants
        </div>
        ${TRADE_GOODS.map((g) => {
          const amt = isCommodityType(g)
            ? offer.wantCommodities?.[g] ?? 0
            : offer.want[g] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-want" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `−${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}
      </div>`
    : `<div class="ga-res-matrix">
        ${renderResourceColumnHeadersPure(
          canRespond
            ? actingPlayer.resources
            : canManage
              ? fromP.resources
              : undefined
        )}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--give"></span>Gives
        </div>
        ${RESOURCES.map((r) => {
          const amt = offer.give[r] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-give" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `+${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--want"></span>Wants
        </div>
        ${RESOURCES.map((r) => {
          const amt = offer.want[r] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-want" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `−${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}
      </div>`;

  const canAffordOfferWant = state.config.enableCitiesAndKnights
    ? hasTradeGoodsForOfferPure(actingPlayer, offer)
    : hasResources(actingPlayer.resources, offer.want);

  return `
      <div class="ga-trade-head">
        <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">
          <span class="player-dot" style="background: ${fromP.color}"></span>
          <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(fromP.name)} trade offer</strong>
          ${responderChipsHtml}
        </div>
        <span class="t-label muted">${statusLabel}</span>
      </div>

      ${tradeOfferMatrixHtml}

      <div class="ga-trade-preview">
        <span class="t-label muted">Inspect the map above while deciding on this trade</span>
        <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto;">
          ${
            canRespond
              ? `
                <button type="button" data-decline-trade="${actingPlayer.id}" class="btn btn--secondary btn--sm">Decline</button>
                <button type="button" data-accept-trade="${actingPlayer.id}" class="btn btn--primary btn--sm action-btn-graphic" ${
                  !canAffordOfferWant
                    ? "disabled"
                    : ""
                }>${renderActionPieceIconSvg("domestic_trade", actingPlayer.color, 16)} <span>Accept</span></button>
              `
              : ""
          }
          ${
            canManage
              ? `
                ${acceptedPartners
                  .map(
                    (partner) => `
                      <button type="button" data-confirm-trade="${escapeAttr(partner.id)}" class="btn btn--primary btn--sm action-btn-graphic">
                        <span class="player-dot" style="background: ${partner.color}"></span>
                        <span>Trade with ${escapeAttr(partner.name)}</span>
                      </button>
                    `
                  )
                  .join("")}
                <button type="button" id="btn-cancel-domestic" class="btn btn--secondary btn--sm">Cancel offer</button>
              `
              : ""
          }
        </div>
      </div>
    `;
}

export function renderCatanMapDecisionPopupPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[]
): string {
  if (!actingPlayer || state.phase === "GAME_OVER" || model.autoPlayBots) {
    return "";
  }

  if (state.phase === "PRE_ROLL") {
    const canKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
    const alchemistCard = state.config.enableCitiesAndKnights
      ? actingPlayer.progressCards.find((c) => c.type === "alchemist")
      : undefined;
    return `
        <div class="map-decision-popup map-decision-popup--compact">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn-roll-graphic">
            <span class="roll-dice-btn-graphic" style="display: inline-flex; align-items: center;">${renderRollDiceButtonGraphicSvg(32)}</span>
            <span>Roll dice</span>
          </button>
          ${
            canKnight
              ? `<button type="button" id="btn-play-knight" class="btn btn--secondary action-btn-graphic">
                   ${renderActionPieceIconSvg("knight", actingPlayer.color, 18)}
                   <span>Play knight</span>
                 </button>`
              : ""
          }${
            alchemistCard
              ? `<button type="button" data-play-progress-card="${alchemistCard.id}" class="btn btn--secondary action-btn-graphic">
                   ${renderActionPieceIconSvg("progress_card", DISCIPLINE_META.science.accent, 18)}
                   <span>Alchemist</span>
                 </button>`
              : ""
          }
        </div>
      `;
  }

  if (state.phase === "STEAL_RESOURCE") {
    return `
        <div class="map-decision-popup map-decision-popup--compact">
          <span class="action-prompt"><strong>Steal 1 card:</strong></span>
          ${state.stealCandidates
            .map((vId) => {
              const victim = state.players.find((p) => p.id === vId)!;
              return `<button type="button" data-steal-victim="${vId}" class="btn btn--primary btn--sm action-btn-graphic">
                <span class="player-dot" style="background: ${victim.color}"></span>
                <span>${victim.name} (${getPlayerResourceCount(victim)})</span>
              </button>`;
            })
            .join("")}
        </div>
      `;
  }

  return "";
}

export function renderCatanActionDockPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[],
  canCancelMyTrade = false
): string {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `<div class="action-buttons" style="justify-content: space-between;">
        <span class="action-prompt"><strong>Match complete.</strong> ${winner?.name ?? "Player"} wins Catan with ${
          winner ? computePlayerVictoryPoints(state, winner.id, false) : 0
        } victory points.</span>
        <button type="button" id="btn-goto-setup-finished" class="btn btn--primary btn--sm">Configure next game${DRAWN_ARROW_SVG}</button>
      </div>`;
  }

  const pColor = actingPlayer.color;

  if (
    state.phase === "SETUP_SETTLEMENT_1" ||
    state.phase === "SETUP_SETTLEMENT_2"
  ) {
    if (
      state.config.enableCitiesAndKnights &&
      state.phase === "SETUP_SETTLEMENT_2"
    ) {
      return `<div class="action-buttons">
        ${renderActionPieceIconSvg("city", pColor, 22)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Click any pulsing intersection on the map to place a starting city.</span>
      </div>`;
    }
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("settlement", pColor, 22)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Click any pulsing intersection on the map to place a starting settlement.</span>
      </div>`;
  }

  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    const anchor = state.lastSetupSettlementVertexId;
    const canShip =
      state.config.enableSeafarers &&
      getLegalShipEdges(state, actingPlayer.id, anchor).length > 0;
    const anchorKind =
      state.config.enableCitiesAndKnights && state.phase === "SETUP_ROAD_2"
        ? "city"
        : "settlement";
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg(model.setupEdgeKind, pColor, 22)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Click a pulsing edge next to your ${anchorKind} to place a starting ${model.setupEdgeKind}.</span>
        ${
          canShip
            ? `<button type="button" id="btn-toggle-setup-edge" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.setupEdgeKind === "road" ? "ship" : "road", pColor, 18)}
                 <span>Switch to ${model.setupEdgeKind === "road" ? "ship" : "road"}</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "BARBARIAN_PILLAGE_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Barbarian raid:</strong> Resolving city downgrade...</span></div>`;
    }
    const vulnerableCities = getPlayerVulnerableCities(state, actingPlayer.id);
    return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Barbarians breached Catan · ${escapeAttr(actingPlayer.name)}:</strong> Choose 1 city to downgrade to a settlement</span>
            <span class="ga-chip ga-chip--danger ga-num">${vulnerableCities.length} vulnerable</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${vulnerableCities
              .map((vId, idx) => {
                const vNode = state.topology.vertices[vId];
                const adjRes = (vNode?.adjacentHexIds ?? [])
                  .map((hId) => {
                    const t = state.hexes[hId];
                    const r = t ? TERRAIN_TO_RESOURCE[t.terrain] : null;
                    return r && t?.numberToken
                      ? `${RESOURCE_META[r].label} #${t.numberToken}`
                      : null;
                  })
                  .filter(Boolean)
                  .join(" · ");
                return `<button type="button" data-pillage-city="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("city", "#ef4444", 16)}
                  <span>City #${idx + 1}${adjRes ? ` (${adjRes})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", "#ef4444", 20)}
          <span class="action-prompt"><strong>Barbarian raid:</strong> Click a pulsing city on the map or pick below.</span>
        </div>`;
  }

  if (state.phase === "PROGRESS_CARD_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Progress cards:</strong> Resolving selection...</span></div>`;
    }
    const isDefenderPick = state.pendingDefenderDeckPicks.includes(
      actingPlayer.id
    );
    if (isDefenderPick) {
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Tied Defender of Catan · ${escapeAttr(actingPlayer.name)}:</strong> Draw 1 free Progress Card</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">
            ${IMPROVEMENT_DISCIPLINES.map((disc) => {
              const dMeta = DISCIPLINE_META[disc];
              const left = state.progressDecks[disc].length;
              return `<button type="button" data-select-progress-deck="${disc}" class="btn btn--secondary btn--sm action-btn-graphic" style="justify-content: space-between;" ${
                left <= 0 ? "disabled" : ""
              }>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                  <span>${dMeta.label}</span>
                </span>
                <span class="ga-chip ga-num">${left} left</span>
              </button>`;
            }).join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", pColor, 20)}
          <span class="action-prompt"><strong>Defender reward:</strong> Choose Trade, Politics, or Science deck below.</span>
        </div>`;
    }

    return `
      <div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          <span class="action-prompt"><strong>Progress hand limit (max 4) · ${escapeAttr(actingPlayer.name)}:</strong> Discard 1 Progress Card</span>
          <span class="ga-chip ga-chip--warn ga-num">${actingPlayer.progressCards.length}/4 held</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${actingPlayer.progressCards
            .map((card) => {
              const cat = PROGRESS_CARD_CATALOG[card.type];
              const dMeta = DISCIPLINE_META[card.discipline];
              return `<button type="button" data-discard-progress-card="${card.id}" class="btn btn--secondary btn--sm action-btn-graphic">
                ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                <span>Discard ${cat.title}</span>
              </button>`;
            })
            .join("")}
        </div>
      </div>
      <div class="action-buttons">
        ${renderActionPieceIconSvg("progress_card", pColor, 20)}
        <span class="action-prompt"><strong>Hand limit:</strong> Choose 1 Progress Card to return to the bottom of its deck.</span>
      </div>`;
  }

  if (state.phase === "DISCARD_ON_SEVEN") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Roll of 7:</strong> Resolving discards...</span></div>`;
    }
    const req = state.pendingDiscards[actingPlayer.id] ?? 0;
    if (state.config.enableCitiesAndKnights) {
      const currentSelected =
        totalResourceCount(model.discardSelection) +
        totalCommodityCount(model.discardCommodities);
      return `
        <div class="sub-modal sub-modal--trade sub-modal--discard">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Discard · ${escapeAttr(actingPlayer.name)}:</strong> Discard ${req} cards</span>
            <span class="ga-chip ${currentSelected === req ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${currentSelected}/${req} selected</span>
          </div>
          <div class="ga-res-matrix ga-res-matrix--ck">
            ${renderTradeGoodColumnHeadersPure(actingPlayer)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Discard
            </div>
            ${TRADE_GOODS.map((g) => {
              const sel = isCommodityType(g)
                ? model.discardCommodities[g]
                : model.discardSelection[g];
              const have = getPlayerGoodCount(actingPlayer, g);
              return `
                <div class="ga-res-cell ${sel > 0 ? "ga-res-cell--active-give" : ""}">
                  <button type="button" data-discard-good-sub="${g}" class="ga-res-step-btn" ${sel <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${sel}</span>
                  <button type="button" data-discard-good-add="${g}" class="ga-res-step-btn" ${sel >= have || currentSelected >= req ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}
          </div>
          <div class="ga-trade-preview">
            <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">Reset</button>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-discard-auto" class="btn btn--secondary btn--sm">Auto-pick ${req}</button>
              <button type="button" id="btn-discard-submit" class="btn btn--primary btn--sm" ${currentSelected !== req ? "disabled" : ""}>Confirm discard</button>
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", pColor, 20)}
          <span class="action-prompt"><strong>Discard required:</strong> Select ${req} resource or commodity cards below while keeping the map in view.</span>
        </div>`;
    }
    const currentSelected = totalResourceCount(model.discardSelection);
    return `
        <div class="sub-modal sub-modal--trade sub-modal--discard">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Roll of 7 · ${escapeAttr(actingPlayer.name)}:</strong> Discard ${req} cards</span>
            <span class="ga-chip ${currentSelected === req ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${currentSelected}/${req} selected</span>
          </div>
          <div class="ga-res-matrix">
            ${renderResourceColumnHeadersPure(actingPlayer.resources)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Discard
            </div>
            ${RESOURCES.map((r) => {
              const sel = model.discardSelection[r];
              const have = actingPlayer.resources[r];
              return `
                <div class="ga-res-cell ${sel > 0 ? "ga-res-cell--active-give" : ""}">
                  <button type="button" data-discard-sub="${r}" class="ga-res-step-btn" ${sel <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${sel}</span>
                  <button type="button" data-discard-add="${r}" class="ga-res-step-btn" ${sel >= have || currentSelected >= req ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}
          </div>
          <div class="ga-trade-preview">
            <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">Reset</button>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-discard-auto" class="btn btn--secondary btn--sm">Auto-pick ${req}</button>
              <button type="button" id="btn-discard-submit" class="btn btn--primary btn--sm" ${currentSelected !== req ? "disabled" : ""}>Confirm discard</button>
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", pColor, 20)}
          <span class="action-prompt"><strong>Roll of 7:</strong> Select ${req} resource cards below while keeping the map in view.</span>
        </div>`;
  }

  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Gold river:</strong> Selecting resources...</span></div>`;
    }
    const rem = state.pendingGoldPicks[actingPlayer.id] ?? 0;
    return `
        <div class="sub-modal sub-modal--trade sub-modal--gold">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Gold river · ${escapeAttr(actingPlayer.name)}:</strong> Pick ${rem} free resource${rem === 1 ? "" : "s"}</span>
            <span class="ga-chip ga-chip--warn ga-num">${rem} left</span>
          </div>
          <div class="ga-res-matrix">
            ${renderResourceColumnHeadersPure(actingPlayer.resources)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>Take 1
            </div>
            ${RESOURCES.map(
              (r) => `
                <button type="button" data-gold-pick="${r}" class="ga-res-port-btn is-selected-want" ${state.bank[r] <= 0 ? "disabled" : ""}>
                  <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
                </button>
              `
            ).join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("year_of_plenty", pColor, 20)}
          <span class="action-prompt"><strong>Gold river:</strong> Select your free resource card in the tray below.</span>
        </div>`;
  }

  if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg(model.robberOrPirateMode, pColor, 22)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Click any pulsing hex on the map to move the ${
          model.robberOrPirateMode === "pirate" ? "pirate ship" : "robber"
        }.</span>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-toggle-robber-pirate" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.robberOrPirateMode === "robber" ? "pirate" : "robber", pColor, 18)}
                 <span>Switch to ${
                   model.robberOrPirateMode === "robber"
                     ? "pirate (sea)"
                     : "robber (land)"
                 }</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "STEAL_RESOURCE") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("robber", pColor, 20)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Choose an adjacent player on the map popup above to draw 1 card.</span>
      </div>`;
  }

  if (state.phase === "ROAD_BUILDING_DEV") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("road_building", pColor, 22)}
        <span class="action-prompt"><strong>Road building active:</strong> Click a highlighted edge on the map (${state.freeRoadsRemaining} free ${state.freeRoadsRemaining === 1 ? "route" : "routes"} left).</span>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-toggle-setup-edge" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.setupEdgeKind === "road" ? "ship" : "road", pColor, 18)}
                 <span>Mode: ${model.setupEdgeKind === "road" ? "Road (switch to Ship)" : "Ship (switch to Road)"}</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "PRE_ROLL") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn--sm action-btn-graphic">${renderRollDiceButtonGraphicSvg(24)} <span>Roll dice</span></button>
        </div>`;
    }
    if (
      state.config.enableCitiesAndKnights &&
      model.buildMode === "progress_card" &&
      model.selectedProgressCardId
    ) {
      const alchCard = actingPlayer.progressCards.find(
        (c) => c.id === model.selectedProgressCardId && c.type === "alchemist"
      );
      if (alchCard) {
        const dFaces = [1, 2, 3, 4, 5, 6];
        return `
          <div class="sub-modal sub-modal--trade">
            <div class="ga-trade-head">
              <div style="display: inline-flex; align-items: center; gap: 7px;">
                ${renderActionPieceIconSvg("progress_card", DISCIPLINE_META.science.accent, 18)}
                <strong style="font-size: var(--t-small); font-weight: 500;">Alchemist — choose exact White & Red dice before Event Die roll</strong>
              </div>
              <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                <span class="t-label muted">White:</span>
                ${dFaces
                  .map(
                    (f) =>
                      `<button type="button" data-alch-die1="${f}" class="btn btn--sm ${
                        model.alchemistDie1 === f
                          ? "btn--primary"
                          : "btn--secondary"
                      } ga-num">${f}</button>`
                  )
                  .join("")}
              </div>
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                <span class="t-label muted">Red (caliper):</span>
                ${dFaces
                  .map(
                    (f) =>
                      `<button type="button" data-alch-die2="${f}" class="btn btn--sm ${
                        model.alchemistDie2 === f
                          ? "btn--primary"
                          : "btn--secondary"
                      } ga-num">${f}</button>`
                  )
                  .join("")}
              </div>
              <button type="button" id="btn-exec-alchemist" class="btn btn--primary btn--sm ga-num" style="margin-left: auto;">
                Roll ${model.alchemistDie1} + ${model.alchemistDie2} = ${model.alchemistDie1 + model.alchemistDie2}
              </button>
            </div>
          </div>
          <div class="action-buttons">
            <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Set your Alchemist dice below or close to roll normally.</span>
          </div>`;
      }
    }
    return `<div class="action-buttons">
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Roll the dice directly on the map above to start your turn (or click any map hex to inspect).</span>
      </div>`;
  }

  if (state.phase === "MAIN_PHASE" && state.activeTradeOffer) {
    if (model.autoPlayBots) {
      return `<div class="sub-modal sub-modal--trade sub-modal--trade-offer">${renderActiveTradeOfferCardPure(
        model,
        room,
        state,
        actingPlayer,
        canCancelMyTrade
      )}</div>`;
    }
    return `
        <div class="sub-modal sub-modal--trade sub-modal--trade-offer">${renderActiveTradeOfferCardPure(
          model,
          room,
          state,
          actingPlayer,
          canCancelMyTrade
        )}</div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("domestic_trade", pColor, 20)}
          <span class="action-prompt"><strong>Active player trade:</strong> Inspect the map above and respond to the resource offer below.</span>
        </div>`;
  }

  const canRoad = legalActions.some((a) => a.type === "BUILD_ROAD");
  const canShip = legalActions.some((a) => a.type === "BUILD_SHIP");
  const canMoveShip = legalActions.some((a) => a.type === "MOVE_SHIP");
  const canSettlement = legalActions.some((a) => a.type === "BUILD_SETTLEMENT");
  const canCity = legalActions.some((a) => a.type === "BUILD_CITY");
  const canWall = legalActions.some((a) => a.type === "BUILD_CITY_WALL");
  const canBuyDev = legalActions.some((a) => a.type === "BUY_DEV_CARD");
  const canKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
  const canRoadBuildDev = legalActions.some(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  const canYoP = legalActions.some((a) => a.type === "PLAY_YEAR_OF_PLENTY");
  const canMonopoly = legalActions.some((a) => a.type === "PLAY_MONOPOLY");
  const canMaritime = legalActions.some((a) => a.type === "MARITIME_TRADE");

  const renderTradeModeTabs = (): string => `
      <div class="ga-trade-tabs" role="tablist" aria-label="Trade mode">
        <button type="button" role="tab" aria-selected="${
          model.buildMode === "maritime_trade"
        }" data-trade-tab="maritime_trade" class="ga-trade-tab ${
          model.buildMode === "maritime_trade" ? "is-active" : ""
        }">
          ${renderActionPieceIconSvg("maritime_trade", pColor, 15)}
          <span>Bank and harbors</span>
        </button>
        <button type="button" role="tab" aria-selected="${
          model.buildMode === "domestic_trade"
        }" data-trade-tab="domestic_trade" class="ga-trade-tab ${
          model.buildMode === "domestic_trade" ? "is-active" : ""
        }">
          ${renderActionPieceIconSvg("domestic_trade", pColor, 15)}
          <span>Player trade</span>
        </button>
      </div>
    `;

  const subModalHtml = ((): string => {
    if (model.buildMode === "maritime_trade") {
      if (state.config.enableCitiesAndKnights) {
        const goodRatios = getPlayerGoodTradeRatios(state, actingPlayer.id);
        const getMarGive = (g: TradeGoodType): number =>
          isCommodityType(g) ? model.maritimeCommGive[g] : model.maritimeGive[g];
        const getMarWant = (g: TradeGoodType): number =>
          isCommodityType(g) ? model.maritimeCommWant[g] : model.maritimeWant[g];

        const giveCredits = TRADE_GOODS.reduce(
          (sum, g) => sum + Math.floor(getMarGive(g) / goodRatios[g]),
          0
        );
        const receiveCount =
          totalResourceCount(model.maritimeWant) +
          totalCommodityCount(model.maritimeCommWant);
        const canExec =
          giveCredits > 0 &&
          giveCredits === receiveCount &&
          TRADE_GOODS.every((g) => {
            const gv = getMarGive(g);
            const wv = getMarWant(g);
            return (
              !(gv > 0 && wv > 0) &&
              gv % goodRatios[g] === 0 &&
              getPlayerGoodCount(actingPlayer, g) >= gv &&
              getBankGoodCount(state, g) >= wv
            );
          });

        const giveCardsPreview = TRADE_GOODS.filter((g) => getMarGive(g) > 0)
          .map(
            (g) =>
              `<span class="map-yield-chip">−${getMarGive(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
          )
          .join("");
        const wantCardsPreview = TRADE_GOODS.filter((g) => getMarWant(g) > 0)
          .map(
            (g) =>
              `<span class="map-yield-chip">+${getMarWant(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
          )
          .join("");

        const statusHint =
          giveCredits === 0 && receiveCount === 0
            ? "Offer resource or commodity bundles (+4, +3, or +2)"
            : giveCredits > receiveCount
              ? `Add ${giveCredits - receiveCount} more requested card${
                  giveCredits - receiveCount === 1 ? "" : "s"
                }`
              : receiveCount > giveCredits
                ? `Add ${receiveCount - giveCredits} more bundle${
                    receiveCount - giveCredits === 1 ? "" : "s"
                  }`
                : `${giveCredits} bank trade${giveCredits === 1 ? "" : "s"} ready`;

        return `<div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            ${renderTradeModeTabs()}
            <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
              <span class="ga-chip ${
                canExec
                  ? "ga-chip--ok"
                  : giveCredits > 0 || receiveCount > 0
                    ? "ga-chip--warn"
                    : ""
              } ga-num">${escapeAttr(statusHint)}</span>
              <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
            </div>
          </div>

          <div class="ga-res-matrix ga-res-matrix--ck">
            ${renderTradeGoodColumnHeadersPure(
              actingPlayer,
              undefined,
              goodRatios
            )}

            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Offer
            </div>
            ${TRADE_GOODS.map((g) => {
              const ratio = goodRatios[g];
              const val = getMarGive(g);
              const canAddBundle =
                getPlayerGoodCount(actingPlayer, g) >= val + ratio;
              return `
                <div class="ga-res-cell ${
                  val > 0 ? "ga-res-cell--active-give" : ""
                }">
                  <button type="button" data-ck-maritime-give-dec="${g}" class="ga-res-step-btn" ${
                    val <= 0 ? "disabled" : ""
                  }>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-maritime-give="${g}" class="ga-res-step-btn" title="Offer ${ratio} ${
                    TRADE_GOOD_META[g].label
                  } (${ratio}:1 rate)" ${!canAddBundle ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}

            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
            </div>
            ${TRADE_GOODS.map((g) => {
              const val = getMarWant(g);
              const bankAvail = getBankGoodCount(state, g);
              return `
                <div class="ga-res-cell ${
                  val > 0 ? "ga-res-cell--active-want" : ""
                }">
                  <button type="button" data-ck-maritime-receive-dec="${g}" class="ga-res-step-btn" ${
                    val <= 0 ? "disabled" : ""
                  }>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-maritime-receive="${g}" class="ga-res-step-btn" ${
                    val >= bankAvail ? "disabled" : ""
                  }>+</button>
                </div>
              `;
            }).join("")}
          </div>

          <div class="ga-trade-preview">
            <div class="ga-trade-bundle">
              ${
                giveCardsPreview || wantCardsPreview
                  ? `${giveCardsPreview || '<span class="t-label muted">No offer</span>'} ${DRAWN_ARROW_SVG} ${wantCardsPreview || '<span class="t-label muted">No request</span>'}`
                  : `<span class="t-label muted">Trade resources & commodities (Trading House Lv 3 unlocks 2:1 commodities)</span>`
              }
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-maritime-reset" class="btn btn--secondary btn--sm">Reset</button>
              <button type="button" id="btn-exec-maritime" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
                !canExec ? "disabled" : ""
              }>
                ${renderActionPieceIconSvg("maritime_trade", pColor, 16)}
                <span>Trade with bank</span>
              </button>
            </div>
          </div>
        </div>`;
      }

      const ratios = getPlayerTradeRatios(state, actingPlayer.id);
      const giveCredits = RESOURCES.reduce(
        (sum, r) => sum + Math.floor(model.maritimeGive[r] / ratios[r]),
        0
      );
      const receiveCount = totalResourceCount(model.maritimeWant);
      const canExec =
        giveCredits > 0 &&
        giveCredits === receiveCount &&
        RESOURCES.every(
          (r) =>
            !(model.maritimeGive[r] > 0 && model.maritimeWant[r] > 0) &&
            model.maritimeGive[r] % ratios[r] === 0 &&
            actingPlayer.resources[r] >= model.maritimeGive[r] &&
            state.bank[r] >= model.maritimeWant[r]
        );

      const giveCardsPreview = RESOURCES.filter(
        (r) => model.maritimeGive[r] > 0
      )
        .map(
          (r) =>
            `<span class="map-yield-chip">−${model.maritimeGive[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
        )
        .join("");
      const wantCardsPreview = RESOURCES.filter(
        (r) => model.maritimeWant[r] > 0
      )
        .map(
          (r) =>
            `<span class="map-yield-chip">+${model.maritimeWant[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
        )
        .join("");

      const statusHint =
        giveCredits === 0 && receiveCount === 0
          ? "Offer harbor bundles (+4, +3, or +2) for your request"
          : giveCredits > receiveCount
            ? `Add ${giveCredits - receiveCount} more requested card${
                giveCredits - receiveCount === 1 ? "" : "s"
              }`
            : receiveCount > giveCredits
              ? `Add ${receiveCount - giveCredits} more harbor bundle${
                  receiveCount - giveCredits === 1 ? "" : "s"
                } for request`
              : `${giveCredits} bank trade${
                  giveCredits === 1 ? "" : "s"
                } ready`;

      return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          ${renderTradeModeTabs()}
          <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
            <span class="ga-chip ${
              canExec
                ? "ga-chip--ok"
                : giveCredits > 0 || receiveCount > 0
                  ? "ga-chip--warn"
                  : ""
            } ga-num">${escapeAttr(statusHint)}</span>
            <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
          </div>
        </div>

        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(
            actingPlayer.resources,
            undefined,
            ratios
          )}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>Offer
          </div>
          ${RESOURCES.map((r) => {
            const ratio = ratios[r];
            const val = model.maritimeGive[r];
            const canAddBundle = actingPlayer.resources[r] >= val + ratio;
            return `
              <div class="ga-res-cell ${
                val > 0 ? "ga-res-cell--active-give" : ""
              }">
                <button type="button" data-maritime-give-dec="${r}" class="ga-res-step-btn" ${
                  val <= 0 ? "disabled" : ""
                }>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-maritime-give="${r}" class="ga-res-step-btn" title="Offer ${ratio} ${
                  RESOURCE_META[r].label
                } (${ratio}:1 rate)" ${!canAddBundle ? "disabled" : ""}>+</button>
              </div>
            `;
          }).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
          </div>
          ${RESOURCES.map((r) => {
            const val = model.maritimeWant[r];
            const bankAvail = state.bank[r];
            return `
              <div class="ga-res-cell ${
                val > 0 ? "ga-res-cell--active-want" : ""
              }">
                <button type="button" data-maritime-receive-dec="${r}" class="ga-res-step-btn" ${
                  val <= 0 ? "disabled" : ""
                }>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-maritime-receive="${r}" class="ga-res-step-btn" ${
                  val >= bankAvail ? "disabled" : ""
                }>+</button>
              </div>
            `;
          }).join("")}
        </div>

        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${
              giveCardsPreview || wantCardsPreview
                ? `${giveCardsPreview || '<span class="t-label muted">No offer</span>'} ${DRAWN_ARROW_SVG} ${wantCardsPreview || '<span class="t-label muted">No request</span>'}`
                : `<span class="t-label muted">Use + and − in each column to set your offer and request</span>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-maritime-reset" class="btn btn--secondary btn--sm">Reset</button>
            <button type="button" id="btn-exec-maritime" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
              !canExec ? "disabled" : ""
            }>
              ${renderActionPieceIconSvg("maritime_trade", pColor, 16)}
              <span>Trade with bank</span>
            </button>
          </div>
        </div>
      </div>`;
    }

    if (model.buildMode === "domestic_trade") {
      if (state.config.enableCitiesAndKnights) {
        const goodRatios = getPlayerGoodTradeRatios(state, actingPlayer.id);
        const getDomGive = (g: TradeGoodType): number =>
          isCommodityType(g) ? model.domesticCommGive[g] : model.domesticGive[g];
        const getDomWant = (g: TradeGoodType): number =>
          isCommodityType(g) ? model.domesticCommWant[g] : model.domesticWant[g];

        const giveTotal =
          totalResourceCount(model.domesticGive) +
          totalCommodityCount(model.domesticCommGive);
        const wantTotal =
          totalResourceCount(model.domesticWant) +
          totalCommodityCount(model.domesticCommWant);
        const canPropose =
          giveTotal > 0 &&
          wantTotal > 0 &&
          TRADE_GOODS.every((g) => !(getDomGive(g) > 0 && getDomWant(g) > 0)) &&
          hasResources(actingPlayer.resources, model.domesticGive) &&
          hasCommodities(actingPlayer.commodities, model.domesticCommGive);

        const giveCardsPreview = TRADE_GOODS.filter((g) => getDomGive(g) > 0)
          .map(
            (g) =>
              `<span class="map-yield-chip">−${getDomGive(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
          )
          .join("");
        const wantCardsPreview = TRADE_GOODS.filter((g) => getDomWant(g) > 0)
          .map(
            (g) =>
              `<span class="map-yield-chip">+${getDomWant(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
          )
          .join("");

        return `<div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            ${renderTradeModeTabs()}
            <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
              <span class="ga-chip ${canPropose ? "ga-chip--ok" : ""}">Open to all players · resources & commodities</span>
              <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
            </div>
          </div>

          <div class="ga-res-matrix ga-res-matrix--ck">
            ${renderTradeGoodColumnHeadersPure(
              actingPlayer,
              undefined,
              goodRatios
            )}

            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Offer
            </div>
            ${TRADE_GOODS.map((g) => {
              const val = getDomGive(g);
              const max = getPlayerGoodCount(actingPlayer, g);
              return `
                <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-give" : ""}">
                  <button type="button" data-ck-dom-give-dec="${g}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-dom-give="${g}" class="ga-res-step-btn" ${val >= max ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}

            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
            </div>
            ${TRADE_GOODS.map((g) => {
              const val = getDomWant(g);
              return `
                <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-want" : ""}">
                  <button type="button" data-ck-dom-want-dec="${g}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-dom-want="${g}" class="ga-res-step-btn">+</button>
                </div>
              `;
            }).join("")}
          </div>

          <div class="ga-trade-preview">
            <div class="ga-trade-bundle">
              ${
                giveCardsPreview || wantCardsPreview
                  ? `${giveCardsPreview || '<span class="t-label muted">No offer</span>'} ${DRAWN_ARROW_SVG} ${wantCardsPreview || '<span class="t-label muted">No request</span>'}`
                  : `<span class="t-label muted">Use + and − in each column to trade resources or commodities</span>`
              }
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-dom-reset" class="btn btn--secondary btn--sm">Reset</button>
              <button type="button" id="btn-dom-propose" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
                !canPropose ? "disabled" : ""
              }>
                ${renderActionPieceIconSvg("domestic_trade", pColor, 16)}
                <span>Send trade offer</span>
              </button>
            </div>
          </div>
        </div>`;
      }

      const ratios = getPlayerTradeRatios(state, actingPlayer.id);
      const canPropose =
        totalResourceCount(model.domesticGive) > 0 &&
        totalResourceCount(model.domesticWant) > 0 &&
        RESOURCES.every(
          (r) => !(model.domesticGive[r] > 0 && model.domesticWant[r] > 0)
        ) &&
        hasResources(actingPlayer.resources, model.domesticGive);

      const giveCardsPreview = RESOURCES.filter(
        (r) => model.domesticGive[r] > 0
      )
        .map(
          (r) =>
            `<span class="map-yield-chip">−${model.domesticGive[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
        )
        .join("");
      const wantCardsPreview = RESOURCES.filter(
        (r) => model.domesticWant[r] > 0
      )
        .map(
          (r) =>
            `<span class="map-yield-chip">+${model.domesticWant[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
        )
        .join("");

      return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          ${renderTradeModeTabs()}
          <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
            <span class="ga-chip ${canPropose ? "ga-chip--ok" : ""}">Open to all players · pick partner after accept</span>
            <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
          </div>
        </div>

        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(
            actingPlayer.resources,
            undefined,
            ratios
          )}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>Offer
          </div>
          ${RESOURCES.map((r) => {
            const val = model.domesticGive[r];
            const max = actingPlayer.resources[r];
            return `
              <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-give" : ""}">
                <button type="button" data-dom-give-dec="${r}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-dom-give="${r}" class="ga-res-step-btn" ${val >= max ? "disabled" : ""}>+</button>
              </div>
            `;
          }).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
          </div>
          ${RESOURCES.map((r) => {
            const val = model.domesticWant[r];
            return `
              <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-want" : ""}">
                <button type="button" data-dom-want-dec="${r}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-dom-want="${r}" class="ga-res-step-btn">+</button>
              </div>
            `;
          }).join("")}
        </div>

        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${
              giveCardsPreview || wantCardsPreview
                ? `${giveCardsPreview || '<span class="t-label muted">No offer</span>'} ${DRAWN_ARROW_SVG} ${wantCardsPreview || '<span class="t-label muted">No request</span>'}`
                : `<span class="t-label muted">Use + and − in each column to set your offer and request</span>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-dom-reset" class="btn btn--secondary btn--sm">Reset</button>
            <button type="button" id="btn-dom-propose" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
              !canPropose ? "disabled" : ""
            }>
              ${renderActionPieceIconSvg("domestic_trade", pColor, 16)}
              <span>Send trade offer</span>
            </button>
          </div>
        </div>
      </div>`;
    }

    if (
      state.config.enableCitiesAndKnights &&
      model.buildMode === "city_upgrades"
    ) {
      return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("city_upgrade", "#fbbf24", 18)}
            <strong style="font-size: var(--t-small); font-weight: 500;">City improvements${
              actingPlayer.activeTurnDiscounts.crane
                ? " · Crane discount (−1 commodity)"
                : ""
            }</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
        </div>
        <div class="ck-upgrades-grid">
          ${IMPROVEMENT_DISCIPLINES.map((disc) => {
            const dMeta = DISCIPLINE_META[disc];
            const cur = actingPlayer.cityImprovements[disc];
            const check = canPlayerUpgradeDiscipline(state, actingPlayer, disc);
            const perkLabel =
              disc === "trade"
                ? "Lv 3 Trading House: 2:1 all commodities"
                : disc === "politics"
                  ? "Lv 3 Fortress: promote Lv 3 Mighty Knights"
                  : "Lv 3 Aqueduct: +1 free card on dry non-7 roll";
            const metro = state.metropolises[disc];
            const metroHolder = metro.ownerId
              ? state.players.find((p) => p.id === metro.ownerId)?.name
              : null;
            const metroHint = metroHolder
              ? metro.ownerId === actingPlayer.id
                ? `You hold Metropolis (Lv ${metro.level})`
                : metro.level < 5
                  ? `Held by ${escapeAttr(metroHolder)} (snipe at Lv ${metro.level + 1})`
                  : `Locked by ${escapeAttr(metroHolder)} (Lv 5)`
              : "Unclaimed +2 VP Metropolis at Lv 4";
            const selectedMetroVId =
              model.selectedMetropolisVertexId &&
              check.eligibleMetropolisVertices.includes(
                model.selectedMetropolisVertexId
              )
                ? model.selectedMetropolisVertexId
                : check.eligibleMetropolisVertices[0] ?? null;

            return `<div class="ck-upgrade-col" style="--disc-accent: ${dMeta.accent}; --disc-border: ${dMeta.border};">
              <div class="ck-upgrade-col__top">
                <strong style="color: ${dMeta.accent}; font-size: 12px;">${dMeta.label}</strong>
                <span class="ga-chip ga-num">Lv ${cur}/5</span>
              </div>
              <div class="ck-upgrade-col__perk ${cur >= 3 ? "is-unlocked" : ""}">
                <div>${perkLabel}</div>
                <div class="muted" style="font-size: 10.5px; margin-top: 2px;">${metroHint}</div>
              </div>
              ${
                check.claimsMetropolis &&
                check.eligibleMetropolisVertices.length > 1
                  ? `<div style="display: flex; gap: 4px; flex-wrap: wrap;">
                      ${check.eligibleMetropolisVertices
                        .map(
                          (vId, idx) =>
                            `<button type="button" data-select-metro-city="${vId}" class="ga-chip ${
                              selectedMetroVId === vId ? "ga-chip--warn" : ""
                            }" style="cursor: pointer;">City #${idx + 1}</button>`
                        )
                        .join("")}
                    </div>`
                  : ""
              }
              <div class="ck-upgrade-col__foot">
                ${
                  cur >= 5
                    ? `<span class="ga-chip ga-chip--ok" style="width: 100%; justify-content: center;">Max level 5</span>`
                    : `<span class="t-label ga-num" style="display: inline-flex; align-items: center; gap: 4px;">
                        ${renderCommodityGlyphSvg(check.costCommodity, 13)}
                        ${actingPlayer.commodities[check.costCommodity]}/${check.costAmount}
                      </span>
                      <button type="button" data-upgrade-discipline="${disc}" data-metro-vertex="${selectedMetroVId ?? ""}" class="btn btn--primary btn--sm" ${
                        !check.allowed ? "disabled" : ""
                      }>
                        ${
                          check.claimsMetropolis
                            ? `Crown Lv ${check.nextLevel}`
                            : `Lv ${check.nextLevel}`
                        }
                      </button>`
                }
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }

    if (
      state.config.enableCitiesAndKnights &&
      model.buildMode === "progress_card" &&
      model.selectedProgressCardId
    ) {
      const card = actingPlayer.progressCards.find(
        (c) => c.id === model.selectedProgressCardId
      );
      if (card) {
        const cat = PROGRESS_CARD_CATALOG[card.type];
        const dMeta = DISCIPLINE_META[card.discipline];
        const matchingActions = legalActions.filter(
          (
            a
          ): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
            a.type === "PLAY_PROGRESS_CARD" && a.cardId === card.id
        );

        const controlsHtml = ((): string => {
          if (
            card.type === "resource_monopoly" ||
            card.type === "commercial_harbor"
          ) {
            const availRes = RESOURCES.filter((r) =>
              matchingActions.some((a) => a.params?.resource === r)
            );
            return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${availRes
                .map(
                  (r) =>
                    `<button type="button" data-prog-res="${r}" class="btn btn--secondary btn--sm action-btn-graphic">
                      ${renderMiniResourceCardSvg(r, 32, 20)}
                      <span>${RESOURCE_META[r].label}</span>
                    </button>`
                )
                .join("")}
            </div>`;
          }
          if (card.type === "trade_monopoly") {
            return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${COMMODITIES.map(
                (c) =>
                  `<button type="button" data-prog-comm="${c}" class="btn btn--secondary btn--sm action-btn-graphic">
                    ${renderMiniTradeGoodCardSvg(c, 32, 20)}
                    <span>${COMMODITY_META[c].label}</span>
                  </button>`
              ).join("")}
            </div>`;
          }
          if (card.type === "merchant_fleet") {
            return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${TRADE_GOODS.map(
                (g) =>
                  `<button type="button" data-prog-good="${g}" class="btn btn--secondary btn--sm action-btn-graphic">
                    ${renderMiniTradeGoodCardSvg(g, 30, 19)}
                    <span>2:1 ${TRADE_GOOD_META[g].label}</span>
                  </button>`
              ).join("")}
            </div>`;
          }
          if (
            card.type === "spy" ||
            card.type === "master_merchant" ||
            card.type === "deserter"
          ) {
            if (card.type === "deserter" && model.deserterTargetPlayerId) {
              const targetOpp = state.players.find(
                (o) => o.id === model.deserterTargetPlayerId
              );
              return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                <span class="t-small muted">Target <strong>${escapeAttr(targetOpp?.name ?? "opponent")}</strong> selected — click any highlighted open intersection on your road network to place the deserted knight:</span>
                <button type="button" data-deserter-reset="true" class="btn btn--secondary btn--sm">Change target</button>
              </div>`;
            }
            const opps = state.players.filter((opp) =>
              matchingActions.some((a) => a.params?.targetPlayerId === opp.id)
            );
            return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${opps
                .map(
                  (opp) =>
                    `<button type="button" data-prog-opp="${opp.id}" class="btn btn--secondary btn--sm action-btn-graphic">
                      <span class="player-dot" style="background: ${opp.color}"></span>
                      <span>Target ${escapeAttr(opp.name)}</span>
                    </button>`
                )
                .join("")}
            </div>`;
          }
          if (card.type === "inventor") {
            return `<div class="t-small muted">
              ${
                model.inventorHex1
                  ? `1st tile selected (<strong>#${state.hexes[model.inventorHex1]?.numberToken}</strong>) — now click a 2nd highlighted tile on the map to swap numbers.`
                  : "Click any 2 highlighted number tiles on the map above (excluding 2, 6, 8, 12) to swap their tokens."
              }
            </div>`;
          }
          if (card.type === "smith") {
            const promotable = getLegalPromoteKnightVertices(
              state,
              actingPlayer.id,
              true
            );
            return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
              <span class="t-small muted">${
                model.smithVertex1
                  ? "1st knight selected — click a 2nd knight on the map or confirm 1 promotion:"
                  : "Click up to 2 highlighted knights on the map to promote for free."
              }</span>
              ${
                model.smithVertex1 || promotable.length === 1
                  ? `<button type="button" id="btn-exec-smith-single" class="btn btn--primary btn--sm">Promote selected knight</button>`
                  : ""
              }
            </div>`;
          }
          return `<div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            <span class="t-small muted">Click a highlighted target on the map above, or choose directly:</span>
            ${matchingActions
              .slice(0, 6)
              .map((act, idx) => {
                const label = act.params?.hexId
                  ? `${state.hexes[act.params.hexId]?.terrain ?? "Hex"} #${state.hexes[act.params.hexId]?.numberToken ?? ""}`
                  : act.params?.vertexId
                    ? `Spot #${idx + 1}`
                    : act.params?.edgeId
                      ? `Road #${idx + 1}`
                      : `Option #${idx + 1}`;
                return `<button type="button" data-prog-action-idx="${idx}" class="btn btn--secondary btn--sm">${escapeAttr(label.trim())}</button>`;
              })
              .join("")}
          </div>`;
        })();

        return `<div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <div style="display: inline-flex; align-items: center; gap: 7px;">
              ${renderActionPieceIconSvg("progress_card", dMeta.accent, 18)}
              <strong style="font-size: var(--t-small); font-weight: 500;">${cat.title} — ${escapeAttr(cat.description)}</strong>
            </div>
            <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
          </div>
          ${controlsHtml}
        </div>`;
      }
    }

    if (model.buildMode === "year_of_plenty") {
      return `<div class="sub-modal">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("year_of_plenty", pColor, 20)}
            <strong style="font-size: var(--t-small); font-weight: 500;">Year of plenty — choose 2 free bank cards</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
        </div>
        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(undefined, state.bank)}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>1st card
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-yop-pick1="${r}" class="ga-res-port-btn ${
                model.yopRes1 === r ? "is-selected-want" : ""
              }" ${state.bank[r] <= 0 ? "disabled" : ""}>
                <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>2nd card
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-yop-pick2="${r}" class="ga-res-port-btn ${
                model.yopRes2 === r ? "is-selected-want" : ""
              }" ${
                state.bank[r] <= (model.yopRes1 === r ? 1 : 0) ? "disabled" : ""
              }>
                <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(model.yopRes1, 42, 27)}
            ${renderMiniResourceCardSvg(model.yopRes2, 42, 27)}
          </div>
          <button type="button" id="btn-exec-yop" class="btn btn--primary btn--sm">Take 2 resources</button>
        </div>
      </div>`;
    }

    if (model.buildMode === "monopoly") {
      return `<div class="sub-modal">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("monopoly", pColor, 20)}
            <strong style="font-size: var(--t-small); font-weight: 500;">Monopoly — claim every opponent copy of 1 resource</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
        </div>
        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(actingPlayer.resources)}
          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Claim all
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-mono-pick="${r}" class="ga-res-port-btn ${
                model.monoRes === r ? "is-selected-want" : ""
              }">
                <span style="font-size: 13px; font-weight: 600;">${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(model.monoRes, 44, 28)}
          </div>
          <button type="button" id="btn-exec-mono" class="btn btn--primary btn--sm">Claim all ${RESOURCE_META[model.monoRes].label.toLowerCase()}</button>
        </div>
      </div>`;
    }

    return "";
  })();

  if (state.config.enableCitiesAndKnights) {
    const canBuildKnight = legalActions.some((a) => a.type === "BUILD_KNIGHT");
    const canActivateKnight = legalActions.some(
      (a) => a.type === "ACTIVATE_KNIGHT"
    );
    const canPromoteKnight = legalActions.some(
      (a) => a.type === "PROMOTE_KNIGHT"
    );
    const canMoveKnight = legalActions.some((a) => a.type === "MOVE_KNIGHT");
    const canChaseRobber = legalActions.some(
      (a) => a.type === "CHASE_ROBBER_WITH_KNIGHT"
    );
    const canUpgradeAny = legalActions.some(
      (a) => a.type === "UPGRADE_CITY_IMPROVEMENT"
    );
    const cityCost = getEffectiveCityCost(actingPlayer);

    return `
      ${subModalHtml}
      <div class="action-buttons">
        <button type="button" id="btn-mode-road" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "road" ? "is-selected" : ""
        }" ${!canRoad ? "disabled" : ""}>
          ${renderActionPieceIconSvg("road", pColor, 18)}
          <span>Road</span>
          ${renderCostPipStripPure(BUILDING_COSTS.road)}
        </button>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-mode-ship" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "ship" ? "is-selected" : ""
              }" ${!canShip ? "disabled" : ""}>
                ${renderActionPieceIconSvg("ship", pColor, 18)}
                <span>Ship</span>
                ${renderCostPipStripPure(BUILDING_COSTS.ship)}
              </button>
              <button type="button" id="btn-mode-moveship" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "move_ship" ? "is-selected" : ""
              }" ${!canMoveShip ? "disabled" : ""}>
                ${renderActionPieceIconSvg("move_ship", pColor, 18)}
                <span>Move ship</span>
              </button>`
            : ""
        }
        <button type="button" id="btn-mode-settlement" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "settlement" ? "is-selected" : ""
        }" ${!canSettlement ? "disabled" : ""}>
          ${renderActionPieceIconSvg("settlement", pColor, 18)}
          <span>Settlement</span>
          ${renderCostPipStripPure(BUILDING_COSTS.settlement)}
        </button>
        <button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "city" ? "is-selected" : ""
        }" ${!canCity ? "disabled" : ""}>
          ${renderActionPieceIconSvg("city", pColor, 18)}
          <span>City</span>
          ${renderCostPipStripPure(cityCost)}
        </button>
        <button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "wall" ? "is-selected" : ""
        }" ${!canWall ? "disabled" : ""}>
          ${renderActionPieceIconSvg("wall", pColor, 18)}
          <span>Wall</span>
          ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
        </button>
        <button type="button" id="btn-mode-knight" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "knight" ? "is-selected" : ""
        }" ${!canBuildKnight ? "disabled" : ""}>
          ${renderActionPieceIconSvg("knight_piece", pColor, 18)}
          <span>Knight</span>
          ${renderCostPipStripPure(BUILDING_COSTS.knight)}
        </button>
        <button type="button" id="btn-mode-activate-knight" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "activate_knight" ? "is-selected" : ""
        }" ${!canActivateKnight ? "disabled" : ""}>
          ${renderActionPieceIconSvg("activate_knight", pColor, 18)}
          <span>Activate</span>
          ${renderCostPipStripPure(BUILDING_COSTS.activateKnight)}
        </button>
        <button type="button" id="btn-mode-promote-knight" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "promote_knight" ? "is-selected" : ""
        }" ${!canPromoteKnight ? "disabled" : ""}>
          ${renderActionPieceIconSvg("promote_knight", pColor, 18)}
          <span>Promote</span>
          ${renderCostPipStripPure(BUILDING_COSTS.knight)}
        </button>
        ${
          canMoveKnight || model.buildMode === "move_knight"
            ? `<button type="button" id="btn-mode-move-knight" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "move_knight" ? "is-selected" : ""
              }" ${!canMoveKnight ? "disabled" : ""}>
                ${renderActionPieceIconSvg("move_knight", pColor, 18)}
                <span>March</span>
              </button>`
            : ""
        }
        ${
          canChaseRobber || model.buildMode === "chase_robber"
            ? `<button type="button" id="btn-mode-chase-robber" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "chase_robber" ? "is-selected" : ""
              }" ${!canChaseRobber ? "disabled" : ""}>
                ${renderActionPieceIconSvg("chase_robber", pColor, 18)}
                <span>Chase robber</span>
              </button>`
            : ""
        }
        <button type="button" id="btn-mode-upgrades" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "city_upgrades" ? "is-selected" : ""
        }">
          ${renderActionPieceIconSvg("city_upgrade", "#fbbf24", 18)}
          <span>Upgrades${canUpgradeAny ? " •" : ""}</span>
        </button>
        ${
          state.phase === "MAIN_PHASE"
            ? `<button type="button" id="btn-mode-maritime" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "maritime_trade" ? "is-selected" : ""
              }" title="${
                canMaritime
                  ? "Trade resources or commodities with the bank"
                  : "Inspect trade rates or switch to player trade"
              }">
                ${renderActionPieceIconSvg("maritime_trade", pColor, 18)}
                <span>Bank trade</span>
              </button>
              <button type="button" id="btn-mode-domestic" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "domestic_trade" ? "is-selected" : ""
              }">
                ${renderActionPieceIconSvg("domestic_trade", pColor, 18)}
                <span>Player trade</span>
              </button>`
            : ""
        }
        <button type="button" id="btn-end-turn" class="btn btn--primary btn--sm action-btn-graphic" style="margin-left: auto;">
          <span>${
            state.phase === "SPECIAL_BUILDING"
              ? "Finish build"
              : "End turn"
          }</span>
          ${renderActionPieceIconSvg("end_turn", pColor, 16)}
        </button>
      </div>
    `;
  }

  return `
      ${subModalHtml}
      <div class="action-buttons">
        <button type="button" id="btn-mode-road" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "road" ? "is-selected" : ""
        }" ${!canRoad ? "disabled" : ""}>
          ${renderActionPieceIconSvg("road", pColor, 18)}
          <span>Road</span>
          ${renderCostPipStripPure(BUILDING_COSTS.road)}
        </button>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-mode-ship" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "ship" ? "is-selected" : ""
              }" ${!canShip ? "disabled" : ""}>
                ${renderActionPieceIconSvg("ship", pColor, 18)}
                <span>Ship</span>
                ${renderCostPipStripPure(BUILDING_COSTS.ship)}
              </button>
              <button type="button" id="btn-mode-moveship" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "move_ship" ? "is-selected" : ""
              }" ${!canMoveShip ? "disabled" : ""}>
                ${renderActionPieceIconSvg("move_ship", pColor, 18)}
                <span>Move ship</span>
              </button>`
            : ""
        }
        <button type="button" id="btn-mode-settlement" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "settlement" ? "is-selected" : ""
        }" ${!canSettlement ? "disabled" : ""}>
          ${renderActionPieceIconSvg("settlement", pColor, 18)}
          <span>Settlement</span>
          ${renderCostPipStripPure(BUILDING_COSTS.settlement)}
        </button>
        <button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "city" ? "is-selected" : ""
        }" ${!canCity ? "disabled" : ""}>
          ${renderActionPieceIconSvg("city", pColor, 18)}
          <span>City</span>
          ${renderCostPipStripPure(BUILDING_COSTS.city)}
        </button>
        ${
          state.config.enableCityWalls
            ? `<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "wall" ? "is-selected" : ""
              }" ${!canWall ? "disabled" : ""}>
                ${renderActionPieceIconSvg("wall", pColor, 18)}
                <span>Wall</span>
                ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
              </button>`
            : ""
        }
        <button type="button" id="btn-buy-dev" class="btn btn--secondary btn--sm action-btn-graphic" ${
          !canBuyDev ? "disabled" : ""
        }>
          ${renderActionPieceIconSvg("dev_card", pColor, 18)}
          <span>Dev card</span>
          ${renderCostPipStripPure(BUILDING_COSTS.devCard)}
        </button>
        ${
          state.phase === "MAIN_PHASE"
            ? `<button type="button" id="btn-mode-maritime" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "maritime_trade" ? "is-selected" : ""
              }" title="${
                canMaritime
                  ? "Trade resources with the bank or harbors"
                  : "Inspect harbor rates or switch to player trade"
              }">
                ${renderActionPieceIconSvg("maritime_trade", pColor, 18)}
                <span>Bank trade</span>
              </button>
              <button type="button" id="btn-mode-domestic" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "domestic_trade" ? "is-selected" : ""
              }">
                ${renderActionPieceIconSvg("domestic_trade", pColor, 18)}
                <span>Player trade</span>
              </button>`
            : ""
        }
        ${
          canKnight
            ? `<button type="button" id="btn-play-knight" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("knight", pColor, 18)} <span>Knight</span></button>`
            : ""
        }
        ${
          canRoadBuildDev
            ? `<button type="button" id="btn-play-roadbuild" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("road_building", pColor, 18)} <span>2 roads</span></button>`
            : ""
        }
        ${
          canYoP
            ? `<button type="button" id="btn-mode-yop" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "year_of_plenty" ? "is-selected" : ""
              }">${renderActionPieceIconSvg("year_of_plenty", pColor, 18)} <span>Year of plenty</span></button>`
            : ""
        }
        ${
          canMonopoly
            ? `<button type="button" id="btn-mode-mono" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "monopoly" ? "is-selected" : ""
              }">${renderActionPieceIconSvg("monopoly", pColor, 18)} <span>Monopoly</span></button>`
            : ""
        }
        <button type="button" id="btn-end-turn" class="btn btn--primary btn--sm action-btn-graphic" style="margin-left: auto;">
          <span>${
            state.phase === "SPECIAL_BUILDING"
              ? "Finish build"
              : "End turn"
          }</span>
          ${renderActionPieceIconSvg("end_turn", pColor, 16)}
        </button>
      </div>
    `;
}

export function renderCatanPlayerCardPure(
  currentUserId: string,
  state: CatanState,
  p: CatanState["players"][number],
  isActing: boolean,
  isOffline = false
): string {
  const visibleVp = computePlayerVictoryPoints(state, p.id, true);
  const totalVp = computePlayerVictoryPoints(state, p.id, false);
  const showPrivateHand = !p.handRedacted || state.phase === "GAME_OVER";
  const cardCount = getPlayerResourceCount(p);
  const safeLimit = getPlayerSafeHandLimit(state, p.id);
  const unplayedDevs = p.devCards.filter((c) => !c.played);
  const botBadge = p.isBot
    ? `Bot · ${BOT_DIFFICULTY_META[p.botDifficulty ?? "smart"].badge}`
    : p.id === currentUserId
      ? "You · Guest"
      : "Guest";
  const offlineChip = isOffline
    ? `<span class="ga-chip ga-chip--warn" title="Temporarily disconnected — waiting to reconnect">Offline</span>`
    : "";

  const hiddenCardIconSvg = `<svg width="13" height="15" viewBox="0 0 14 16" aria-hidden="true"><rect x="1.5" y="1" width="11" height="14" rx="2.2" fill="#27272a" stroke="#a1a1aa" stroke-width="1.2"/><path d="M4.2 4.5h5.6M4.2 8h5.6M4.2 11.5h3.6" stroke="#fb923c" stroke-width="1.1" stroke-linecap="round"/></svg>`;

  if (state.config.enableCitiesAndKnights) {
    const activeStr = getPlayerActiveKnightStrength(state, p.id);
    const progCount = p.handRedacted
      ? p.hiddenProgressCardCount ?? 0
      : p.progressCards.length;
    return `
      <div class="player-card ${isActing ? "active-turn" : ""}">
        <div class="player-header">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span class="player-dot" style="background: ${p.color}"></span>
            <strong class="player-card__name">${escapeAttr(p.name)}</strong>
            <span class="ga-chip">${botBadge}</span>
            ${offlineChip}
          </div>
          <span class="ga-chip ga-chip--warn ga-num">${
            showPrivateHand
              ? `${totalVp} VP${totalVp !== visibleVp ? ` (${visibleVp})` : ""}`
              : `${visibleVp} VP`
          }</span>
        </div>

        <div class="player-card__hud-row">
          <div class="res-pills">
            ${
              showPrivateHand
                ? `${RESOURCES.map(
                    (r) =>
                      `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r)} ${p.resources[r]}</span>`
                  ).join("")}${COMMODITIES.map(
                    (c) =>
                      `<span class="res-pill res-${c}" title="${COMMODITY_META[c].label}">${renderCommodityGlyphSvg(c)} ${p.commodities[c]}</span>`
                  ).join("")}`
                : `<span class="res-pill res-pill--hidden ga-num" title="Hidden resource & commodity cards in hand">${hiddenCardIconSvg} ${cardCount} ${
                    cardCount === 1 ? "card" : "cards"
                  }</span>`
            }
            <span class="ga-chip ga-num" title="Cards in hand vs safe limit on 7">${cardCount}/${safeLimit}</span>
          </div>

          <div class="player-card__stats">
            <span title="Longest route">R <strong class="ga-num">${p.longestRoadLength}</strong></span>
            <span title="Active knight strength">⚔ <strong class="ga-num">${activeStr}</strong></span>
            <span title="Trade / Politics / Science levels">T<strong class="ga-num">${p.cityImprovements.trade}</strong>·P<strong class="ga-num">${p.cityImprovements.politics}</strong>·S<strong class="ga-num">${p.cityImprovements.science}</strong></span>
            <span title="Progress cards">P <strong class="ga-num">${progCount}</strong></span>
            ${
              p.defenderPoints > 0
                ? `<span title="Defender of Catan VP">🛡<strong class="ga-num">${p.defenderPoints}</strong></span>`
                : ""
            }
            ${
              state.config.enableHarbormaster
                ? `<span title="Harbor points">H <strong class="ga-num">${p.harborPoints}</strong></span>`
                : ""
            }
            ${
              p.bonusVictoryPoints > 0
                ? `<span title="Island bonus">+<strong class="ga-num">${p.bonusVictoryPoints}</strong></span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  return `
      <div class="player-card ${isActing ? "active-turn" : ""}">
        <div class="player-header">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span class="player-dot" style="background: ${p.color}"></span>
            <strong class="player-card__name">${escapeAttr(p.name)}</strong>
            <span class="ga-chip">${botBadge}</span>
            ${offlineChip}
          </div>
          <span class="ga-chip ga-chip--warn ga-num">${
            showPrivateHand
              ? `${totalVp} VP${totalVp !== visibleVp ? ` (${visibleVp})` : ""}`
              : `${visibleVp} VP`
          }</span>
        </div>

        <div class="player-card__hud-row">
          <div class="res-pills">
            ${
              showPrivateHand
                ? RESOURCES.map(
                    (r) =>
                      `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r)} ${p.resources[r]}</span>`
                  ).join("")
                : `<span class="res-pill res-pill--hidden ga-num" title="Hidden resource cards in hand">${hiddenCardIconSvg} ${cardCount} ${
                    cardCount === 1 ? "card" : "cards"
                  }</span>`
            }
            <span class="ga-chip ga-num" title="Cards in hand vs safe limit on 7">${cardCount}/${safeLimit}</span>
          </div>

          <div class="player-card__stats">
            <span title="Longest route">R <strong class="ga-num">${p.longestRoadLength}</strong></span>
            <span title="Knights played">K <strong class="ga-num">${p.knightsPlayed}</strong></span>
            <span title="Unplayed dev cards">D <strong class="ga-num">${unplayedDevs.length}</strong></span>
            ${
              state.config.enableHarbormaster
                ? `<span title="Harbor points">H <strong class="ga-num">${p.harborPoints}</strong></span>`
                : ""
            }
            ${
              p.bonusVictoryPoints > 0
                ? `<span title="Island bonus">+<strong class="ga-num">${p.bonusVictoryPoints}</strong></span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
}

export function renderInGameViewPure(
  rawModel: Readonly<AppModel>,
  room: ClientRoom,
  rawState: any
): {
  readonly model: AppModel;
  readonly html: string;
  readonly state: any;
  readonly actingPlayerId: string | null;
  readonly canCancelMyTrade: boolean;
} {
  const usesServer = roomUsesServerPure(rawModel, room);
  const engine = getEngineForGamePure(room.gameId);
  const baseActingPlayerId = usesServer
    ? room.remoteActingPlayerId ?? getActingPlayerIdPure(room.gameId, rawState)
    : getActingPlayerIdPure(room.gameId, rawState);
  const actingPlayerId = ((): string | null => {
    if (
      room.gameId === "seven_wonders" &&
      rawState.phase === "AGE_DRAFT" &&
      Array.isArray(rawState.lockedPlayerIds)
    ) {
      const meRaw = rawState.players.find(
        (p: any) =>
          p.id === rawModel.currentUserId &&
          !p.isBot &&
          !rawState.lockedPlayerIds.includes(p.id) &&
          canControlPlayerOnDevicePure(rawModel, room, p.id)
      );
      if (meRaw) return meRaw.id;
      const unlockedControllable = rawState.players.find(
        (p: any) =>
          !p.isBot &&
          !rawState.lockedPlayerIds.includes(p.id) &&
          canControlPlayerOnDevicePure(rawModel, room, p.id)
      );
      if (unlockedControllable) return unlockedControllable.id;
    }
    return baseActingPlayerId;
  })();
  const isMyTurn = canControlPlayerOnDevicePure(
    rawModel,
    room,
    actingPlayerId
  );
  const clearedTurnModel: AppModel = !isMyTurn
    ? {
        ...rawModel,
        buildMode: null,
        selectedMoveFromEdgeId: null,
        selectedMoveKnightFromVertexId: null,
        selectedChaseKnightVertexId: null,
        sevenWondersSelectedCardId: null,
      }
    : rawModel;

  const controllableHumans = rawState.players.filter(
    (p: any) =>
      !p.isBot && canControlPlayerOnDevicePure(clearedTurnModel, room, p.id)
  );
  const controllableHumansCount = controllableHumans.length;
  const rawActingPlayer =
    rawState.players.find((p: any) => p.id === actingPlayerId) ?? null;

  const effectiveViewerId = ((): string | null => {
    if (rawState.phase === "GAME_OVER") return null;
    if (
      controllableHumansCount >= 2 &&
      clearedTurnModel.hidePassAndPlayHand
    ) {
      return null;
    }
    if (isMyTurn && rawActingPlayer && !rawActingPlayer.isBot) {
      return rawActingPlayer.id;
    }
    if (controllableHumansCount === 1) {
      return controllableHumans[0]!.id;
    }
    return null;
  })();

  const state: any =
    room.gameId === "catan"
      ? CatanEngine.getPlayerView(rawState as CatanState, effectiveViewerId)
      : room.gameId === "splendor"
        ? SplendorEngine.getPlayerView(
            rawState as SplendorState,
            effectiveViewerId
          )
        : room.gameId === "seven_wonders"
          ? SevenWondersEngine.getPlayerView(
              rawState as SevenWondersState,
              effectiveViewerId
            )
          : AzulEngine.getPlayerView(
              rawState as AzulState,
              effectiveViewerId
            );

  const model: AppModel = (() => {
    const tut = clearedTurnModel.activeTutorial;
    if (!tut || tut.roomId !== room.roomId) return clearedTurnModel;
    const prevMaxAuto = tut.maxAutoStepIndex ?? tut.stepIndex;
    const nextStep = computeSuggestedTutorialStepIndexPure(
      room.gameId,
      prevMaxAuto,
      state,
      effectiveViewerId ?? clearedTurnModel.currentUserId
    );
    if (nextStep <= prevMaxAuto) return clearedTurnModel;
    return {
      ...clearedTurnModel,
      activeTutorial: {
        ...tut,
        stepIndex: nextStep,
        maxAutoStepIndex: nextStep,
      },
    };
  })();

  const actingPlayer =
    state.players.find((p: any) => p.id === actingPlayerId) ?? null;
  const invariantCheck = engine.checkInvariants(state);

  const mySeatedPlayer =
    state.players.find((p: any) => p.id === model.currentUserId) ?? null;
  const handPlayer =
    state.phase === "GAME_OVER"
      ? mySeatedPlayer ??
        state.players.find((p: any) => p.id === state.winnerId) ??
        state.players[0]
      : controllableHumansCount >= 2 && model.hidePassAndPlayHand
        ? isMyTurn && actingPlayer && !actingPlayer.isBot
          ? actingPlayer
          : mySeatedPlayer ?? controllableHumans[0]
        : effectiveViewerId
          ? state.players.find((p: any) => p.id === effectiveViewerId) ?? null
          : null;

  const localDeviceGuestForTurn =
    !isMyTurn && actingPlayerId
      ? model.deviceGuests.find((g) => g.id === actingPlayerId)
      : undefined;

  const offerProposer =
    room.gameId === "catan" && state.activeTradeOffer
      ? state.players.find(
          (p: any) => p.id === state.activeTradeOffer!.fromPlayerId
        )
      : null;
  const canCancelMyTrade =
    room.gameId === "catan" &&
    Boolean(
      state.activeTradeOffer &&
        offerProposer &&
        (!offerProposer.isBot || room.allBots) &&
        effectiveViewerId &&
        state.activeTradeOffer.fromPlayerId === effectiveViewerId &&
        canControlPlayerOnDevicePure(
          model,
          room,
          state.activeTradeOffer.fromPlayerId
        )
    );

  const summaryInfo = getRoomSetupSummaryDataPure(model, room);
  const isOwner = Boolean(room.ownerId && room.ownerId === model.currentUserId);
  const localUndoTargetId = ((): string | null => {
    if (!room.session) return null;
    if (isMyTurn && actingPlayerId && room.session.canPlayerUndo(actingPlayerId)) {
      return actingPlayerId;
    }
    if (room.gameId === "seven_wonders" && rawState.phase === "AGE_DRAFT") {
      const log = room.session.getActionLog();
      const last = log[log.length - 1];
      if (
        last &&
        canControlPlayerOnDevicePure(model, room, last.playerId) &&
        room.session.canPlayerUndo(last.playerId)
      ) {
        return last.playerId;
      }
    }
    return null;
  })();
  const undoableSteps = usesServer
    ? isMyTurn || room.gameId === "seven_wonders"
      ? room.undoableSteps
      : 0
    : localUndoTargetId && room.session
      ? room.session.getUndoableStepCount(localUndoTargetId)
      : 0;
  const canUndo = undoableSteps > 0;
  const canRedo = usesServer
    ? isMyTurn && room.canRedo
    : Boolean(
        isMyTurn &&
          actingPlayerId &&
          room.session?.canPlayerRedo(actingPlayerId)
      );

  const catanLegalActions =
    room.gameId === "catan" &&
    actingPlayerId &&
    isMyTurn &&
    !(controllableHumansCount >= 2 && model.hidePassAndPlayHand)
      ? CatanEngine.getLegalActions(state, actingPlayerId)
      : [];
  const boardActingPlayerId = isMyTurn ? actingPlayerId : null;
  const ckBoardOptions = (() => {
    if (
      room.gameId !== "catan" ||
      !(state as CatanState).config.enableCitiesAndKnights
    ) {
      return {};
    }
    const cState = state as CatanState;
    const progressCard =
      isMyTurn &&
      model.buildMode === "progress_card" &&
      model.selectedProgressCardId &&
      actingPlayer
        ? actingPlayer.progressCards.find(
            (c: any) => c.id === model.selectedProgressCardId
          )
        : undefined;

    const progressTargets = ((): {
      progressTargetVertexIds?: readonly string[];
      progressTargetEdgeIds?: readonly string[];
      progressTargetHexIds?: readonly string[];
    } => {
      if (!progressCard || !actingPlayer) return {};
      if (progressCard.type === "engineer") {
        return {
          progressTargetVertexIds: Object.entries(cState.buildings)
            .filter(
              ([, b]) =>
                b.ownerId === actingPlayer.id &&
                b.type === "city" &&
                !b.hasWall
            )
            .map(([vId]) => vId),
        };
      }
      if (progressCard.type === "smith") {
        return {
          progressTargetVertexIds: getLegalPromoteKnightVertices(
            cState,
            actingPlayer.id,
            true
          ).filter((vId) => vId !== model.smithVertex1),
        };
      }
      if (progressCard.type === "inventor") {
        return {
          progressTargetHexIds: cState.topology.hexOrder.filter((hId) => {
            if (hId === model.inventorHex1) return false;
            const t = cState.hexes[hId]!;
            return (
              t.numberToken !== null &&
              t.numberToken !== 2 &&
              t.numberToken !== 6 &&
              t.numberToken !== 8 &&
              t.numberToken !== 12 &&
              t.terrain !== "sea" &&
              t.terrain !== "fog"
            );
          }),
        };
      }
      if (progressCard.type === "bishop") {
        return {
          progressTargetHexIds: getLegalRobberHexes(cState, actingPlayer.id),
        };
      }
      if (progressCard.type === "intrigue") {
        return {
          progressTargetVertexIds: Object.entries(cState.knights)
            .filter(([vId, k]) => {
              if (k.ownerId === actingPlayer.id) return false;
              const vNode = cState.topology.vertices[vId];
              return Boolean(
                vNode?.incidentEdgeIds.some(
                  (eId) => cState.edges[eId]?.ownerId === actingPlayer.id
                )
              );
            })
            .map(([vId]) => vId),
        };
      }
      if (progressCard.type === "diplomat") {
        return {
          progressTargetEdgeIds: getDiplomatRemovableRoadEdges(cState),
        };
      }
      if (progressCard.type === "merchant") {
        return {
          progressTargetHexIds: cState.topology.hexOrder.filter((hId) => {
            const tile = cState.hexes[hId]!;
            if (!TERRAIN_TO_RESOURCE[tile.terrain]) return false;
            return cState.topology.hexes[hId]!.cornerVertexIds.some(
              (vId) => cState.buildings[vId]?.ownerId === actingPlayer.id
            );
          }),
        };
      }
      if (progressCard.type === "deserter" && model.deserterTargetPlayerId) {
        return {
          progressTargetVertexIds: cState.topology.vertexOrder.filter((vId) => {
            if (cState.buildings[vId] || cState.knights[vId]) return false;
            const vNode = cState.topology.vertices[vId];
            return Boolean(
              vNode?.incidentEdgeIds.some(
                (eId) => cState.edges[eId]?.ownerId === actingPlayer.id
              )
            );
          }),
        };
      }
      return {};
    })();

    return {
      selectedMoveKnightFromVertexId: isMyTurn
        ? model.selectedMoveKnightFromVertexId
        : null,
      selectedChaseKnightVertexId: isMyTurn
        ? model.selectedChaseKnightVertexId
        : null,
      ...progressTargets,
    };
  })();

  const sevenWondersLegalActions =
    room.gameId === "seven_wonders" &&
    actingPlayerId &&
    isMyTurn &&
    !(controllableHumansCount >= 2 && model.hidePassAndPlayHand)
      ? SevenWondersEngine.getLegalActions(
          state as SevenWondersState,
          actingPlayerId
        )
      : [];

  const catanDecisionPopupHtml =
    room.gameId === "catan" && isMyTurn
      ? renderCatanMapDecisionPopupPure(
          model,
          state as CatanState,
          actingPlayer,
          catanLegalActions
        )
      : "";

  const tutorialCoachHtml =
    model.activeTutorial && model.activeTutorial.roomId === room.roomId
      ? renderTutorialCoachBannerPure(
          room.gameId,
          model.activeTutorial.stepIndex,
          Boolean(isMyTurn && actingPlayerId && state.phase !== "GAME_OVER"),
          state,
          Boolean(catanDecisionPopupHtml)
        )
      : "";

  const bannerPhaseLabel =
    room.gameId === "catan" &&
    state.phase === "SETUP_SETTLEMENT_2" &&
    (state as CatanState).config.enableCitiesAndKnights
      ? "Setup city 2"
      : formatPhaseLabel(state.phase);

  const html = `
      <div class="ga-game-canvas">
        ${renderRoomHeaderPure(model, room, "game")}

        <div class="ga-room-shell ga-room-shell--game">
          <div class="board-container ${
            room.gameId !== "catan" ? "board-container--neutral" : ""
          }">
            <div class="board-banner">
              <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                ${
                  actingPlayer
                    ? `<span class="player-dot" style="background: ${actingPlayer.color}"></span>
                       <strong style="font-weight: 500;">Active turn: ${escapeAttr(actingPlayer.name)}${
                         mySeatedPlayer && actingPlayer.id === mySeatedPlayer.id
                           ? actingPlayer.name.includes("(You)")
                             ? ""
                             : " (You)"
                           : isMyTurn && !actingPlayer.isBot
                             ? actingPlayer.name.includes("(Local)")
                               ? ""
                               : " (Local)"
                             : ""
                       }</strong>`
                    : `<strong style="font-weight: 500;">Match complete</strong>`
                }
                <span class="ga-chip">${bannerPhaseLabel}</span>
                ${
                  room.gameId === "catan"
                    ? state.lastRoll
                      ? `<span style="display: inline-flex; align-items: center; gap: 5px;">
                          ${renderDieSvg(state.lastRoll.die1, 22)}
                          ${renderDieSvg(state.lastRoll.die2, 22)}${
                            state.config.enableCitiesAndKnights &&
                            state.lastRoll.eventFace
                              ? `\n                          ${renderEventDieSvg(state.lastRoll.eventFace, 22)}`
                              : ""
                          }
                          <span class="ga-chip ga-chip--warn ga-num">Roll ${
                            state.lastRoll.total
                          }</span>
                        </span>`
                      : `<span class="ga-chip">Awaiting dice roll</span>`
                    : room.gameId === "splendor"
                      ? `<span class="ga-chip ga-num">Round ${state.round} · Target ${state.config.targetPoints}</span>`
                      : room.gameId === "seven_wonders"
                        ? `<span class="ga-chip ga-num">Age ${state.age} · Draft ${state.draftRound}/6</span>`
                        : `<span class="ga-chip ga-num">Round ${state.round} · Bag ${state.bag.length} · Lid ${state.discardLid.length}</span>`
                }
                <span class="ga-chip ${invariantCheck.valid ? "ga-chip--ok" : "ga-chip--danger"}">
                  ${
                    invariantCheck.valid
                      ? "Rules verified"
                      : `${invariantCheck.violations.length} rule errors`
                  }
                </span>
                ${
                  state.winnerId
                    ? `<span class="ga-chip ga-chip--warn">Winner: ${escapeAttr(
                        state.players.find((p: any) => p.id === state.winnerId)?.name ?? "Player"
                      )}</span>`
                    : ""
                }
              </div>

              <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 5px;">
                <button type="button" data-open-guide="${room.gameId}" class="btn btn--secondary btn--sm">Guide</button>
                ${
                  (room.gameId === "catan" || room.gameId === "seven_wonders") &&
                  controllableHumansCount >= 2
                    ? `<button type="button" id="btn-toggle-hand-privacy" class="btn btn--secondary btn--sm">
                        ${model.hidePassAndPlayHand ? "Show hand" : "Hide hand"}
                      </button>`
                    : ""
                }
                <button type="button" id="btn-undo" class="btn btn--secondary btn--sm ga-num" title="${
                  canUndo
                    ? "Undo your last reversible step in this turn"
                    : "Undo is only available during your turn before a random roll or card reveal"
                }" ${!canUndo ? "disabled" : ""}>Undo${
                  undoableSteps > 0 ? ` (${undoableSteps})` : ""
                }</button>
                <button type="button" id="btn-redo" class="btn btn--secondary btn--sm" ${
                  !canRedo ? "disabled" : ""
                }>Redo</button>
                ${
                  room.gameId === "catan" &&
                  state.phase.startsWith("SETUP_") &&
                  (!usesServer || isOwner)
                    ? `<button type="button" id="btn-finish-setup" class="btn btn--secondary btn--sm">Auto-place setup</button>`
                    : ""
                }
                <button type="button" id="btn-toggle-bot-response" class="btn btn--secondary btn--sm ${
                  model.autoRespondBotsToHuman ? "is-selected" : ""
                }">
                  Auto-bots: ${model.autoRespondBotsToHuman ? "on" : "off"}
                </button>
                <button type="button" id="btn-step-bot" class="btn btn--secondary btn--sm" ${
                  state.phase === "GAME_OVER" ? "disabled" : ""
                }>Step bot</button>
                <button type="button" id="btn-autoplay" class="btn ${
                  model.autoPlayBots ? "btn--primary" : "btn--secondary"
                } btn--sm">
                  ${model.autoPlayBots ? "Pause sim" : "Auto-sim"}
                </button>
              </div>
            </div>

            <div class="board-svg-wrap">
              ${tutorialCoachHtml}
              ${
                room.gameId === "catan"
                  ? `
                    ${renderCatanMapDiceHudPure(state as CatanState)}${
                      (state as CatanState).config.enableCitiesAndKnights
                        ? `\n                    ${renderCatanBarbarianHudPure(
                            state as CatanState,
                            handPlayer ?? mySeatedPlayer ?? actingPlayer
                          )}`
                        : ""
                    }
                    ${renderCatanBoardSvg(
                      state as CatanState,
                      boardActingPlayerId,
                      {
                        buildMode: isMyTurn ? model.buildMode : null,
                        setupEdgeKind: model.setupEdgeKind,
                        robberOrPirateMode: model.robberOrPirateMode,
                        selectedMoveFromEdgeId: isMyTurn
                          ? model.selectedMoveFromEdgeId
                          : null,
                        selectedSpot: model.selectedBoardSpot,
                        ...ckBoardOptions,
                      }
                    )}
                    ${renderCatanSpotPopoverPure(
                      model,
                      state as CatanState,
                      isMyTurn ? actingPlayer : mySeatedPlayer ?? actingPlayer,
                      catanLegalActions
                    )}
                    ${catanDecisionPopupHtml}
                  `
                  : room.gameId === "splendor"
                    ? renderSplendorBoardView(
                        state as SplendorState,
                        isMyTurn ? model.splendorDraftGems : {},
                        effectiveViewerId ?? mySeatedPlayer?.id ?? actingPlayerId,
                        isMyTurn
                      )
                    : room.gameId === "seven_wonders"
                      ? renderSevenWondersBoardView(
                          state as SevenWondersState,
                          effectiveViewerId ?? mySeatedPlayer?.id ?? actingPlayerId,
                          isMyTurn ? model.sevenWondersSelectedCardId : null,
                          sevenWondersLegalActions,
                          model.sevenWondersInspectedPlayerId,
                          controllableHumansCount >= 2 && model.hidePassAndPlayHand
                        )
                      : renderAzulBoardView(
                          state as AzulState,
                          isMyTurn ? model.azulSelectedDraft : null,
                          model.azulInspectedPlayerId ??
                            (state.phase === "GAME_OVER"
                              ? null
                              : effectiveViewerId ??
                                mySeatedPlayer?.id ??
                                null),
                          isMyTurn
                        )
              }
            </div>

            <div class="action-dock">
              ${
                state.phase !== "GAME_OVER" &&
                !isMyTurn &&
                !(
                  room.gameId === "seven_wonders" &&
                  (effectiveViewerId ?? mySeatedPlayer?.id) &&
                  canPlayerUnselectDraftPick(
                    state as SevenWondersState,
                    (effectiveViewerId ?? mySeatedPlayer?.id)!
                  )
                )
                  ? `${
                      room.gameId === "catan" &&
                      canCancelMyTrade &&
                      state.phase === "MAIN_PHASE" &&
                      Boolean((state as CatanState).activeTradeOffer) &&
                      actingPlayer
                        ? `<div class="sub-modal sub-modal--trade sub-modal--trade-offer">${renderActiveTradeOfferCardPure(
                            model,
                            room,
                            state as CatanState,
                            actingPlayer,
                            canCancelMyTrade
                          )}</div>`
                        : ""
                    }<div class="action-buttons" style="justify-content: space-between;">
                      <span class="action-prompt">
                        ${
                          mySeatedPlayer
                            ? `Waiting for <strong>${escapeAttr(actingPlayer?.name ?? "active player")}</strong> (${formatPhaseLabel(state.phase)}).`
                            : `Spectating room — active turn: <strong>${escapeAttr(actingPlayer?.name ?? "player")}</strong> (${formatPhaseLabel(state.phase)}).`
                        }
                      </span>
                      <div style="display: inline-flex; gap: 6px;">
                        ${
                          localDeviceGuestForTurn
                            ? `<button type="button" id="btn-switch-turn-guest" data-switch-guest="${escapeAttr(localDeviceGuestForTurn.id)}" class="btn btn--primary btn--sm">Switch to ${escapeAttr(localDeviceGuestForTurn.name)}</button>`
                            : ""
                        }
                      </div>
                    </div>`
                  : room.gameId === "catan"
                    ? renderCatanActionDockPure(
                        model,
                        room,
                        state as CatanState,
                        actingPlayer,
                        catanLegalActions,
                        canCancelMyTrade
                      )
                    : room.gameId === "splendor"
                       ? renderSplendorActionDock(
                          state as SplendorState,
                          actingPlayer
                        )
                      : room.gameId === "seven_wonders"
                        ? renderSevenWondersActionDock(
                            state as SevenWondersState,
                            actingPlayer,
                            model.sevenWondersSelectedCardId,
                            sevenWondersLegalActions,
                            effectiveViewerId ?? mySeatedPlayer?.id ?? null
                          )
                        : renderAzulActionDock(
                            state as AzulState,
                            actingPlayer,
                            model.azulSelectedDraft
                          )
              }
            </div>

            ${
              room.gameId === "catan"
                ? handPlayer
                  ? controllableHumansCount >= 2 && model.hidePassAndPlayHand
                    ? `
                      <div class="ga-hand-privacy-card">
                        <span class="t-small muted"><strong>${escapeAttr(handPlayer.name)}'s</strong> hand is hidden while passing the screen.</span>
                        <button type="button" id="btn-reveal-hand" class="btn btn--secondary btn--sm">Show ${escapeAttr(handPlayer.name)}'s hand</button>
                      </div>
                    `
                    : renderCatanVisualHandTray(
                        state as CatanState,
                        handPlayer,
                        isMyTurn && actingPlayerId === handPlayer.id
                          ? CatanEngine.getLegalActions(state, handPlayer.id)
                          : []
                      )
                  : room.allBots && actingPlayer && !actingPlayer.handRedacted
                    ? renderCatanVisualHandTray(
                        state as CatanState,
                        actingPlayer,
                        isMyTurn
                          ? CatanEngine.getLegalActions(state, actingPlayer.id)
                          : []
                      )
                    : `
                      <div class="ga-hand-privacy-card">
                        <span class="t-small muted">Spectating table — player hands remain hidden until match completion.</span>
                      </div>
                    `
                : ""
            }
          </div>

          <aside class="ga-sidebar">
            <div class="ga-standings-section">
              <div class="ga-sidebar__head">
                <span>Standings (${state.players.length})</span>
                <span class="ga-num">${
                  room.gameId === "catan"
                    ? `Target ${state.config.targetVictoryPoints} VP`
                    : room.gameId === "splendor"
                      ? `Target ${state.config.targetPoints} VP`
                      : room.gameId === "seven_wonders"
                        ? `Age ${state.age}/3 · VP`
                        : `5×5 wall`
                }</span>
              </div>
              ${
                (room.offlinePlayerIds ?? []).length > 0
                  ? `<div class="ga-inline-summary__chips">
                      ${(room.offlinePlayerIds ?? [])
                        .map((offId) => {
                          const offP = state.players.find((sp: any) => sp.id === offId);
                          return offP
                            ? `<span class="ga-chip ga-chip--warn" title="Temporarily disconnected — waiting to reconnect">${escapeAttr(offP.name)}: Offline</span>`
                            : "";
                        })
                        .join("")}
                    </div>`
                  : ""
              }
              <div class="ga-standings-list">
                ${state.players
                  .map((p: any) =>
                    room.gameId === "catan"
                      ? renderCatanPlayerCardPure(
                          model.currentUserId,
                          state as CatanState,
                          p,
                          p.id === actingPlayerId,
                          Boolean(room.offlinePlayerIds?.includes(p.id))
                        )
                      : room.gameId === "splendor"
                        ? renderSplendorPlayerCard(
                            state as SplendorState,
                            p,
                            p.id === actingPlayerId
                          )
                        : room.gameId === "seven_wonders"
                          ? renderSevenWondersPlayerCard(
                              state as SevenWondersState,
                              p,
                              p.id === actingPlayerId
                            )
                          : renderAzulPlayerCard(
                              state as AzulState,
                              p,
                              p.id === actingPlayerId
                            )
                  )
                  .join("")}
              </div>
            </div>

            <div class="ga-sidebar__secondary">
              <div class="ga-inline-summary ga-settings-fold ${
                model.sidebarSettingsExpanded ? "is-open" : ""
              }" title="${escapeAttr(summaryInfo.ruleChips.join(" · "))}">
                <button
                  type="button"
                  id="btn-toggle-game-settings"
                  class="ga-settings-fold__btn"
                  aria-expanded="${model.sidebarSettingsExpanded ? "true" : "false"}"
                >
                  <span class="ga-settings-fold__title">Game settings</span>
                  <span class="ga-settings-fold__meta ga-num">
                    <span>${summaryInfo.seatsLabel} · T${state.turn}</span>
                    <svg class="ga-settings-fold__chev" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                </button>
                ${
                  model.sidebarSettingsExpanded
                    ? `
                      <div class="ga-settings-fold__body">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                          <strong style="font-size: var(--t-label); font-weight: 500; color: var(--ink);">${summaryInfo.formatTitle}</strong>
                          <span class="t-label muted ga-num">${summaryInfo.targetLabel}</span>
                        </div>
                        <div class="ga-inline-summary__chips">
                          ${summaryInfo.ruleChips
                            .map((chip) => `<span class="ga-chip">${escapeAttr(chip)}</span>`)
                            .join("")}
                        </div>
                      </div>
                    `
                    : ""
                }
                ${
                  room.status === "finished" && isOwner
                    ? `<div style="padding: 0 12px 10px;"><button type="button" id="btn-sidebar-edit-setup" class="btn btn--secondary btn--sm" style="width: 100%;">Edit setup for next game</button></div>`
                    : ""
                }
              </div>

              ${
                room.gameId === "catan"
                  ? (state as CatanState).config.enableCitiesAndKnights
                    ? `
                <div class="ga-bank-section">
                  <div class="ga-sidebar__head">
                    <span>Bank & progress decks</span>
                    <span class="ga-num">T${state.progressDecks.trade.length}·P${state.progressDecks.politics.length}·S${state.progressDecks.science.length}</span>
                  </div>
                  <div class="res-pills res-pills--bank" data-bank-mode="ck">
                    ${RESOURCES.map(
                      (r) =>
                        `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}: ${state.bank[r]} in bank">${renderResourceGlyphSvg(r)} ${state.bank[r]}</span>`
                    ).join("")}${COMMODITIES.map(
                      (c) =>
                        `<span class="res-pill res-${c}" title="${COMMODITY_META[c].label}: ${state.commodityBank[c]} in bank">${renderCommodityGlyphSvg(c)} ${state.commodityBank[c]}</span>`
                    ).join("")}
                  </div>
                  <div class="ga-stat-list ga-stat-list--compact">
                    <div class="ga-stat-row">
                      <span>Longest route (+2 VP)</span>
                      <strong class="ga-num">${
                        state.longestRoadOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.longestRoadOwnerId
                              )?.name
                            } (${state.longestRoadLength})`
                          : "Unclaimed (5+)"
                      }</strong>
                    </div>
                    ${IMPROVEMENT_DISCIPLINES.map((disc) => {
                      const m = state.metropolises[disc];
                      const dMeta = DISCIPLINE_META[disc];
                      return `<div class="ga-stat-row">
                        <span>${dMeta.label} Metro (+2 VP)</span>
                        <strong class="ga-num">${
                          m.ownerId
                            ? `${
                                state.players.find((p: any) => p.id === m.ownerId)
                                  ?.name
                              } (Lv ${m.level})`
                            : "Unclaimed (Lv 4)"
                        }</strong>
                      </div>`;
                    }).join("")}
                    <div class="ga-stat-row">
                      <span>Merchant (+1 VP)</span>
                      <strong class="ga-num">${
                        state.merchantOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.merchantOwnerId
                              )?.name
                            }`
                          : "Unclaimed"
                      }</strong>
                    </div>
                    ${
                      state.config.enableHarbormaster
                        ? `<div class="ga-stat-row">
                            <span>Harbormaster (+2 VP)</span>
                            <strong class="ga-num">${
                              state.harbormasterOwnerId
                                ? `${
                                    state.players.find(
                                      (p: any) => p.id === state.harbormasterOwnerId
                                    )?.name
                                  } (${state.harbormasterPoints})`
                                : "Unclaimed (3+)"
                            }</strong>
                          </div>`
                        : ""
                    }
                  </div>
                </div>
              `
                    : `
                <div class="ga-bank-section">
                  <div class="ga-sidebar__head">
                    <span>Bank supply and awards</span>
                    <span class="ga-num">Dev deck: ${state.devCardDeck.length}</span>
                  </div>
                  <div class="res-pills res-pills--bank">
                    ${RESOURCES.map(
                      (r) =>
                        `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}: ${state.bank[r]} in bank">${renderResourceGlyphSvg(r)} ${state.bank[r]}</span>`
                    ).join("")}
                  </div>
                  <div class="ga-stat-list ga-stat-list--compact">
                    <div class="ga-stat-row">
                      <span>Longest route (+2 VP)</span>
                      <strong class="ga-num">${
                        state.longestRoadOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.longestRoadOwnerId
                              )?.name
                            } (${state.longestRoadLength})`
                          : "Unclaimed (5+)"
                      }</strong>
                    </div>
                    <div class="ga-stat-row">
                      <span>Largest army (+2 VP)</span>
                      <strong class="ga-num">${
                        state.largestArmyOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.largestArmyOwnerId
                              )?.name
                            } (${state.largestArmySize})`
                          : "Unclaimed (3+)"
                      }</strong>
                    </div>
                    ${
                      state.config.enableHarbormaster
                        ? `<div class="ga-stat-row">
                            <span>Harbormaster (+2 VP)</span>
                            <strong class="ga-num">${
                              state.harbormasterOwnerId
                                ? `${
                                    state.players.find(
                                      (p: any) => p.id === state.harbormasterOwnerId
                                    )?.name
                                  } (${state.harbormasterPoints})`
                                : "Unclaimed (3+)"
                            }</strong>
                          </div>`
                        : ""
                    }
                  </div>
                </div>
              `
                  : ""
              }

              <div class="ga-log-section">
                <div class="ga-sidebar__head">
                  <span>Match log</span>
                  <span class="ga-num">${state.eventLog.length}</span>
                </div>
                <div class="event-log">
                  ${[...state.eventLog]
                    .reverse()
                    .slice(0, 35)
                    .map(
                      (evt: any) =>
                        `<div class="event-item"><strong>T${evt.turn}</strong> ${escapeAttr(evt.message)}</div>`
                    )
                    .join("")}
                </div>
              </div>
            </div>
          </aside>
        </div>
        ${
          model.guideModalGameId
            ? renderReferenceGuideModalPure(model.guideModalGameId, true)
            : ""
        }
      </div>
    `;

  return { model, html, state, actingPlayerId, canCancelMyTrade };
}

/**
 * Thin Imperative I/O Boundary Helpers (Storage & Dropdown DOM)
 */
function loadDeviceGuestsFromStorage(): GuestSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(DEVICE_GUESTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (g): g is GuestSession =>
          Boolean(g && typeof g.id === "string" && typeof g.name === "string")
      );
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

function saveDeviceGuestsToStorage(deviceGuests: readonly GuestSession[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(
      DEVICE_GUESTS_STORAGE_KEY,
      JSON.stringify(deviceGuests)
    );
  } catch {
    // Ignore storage errors
  }
}

function loadSavedGuestSessionFromStorage(): GuestSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestSession;
    if (parsed && parsed.id && parsed.name) {
      return parsed;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function saveGuestSessionToStorage(session: GuestSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(GUEST_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

function clearGuestSessionFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function loadActiveRoomIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(ACTIVE_ROOM_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function saveActiveRoomIdToStorage(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    if (roomId) {
      window.sessionStorage?.setItem(ACTIVE_ROOM_STORAGE_KEY, roomId);
    }
  } catch {
    // Ignore storage errors
  }
}

function clearActiveRoomIdFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(ACTIVE_ROOM_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function closeDropdownElement(dd: HTMLElement): void {
  dd.classList.remove("is-open");
  const trigger = dd.querySelector(
    ".ga-dropdown__trigger"
  ) as HTMLButtonElement | null;
  const menu = dd.querySelector(".ga-dropdown__menu") as HTMLElement | null;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  if (menu) menu.hidden = true;
}

function registerGlobalDropdownDismiss(root: HTMLElement): void {
  if (typeof document === "undefined") return;
  document.addEventListener("pointerdown", (e) => {
    const target = e.target as Node | null;
    root.querySelectorAll(".ga-dropdown.is-open").forEach((dd) => {
      if (!target || !dd.contains(target)) {
        closeDropdownElement(dd as HTMLElement);
      }
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      root.querySelectorAll(".ga-dropdown.is-open").forEach((dd) => {
        const trigger = dd.querySelector(
          ".ga-dropdown__trigger"
        ) as HTMLButtonElement | null;
        closeDropdownElement(dd as HTMLElement);
        trigger?.focus();
      });
    }
  });
}

function bindDropdownEventsOnRoot(root: HTMLElement): void {
  root.querySelectorAll("[data-dropdown-root]").forEach((el) => {
    const dd = el as HTMLElement;
    const selectEl = dd.querySelector(
      ".ga-dropdown__native"
    ) as HTMLSelectElement | null;
    const trigger = dd.querySelector(
      ".ga-dropdown__trigger"
    ) as HTMLButtonElement | null;
    const menu = dd.querySelector(".ga-dropdown__menu") as HTMLElement | null;
    const valueSpan = dd.querySelector(
      ".ga-dropdown__value"
    ) as HTMLElement | null;
    const metaSpan = dd.querySelector(
      ".ga-dropdown__label-group .ga-dropdown__meta"
    ) as HTMLElement | null;

    if (!selectEl || !trigger || !menu) return;

    const options = Array.from(
      menu.querySelectorAll(".ga-dropdown__option")
    ) as HTMLButtonElement[];

    const openMenu = (focusSelected = false) => {
      if (trigger.disabled) return;
      root.querySelectorAll(".ga-dropdown.is-open").forEach((other) => {
        if (other !== dd) closeDropdownElement(other as HTMLElement);
      });
      dd.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      if (focusSelected) {
        const activeOpt =
          options.find((o) => o.getAttribute("aria-selected") === "true") ??
          options[0];
        activeOpt?.focus();
      }
    };

    trigger.addEventListener("click", () => {
      if (trigger.disabled) return;
      if (dd.classList.contains("is-open")) {
        closeDropdownElement(dd);
      } else {
        openMenu(false);
      }
    });

    trigger.addEventListener("keydown", (e) => {
      if (trigger.disabled) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(true);
      }
    });

    menu.addEventListener("keydown", (e) => {
      const idx = options.indexOf(
        document.activeElement as HTMLButtonElement
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = options[(idx + 1 + options.length) % options.length];
        next?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = options[(idx - 1 + options.length) % options.length];
        prev?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        options[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        options[options.length - 1]?.focus();
      } else if (e.key === "Tab") {
        closeDropdownElement(dd);
      }
    });

    options.forEach((optBtn) => {
      optBtn.addEventListener("click", () => {
        const nextVal = optBtn.getAttribute("data-dropdown-value") ?? "";
        const nextLabel = optBtn.getAttribute("data-dropdown-label") ?? "";
        const nextMeta = optBtn.getAttribute("data-dropdown-meta") ?? "";

        selectEl.value = nextVal;
        if (valueSpan) valueSpan.textContent = nextLabel;
        if (metaSpan) {
          metaSpan.textContent = nextMeta;
          metaSpan.hidden = !nextMeta;
        }
        options.forEach((o) =>
          o.setAttribute("aria-selected", o === optBtn ? "true" : "false")
        );
        closeDropdownElement(dd);
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  });
}

export interface RoomsMapView {
  readonly size: number;
  get(roomId: string): ClientRoom | undefined;
  has(roomId: string): boolean;
  set(roomId: string, room: ClientRoom): RoomsMapView;
  delete(roomId: string): boolean;
  keys(): IterableIterator<string>;
  values(): IterableIterator<ClientRoom>;
  entries(): IterableIterator<[string, ClientRoom]>;
  forEach(cb: (room: ClientRoom, roomId: string) => void): void;
  [Symbol.iterator](): IterableIterator<[string, ClientRoom]>;
}

export interface MultiGamePlatformApp {
  readonly root: HTMLElement;
  viewMode: AppViewMode;
  lobbyGameFilter: SupportedGameId;
  lobbyHeroEnteredOnce: boolean;
  loginHeroEnteredOnce: boolean;
  useServerBackend: boolean;
  staticHostOnly: boolean;
  serverReachable: boolean;
  isAuthenticated: boolean;
  addingAdditionalGuest: boolean;
  returnViewAfterAddGuest: AppViewMode;
  loginDraftName: string;
  loginErrorMsg: string;
  currentUserId: string;
  currentUserName: string;
  deviceGuests: GuestSession[];
  localFriendDraftName: string;
  hidePassAndPlayHand: boolean;
  createRoomName: string;
  createRoomGameId: SupportedGameId;
  createRoomMode: "online" | "offline";
  readonly rooms: RoomsMapView;
  nextRoomNum: number;
  activeRoomId: string;
  buildMode: BuildMode;
  selectedBoardSpot: BoardSpotSelection | null;
  setupEdgeKind: "road" | "ship";
  robberOrPirateMode: "robber" | "pirate";
  selectedMoveFromEdgeId: string | null;
  discardSelection: ResourceMap;
  tradeGiveRes: ResourceType;
  tradeReceiveRes: ResourceType;
  maritimeGive: ResourceMap;
  maritimeWant: ResourceMap;
  domesticGive: ResourceMap;
  domesticWant: ResourceMap;
  domesticTargetPlayerId: string;
  yopRes1: ResourceType;
  yopRes2: ResourceType;
  monoRes: ResourceType;
  splendorDraftGems: Partial<Record<GemColor, number>>;
  azulSelectedDraft: {
    source: AzulDraftSource;
    color: AzulTileColor;
  } | null;
  autoPlayBots: boolean;
  sidebarSettingsExpanded: boolean;
  autoRespondBotsToHuman: boolean;
  autoPlaySpeedMs: number;
  render(): void;
  signInAsGuest(rawName?: string, existingGuestId?: string): boolean;
  startSoloGameFromLogin(rawName?: string): boolean;
  startOfflineLocalFromLogin(rawName?: string): boolean;
  openAddGuestView(): void;
  switchActiveGuest(guestId: string): void;
  renameCurrentGuest(rawNewName: string): boolean;
  signOutGuest(): void;
  removeDeviceGuest(guestId: string): void;
  getRoomBounds(room: {
    gameId: SupportedGameId;
    config: { scenarioId: ScenarioId };
  }): { minPlayers: number; maxPlayers: number };
  createLocalRoom(opts: CreateLocalRoomOptions): ClientRoom;
  getActiveRoom(): ClientRoom;
  getRoomState(room: ClientRoom): any | null;
  canControlPlayerOnThisDevice(
    room: ClientRoom,
    playerId: string | null
  ): boolean;
  rebuildRoomSeats(room: ClientRoom): void;
  addLocalFriendToRoom(room: ClientRoom, rawName: string): void;
  removePlayerFromRoom(room: ClientRoom, targetPlayerId: string): void;
  createAndOpenRoom(): void;
  enterOrJoinRoom(roomId: string): void;
  leaveActiveRoom(): void;
  startRoomMatch(roomId: string): void;
  startInteractiveTutorial(gameId: SupportedGameId): ClientRoom;
  resetSubModes(): void;
  dispatchUiAction(playerId: string, action: any): void;
  dispatch(playerId: string, action: any): void;
  stepOneBotMove(): boolean;
  finishSetupWithBots(): void;
  undoMatch(): void;
  redoMatch(): void;
  toggleAutoRespondBots(): void;
  toggleAutoPlay(): void;
  stopAutoPlay(): void;
  switchTradeMode(nextMode: "maritime_trade" | "domestic_trade" | null): void;
  setSharedTradeWant(resource: ResourceType, amount: number): void;
}

export interface MultiGamePlatformAppConstructor {
  new (
    root: HTMLElement,
    options?: MultiGamePlatformAppOptions
  ): MultiGamePlatformApp;
  (
    root: HTMLElement,
    options?: MultiGamePlatformAppOptions
  ): MultiGamePlatformApp;
}

export function createMultiGamePlatformApp(
  root: HTMLElement,
  options?: MultiGamePlatformAppOptions
): MultiGamePlatformApp {
  const isStaticHost =
    Boolean(options?.staticHostOnly) ||
    (typeof document !== "undefined" &&
      Boolean(document.documentElement?.hasAttribute("data-static-only"))) ||
    (typeof window !== "undefined" &&
      Boolean(window.location?.hostname?.endsWith(".github.io")));
  const isBrowserHttp =
    !options?.forceLocalMode &&
    typeof window !== "undefined" &&
    typeof fetch === "function" &&
    Boolean(window.location?.protocol?.startsWith("http"));

  let model: AppModel = createInitialAppModelPure(options, {
    isStaticHost,
    isBrowserHttp,
    randomGuestSuffix: 100 + Math.floor(Math.random() * 900),
    deviceGuests: loadDeviceGuestsFromStorage(),
    savedGuest: loadSavedGuestSessionFromStorage(),
    nowMs: Date.now(),
    locationSearch:
      typeof window !== "undefined" ? window.location?.search ?? "" : "",
    locationHash:
      typeof window !== "undefined" ? window.location?.hash ?? "" : "",
  });

  if (model.isAuthenticated) {
    saveDeviceGuestsToStorage(model.deviceGuests);
  }

  let ws: WebSocket | null = null;
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let setupSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let autoPlayTimer: ReturnType<typeof setInterval> | null = null;
  let botResponseTimeout: ReturnType<typeof setTimeout> | null = null;
  let copyLinkResetTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRestoreRoomId: string | null = model.isAuthenticated
    ? model.pendingInviteRoomId ?? loadActiveRoomIdFromStorage()
    : null;

  const syncUrlRoomHash = (roomId: string | null): void => {
    if (
      typeof window === "undefined" ||
      !window.history ||
      typeof window.history.replaceState !== "function"
    ) {
      return;
    }
    try {
      const pathname = window.location?.pathname ?? "/";
      const rawSearch = window.location?.search ?? "";
      const params = new URLSearchParams(rawSearch.replace(/^\?+/, ""));
      params.delete("room");
      const cleanSearch = params.toString();
      const base = `${pathname}${cleanSearch ? `?${cleanSearch}` : ""}`;
      if (roomId) {
        const cleanId = roomId.trim().replace(/^#+/, "");
        window.history.replaceState(
          null,
          "",
          `${base}#room=${encodeURIComponent(cleanId)}`
        );
      } else if (
        window.location?.hash?.includes("room=") ||
        /^#[0-9a-f]{6,10}$/i.test(window.location?.hash ?? "")
      ) {
        window.history.replaceState(null, "", base);
      }
    } catch {
      // Ignore history security errors in sandboxed frames
    }
  };

  const copyRoomShareLink = (roomId: string): string => {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost:3000";
    const pathname =
      typeof window !== "undefined" && window.location?.pathname
        ? window.location.pathname
        : "/";
    const search =
      typeof window !== "undefined" && window.location?.search
        ? window.location.search
        : "";
    const shareUrl = buildRoomShareUrlPure(origin, pathname, search, roomId);

    const markCopied = () => {
      model = { ...model, copiedRoomLinkId: roomId };
      render();
      if (copyLinkResetTimer) clearTimeout(copyLinkResetTimer);
      copyLinkResetTimer = setTimeout(() => {
        if (model.copiedRoomLinkId === roomId) {
          model = { ...model, copiedRoomLinkId: null };
          render();
        }
      }, 2000);
    };

    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      void navigator.clipboard
        .writeText(shareUrl)
        .then(() => markCopied())
        .catch(() => {
          try {
            if (typeof document !== "undefined" && document.body) {
              const ta = document.createElement("textarea");
              ta.value = shareUrl;
              ta.style.position = "fixed";
              ta.style.opacity = "0";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand?.("copy");
              document.body.removeChild(ta);
            }
          } catch {
            // Ignore fallback error
          }
          markCopied();
        });
    } else {
      try {
        if (typeof document !== "undefined" && document.body) {
          const ta = document.createElement("textarea");
          ta.value = shareUrl;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand?.("copy");
          document.body.removeChild(ta);
        }
      } catch {
        // Ignore fallback error
      }
      markCopied();
    }

    return shareUrl;
  };

  const roomLensCache = new Map<string, ClientRoom>();

  const getOrCreateRoomLens = (roomId: string): ClientRoom => {
    const cached = roomLensCache.get(roomId);
    if (cached) return cached;

    const initialSnapshot = model.rooms[roomId];
    const targetObj: ClientRoom = initialSnapshot
      ? { ...initialSnapshot, config: { ...initialSnapshot.config } }
      : ({ roomId } as ClientRoom);

    const configProxy = new Proxy({} as ClientRoomConfig, {
      get(_cfgTarget, cfgProp) {
        const live = model.rooms[roomId] ?? targetObj;
        return (live.config as any)[cfgProp];
      },
      set(_cfgTarget, cfgProp, cfgValue) {
        const live = model.rooms[roomId];
        if (live) {
          model = setRoomInModelPure(model, {
            ...live,
            config: {
              ...live.config,
              [cfgProp]: cfgValue,
            },
          });
        } else {
          (targetObj.config as any)[cfgProp] = cfgValue;
        }
        return true;
      },
      ownKeys() {
        const live = model.rooms[roomId] ?? targetObj;
        return Reflect.ownKeys(live.config);
      },
      getOwnPropertyDescriptor(_cfgTarget, cfgProp) {
        const live = model.rooms[roomId] ?? targetObj;
        return Object.getOwnPropertyDescriptor(live.config, cfgProp);
      },
    });

    const lens = new Proxy(targetObj, {
      get(_target, prop) {
        const live = model.rooms[roomId] ?? targetObj;
        if (prop === "config") return configProxy;
        return (live as any)[prop];
      },
      set(_target, prop, value) {
        const live = model.rooms[roomId];
        if (live) {
          model = setRoomInModelPure(model, {
            ...live,
            [prop]: value,
          });
        } else {
          (targetObj as any)[prop] = value;
        }
        return true;
      },
      ownKeys() {
        const live = model.rooms[roomId] ?? targetObj;
        return Reflect.ownKeys(live);
      },
      getOwnPropertyDescriptor(_target, prop) {
        const live = model.rooms[roomId] ?? targetObj;
        return Object.getOwnPropertyDescriptor(live, prop);
      },
    });

    roomLensCache.set(roomId, lens);
    return lens;
  };

  const roomsFacade: RoomsMapView = {
    get size() {
      return model.roomOrder.length;
    },
    get(roomId: string) {
      if (!Object.prototype.hasOwnProperty.call(model.rooms, roomId)) {
        return undefined;
      }
      return getOrCreateRoomLens(roomId);
    },
    has(roomId: string) {
      return Object.prototype.hasOwnProperty.call(model.rooms, roomId);
    },
    set(roomId: string, room: ClientRoom) {
      model = setRoomInModelPure(model, { ...room, roomId });
      return roomsFacade;
    },
    delete(roomId: string) {
      const existed = Object.prototype.hasOwnProperty.call(model.rooms, roomId);
      if (existed) {
        model = removeRoomFromModelPure(model, roomId);
        roomLensCache.delete(roomId);
      }
      return existed;
    },
    keys() {
      return [...model.roomOrder][Symbol.iterator]();
    },
    values() {
      return model.roomOrder
        .filter((id) => Object.prototype.hasOwnProperty.call(model.rooms, id))
        .map((id) => getOrCreateRoomLens(id))[Symbol.iterator]();
    },
    entries() {
      return model.roomOrder
        .filter((id) => Object.prototype.hasOwnProperty.call(model.rooms, id))
        .map(
          (id) => [id, getOrCreateRoomLens(id)] as [string, ClientRoom]
        )[Symbol.iterator]();
    },
    forEach(cb: (room: ClientRoom, roomId: string) => void) {
      model.roomOrder.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(model.rooms, id)) {
          cb(getOrCreateRoomLens(id), id);
        }
      });
    },
    [Symbol.iterator]() {
      return roomsFacade.entries();
    },
  };

  const sendWsMessage = (msg: Record<string, unknown>): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const stopAutoPlay = (): void => {
    model = { ...model, autoPlayBots: false };
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
    if (botResponseTimeout) {
      clearTimeout(botResponseTimeout);
      botResponseTimeout = null;
    }
  };

  const renderPreservingFocus = (): void => {
    const activeEl =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    if (
      activeEl &&
      (activeEl.id === "inp-create-room-name" ||
        activeEl.id === "setup-room-name" ||
        activeEl.id === "inp-guest-name" ||
        activeEl.id === "inp-local-friend-name")
    ) {
      return;
    }
    render();
  };

  const connectServerRealtime = (): void => {
    if (!model.useServerBackend || typeof WebSocket === "undefined") return;
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${proto}//${window.location.host}`);
    ws = socket;

    socket.addEventListener("open", () => {
      model = { ...model, serverReachable: true };
      const active = model.rooms[model.activeRoomId];
      if (
        (model.viewMode === "room_setup" || model.viewMode === "in_game") &&
        active &&
        !active.isOfflineLocal
      ) {
        sendWsMessage({
          type: "SUBSCRIBE_ROOM",
          roomId: active.roomId,
          playerId: model.currentUserId,
        });
      }
    });

    socket.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "LOBBY_ROOMS" && Array.isArray(msg.rooms)) {
          model = syncOnlineLobbyRoomsPure(model, msg.rooms);
          if (model.viewMode === "lobby") {
            renderPreservingFocus();
          }
        } else if (msg.type === "ROOM_STATE" && msg.room) {
          const prevStatus = model.rooms[msg.room.roomId]?.status;
          const upserted = upsertRoomFromSummaryPure(
            model,
            msg.room,
            msg.state,
            msg.actingPlayerId
          );
          model = upserted.model;
          const updated = upserted.room;
          if (updated.roomId === model.activeRoomId) {
            if (
              model.viewMode === "room_setup" &&
              prevStatus !== "in_progress" &&
              updated.status === "in_progress"
            ) {
              model = resetSubModesPure({ ...model, viewMode: "in_game" });
            }
            if (updated.status === "finished") {
              stopAutoPlay();
            }
            renderPreservingFocus();
          }
        }
      } catch {
        // Ignore malformed frame
      }
    });

    socket.addEventListener("close", () => {
      if (ws === socket) {
        ws = null;
      }
      if (model.isAuthenticated && model.useServerBackend) {
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(() => connectServerRealtime(), 1500);
      }
    });
  };

  const fetchLobbyRooms = async (): Promise<void> => {
    if (!model.useServerBackend) return;
    try {
      const res = await fetch("/api/rooms");
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("application/json")) {
        model = {
          ...model,
          staticHostOnly: true,
          useServerBackend: false,
          serverReachable: false,
          createRoomMode: "offline",
        };
        if (wsReconnectTimer) {
          clearTimeout(wsReconnectTimer);
          wsReconnectTimer = null;
        }
        if (model.viewMode === "lobby") {
          renderPreservingFocus();
        }
        return;
      }
      model = { ...model, serverReachable: true };
      connectServerRealtime();
      const data = await res.json();
      if (Array.isArray(data.rooms)) {
        model = syncOnlineLobbyRoomsPure(model, data.rooms);
        if (model.pendingInviteRoomId) {
          const inviteId = model.pendingInviteRoomId;
          model = { ...model, pendingInviteRoomId: null };
          pendingRestoreRoomId = null;
          enterOrJoinRoom(inviteId);
          return;
        }
        if (pendingRestoreRoomId) {
          const restoreId = pendingRestoreRoomId;
          pendingRestoreRoomId = null;
          const restoreTarget = model.rooms[restoreId];
          const isSeatedInRestore = Boolean(
            restoreTarget?.players.some(
              (p) =>
                p.id === model.currentUserId ||
                p.controllerId === model.currentUserId
            )
          );
          if (restoreTarget && isSeatedInRestore) {
            enterOrJoinRoom(restoreId);
            return;
          }
          clearActiveRoomIdFromStorage();
        }
        if (model.viewMode === "lobby") {
          renderPreservingFocus();
        }
      }
    } catch {
      model = {
        ...model,
        serverReachable: false,
        createRoomMode: "offline",
      };
      if (model.viewMode === "lobby") {
        renderPreservingFocus();
      }
    }
  };

  const pushServerRoomSetup = (room: ClientRoom, debounceMs = 0): void => {
    if (!roomUsesServerPure(model, room)) return;
    if (setupSyncTimer) {
      clearTimeout(setupSyncTimer);
      setupSyncTimer = null;
    }
    const send = async () => {
      try {
        const latest = model.rooms[room.roomId] ?? room;
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(latest.roomId)}/setup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requesterId: model.currentUserId,
              name: latest.name,
              gameId: latest.gameId,
              botCount: latest.botCount,
              allBots: latest.allBots,
              botDifficulty: latest.botDifficulty,
              startingPlayerMode: latest.startingPlayerMode,
              config: latest.config,
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.room) {
            model = upsertRoomFromSummaryPure(model, data.room).model;
            renderPreservingFocus();
          }
        }
      } catch {
        // Ignore transient network errors
      }
    };
    if (debounceMs > 0) {
      setupSyncTimer = setTimeout(() => void send(), debounceMs);
    } else {
      void send();
    }
  };

  const signInAsGuest = (
    rawName?: string,
    existingGuestId?: string
  ): boolean => {
    const inviteBeforeSignIn = model.pendingInviteRoomId;
    const res = resolveGuestSignInPure(
      model,
      rawName,
      Math.random().toString(36).slice(2, 8),
      Date.now(),
      existingGuestId
    );
    model = res.model;
    if (!res.ok) {
      render();
      return false;
    }

    saveGuestSessionToStorage(res.session);
    saveDeviceGuestsToStorage(model.deviceGuests);

    if (inviteBeforeSignIn) {
      model = { ...model, pendingInviteRoomId: null };
      pendingRestoreRoomId = null;
      if (model.useServerBackend) {
        void fetchLobbyRooms();
      }
      enterOrJoinRoom(inviteBeforeSignIn);
      return true;
    }

    render();

    if (model.useServerBackend) {
      void fetchLobbyRooms();
    }
    return true;
  };

  const createLocalRoom = (opts: CreateLocalRoomOptions): ClientRoom => {
    const created = createLocalRoomPure(model, opts, Date.now());
    model = created.model;
    if (opts.autoStart) {
      startRoomMatch(created.room.roomId);
    }
    return getOrCreateRoomLens(created.room.roomId);
  };

  const startSoloGameFromLogin = (rawName?: string): boolean => {
    const fallbackName =
      (rawName ?? model.loginDraftName).trim() || "Player 1";
    model = { ...model, pendingInviteRoomId: null };
    const ok = signInAsGuest(fallbackName);
    if (!ok) return false;
    model = { ...model, createRoomMode: "offline" };
    const room = createLocalRoom({
      gameId: model.createRoomGameId,
      ownerId: model.currentUserId,
      ownerName: model.currentUserName,
      isOfflineLocal: true,
      botCount: 3,
      startingPlayerMode: "random",
      autoStart: false,
    });
    model = resetSubModesPure({
      ...model,
      activeRoomId: room.roomId,
      viewMode: "room_setup",
    });
    render();
    return true;
  };

  const startOfflineLocalFromLogin = (rawName?: string): boolean => {
    const fallbackName =
      (rawName ?? model.loginDraftName).trim() || "Player 1";
    model = { ...model, pendingInviteRoomId: null };
    const ok = signInAsGuest(fallbackName);
    if (!ok) return false;
    model = { ...model, createRoomMode: "offline" };
    const room = createLocalRoom({
      gameId: model.createRoomGameId,
      ownerId: model.currentUserId,
      ownerName: model.currentUserName,
      isOfflineLocal: true,
      botCount: 0,
      startingPlayerMode: "random",
      autoStart: false,
    });
    model = resetSubModesPure({
      ...model,
      activeRoomId: room.roomId,
      viewMode: "room_setup",
    });
    render();
    return true;
  };

  const openAddGuestView = (): void => {
    stopAutoPlay();
    model = {
      ...model,
      returnViewAfterAddGuest:
        model.viewMode === "login" ? "lobby" : model.viewMode,
      addingAdditionalGuest: true,
      loginErrorMsg: "",
      loginDraftName: `Guest ${model.deviceGuests.length + 1}`,
      viewMode: "login",
    };
    render();
  };

  const switchActiveGuest = (guestId: string): void => {
    const found =
      model.deviceGuests.find((g) => g.id === guestId) ??
      USER_PROFILES.find((u) => u.id === guestId);
    if (!found) return;

    const session: GuestSession = {
      id: found.id,
      name: found.name,
      mode: "guest",
    };
    model = {
      ...model,
      currentUserId: found.id,
      currentUserName: found.name,
      deviceGuests: upsertDeviceGuestListPure(model.deviceGuests, session),
    };
    saveGuestSessionToStorage(session);
    saveDeviceGuestsToStorage(model.deviceGuests);

    const active = model.rooms[model.activeRoomId];
    if (
      active &&
      roomUsesServerPure(model, active) &&
      (model.viewMode === "room_setup" || model.viewMode === "in_game")
    ) {
      sendWsMessage({
        type: "SUBSCRIBE_ROOM",
        roomId: active.roomId,
        playerId: model.currentUserId,
      });
      void fetch(
        `/api/rooms/${encodeURIComponent(active.roomId)}?playerId=${encodeURIComponent(model.currentUserId)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.room) {
            model = upsertRoomFromSummaryPure(
              model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model;
            render();
          }
        })
        .catch(() => {});
    }

    render();
  };

  const performGuestCleanup = (targetGuestId: string): void => {
    if (!targetGuestId) return;
    const isSigningOutCurrent = targetGuestId === model.currentUserId;
    if (isSigningOutCurrent) {
      stopAutoPlay();
      pendingRestoreRoomId = null;
    }

    if (model.useServerBackend) {
      void fetch("/api/guests/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: targetGuestId }),
      })
        .then(() => {
          if (model.isAuthenticated && model.useServerBackend) {
            return fetchLobbyRooms();
          }
        })
        .catch(() => {});

      if (isSigningOutCurrent) {
        sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
      }
    }

    const cleaned = signOutGuestFromModelPure(
      model,
      targetGuestId,
      100 + Math.floor(Math.random() * 900)
    );
    model = cleaned.model;
    cleaned.removedRoomIds.forEach((id) => roomLensCache.delete(id));
    saveDeviceGuestsToStorage(model.deviceGuests);

    if (cleaned.switchedToGuest) {
      saveGuestSessionToStorage(cleaned.switchedToGuest);
      if (
        (model.viewMode === "room_setup" || model.viewMode === "in_game") &&
        model.activeRoomId
      ) {
        saveActiveRoomIdToStorage(model.activeRoomId);
        const active = model.rooms[model.activeRoomId];
        if (active && roomUsesServerPure(model, active)) {
          sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: active.roomId,
            playerId: model.currentUserId,
          });
        }
      } else {
        clearActiveRoomIdFromStorage();
      }
    } else if (isSigningOutCurrent) {
      clearGuestSessionFromStorage();
      clearActiveRoomIdFromStorage();
    }

    render();
    scheduleBotAutoResponseIfNeeded();
  };

  const signOutGuest = (): void => {
    performGuestCleanup(model.currentUserId);
  };

  const removeDeviceGuest = (guestId: string): void => {
    performGuestCleanup(guestId);
  };

  const renameCurrentGuest = (rawNewName: string): boolean => {
    const res = renameGuestInModelPure(
      model,
      model.currentUserId,
      rawNewName
    );
    if (!res.ok) {
      return false;
    }
    model = res.model;
    saveGuestSessionToStorage(res.session);
    saveDeviceGuestsToStorage(model.deviceGuests);

    if (model.useServerBackend) {
      void fetch("/api/guests/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: res.session.id,
          newName: res.session.name,
        }),
      }).catch(() => {});
    }

    render();
    return true;
  };

  const getActiveRoom = (): ClientRoom => {
    const active = getActiveRoomPure(model);
    return getOrCreateRoomLens(active.roomId);
  };

  const rebuildRoomSeats = (roomLike: ClientRoom): void => {
    const target = model.rooms[roomLike.roomId] ?? roomLike;
    const rebuilt = rebuildRoomSeatsPure(target);
    model = setRoomInModelPure(model, rebuilt);
  };

  const addLocalFriendToRoom = (room: ClientRoom, rawName: string): void => {
    const liveRoom = model.rooms[room.roomId] ?? room;
    const cleanName =
      rawName.trim() || `Player ${liveRoom.humanPlayers.length + 1}`;
    const bounds = getRoomBoundsPure(liveRoom);
    if (liveRoom.humanPlayers.length >= bounds.maxPlayers) return;

    if (roomUsesServerPure(model, liveRoom)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(liveRoom.roomId)}/local-players`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: model.currentUserId,
                playerName: cleanName.slice(0, 28),
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Unable to add local player");
            return;
          }
          model = upsertRoomFromSummaryPure(
            { ...model, localFriendDraftName: "" },
            data.room
          ).model;
          render();
        } catch (err: any) {
          alert(`Unable to add local player: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    model = addOfflineLocalFriendPure(
      model,
      liveRoom.roomId,
      rawName,
      Math.random().toString(36).slice(2, 7)
    );
    render();
  };

  const removePlayerFromRoom = (
    room: ClientRoom,
    targetPlayerId: string
  ): void => {
    const liveRoom = model.rooms[room.roomId] ?? room;
    if (targetPlayerId === liveRoom.ownerId) return;

    if (roomUsesServerPure(model, liveRoom)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(liveRoom.roomId)}/remove-player`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: model.currentUserId,
                targetPlayerId,
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Unable to remove player");
            return;
          }
          model = upsertRoomFromSummaryPure(model, data.room).model;
          render();
        } catch (err: any) {
          alert(`Unable to remove player: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    model = removeOfflinePlayerPure(model, liveRoom.roomId, targetPlayerId);
    render();
  };

  const createAndOpenRoom = (): void => {
    const selectedGameId = model.lobbyGameFilter || model.createRoomGameId;
    const explicitName = model.createRoomName.trim();

    const openAsOfflineLocal =
      model.createRoomMode === "offline" ||
      !model.useServerBackend ||
      !model.serverReachable;

    if (!openAsOfflineLocal) {
      void (async () => {
        try {
          const res = await fetch("/api/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(explicitName ? { name: explicitName } : {}),
              gameId: selectedGameId,
              ownerId: model.currentUserId,
              hostName: model.currentUserName,
              botCount: 0,
              startingPlayerMode: "random",
              autoStart: false,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Unable to create room");
            return;
          }
          const upserted = upsertRoomFromSummaryPure(
            model,
            data.room,
            data.state,
            data.actingPlayerId
          );
          const created = upserted.room;
          saveActiveRoomIdToStorage(created.roomId);
          syncUrlRoomHash(created.roomId);
          model = resetSubModesPure({
            ...upserted.model,
            lobbyGameFilter: created.gameId,
            createRoomGameId: created.gameId,
            activeRoomId: created.roomId,
            viewMode:
              created.status === "in_progress" ? "in_game" : "room_setup",
          });
          sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: created.roomId,
            playerId: model.currentUserId,
          });
          render();
        } catch {
          model = {
            ...model,
            serverReachable: false,
            createRoomMode: "offline",
          };
          const fallbackRoom = createLocalRoom({
            ...(explicitName ? { name: explicitName } : {}),
            gameId: selectedGameId,
            ownerId: model.currentUserId,
            ownerName: model.currentUserName,
            isOfflineLocal: true,
            botCount: 0,
            startingPlayerMode: "random",
            autoStart: false,
          });
          model = resetSubModesPure({
            ...model,
            lobbyGameFilter: fallbackRoom.gameId,
            createRoomGameId: fallbackRoom.gameId,
            activeRoomId: fallbackRoom.roomId,
            viewMode: "room_setup",
          });
          render();
        }
      })();
      return;
    }

    const room = createLocalRoom({
      ...(explicitName ? { name: explicitName } : {}),
      gameId: selectedGameId,
      ownerId: model.currentUserId,
      ownerName: model.currentUserName,
      isOfflineLocal: true,
      botCount: 0,
      startingPlayerMode: "random",
      autoStart: false,
    });
    model = resetSubModesPure({
      ...model,
      lobbyGameFilter: room.gameId,
      createRoomGameId: room.gameId,
      activeRoomId: room.roomId,
      viewMode: "room_setup",
    });
    render();
  };

  const enterOrJoinRoom = (rawRoomId: string): void => {
    stopAutoPlay();
    const roomId = resolveClientRoomIdPure(model, rawRoomId);
    const room = model.rooms[roomId];

    if (!room) {
      if (model.useServerBackend) {
        void (async () => {
          try {
            const getRes = await fetch(
              `/api/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(model.currentUserId)}`
            );
            if (!getRes.ok) {
              clearActiveRoomIdFromStorage();
              syncUrlRoomHash(null);
              render();
              return;
            }
            const getData = await getRes.json();
            const fetchedStatus = getData.room?.status ?? "lobby";
            let latestRoom: ClientRoom;

            if (fetchedStatus === "lobby" || fetchedStatus === "finished") {
              const joinRes = await fetch(
                `/api/rooms/${encodeURIComponent(getData.room.roomId)}/join`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    playerId: model.currentUserId,
                    playerName: model.currentUserName,
                  }),
                }
              );
              const joinData = await joinRes.json();
              if (!joinRes.ok) {
                alert(joinData.error ?? "Unable to join room");
                syncUrlRoomHash(null);
                render();
                return;
              }
              const upserted = upsertRoomFromSummaryPure(
                model,
                joinData.room,
                joinData.state,
                joinData.actingPlayerId
              );
              model = upserted.model;
              latestRoom = upserted.room;
            } else {
              const upserted = upsertRoomFromSummaryPure(
                model,
                getData.room,
                getData.state,
                getData.actingPlayerId
              );
              model = upserted.model;
              latestRoom = upserted.room;
            }

            connectServerRealtime();
            saveActiveRoomIdToStorage(latestRoom.roomId);
            syncUrlRoomHash(latestRoom.roomId);
            sendWsMessage({
              type: "SUBSCRIBE_ROOM",
              roomId: latestRoom.roomId,
              playerId: model.currentUserId,
            });
            model = resetSubModesPure({
              ...model,
              lobbyGameFilter: latestRoom.gameId,
              createRoomGameId: latestRoom.gameId,
              activeRoomId: latestRoom.roomId,
              viewMode:
                latestRoom.status === "in_progress" ? "in_game" : "room_setup",
            });
            render();
          } catch {
            syncUrlRoomHash(null);
            render();
          }
        })();
      }
      return;
    }

    model = {
      ...model,
      lobbyGameFilter: room.gameId,
      createRoomGameId: room.gameId,
      activeRoomId: room.roomId,
    };
    saveActiveRoomIdToStorage(room.roomId);
    if (!room.isOfflineLocal) {
      syncUrlRoomHash(room.roomId);
    }

    if (roomUsesServerPure(model, room)) {
      void (async () => {
        try {
          let latestRoom = room;
          if (room.status === "lobby" || room.status === "finished") {
            const joinRes = await fetch(
              `/api/rooms/${encodeURIComponent(room.roomId)}/join`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  playerId: model.currentUserId,
                  playerName: model.currentUserName,
                }),
              }
            );
            const joinData = await joinRes.json();
            if (!joinRes.ok) {
              alert(joinData.error ?? "Unable to join room");
              return;
            }
            const upserted = upsertRoomFromSummaryPure(
              model,
              joinData.room,
              joinData.state,
              joinData.actingPlayerId
            );
            model = upserted.model;
            latestRoom = upserted.room;
          } else {
            const getRes = await fetch(
              `/api/rooms/${encodeURIComponent(room.roomId)}?playerId=${encodeURIComponent(model.currentUserId)}`
            );
            if (getRes.ok) {
              const getData = await getRes.json();
              const upserted = upsertRoomFromSummaryPure(
                model,
                getData.room,
                getData.state,
                getData.actingPlayerId
              );
              model = upserted.model;
              latestRoom = upserted.room;
            }
          }

          syncUrlRoomHash(latestRoom.roomId);
          sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: latestRoom.roomId,
            playerId: model.currentUserId,
          });
          model = resetSubModesPure({
            ...model,
            lobbyGameFilter: latestRoom.gameId,
            createRoomGameId: latestRoom.gameId,
            viewMode:
              latestRoom.status === "in_progress" ? "in_game" : "room_setup",
          });
          render();
        } catch (err: any) {
          alert(`Unable to enter room: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    model = enterOfflineRoomPure(model, room.roomId);
    render();
  };

  const leaveActiveRoom = (): void => {
    const room = getActiveRoomPure(model);
    if (!room) return;
    stopAutoPlay();
    clearActiveRoomIdFromStorage();
    syncUrlRoomHash(null);

    if (roomUsesServerPure(model, room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(room.roomId)}/leave`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId: model.currentUserId }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.closed) {
              model = removeRoomFromModelPure(model, room.roomId);
              roomLensCache.delete(room.roomId);
            }
          }
        } catch {
          // Ignore network errors
        }
        sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
        model = resetSubModesPure({ ...model, viewMode: "lobby" });
        await fetchLobbyRooms();
        render();
      })();
      return;
    }

    model = leaveOfflineRoomPure(model, room.roomId);
    render();
  };

  const scheduleBotAutoResponseIfNeeded = (): void => {
    const room = getActiveRoomPure(model);
    if (!room || roomUsesServerPure(model, room)) return;
    if (botResponseTimeout) {
      clearTimeout(botResponseTimeout);
      botResponseTimeout = null;
    }
    if (!room.session || model.viewMode !== "in_game") return;
    const state = room.session.getState();
    if (state.phase === "GAME_OVER") return;

    const actorId = getActingPlayerIdPure(room.gameId, state);
    const actor = state.players.find((p: any) => p.id === actorId);

    if (
      room.gameId === "catan" &&
      state.phase === "MAIN_PHASE" &&
      state.activeTradeOffer &&
      actor &&
      actor.id !== state.activeTradeOffer.fromPlayerId &&
      !(state.config.enableCitiesAndKnights
        ? hasTradeGoodsForOfferPure(actor, state.activeTradeOffer)
        : hasResources(actor.resources, state.activeTradeOffer.want))
    ) {
      dispatch(actor.id, {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId: state.activeTradeOffer.id,
      });
      return;
    }

    if (!model.autoRespondBotsToHuman || model.autoPlayBots) return;
    if (actor && actor.isBot) {
      const delayMs =
        room.gameId === "seven_wonders" &&
        state.phase === "AGE_DRAFT" &&
        state.players.some(
          (p: any) => !p.isBot && state.lockedPlayerIds.includes(p.id)
        )
          ? 380
          : 140;
      botResponseTimeout = setTimeout(() => {
        stepOneBotMove();
      }, delayMs);
      return;
    }

    if (
      room.gameId === "catan" &&
      state.phase === "SPECIAL_BUILDING" &&
      actor &&
      !actor.isBot &&
      !room.allBots &&
      canControlPlayerOnDevicePure(model, room, actor.id)
    ) {
      const spLegal = CatanEngine.getLegalActions(state, actor.id);
      if (
        spLegal.length === 1 &&
        spLegal[0]?.type === "END_SPECIAL_BUILD"
      ) {
        botResponseTimeout = setTimeout(() => {
          dispatch(actor.id, { type: "END_SPECIAL_BUILD" });
        }, 160);
      }
    }
  };

  const startRoomMatch = (roomId: string): void => {
    stopAutoPlay();
    const room = model.rooms[roomId];
    if (!room) return;

    if (roomUsesServerPure(model, room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(roomId)}/start`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterId: model.currentUserId }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Cannot start match");
            return;
          }
          const upserted = upsertRoomFromSummaryPure(
            model,
            data.room,
            data.state,
            data.actingPlayerId
          );
          model = resetSubModesPure({
            ...upserted.model,
            activeRoomId: roomId,
            viewMode: "in_game",
          });
          sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId,
            playerId: model.currentUserId,
          });
          render();
        } catch (err: any) {
          alert(`Unable to start match: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    const startedRes = startOfflineRoomMatchPure(model, roomId);
    model = startedRes.model;
    if (!startedRes.started) return;
    render();
    scheduleBotAutoResponseIfNeeded();
  };

  const resetSubModes = (): void => {
    model = resetSubModesPure(model);
  };

  const dispatch = (playerId: string, action: any): void => {
    const room = getActiveRoomPure(model);
    if (roomUsesServerPure(model, room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(room.roomId)}/action`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                playerId,
                requesterId: model.currentUserId,
                action,
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(`Action error: ${data.error ?? "Illegal action"}`);
            return;
          }
          model = resetSubModesPure(
            upsertRoomFromSummaryPure(
              model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model
          );
          render();
        } catch (err: any) {
          alert(`Action error: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    if (!room.session) return;
    try {
      const prevActorId = getActingPlayerIdPure(
        room.gameId,
        room.session.getState()
      );
      const result = room.session.dispatch(playerId, action);
      const nextActorId = getActingPlayerIdPure(room.gameId, result.state);
      if (result.state.phase === "GAME_OVER") {
        model = updateRoomInModelPure(model, room.roomId, (r) => ({
          ...r,
          status: "finished",
        }));
      } else if (
        room.gameId === "catan" &&
        prevActorId !== nextActorId &&
        result.state.players.filter((p: any) => !p.isBot).length >= 2
      ) {
        const nextActor = result.state.players.find(
          (p: any) => p.id === nextActorId
        );
        if (nextActor && !nextActor.isBot && model.hidePassAndPlayHand) {
          model = { ...model, hidePassAndPlayHand: true };
        }
      }
      model = resetSubModesPure(model);
      render();
      scheduleBotAutoResponseIfNeeded();
    } catch (err: any) {
      alert(`Action error: ${err?.message ?? String(err)}`);
    }
  };

  const dispatchUiAction = (playerId: string, action: any): void => {
    const room = getActiveRoomPure(model);
    if (!canControlPlayerOnDevicePure(model, room, playerId)) {
      return;
    }
    const rawState = getRoomStatePure(model, room);
    if (rawState) {
      const actingId = roomUsesServerPure(model, room)
        ? room.remoteActingPlayerId ??
          getActingPlayerIdPure(room.gameId, rawState)
        : getActingPlayerIdPure(room.gameId, rawState);
      const isTradeProposerAction =
        room.gameId === "catan" &&
        rawState.activeTradeOffer?.fromPlayerId === playerId &&
        (action?.type === "CONFIRM_DOMESTIC_TRADE" ||
          action?.type === "CANCEL_DOMESTIC_TRADE");
      const isSimultaneousSevenWondersDraft =
        room.gameId === "seven_wonders" &&
        rawState.phase === "AGE_DRAFT" &&
        Array.isArray(rawState.lockedPlayerIds) &&
        !rawState.lockedPlayerIds.includes(playerId);
      const isSevenWondersUnselect =
        room.gameId === "seven_wonders" &&
        action?.type === "UNSELECT_DRAFT_ACTION" &&
        canPlayerUnselectDraftPick(rawState as SevenWondersState, playerId);
      if (
        playerId !== actingId &&
        !isTradeProposerAction &&
        !isSimultaneousSevenWondersDraft &&
        !isSevenWondersUnselect
      ) {
        return;
      }
    }
    dispatch(playerId, action);
  };

  const startInteractiveTutorial = (gameId: SupportedGameId): ClientRoom => {
    stopAutoPlay();
    const res = startInteractiveTutorialPure(model, gameId, Date.now());
    model = res.model;
    render();
    scheduleBotAutoResponseIfNeeded();
    return getOrCreateRoomLens(res.roomId);
  };

  const stepOneBotMove = (): boolean => {
    const room = getActiveRoomPure(model);
    if (roomUsesServerPure(model, room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/bot-step`,
          { method: "POST" }
        );
        if (res.ok) {
          const data = await res.json();
          model = resetSubModesPure(
            upsertRoomFromSummaryPure(
              model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model
          );
          render();
        }
      })();
      return true;
    }

    if (!room.session) return false;
    const state = room.session.getState();
    if (state.phase === "GAME_OVER") {
      model = updateRoomInModelPure(model, room.roomId, (r) => ({
        ...r,
        status: "finished",
      }));
      stopAutoPlay();
      return false;
    }
    const actorId = getActingPlayerIdPure(room.gameId, state);
    if (!actorId) return false;
    const engine = getEngineForGamePure(room.gameId);
    const action = engine.chooseBotAction(state, actorId);
    if (!action) return false;
    const res = room.session.dispatch(actorId, action);
    if (res.state.phase === "GAME_OVER") {
      model = updateRoomInModelPure(model, room.roomId, (r) => ({
        ...r,
        status: "finished",
      }));
    }
    model = resetSubModesPure(model);
    render();
    scheduleBotAutoResponseIfNeeded();
    return true;
  };

  const finishSetupWithBots = (): void => {
    const room = getActiveRoomPure(model);
    if (roomUsesServerPure(model, room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/finish-setup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: model.currentUserId }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          model = resetSubModesPure(
            upsertRoomFromSummaryPure(
              model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model
          );
          render();
        }
      })();
      return;
    }

    if (!room.session || room.gameId !== "catan") return;
    stepSetupBotsRecursive(room.session, 40);
    model = resetSubModesPure(model);
    render();
    scheduleBotAutoResponseIfNeeded();
  };

  const undoMatch = (): void => {
    const room = getActiveRoomPure(model);
    stopAutoPlay();
    if (roomUsesServerPure(model, room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/undo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: model.currentUserId }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          model = resetSubModesPure(
            upsertRoomFromSummaryPure(
              model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model
          );
          render();
        }
      })();
      return;
    }
    if (!room.session) return;
    const rawState = room.session.getState();
    const baseActingId = getActingPlayerIdPure(room.gameId, rawState);
    const undoTargetId = ((): string | null => {
      if (
        baseActingId &&
        canControlPlayerOnDevicePure(model, room, baseActingId) &&
        room.session.canPlayerUndo(baseActingId)
      ) {
        return baseActingId;
      }
      if (room.gameId === "seven_wonders" && rawState.phase === "AGE_DRAFT") {
        const log = room.session.getActionLog();
        const last = log[log.length - 1];
        if (
          last &&
          canControlPlayerOnDevicePure(model, room, last.playerId) &&
          room.session.canPlayerUndo(last.playerId)
        ) {
          return last.playerId;
        }
      }
      return null;
    })();
    if (!undoTargetId) {
      return;
    }
    room.session.undoForPlayer(undoTargetId);
    model = resetSubModesPure(model);
    render();
  };

  const redoMatch = (): void => {
    const room = getActiveRoomPure(model);
    stopAutoPlay();
    if (roomUsesServerPure(model, room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/redo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: model.currentUserId }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          model = resetSubModesPure(
            upsertRoomFromSummaryPure(
              model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model
          );
          render();
        }
      })();
      return;
    }
    if (!room.session) return;
    const rawState = room.session.getState();
    const actingId = getActingPlayerIdPure(room.gameId, rawState);
    if (
      !actingId ||
      !canControlPlayerOnDevicePure(model, room, actingId) ||
      !room.session.canPlayerRedo(actingId)
    ) {
      return;
    }
    room.session.redoForPlayer(actingId);
    model = resetSubModesPure(model);
    render();
  };

  const toggleAutoRespondBots = (): void => {
    const room = getActiveRoomPure(model);
    const next = !model.autoRespondBotsToHuman;
    model = updateRoomInModelPure(
      { ...model, autoRespondBotsToHuman: next },
      room.roomId,
      (r) => ({ ...r, autoStepBots: next })
    );
    if (roomUsesServerPure(model, room)) {
      void fetch(`/api/rooms/${encodeURIComponent(room.roomId)}/auto-bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      }).catch(() => {});
    }
    render();
    scheduleBotAutoResponseIfNeeded();
  };

  const toggleAutoPlay = (): void => {
    if (model.autoPlayBots) {
      stopAutoPlay();
    } else {
      model = { ...model, autoPlayBots: true };
      autoPlayTimer = setInterval(() => {
        const room = getActiveRoomPure(model);
        const state = getRoomStatePure(model, room);
        if (!state) {
          stopAutoPlay();
          return;
        }
        if (state.phase === "GAME_OVER") {
          model = updateRoomInModelPure(model, room.roomId, (r) => ({
            ...r,
            status: "finished",
          }));
          stopAutoPlay();
          render();
          return;
        }
        stepOneBotMove();
      }, model.autoPlaySpeedMs);
    }
    render();
  };

  const switchTradeMode = (
    nextMode: "maritime_trade" | "domestic_trade" | null
  ): void => {
    model = switchTradeModePure(model, nextMode);
    render();
  };

  const setSharedTradeWant = (resource: ResourceType, amount: number): void => {
    model = setSharedTradeWantPure(model, resource, amount);
  };

  const bindTutorialAndGuideEvents = (): void => {
    root.querySelectorAll("[data-start-tutorial]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gId = btn.getAttribute("data-start-tutorial") as SupportedGameId;
        if (gId) {
          startInteractiveTutorial(gId);
        }
      });
    });

    root.querySelectorAll("[data-open-guide]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gId = btn.getAttribute("data-open-guide") as SupportedGameId;
        if (gId) {
          model = { ...model, guideModalGameId: gId };
          render();
        }
      });
    });

    root.querySelector("#btn-close-guide")?.addEventListener("click", () => {
      model = { ...model, guideModalGameId: null };
      render();
    });

    root
      .querySelector("#btn-resume-from-guide")
      ?.addEventListener("click", () => {
        model = { ...model, guideModalGameId: null };
        render();
      });

    root
      .querySelector("#ga-guide-backdrop")
      ?.addEventListener("click", (ev) => {
        if (ev.target === ev.currentTarget) {
          model = { ...model, guideModalGameId: null };
          render();
        }
      });

    root
      .querySelector("#ga-guide-backdrop")
      ?.addEventListener("keydown", (ev: any) => {
        if (ev.key === "Escape") {
          model = { ...model, guideModalGameId: null };
          render();
        }
      });

    root.querySelector("#btn-tutorial-prev")?.addEventListener("click", () => {
      if (!model.activeTutorial) return;
      model = {
        ...model,
        activeTutorial: {
          ...model.activeTutorial,
          stepIndex: Math.max(0, model.activeTutorial.stepIndex - 1),
        },
      };
      render();
    });

    root.querySelector("#btn-tutorial-next")?.addEventListener("click", () => {
      if (!model.activeTutorial) return;
      const maxIdx = TUTORIAL_LESSONS[model.activeTutorial.gameId].length - 1;
      const nextIdx = Math.min(maxIdx, model.activeTutorial.stepIndex + 1);
      model = {
        ...model,
        activeTutorial: {
          ...model.activeTutorial,
          stepIndex: nextIdx,
          maxAutoStepIndex: Math.max(
            model.activeTutorial.maxAutoStepIndex,
            nextIdx
          ),
        },
      };
      render();
    });

    root
      .querySelector("#btn-tutorial-dismiss")
      ?.addEventListener("click", () => {
        model = { ...model, activeTutorial: null };
        render();
      });

    root
      .querySelector("#btn-tutorial-exit")
      ?.addEventListener("click", () => {
        const tutRoomId = model.activeTutorial?.roomId ?? null;
        const nextRooms = tutRoomId
          ? Object.fromEntries(
              Object.entries(model.rooms).filter(([id]) => id !== tutRoomId)
            )
          : model.rooms;
        const nextOrder = tutRoomId
          ? model.roomOrder.filter((id) => id !== tutRoomId)
          : model.roomOrder;
        const fallbackId = nextOrder[0] ?? "";
        model = {
          ...model,
          rooms: nextRooms,
          roomOrder: nextOrder,
          activeRoomId:
            model.activeRoomId === tutRoomId ? fallbackId : model.activeRoomId,
          activeTutorial: null,
          viewMode: "lobby",
        };
        render();
      });

    root
      .querySelector("#btn-tutorial-auto-step")
      ?.addEventListener("click", () => {
        const room = getActiveRoomPure(model);
        const rawState = getRoomStatePure(model, room);
        if (!rawState) return;
        const actingId = getActingPlayerIdPure(room.gameId, rawState);
        if (!actingId || !canControlPlayerOnDevicePure(model, room, actingId)) {
          return;
        }
        const curStepIdx = model.activeTutorial?.stepIndex ?? 0;
        const rec = chooseRecommendedTutorialActionPure(
          room.gameId,
          rawState,
          actingId,
          curStepIdx,
          model.azulSelectedDraft
        );
        if (
          rec &&
          room.gameId === "azul" &&
          curStepIdx === 0 &&
          !model.azulSelectedDraft &&
          rec.type === "DRAFT_TILES"
        ) {
          model = {
            ...model,
            azulSelectedDraft: {
              source: rec.source,
              color: rec.color,
            },
          };
          render();
          return;
        }
        if (rec) {
          model = { ...model, azulSelectedDraft: null };
          dispatchUiAction(actingId, rec);
        }
      });
  };

  const bindCommonIdentityEvents = (): void => {
    bindDropdownEventsOnRoot(root);
    bindTutorialAndGuideEvents();
    root.querySelectorAll('[role="button"][tabindex="0"]').forEach((el) => {
      el.addEventListener("keydown", (ev: any) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault?.();
          (el as HTMLElement).click();
        }
      });
    });
    root
      .querySelector("#sel-user-identity")
      ?.addEventListener("change", (e) => {
        const selectedId = (e.target as HTMLSelectElement).value;
        switchActiveGuest(selectedId);
      });

    root
      .querySelector("#btn-edit-guest-name")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          editingGuestName: true,
          guestRenameDraft: model.currentUserName,
        };
        render();
        const inp = root.querySelector?.(
          "#inp-rename-guest"
        ) as HTMLInputElement | null;
        inp?.focus?.();
        inp?.select?.();
      });

    root
      .querySelector("#inp-rename-guest")
      ?.addEventListener("input", (e) => {
        model = {
          ...model,
          guestRenameDraft: (e.target as HTMLInputElement).value,
        };
      });

    root
      .querySelector("#inp-rename-guest")
      ?.addEventListener("keydown", (e: any) => {
        if (e.key === "Escape") {
          model = {
            ...model,
            editingGuestName: false,
            guestRenameDraft: "",
          };
          render();
        }
      });

    root
      .querySelector("#form-rename-guest")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        renameCurrentGuest(model.guestRenameDraft);
      });

    root
      .querySelector("#btn-cancel-guest-name")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          editingGuestName: false,
          guestRenameDraft: "",
        };
        render();
      });

    root.querySelector("#btn-add-guest")?.addEventListener("click", () => {
      openAddGuestView();
    });

    root.querySelector("#btn-sign-out")?.addEventListener("click", () => {
      syncUrlRoomHash(null);
      signOutGuest();
    });

    root.querySelectorAll("[data-copy-room-link]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rId = btn.getAttribute("data-copy-room-link");
        if (rId) {
          copyRoomShareLink(rId);
        }
      });
    });
  };

  const bindLoginEvents = (): void => {
    root.querySelector("#inp-guest-name")?.addEventListener("input", (e) => {
      model = {
        ...model,
        loginDraftName: (e.target as HTMLInputElement).value,
        loginErrorMsg: "",
      };
    });

    root
      .querySelector("#form-guest-login")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        signInAsGuest(model.loginDraftName);
      });

    root
      .querySelector("#btn-start-solo-game")
      ?.addEventListener("click", () => {
        startSoloGameFromLogin(model.loginDraftName);
      });

    root
      .querySelector("#btn-start-offline-local")
      ?.addEventListener("click", () => {
        startOfflineLocalFromLogin(model.loginDraftName);
      });

    root
      .querySelector("#btn-cancel-add-guest")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          addingAdditionalGuest: false,
          loginErrorMsg: "",
          viewMode: model.returnViewAfterAddGuest,
        };
        render();
      });

    root.querySelectorAll("[data-select-saved-guest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const guestId = btn.getAttribute("data-select-saved-guest")!;
        const found = model.deviceGuests.find((g) => g.id === guestId);
        if (found) {
          signInAsGuest(found.name, found.id);
        }
      });
    });

    root.querySelectorAll("[data-remove-saved-guest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const guestId = btn.getAttribute("data-remove-saved-guest")!;
        removeDeviceGuest(guestId);
      });
    });
  };

  const bindLobbyEvents = (): void => {
    bindCommonIdentityEvents();

    root.querySelectorAll("[data-lobby-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        const filter = el.getAttribute("data-lobby-filter") as SupportedGameId;
        model = {
          ...model,
          lobbyGameFilter: filter,
          createRoomGameId: filter,
        };
        render();
      });
    });

    root
      .querySelector("#sel-create-room-mode")
      ?.addEventListener("change", (e) => {
        model = {
          ...model,
          createRoomMode: (e.target as HTMLSelectElement).value as
            | "online"
            | "offline",
        };
        render();
      });

    root.querySelector("#btn-create-room")?.addEventListener("click", () => {
      createAndOpenRoom();
    });

    root.querySelectorAll("[data-join-room]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rId = btn.getAttribute("data-join-room")!;
        enterOrJoinRoom(rId);
      });
    });

    root.querySelectorAll("[data-start-room-direct]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rId = btn.getAttribute("data-start-room-direct")!;
        startRoomMatch(rId);
      });
    });
  };

  const bindRoomSetupEvents = (
    room: ClientRoom,
    canEditSetup: boolean,
    maxBots: number,
    bounds: { minPlayers: number; maxPlayers: number }
  ): void => {
    bindCommonIdentityEvents();

    root.querySelector("#btn-back-lobby")?.addEventListener("click", () => {
      clearActiveRoomIdFromStorage();
      syncUrlRoomHash(null);
      model = { ...model, viewMode: "lobby" };
      if (model.useServerBackend) {
        void fetchLobbyRooms().then(() => render());
      } else {
        render();
      }
    });

    root.querySelector("#btn-leave-room")?.addEventListener("click", () => {
      leaveActiveRoom();
    });

    root.querySelector("#tab-game-page")?.addEventListener("click", () => {
      const latest = model.rooms[room.roomId] ?? room;
      if (getRoomStatePure(model, latest)) {
        model = { ...model, viewMode: "in_game" };
        render();
      }
    });

    root
      .querySelector("#btn-return-active-game")
      ?.addEventListener("click", () => {
        const latest = model.rooms[room.roomId] ?? room;
        if (getRoomStatePure(model, latest)) {
          model = { ...model, viewMode: "in_game" };
          render();
        }
      });

    if (canEditSetup) {
      root
        .querySelector("#inp-local-friend-name")
        ?.addEventListener("input", (e) => {
          model = {
            ...model,
            localFriendDraftName: (e.target as HTMLInputElement).value,
          };
        });

      root
        .querySelector("#inp-local-friend-name")
        ?.addEventListener("keydown", (e) => {
          if ((e as KeyboardEvent).key === "Enter") {
            e.preventDefault();
            const latest = model.rooms[room.roomId] ?? room;
            addLocalFriendToRoom(latest, model.localFriendDraftName);
          }
        });

      root
        .querySelector("#btn-add-local-friend")
        ?.addEventListener("click", () => {
          const latest = model.rooms[room.roomId] ?? room;
          addLocalFriendToRoom(latest, model.localFriendDraftName);
        });

      root.querySelectorAll("[data-remove-player]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetId = btn.getAttribute("data-remove-player")!;
          const latest = model.rooms[room.roomId] ?? room;
          removePlayerFromRoom(latest, targetId);
        });
      });

      root
        .querySelector("#setup-sel-game")
        ?.addEventListener("change", (e) => {
          const nextGame = (e.target as HTMLSelectElement)
            .value as SupportedGameId;
          model = updateRoomInModelPure(model, room.roomId, (r) =>
            rebuildRoomSeatsPure({
              ...r,
              gameId: nextGame,
              botCount:
                nextGame === "seven_wonders" && r.botCount < 2 ? 3 : r.botCount,
            })
          );
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-sel-wonderside")
        ?.addEventListener("change", (e) => {
          const nextSide = (e.target as HTMLSelectElement).value as
            | "random"
            | "day"
            | "night";
          model = updateRoomInModelPure(model, room.roomId, (r) => ({
            ...r,
            config: {
              ...r.config,
              wonderSideMode: nextSide,
            },
          }));
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-sel-scenario")
        ?.addEventListener("change", (e) => {
          const nextScenario = toBaseMapScenarioId(
            (e.target as HTMLSelectElement).value as ScenarioId
          );
          model = updateRoomInModelPure(model, room.roomId, (r) =>
            rebuildRoomSeatsPure({
              ...r,
              config: {
                ...r.config,
                scenarioId: nextScenario,
                enable56PlayerExtension: undefined,
              },
            })
          );
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-sel-bots")
        ?.addEventListener("change", (e) => {
          const nextBots = Number((e.target as HTMLSelectElement).value);
          model = updateRoomInModelPure(model, room.roomId, (r) =>
            rebuildRoomSeatsPure({ ...r, botCount: nextBots })
          );
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#btn-seat-remove-bot")
        ?.addEventListener("click", () => {
          const current = model.rooms[room.roomId] ?? room;
          if (current.botCount > 0) {
            model = updateRoomInModelPure(model, room.roomId, (r) =>
              rebuildRoomSeatsPure({ ...r, botCount: r.botCount - 1 })
            );
            const latest = model.rooms[room.roomId];
            if (latest) pushServerRoomSetup(latest);
            render();
          }
        });

      root.querySelector("#btn-seat-add-bot")?.addEventListener("click", () => {
        const current = model.rooms[room.roomId] ?? room;
        if (current.botCount < maxBots) {
          model = updateRoomInModelPure(model, room.roomId, (r) =>
            rebuildRoomSeatsPure({ ...r, botCount: r.botCount + 1 })
          );
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        }
      });

      root
        .querySelector("#setup-sel-starting-player")
        ?.addEventListener("change", (e) => {
          const nextStart = (e.target as HTMLSelectElement).value;
          model = updateRoomInModelPure(model, room.roomId, (r) => ({
            ...r,
            startingPlayerMode: nextStart,
          }));
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-sel-bot-difficulty")
        ?.addEventListener("change", (e) => {
          const nextDiff = (e.target as HTMLSelectElement)
            .value as BotDifficulty;
          model = updateRoomInModelPure(model, room.roomId, (r) =>
            rebuildRoomSeatsPure({ ...r, botDifficulty: nextDiff })
          );
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-chk-citiesknights")
        ?.addEventListener("change", (e) => {
          const checked = (e.target as HTMLInputElement).checked;
          model = updateRoomInModelPure(model, room.roomId, (r) => ({
            ...r,
            config: {
              ...r.config,
              scenarioId: toBaseMapScenarioId(r.config.scenarioId),
              enable56PlayerExtension: undefined,
              enableCitiesAndKnights: checked,
              enableCityWalls: checked,
            },
          }));
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-chk-harbormaster")
        ?.addEventListener("change", (e) => {
          const checked = (e.target as HTMLInputElement).checked;
          model = updateRoomInModelPure(model, room.roomId, (r) => ({
            ...r,
            config: { ...r.config, enableHarbormaster: checked },
          }));
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-chk-citywalls")
        ?.addEventListener("change", (e) => {
          const checked = (e.target as HTMLInputElement).checked;
          model = updateRoomInModelPure(model, room.roomId, (r) => ({
            ...r,
            config: { ...r.config, enableCityWalls: checked },
          }));
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-chk-friendlyrobber")
        ?.addEventListener("change", (e) => {
          const checked = (e.target as HTMLInputElement).checked;
          model = updateRoomInModelPure(model, room.roomId, (r) => ({
            ...r,
            config: { ...r.config, enableFriendlyRobber: checked },
          }));
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });
    }

    root.querySelector("#btn-launch-match")?.addEventListener("click", () => {
      startRoomMatch(room.roomId);
    });
  };

  const bindReadOnlyCatanSpotInspect = (): void => {
    root
      .querySelector("#btn-close-spot-popover")
      ?.addEventListener("click", () => {
        model = { ...model, selectedBoardSpot: null };
        render();
      });

    root.querySelectorAll("[data-spot-hex]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const hexId = el.getAttribute("data-spot-hex")!;
        model = {
          ...model,
          selectedBoardSpot:
            model.selectedBoardSpot?.kind === "hex" &&
            model.selectedBoardSpot.id === hexId
              ? null
              : { kind: "hex", id: hexId },
        };
        render();
      });
    });

    root.querySelectorAll("[data-spot-vertex]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const vertexId = el.getAttribute("data-spot-vertex")!;
        model = {
          ...model,
          selectedBoardSpot:
            model.selectedBoardSpot?.kind === "vertex" &&
            model.selectedBoardSpot.id === vertexId
              ? null
              : { kind: "vertex", id: vertexId },
        };
        render();
      });
    });

    root.querySelectorAll("[data-spot-edge]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const edgeId = el.getAttribute("data-spot-edge")!;
        model = {
          ...model,
          selectedBoardSpot:
            model.selectedBoardSpot?.kind === "edge" &&
            model.selectedBoardSpot.id === edgeId
              ? null
              : { kind: "edge", id: edgeId },
        };
        render();
      });
    });
  };

  const bindSplendorEvents = (
    state: SplendorState,
    actingPlayerId: string
  ): void => {
    root.querySelectorAll("[data-sp-gem]").forEach((el) => {
      el.addEventListener("click", () => {
        if (state.phase !== "MAIN_ACTION") return;
        const color = el.getAttribute("data-sp-gem") as GemColor;
        if (state.bank[color] <= 0) return;

        model = {
          ...model,
          splendorDraftGems: toggleSplendorDraftGemPure(
            model.splendorDraftGems,
            state,
            color
          ),
        };
        render();
      });
    });

    root.querySelector("#btn-sp-clear-gems")?.addEventListener("click", () => {
      model = { ...model, splendorDraftGems: {} };
      render();
    });

    root.querySelector("#btn-sp-take-gems")?.addEventListener("click", () => {
      dispatch(actingPlayerId, {
        type: "TAKE_GEMS",
        gems: { ...model.splendorDraftGems },
      });
    });

    root.querySelectorAll("[data-sp-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-sp-buy")!;
        dispatch(actingPlayerId, { type: "PURCHASE_CARD", cardId });
      });
    });

    root.querySelectorAll("[data-sp-reserve]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-sp-reserve")!;
        dispatch(actingPlayerId, { type: "RESERVE_CARD", cardId });
      });
    });

    root.querySelectorAll("[data-sp-reserve-deck]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const deckTier = Number(
          btn.getAttribute("data-sp-reserve-deck")
        ) as 1 | 2 | 3;
        dispatch(actingPlayerId, { type: "RESERVE_CARD", deckTier });
      });
    });

    root.querySelectorAll("[data-sp-return-one]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = btn.getAttribute("data-sp-return-one") as TokenColor;
        dispatch(actingPlayerId, {
          type: "RETURN_TOKENS",
          tokens: { [c]: 1 },
        });
      });
    });

    root.querySelectorAll("[data-sp-noble]").forEach((el) => {
      el.addEventListener("click", () => {
        const nobleId = el.getAttribute("data-sp-noble")!;
        dispatch(actingPlayerId, { type: "SELECT_NOBLE", nobleId });
      });
    });

    root.querySelector("#btn-sp-pass-turn")?.addEventListener("click", () => {
      dispatch(actingPlayerId, { type: "PASS_TURN" });
    });
  };

  const bindAzulEvents = (_state: AzulState, actingPlayerId: string): void => {
    root.querySelectorAll("[data-azul-factory]").forEach((el) => {
      el.addEventListener("click", () => {
        const factoryIndex = Number(el.getAttribute("data-azul-factory"));
        const color = el.getAttribute("data-azul-color") as AzulTileColor;
        model = {
          ...model,
          azulInspectedPlayerId: null,
          azulSelectedDraft: {
            source: { kind: "factory", factoryIndex },
            color,
          },
        };
        render();
      });
    });

    root.querySelectorAll("[data-azul-center]").forEach((el) => {
      el.addEventListener("click", () => {
        const color = el.getAttribute("data-azul-color") as AzulTileColor;
        model = {
          ...model,
          azulInspectedPlayerId: null,
          azulSelectedDraft: {
            source: { kind: "center" },
            color,
          },
        };
        render();
      });
    });

    root.querySelectorAll("[data-azul-target-line]").forEach((el) => {
      el.addEventListener("click", () => {
        if (!model.azulSelectedDraft) return;
        const raw = el.getAttribute("data-azul-target-line")!;
        const targetLine: AzulTargetLine =
          raw === "floor" ? "floor" : (Number(raw) as 0 | 1 | 2 | 3 | 4);
        dispatch(actingPlayerId, {
          type: "DRAFT_TILES",
          source: model.azulSelectedDraft.source,
          color: model.azulSelectedDraft.color,
          targetLine,
        });
      });
    });

    root
      .querySelector("#btn-azul-cancel-draft")
      ?.addEventListener("click", () => {
        model = { ...model, azulSelectedDraft: null };
        render();
      });
  };

  const bindSevenWondersEvents = (
    state: SevenWondersState,
    actingPlayerId: string
  ): void => {
    const legalActions = SevenWondersEngine.getLegalActions(
      state,
      actingPlayerId
    );

    root.querySelectorAll("[data-sw-select-card]").forEach((cardEl) => {
      cardEl.addEventListener("click", () => {
        const cardId = cardEl.getAttribute("data-sw-select-card")!;
        model = {
          ...model,
          sevenWondersSelectedCardId:
            model.sevenWondersSelectedCardId === cardId ? null : cardId,
        };
        render();
      });
    });

    root.querySelectorAll("[data-sw-quick-build]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const cardId = btn.getAttribute("data-sw-quick-build")!;
        const buildActs = legalActions.filter(
          (
            a
          ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
            a.type === "SELECT_DRAFT_ACTION" &&
            a.kind === "build" &&
            a.cardId === cardId
        );
        if (buildActs.length > 1) {
          model = { ...model, sevenWondersSelectedCardId: cardId };
          render();
          return;
        }
        const preferred = buildActs[0] ?? null;
        if (preferred) {
          dispatchUiAction(actingPlayerId, preferred);
        }
      });
    });

    root.querySelectorAll("[data-sw-quick-wonder]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const cardId = btn.getAttribute("data-sw-quick-wonder")!;
        const wonderActs = legalActions.filter(
          (
            a
          ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
            a.type === "SELECT_DRAFT_ACTION" &&
            a.kind === "wonder" &&
            a.cardId === cardId
        );
        if (wonderActs.length > 1) {
          model = { ...model, sevenWondersSelectedCardId: cardId };
          render();
          return;
        }
        const wonderAct = wonderActs[0] ?? null;
        if (wonderAct) {
          dispatchUiAction(actingPlayerId, wonderAct);
        }
      });
    });

    root.querySelectorAll("[data-sw-quick-discard]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const cardId = btn.getAttribute("data-sw-quick-discard")!;
        const discardAct = legalActions.find(
          (
            a
          ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
            a.type === "SELECT_DRAFT_ACTION" &&
            a.kind === "discard" &&
            a.cardId === cardId
        );
        if (discardAct) {
          dispatchUiAction(actingPlayerId, discardAct);
        }
      });
    });

    root.querySelectorAll("[data-sw-variant-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-sw-variant-card")!;
        const kind = (btn.getAttribute("data-sw-variant-kind") ?? "build") as
          | "build"
          | "wonder";
        const idx = Number(btn.getAttribute("data-sw-variant-idx") ?? "0");
        const variants = legalActions.filter(
          (
            a
          ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
            a.type === "SELECT_DRAFT_ACTION" &&
            a.kind === kind &&
            a.cardId === cardId
        );
        const chosen = variants[idx];
        if (chosen) {
          dispatchUiAction(actingPlayerId, chosen);
        }
      });
    });

    root.querySelectorAll("[data-sw-discard-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-sw-discard-pick")!;
        dispatchUiAction(actingPlayerId, {
          type: "BUILD_FROM_DISCARD",
          cardId,
        });
      });
    });

    root.querySelectorAll("[data-sw-skip-discard]").forEach((btn) => {
      btn.addEventListener("click", () => {
        dispatchUiAction(actingPlayerId, { type: "SKIP_DISCARD_BUILD" });
      });
    });
  };

  const bindCatanEvents = (state: CatanState, actingPlayerId: string): void => {
    const room = getActiveRoomPure(model);
    if (!canControlPlayerOnDevicePure(model, room, actingPlayerId)) {
      bindReadOnlyCatanSpotInspect();
      return;
    }

    root.querySelectorAll("[data-close-submodal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = {
          ...model,
          selectedBoardSpot: null,
          buildMode: null,
          selectedProgressCardId: null,
          inventorHex1: null,
          smithVertex1: null,
          deserterTargetPlayerId: null,
        };
        render();
      });
    });

    root.querySelectorAll("[data-hand-res-card]").forEach((cardEl) => {
      cardEl.addEventListener("click", () => {
        const g = cardEl.getAttribute("data-hand-res-card") as TradeGoodType;
        const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
        if (!actingPlayer || getPlayerGoodCount(actingPlayer, g) <= 0) return;

        if (isCommodityType(g)) {
          if (!state.config.enableCitiesAndKnights) return;
          if (state.phase === "DISCARD_ON_SEVEN") {
            const req = state.pendingDiscards[actingPlayerId] ?? 0;
            const totalSel =
              totalResourceCount(model.discardSelection) +
              totalCommodityCount(model.discardCommodities);
            if (
              model.discardCommodities[g] < actingPlayer.commodities[g] &&
              totalSel < req
            ) {
              model = {
                ...model,
                discardCommodities: {
                  ...model.discardCommodities,
                  [g]: model.discardCommodities[g] + 1,
                },
              };
              render();
            }
          } else if (model.buildMode === "domestic_trade") {
            if (model.domesticCommGive[g] < actingPlayer.commodities[g]) {
              model = setSharedTradeGoodWantPure(
                {
                  ...model,
                  domesticCommGive: {
                    ...model.domesticCommGive,
                    [g]: model.domesticCommGive[g] + 1,
                  },
                },
                g,
                0
              );
              render();
            }
          } else if (state.phase === "MAIN_PHASE" && !state.activeTradeOffer) {
            const goodRatios = getPlayerGoodTradeRatios(state, actingPlayerId);
            const ratio = goodRatios[g];
            if (
              actingPlayer.commodities[g] >= model.maritimeCommGive[g] + ratio
            ) {
              model = switchTradeModePure(
                setSharedTradeGoodWantPure(
                  {
                    ...model,
                    maritimeCommGive: {
                      ...model.maritimeCommGive,
                      [g]: model.maritimeCommGive[g] + ratio,
                    },
                  },
                  g,
                  0
                ),
                "maritime_trade"
              );
              render();
            } else {
              const withGive =
                model.domesticCommGive[g] < actingPlayer.commodities[g]
                  ? setSharedTradeGoodWantPure(
                      {
                        ...model,
                        domesticCommGive: {
                          ...model.domesticCommGive,
                          [g]: model.domesticCommGive[g] + 1,
                        },
                      },
                      g,
                      0
                    )
                  : model;
              model = switchTradeModePure(withGive, "domestic_trade");
              render();
            }
          }
          return;
        }

        const r = g;
        if (state.phase === "DISCARD_ON_SEVEN") {
          const req = state.pendingDiscards[actingPlayerId] ?? 0;
          const totalSel =
            totalResourceCount(model.discardSelection) +
            (state.config.enableCitiesAndKnights
              ? totalCommodityCount(model.discardCommodities)
              : 0);
          if (
            model.discardSelection[r] < actingPlayer.resources[r] &&
            totalSel < req
          ) {
            model = {
              ...model,
              discardSelection: {
                ...model.discardSelection,
                [r]: model.discardSelection[r] + 1,
              },
            };
            render();
          }
        } else if (model.buildMode === "domestic_trade") {
          if (model.domesticGive[r] < actingPlayer.resources[r]) {
            model = setSharedTradeWantPure(
              {
                ...model,
                domesticGive: {
                  ...model.domesticGive,
                  [r]: model.domesticGive[r] + 1,
                },
              },
              r,
              0
            );
            render();
          }
        } else if (state.phase === "MAIN_PHASE" && !state.activeTradeOffer) {
          const ratios = state.config.enableCitiesAndKnights
            ? getPlayerGoodTradeRatios(state, actingPlayerId)
            : getPlayerTradeRatios(state, actingPlayerId);
          const ratio = ratios[r];
          if (actingPlayer.resources[r] >= model.maritimeGive[r] + ratio) {
            model = switchTradeModePure(
              setSharedTradeWantPure(
                {
                  ...model,
                  maritimeGive: {
                    ...model.maritimeGive,
                    [r]: model.maritimeGive[r] + ratio,
                  },
                },
                r,
                0
              ),
              "maritime_trade"
            );
            render();
          } else {
            const withGive =
              model.domesticGive[r] < actingPlayer.resources[r]
                ? setSharedTradeWantPure(
                    {
                      ...model,
                      domesticGive: {
                        ...model.domesticGive,
                        [r]: model.domesticGive[r] + 1,
                      },
                    },
                    r,
                    0
                  )
                : model;
            model = switchTradeModePure(withGive, "domestic_trade");
            render();
          }
        }
      });
    });

    root.querySelectorAll("[data-play-progress-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-play-progress-card")!;
        const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
        const card = actingPlayer?.progressCards.find((c) => c.id === cardId);
        if (!card) return;
        const immediateTypes = new Set([
          "mining",
          "irrigation",
          "crane",
          "medicine",
          "road_building",
          "warlord",
          "saboteur",
          "wedding",
        ]);
        if (immediateTypes.has(card.type)) {
          dispatchUiAction(actingPlayerId, {
            type: "PLAY_PROGRESS_CARD",
            cardId,
          });
          return;
        }
        model = {
          ...model,
          selectedBoardSpot: null,
          buildMode: "progress_card",
          selectedProgressCardId: cardId,
          inventorHex1: null,
          smithVertex1: null,
          deserterTargetPlayerId: null,
        };
        render();
      });
    });

    root
      .querySelector("#btn-hand-play-knight")
      ?.addEventListener("click", () => {
        dispatchUiAction(actingPlayerId, { type: "PLAY_KNIGHT" });
      });
    root
      .querySelector("#btn-hand-play-roadbuild")
      ?.addEventListener("click", () => {
        dispatchUiAction(actingPlayerId, { type: "PLAY_ROAD_BUILDING" });
      });
    root.querySelector("#btn-hand-play-yop")?.addEventListener("click", () => {
      model = { ...model, buildMode: "year_of_plenty" };
      render();
    });
    root.querySelector("#btn-hand-play-mono")?.addEventListener("click", () => {
      model = { ...model, buildMode: "monopoly" };
      render();
    });

    root
      .querySelector("#btn-close-spot-popover")
      ?.addEventListener("click", () => {
        model = { ...model, selectedBoardSpot: null };
        render();
      });

    root.querySelectorAll("[data-spot-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-spot-action")!;
        const spotId = btn.getAttribute("data-spot-id") ?? "";
        if (act === "build_road") {
          dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId: spotId });
        } else if (act === "build_ship") {
          dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId: spotId });
        } else if (act === "setup_road") {
          dispatch(actingPlayerId, {
            type: "PLACE_SETUP_EDGE",
            edgeId: spotId,
            edgeKind: "road",
          });
        } else if (act === "setup_ship") {
          dispatch(actingPlayerId, {
            type: "PLACE_SETUP_EDGE",
            edgeId: spotId,
            edgeKind: "ship",
          });
        } else if (act === "start_move_ship") {
          model = {
            ...model,
            buildMode: "move_ship",
            selectedMoveFromEdgeId: spotId,
            selectedBoardSpot: null,
          };
          render();
        } else if (
          act === "complete_move_ship" &&
          model.selectedMoveFromEdgeId
        ) {
          dispatch(actingPlayerId, {
            type: "MOVE_SHIP",
            fromEdgeId: model.selectedMoveFromEdgeId,
            toEdgeId: spotId,
          });
        } else if (act === "setup_settlement") {
          dispatch(actingPlayerId, {
            type: "PLACE_SETUP_SETTLEMENT",
            vertexId: spotId,
          });
        } else if (act === "build_settlement") {
          dispatch(actingPlayerId, {
            type: "BUILD_SETTLEMENT",
            vertexId: spotId,
          });
        } else if (act === "build_city") {
          dispatch(actingPlayerId, {
            type: "BUILD_CITY",
            vertexId: spotId,
          });
        } else if (act === "build_wall") {
          dispatch(actingPlayerId, {
            type: "BUILD_CITY_WALL",
            vertexId: spotId,
          });
        } else if (act === "pillage_city") {
          dispatch(actingPlayerId, {
            type: "SELECT_PILLAGED_CITY",
            vertexId: spotId,
          });
        } else if (act === "build_knight") {
          dispatch(actingPlayerId, {
            type: "BUILD_KNIGHT",
            vertexId: spotId,
          });
        } else if (act === "activate_knight") {
          dispatch(actingPlayerId, {
            type: "ACTIVATE_KNIGHT",
            vertexId: spotId,
          });
        } else if (act === "promote_knight") {
          dispatch(actingPlayerId, {
            type: "PROMOTE_KNIGHT",
            vertexId: spotId,
          });
        } else if (act === "start_move_knight") {
          model = {
            ...model,
            buildMode: "move_knight",
            selectedMoveKnightFromVertexId: spotId,
            selectedBoardSpot: null,
          };
          render();
        } else if (
          act === "complete_move_knight" &&
          model.selectedMoveKnightFromVertexId
        ) {
          dispatch(actingPlayerId, {
            type: "MOVE_KNIGHT",
            fromVertexId: model.selectedMoveKnightFromVertexId,
            toVertexId: spotId,
          });
        } else if (act === "start_chase_robber") {
          model = {
            ...model,
            buildMode: "chase_robber",
            selectedChaseKnightVertexId: spotId,
            selectedBoardSpot: null,
          };
          render();
        } else if (act === "complete_chase_robber") {
          const chaseVId =
            btn.getAttribute("data-chase-vertex") ??
            model.selectedChaseKnightVertexId ??
            "";
          const targetKind =
            (btn.getAttribute("data-chase-target") as "robber" | "pirate") ??
            "robber";
          if (chaseVId) {
            dispatch(actingPlayerId, {
              type: "CHASE_ROBBER_WITH_KNIGHT",
              vertexId: chaseVId,
              hexId: spotId,
              targetKind,
            });
          }
        } else if (act === "move_robber") {
          dispatch(actingPlayerId, { type: "MOVE_ROBBER", hexId: spotId });
        } else if (act === "move_pirate") {
          dispatch(actingPlayerId, { type: "MOVE_PIRATE", hexId: spotId });
        } else if (act === "play_knight") {
          dispatch(actingPlayerId, { type: "PLAY_KNIGHT" });
        } else if (act === "open_trade") {
          model = {
            ...model,
            selectedBoardSpot: null,
            buildMode: "domestic_trade",
          };
          render();
        }
      });
    });

    root.querySelectorAll("[data-spot-hex]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const hexId = el.getAttribute("data-spot-hex")!;
        if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
          if (
            model.robberOrPirateMode === "pirate" &&
            state.config.enableSeafarers
          ) {
            if (getLegalPirateHexes(state).includes(hexId)) {
              dispatch(actingPlayerId, { type: "MOVE_PIRATE", hexId });
              return;
            }
          } else {
            if (getLegalRobberHexes(state, actingPlayerId).includes(hexId)) {
              dispatch(actingPlayerId, { type: "MOVE_ROBBER", hexId });
              return;
            }
          }
        } else if (
          state.config.enableCitiesAndKnights &&
          model.buildMode === "chase_robber"
        ) {
          const legalChases = getLegalChaseRobberActions(
            state,
            actingPlayerId,
            getLegalRobberHexes(state, actingPlayerId),
            state.config.enableSeafarers ? getLegalPirateHexes(state) : []
          );
          const chosen = legalChases.find(
            (c) =>
              c.hexId === hexId &&
              (!model.selectedChaseKnightVertexId ||
                c.vertexId === model.selectedChaseKnightVertexId)
          );
          if (chosen) {
            dispatch(actingPlayerId, chosen);
            return;
          }
        } else if (
          state.config.enableCitiesAndKnights &&
          model.buildMode === "progress_card" &&
          model.selectedProgressCardId
        ) {
          const actingPlayer = state.players.find(
            (p) => p.id === actingPlayerId
          );
          const card = actingPlayer?.progressCards.find(
            (c) => c.id === model.selectedProgressCardId
          );
          if (card?.type === "bishop") {
            if (getLegalRobberHexes(state, actingPlayerId).includes(hexId)) {
              dispatch(actingPlayerId, {
                type: "PLAY_PROGRESS_CARD",
                cardId: card.id,
                params: { hexId },
              });
              return;
            }
          } else if (card?.type === "merchant") {
            const tile = state.hexes[hexId];
            const touchesOwn = Boolean(
              tile &&
                TERRAIN_TO_RESOURCE[tile.terrain] &&
                state.topology.hexes[hexId]?.cornerVertexIds.some(
                  (vId) => state.buildings[vId]?.ownerId === actingPlayerId
                )
            );
            if (touchesOwn) {
              dispatch(actingPlayerId, {
                type: "PLAY_PROGRESS_CARD",
                cardId: card.id,
                params: { hexId },
              });
              return;
            }
          } else if (card?.type === "inventor") {
            const t = state.hexes[hexId];
            const swappable = Boolean(
              t &&
                t.numberToken !== null &&
                t.numberToken !== 2 &&
                t.numberToken !== 6 &&
                t.numberToken !== 8 &&
                t.numberToken !== 12 &&
                t.terrain !== "sea" &&
                t.terrain !== "fog"
            );
            if (swappable) {
              if (!model.inventorHex1) {
                model = {
                  ...model,
                  inventorHex1: hexId,
                  selectedBoardSpot: null,
                };
                render();
                return;
              }
              if (model.inventorHex1 !== hexId) {
                dispatch(actingPlayerId, {
                  type: "PLAY_PROGRESS_CARD",
                  cardId: card.id,
                  params: { hexId1: model.inventorHex1, hexId2: hexId },
                });
                return;
              }
            }
          }
        }
        model = {
          ...model,
          selectedBoardSpot:
            model.selectedBoardSpot?.kind === "hex" &&
            model.selectedBoardSpot.id === hexId
              ? null
              : { kind: "hex", id: hexId },
        };
        render();
      });
    });

    root.querySelectorAll("[data-spot-vertex]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const vertexId = el.getAttribute("data-spot-vertex")!;
        if (
          state.phase === "BARBARIAN_PILLAGE_SELECTION" &&
          getPlayerVulnerableCities(state, actingPlayerId).includes(vertexId)
        ) {
          dispatch(actingPlayerId, {
            type: "SELECT_PILLAGED_CITY",
            vertexId,
          });
          return;
        }
        if (
          (state.phase === "SETUP_SETTLEMENT_1" ||
            state.phase === "SETUP_SETTLEMENT_2") &&
          getLegalSettlementVertices(state, actingPlayerId, true).includes(
            vertexId
          )
        ) {
          dispatch(actingPlayerId, {
            type: "PLACE_SETUP_SETTLEMENT",
            vertexId,
          });
          return;
        }
        if (
          model.buildMode === "settlement" &&
          getLegalSettlementVertices(state, actingPlayerId, false).includes(
            vertexId
          )
        ) {
          dispatch(actingPlayerId, { type: "BUILD_SETTLEMENT", vertexId });
          return;
        }
        if (
          model.buildMode === "city" &&
          state.buildings[vertexId]?.ownerId === actingPlayerId &&
          state.buildings[vertexId]?.type === "settlement"
        ) {
          dispatch(actingPlayerId, { type: "BUILD_CITY", vertexId });
          return;
        }
        if (
          model.buildMode === "wall" &&
          state.buildings[vertexId]?.ownerId === actingPlayerId &&
          state.buildings[vertexId]?.type === "city" &&
          !state.buildings[vertexId]?.hasWall
        ) {
          dispatch(actingPlayerId, { type: "BUILD_CITY_WALL", vertexId });
          return;
        }
        if (state.config.enableCitiesAndKnights) {
          if (
            model.buildMode === "knight" &&
            getLegalBuildKnightVertices(state, actingPlayerId).includes(
              vertexId
            )
          ) {
            dispatch(actingPlayerId, { type: "BUILD_KNIGHT", vertexId });
            return;
          }
          if (
            model.buildMode === "activate_knight" &&
            getLegalActivateKnightVertices(state, actingPlayerId).includes(
              vertexId
            )
          ) {
            dispatch(actingPlayerId, { type: "ACTIVATE_KNIGHT", vertexId });
            return;
          }
          if (
            model.buildMode === "promote_knight" &&
            getLegalPromoteKnightVertices(
              state,
              actingPlayerId,
              false
            ).includes(vertexId)
          ) {
            dispatch(actingPlayerId, { type: "PROMOTE_KNIGHT", vertexId });
            return;
          }
          if (model.buildMode === "move_knight") {
            const kMoves = getLegalMoveKnightActions(state, actingPlayerId);
            if (
              !model.selectedMoveKnightFromVertexId &&
              kMoves.some((m) => m.fromVertexId === vertexId)
            ) {
              model = {
                ...model,
                selectedMoveKnightFromVertexId: vertexId,
                selectedBoardSpot: null,
              };
              render();
              return;
            }
            if (
              model.selectedMoveKnightFromVertexId &&
              kMoves.some(
                (m) =>
                  m.fromVertexId === model.selectedMoveKnightFromVertexId &&
                  m.toVertexId === vertexId
              )
            ) {
              dispatch(actingPlayerId, {
                type: "MOVE_KNIGHT",
                fromVertexId: model.selectedMoveKnightFromVertexId,
                toVertexId: vertexId,
              });
              return;
            }
          }
          if (model.buildMode === "chase_robber") {
            const chases = getLegalChaseRobberActions(
              state,
              actingPlayerId,
              getLegalRobberHexes(state, actingPlayerId),
              state.config.enableSeafarers ? getLegalPirateHexes(state) : []
            );
            if (chases.some((c) => c.vertexId === vertexId)) {
              model = {
                ...model,
                selectedChaseKnightVertexId: vertexId,
                selectedBoardSpot: null,
              };
              render();
              return;
            }
          }
          if (
            model.buildMode === "progress_card" &&
            model.selectedProgressCardId
          ) {
            const actingPlayer = state.players.find(
              (p) => p.id === actingPlayerId
            );
            const card = actingPlayer?.progressCards.find(
              (c) => c.id === model.selectedProgressCardId
            );
            if (
              card?.type === "engineer" &&
              state.buildings[vertexId]?.ownerId === actingPlayerId &&
              state.buildings[vertexId]?.type === "city" &&
              !state.buildings[vertexId]?.hasWall
            ) {
              dispatch(actingPlayerId, {
                type: "PLAY_PROGRESS_CARD",
                cardId: card.id,
                params: { vertexId },
              });
              return;
            }
            if (
              card?.type === "intrigue" &&
              state.knights[vertexId] &&
              state.knights[vertexId]!.ownerId !== actingPlayerId &&
              state.topology.vertices[vertexId]?.incidentEdgeIds.some(
                (eId) => state.edges[eId]?.ownerId === actingPlayerId
              )
            ) {
              dispatch(actingPlayerId, {
                type: "PLAY_PROGRESS_CARD",
                cardId: card.id,
                params: { vertexId },
              });
              return;
            }
            if (card?.type === "smith") {
              const promotable = getLegalPromoteKnightVertices(
                state,
                actingPlayerId,
                true
              );
              if (promotable.includes(vertexId)) {
                if (promotable.length === 1) {
                  dispatch(actingPlayerId, {
                    type: "PLAY_PROGRESS_CARD",
                    cardId: card.id,
                    params: { vertexIds: [vertexId] },
                  });
                  return;
                }
                if (!model.smithVertex1) {
                  model = {
                    ...model,
                    smithVertex1: vertexId,
                    selectedBoardSpot: null,
                  };
                  render();
                  return;
                }
                if (model.smithVertex1 !== vertexId) {
                  dispatch(actingPlayerId, {
                    type: "PLAY_PROGRESS_CARD",
                    cardId: card.id,
                    params: { vertexIds: [model.smithVertex1, vertexId] },
                  });
                  return;
                }
              }
            }
            if (
              card?.type === "deserter" &&
              model.deserterTargetPlayerId &&
              !state.buildings[vertexId] &&
              !state.knights[vertexId] &&
              state.topology.vertices[vertexId]?.incidentEdgeIds.some(
                (eId) => state.edges[eId]?.ownerId === actingPlayerId
              )
            ) {
              dispatchUiAction(actingPlayerId, {
                type: "PLAY_PROGRESS_CARD",
                cardId: card.id,
                params: {
                  targetPlayerId: model.deserterTargetPlayerId,
                  placeVertexId: vertexId,
                },
              });
              return;
            }
          }
        }
        model = {
          ...model,
          selectedBoardSpot:
            model.selectedBoardSpot?.kind === "vertex" &&
            model.selectedBoardSpot.id === vertexId
              ? null
              : { kind: "vertex", id: vertexId },
        };
        render();
      });
    });

    root.querySelectorAll("[data-spot-edge]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const edgeId = el.getAttribute("data-spot-edge")!;
        if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
          const anchor = state.lastSetupSettlementVertexId;
          const legalRoads = getLegalRoadEdges(state, actingPlayerId, anchor);
          const legalShips = state.config.enableSeafarers
            ? getLegalShipEdges(state, actingPlayerId, anchor)
            : [];
          const canRoad = legalRoads.includes(edgeId);
          const canShip = legalShips.includes(edgeId);
          if (canRoad || canShip) {
            const chosenEdgeKind: "road" | "ship" =
              canRoad && canShip
                ? model.setupEdgeKind
                : canShip
                  ? "ship"
                  : "road";
            dispatch(actingPlayerId, {
              type: "PLACE_SETUP_EDGE",
              edgeId,
              edgeKind: chosenEdgeKind,
            });
            return;
          }
        } else if (state.phase === "ROAD_BUILDING_DEV") {
          const isRoad = getLegalRoadEdges(
            state,
            actingPlayerId,
            null
          ).includes(edgeId);
          const isShip = state.config.enableSeafarers
            ? getLegalShipEdges(state, actingPlayerId, null).includes(edgeId)
            : false;
          if (isRoad && isShip) {
            dispatch(actingPlayerId, {
              type: model.setupEdgeKind === "ship" ? "BUILD_SHIP" : "BUILD_ROAD",
              edgeId,
            });
            return;
          }
          if (isRoad) {
            dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId });
            return;
          }
          if (isShip) {
            dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId });
            return;
          }
        } else if (
          model.buildMode === "road" &&
          getLegalRoadEdges(state, actingPlayerId, null).includes(edgeId)
        ) {
          dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId });
          return;
        } else if (
          model.buildMode === "ship" &&
          getLegalShipEdges(state, actingPlayerId, null).includes(edgeId)
        ) {
          dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId });
          return;
        } else if (model.buildMode === "move_ship") {
          const moves = getLegalMoveShipActions(state, actingPlayerId);
          if (
            !model.selectedMoveFromEdgeId &&
            moves.some((m) => m.fromEdgeId === edgeId)
          ) {
            model = {
              ...model,
              selectedMoveFromEdgeId: edgeId,
              selectedBoardSpot: null,
            };
            render();
            return;
          }
          if (
            model.selectedMoveFromEdgeId &&
            moves.some(
              (m) =>
                m.fromEdgeId === model.selectedMoveFromEdgeId &&
                m.toEdgeId === edgeId
            )
          ) {
            dispatch(actingPlayerId, {
              type: "MOVE_SHIP",
              fromEdgeId: model.selectedMoveFromEdgeId,
              toEdgeId: edgeId,
            });
            return;
          }
        } else if (
          state.config.enableCitiesAndKnights &&
          model.buildMode === "progress_card" &&
          model.selectedProgressCardId
        ) {
          const actingPlayer = state.players.find(
            (p) => p.id === actingPlayerId
          );
          const card = actingPlayer?.progressCards.find(
            (c) => c.id === model.selectedProgressCardId
          );
          if (
            card?.type === "diplomat" &&
            getDiplomatRemovableRoadEdges(state).includes(edgeId)
          ) {
            const ownRebuilds = getLegalRoadEdges(
              state,
              actingPlayerId,
              null
            ).filter((rId) => rId !== edgeId);
            const isOwn = state.edges[edgeId]?.ownerId === actingPlayerId;
            dispatch(actingPlayerId, {
              type: "PLAY_PROGRESS_CARD",
              cardId: card.id,
              params: {
                edgeId,
                ...(isOwn && ownRebuilds[0]
                  ? { rebuildEdgeId: ownRebuilds[0] }
                  : {}),
              },
            });
            return;
          }
        }

        model = {
          ...model,
          selectedBoardSpot:
            model.selectedBoardSpot?.kind === "edge" &&
            model.selectedBoardSpot.id === edgeId
              ? null
              : { kind: "edge", id: edgeId },
        };
        render();
      });
    });

    root
      .querySelector("#btn-toggle-setup-edge")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          setupEdgeKind: model.setupEdgeKind === "road" ? "ship" : "road",
        };
        render();
      });

    root
      .querySelector("#btn-toggle-robber-pirate")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          robberOrPirateMode:
            model.robberOrPirateMode === "robber" ? "pirate" : "robber",
        };
        render();
      });

    root.querySelectorAll("[data-pillage-city]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const vertexId = btn.getAttribute("data-pillage-city")!;
        dispatch(actingPlayerId, {
          type: "SELECT_PILLAGED_CITY",
          vertexId,
        });
      });
    });

    root.querySelectorAll("[data-select-progress-deck]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const discipline = btn.getAttribute(
          "data-select-progress-deck"
        ) as ImprovementDiscipline;
        dispatch(actingPlayerId, {
          type: "SELECT_PROGRESS_DECK",
          discipline,
        });
      });
    });

    root.querySelectorAll("[data-discard-progress-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-discard-progress-card")!;
        dispatch(actingPlayerId, {
          type: "DISCARD_PROGRESS_CARD",
          cardId,
        });
      });
    });

    root.querySelectorAll("[data-discard-good-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-discard-good-add") as TradeGoodType;
        if (isCommodityType(g)) {
          model = {
            ...model,
            discardCommodities: {
              ...model.discardCommodities,
              [g]: model.discardCommodities[g] + 1,
            },
          };
        } else {
          model = {
            ...model,
            discardSelection: {
              ...model.discardSelection,
              [g]: model.discardSelection[g] + 1,
            },
          };
        }
        render();
      });
    });

    root.querySelectorAll("[data-discard-good-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-discard-good-sub") as TradeGoodType;
        if (isCommodityType(g)) {
          if (model.discardCommodities[g] > 0) {
            model = {
              ...model,
              discardCommodities: {
                ...model.discardCommodities,
                [g]: model.discardCommodities[g] - 1,
              },
            };
            render();
          }
        } else if (model.discardSelection[g] > 0) {
          model = {
            ...model,
            discardSelection: {
              ...model.discardSelection,
              [g]: model.discardSelection[g] - 1,
            },
          };
          render();
        }
      });
    });

    root.querySelectorAll("[data-discard-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-discard-add") as ResourceType;
        model = {
          ...model,
          discardSelection: {
            ...model.discardSelection,
            [r]: model.discardSelection[r] + 1,
          },
        };
        render();
      });
    });

    root.querySelectorAll("[data-discard-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-discard-sub") as ResourceType;
        if (model.discardSelection[r] > 0) {
          model = {
            ...model,
            discardSelection: {
              ...model.discardSelection,
              [r]: model.discardSelection[r] - 1,
            },
          };
          render();
        }
      });
    });

    root.querySelector("#btn-discard-reset")?.addEventListener("click", () => {
      model = {
        ...model,
        discardSelection: emptyResources(),
        discardCommodities: emptyCommodities(),
      };
      render();
    });

    root.querySelector("#btn-discard-submit")?.addEventListener("click", () => {
      dispatch(actingPlayerId, {
        type: "DISCARD_CARDS",
        resources: { ...model.discardSelection },
        ...(state.config.enableCitiesAndKnights
          ? { commodities: { ...model.discardCommodities } }
          : {}),
      });
    });

    root.querySelector("#btn-discard-auto")?.addEventListener("click", () => {
      const botAct = CatanEngine.chooseBotAction(state, actingPlayerId);
      if (botAct) dispatch(actingPlayerId, botAct);
    });

    root.querySelectorAll("[data-gold-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const resource = btn.getAttribute("data-gold-pick") as ResourceType;
        dispatch(actingPlayerId, {
          type: "SELECT_GOLD_RESOURCE",
          resource,
        });
      });
    });

    root.querySelectorAll("[data-steal-victim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const victimId = btn.getAttribute("data-steal-victim")!;
        dispatch(actingPlayerId, {
          type: "STEAL_FROM_PLAYER",
          victimId,
        });
      });
    });

    root.querySelector("#btn-roll-dice")?.addEventListener("click", () => {
      dispatchUiAction(actingPlayerId, { type: "ROLL_DICE" });
    });

    root.querySelector("#btn-mode-road")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode: model.buildMode === "road" ? null : "road",
      };
      render();
    });

    root.querySelector("#btn-mode-ship")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode: model.buildMode === "ship" ? null : "ship",
      };
      render();
    });

    root.querySelector("#btn-mode-moveship")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode: model.buildMode === "move_ship" ? null : "move_ship",
        selectedMoveFromEdgeId: null,
      };
      render();
    });

    root
      .querySelector("#btn-mode-settlement")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          selectedBoardSpot: null,
          buildMode: model.buildMode === "settlement" ? null : "settlement",
        };
        render();
      });

    root.querySelector("#btn-mode-city")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode: model.buildMode === "city" ? null : "city",
      };
      render();
    });

    root.querySelector("#btn-mode-wall")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode: model.buildMode === "wall" ? null : "wall",
      };
      render();
    });

    root.querySelector("#btn-mode-knight")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode: model.buildMode === "knight" ? null : "knight",
      };
      render();
    });

    root
      .querySelector("#btn-mode-activate-knight")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          selectedBoardSpot: null,
          buildMode:
            model.buildMode === "activate_knight" ? null : "activate_knight",
        };
        render();
      });

    root
      .querySelector("#btn-mode-promote-knight")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          selectedBoardSpot: null,
          buildMode:
            model.buildMode === "promote_knight" ? null : "promote_knight",
        };
        render();
      });

    root
      .querySelector("#btn-mode-move-knight")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          selectedBoardSpot: null,
          selectedMoveKnightFromVertexId: null,
          buildMode: model.buildMode === "move_knight" ? null : "move_knight",
        };
        render();
      });

    root
      .querySelector("#btn-mode-chase-robber")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          selectedBoardSpot: null,
          selectedChaseKnightVertexId: null,
          buildMode:
            model.buildMode === "chase_robber" ? null : "chase_robber",
        };
        render();
      });

    root.querySelector("#btn-mode-upgrades")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode:
          model.buildMode === "city_upgrades" ? null : "city_upgrades",
      };
      render();
    });

    root.querySelectorAll("[data-select-metro-city]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = {
          ...model,
          selectedMetropolisVertexId: btn.getAttribute("data-select-metro-city"),
        };
        render();
      });
    });

    root.querySelectorAll("[data-upgrade-discipline]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const discipline = btn.getAttribute(
          "data-upgrade-discipline"
        ) as ImprovementDiscipline;
        const metroV = btn.getAttribute("data-metro-vertex") || undefined;
        dispatch(actingPlayerId, {
          type: "UPGRADE_CITY_IMPROVEMENT",
          discipline,
          ...(metroV ? { metropolisVertexId: metroV } : {}),
        });
      });
    });

    root.querySelectorAll("[data-alch-die1]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = {
          ...model,
          alchemistDie1: Number(btn.getAttribute("data-alch-die1")),
        };
        render();
      });
    });

    root.querySelectorAll("[data-alch-die2]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = {
          ...model,
          alchemistDie2: Number(btn.getAttribute("data-alch-die2")),
        };
        render();
      });
    });

    root
      .querySelector("#btn-exec-alchemist")
      ?.addEventListener("click", () => {
        if (!model.selectedProgressCardId) return;
        dispatchUiAction(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: model.selectedProgressCardId,
          params: {
            die1: model.alchemistDie1,
            die2: model.alchemistDie2,
          },
        });
      });

    root
      .querySelector("#btn-exec-smith-single")
      ?.addEventListener("click", () => {
        if (!model.selectedProgressCardId) return;
        const promotable = getLegalPromoteKnightVertices(
          state,
          actingPlayerId,
          true
        );
        const vId = model.smithVertex1 ?? promotable[0];
        if (!vId) return;
        dispatchUiAction(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: model.selectedProgressCardId,
          params: { vertexIds: [vId] },
        });
      });

    root.querySelectorAll("[data-prog-res]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!model.selectedProgressCardId) return;
        const resource = btn.getAttribute("data-prog-res") as ResourceType;
        dispatchUiAction(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: model.selectedProgressCardId,
          params: { resource },
        });
      });
    });

    root.querySelectorAll("[data-prog-comm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!model.selectedProgressCardId) return;
        const commodity = btn.getAttribute("data-prog-comm") as CommodityType;
        dispatchUiAction(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: model.selectedProgressCardId,
          params: { commodity },
        });
      });
    });

    root.querySelectorAll("[data-prog-good]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!model.selectedProgressCardId) return;
        const good = btn.getAttribute("data-prog-good") as TradeGoodType;
        dispatchUiAction(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: model.selectedProgressCardId,
          params: { good },
        });
      });
    });

    root.querySelectorAll("[data-prog-opp]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!model.selectedProgressCardId) return;
        const targetPlayerId = btn.getAttribute("data-prog-opp")!;
        const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
        const card = actingPlayer?.progressCards.find(
          (c) => c.id === model.selectedProgressCardId
        );
        const legals = CatanEngine.getLegalActions(state, actingPlayerId);
        const matchingForOpp = legals.filter(
          (
            a
          ): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
            a.type === "PLAY_PROGRESS_CARD" &&
            a.cardId === model.selectedProgressCardId &&
            a.params?.targetPlayerId === targetPlayerId
        );
        if (card?.type === "deserter" && matchingForOpp.length > 1) {
          model = {
            ...model,
            deserterTargetPlayerId: targetPlayerId,
            selectedBoardSpot: null,
          };
          render();
          return;
        }
        const matched = matchingForOpp[0];
        dispatchUiAction(
          actingPlayerId,
          matched ?? {
            type: "PLAY_PROGRESS_CARD",
            cardId: model.selectedProgressCardId,
            params: { targetPlayerId },
          }
        );
      });
    });

    root.querySelectorAll("[data-deserter-reset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = { ...model, deserterTargetPlayerId: null };
        render();
      });
    });

    root.querySelectorAll("[data-prog-action-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!model.selectedProgressCardId) return;
        const idx = Number(btn.getAttribute("data-prog-action-idx"));
        const legals = CatanEngine.getLegalActions(
          state,
          actingPlayerId
        ).filter(
          (
            a
          ): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
            a.type === "PLAY_PROGRESS_CARD" &&
            a.cardId === model.selectedProgressCardId
        );
        const chosen = legals[idx];
        if (chosen) {
          dispatchUiAction(actingPlayerId, chosen);
        }
      });
    });

    root.querySelector("#btn-buy-dev")?.addEventListener("click", () => {
      dispatch(actingPlayerId, { type: "BUY_DEV_CARD" });
    });

    root.querySelectorAll("[data-trade-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextTab = btn.getAttribute("data-trade-tab") as
          | "maritime_trade"
          | "domestic_trade";
        if (nextTab === model.buildMode) return;
        switchTradeMode(nextTab);
      });
    });

    root.querySelector("#btn-mode-maritime")?.addEventListener("click", () => {
      if (model.buildMode === "maritime_trade") {
        model = { ...model, selectedBoardSpot: null, buildMode: null };
        render();
      } else {
        switchTradeMode("maritime_trade");
      }
    });

    root.querySelector("#btn-mode-domestic")?.addEventListener("click", () => {
      if (model.buildMode === "domestic_trade") {
        model = { ...model, selectedBoardSpot: null, buildMode: null };
        render();
      } else {
        switchTradeMode("domestic_trade");
      }
    });

    root.querySelector("#sel-dom-target")?.addEventListener("change", (e) => {
      model = {
        ...model,
        domesticTargetPlayerId: (e.target as HTMLSelectElement).value,
      };
      render();
    });

    root.querySelectorAll("[data-dom-give]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-give") as ResourceType;
        model = setSharedTradeWantPure(
          {
            ...model,
            domesticGive: {
              ...model.domesticGive,
              [r]: model.domesticGive[r] + 1,
            },
          },
          r,
          0
        );
        render();
      });
    });

    root.querySelectorAll("[data-dom-give-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-give-dec") as ResourceType;
        if (model.domesticGive[r] > 0) {
          model = {
            ...model,
            domesticGive: {
              ...model.domesticGive,
              [r]: model.domesticGive[r] - 1,
            },
          };
          render();
        }
      });
    });

    root.querySelectorAll("[data-dom-want]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-want") as ResourceType;
        model = setSharedTradeWantPure(model, r, model.domesticWant[r] + 1);
        render();
      });
    });

    root.querySelectorAll("[data-dom-want-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-want-dec") as ResourceType;
        if (model.domesticWant[r] > 0) {
          model = setSharedTradeWantPure(model, r, model.domesticWant[r] - 1);
          render();
        }
      });
    });

    root.querySelectorAll("[data-ck-dom-give]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-ck-dom-give") as TradeGoodType;
        if (isCommodityType(g)) {
          model = setSharedTradeGoodWantPure(
            {
              ...model,
              domesticCommGive: {
                ...model.domesticCommGive,
                [g]: model.domesticCommGive[g] + 1,
              },
            },
            g,
            0
          );
        } else {
          model = setSharedTradeWantPure(
            {
              ...model,
              domesticGive: {
                ...model.domesticGive,
                [g]: model.domesticGive[g] + 1,
              },
            },
            g,
            0
          );
        }
        render();
      });
    });

    root.querySelectorAll("[data-ck-dom-give-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-ck-dom-give-dec") as TradeGoodType;
        if (isCommodityType(g)) {
          if (model.domesticCommGive[g] > 0) {
            model = {
              ...model,
              domesticCommGive: {
                ...model.domesticCommGive,
                [g]: model.domesticCommGive[g] - 1,
              },
            };
            render();
          }
        } else if (model.domesticGive[g] > 0) {
          model = {
            ...model,
            domesticGive: {
              ...model.domesticGive,
              [g]: model.domesticGive[g] - 1,
            },
          };
          render();
        }
      });
    });

    root.querySelectorAll("[data-ck-dom-want]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-ck-dom-want") as TradeGoodType;
        const cur = isCommodityType(g)
          ? model.domesticCommWant[g]
          : model.domesticWant[g];
        model = setSharedTradeGoodWantPure(model, g, cur + 1);
        render();
      });
    });

    root.querySelectorAll("[data-ck-dom-want-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-ck-dom-want-dec") as TradeGoodType;
        const cur = isCommodityType(g)
          ? model.domesticCommWant[g]
          : model.domesticWant[g];
        if (cur > 0) {
          model = setSharedTradeGoodWantPure(model, g, cur - 1);
          render();
        }
      });
    });

    root.querySelector("#btn-dom-reset")?.addEventListener("click", () => {
      model = {
        ...model,
        maritimeGive: emptyResources(),
        maritimeWant: emptyResources(),
        maritimeCommGive: emptyCommodities(),
        maritimeCommWant: emptyCommodities(),
        domesticGive: emptyResources(),
        domesticWant: emptyResources(),
        domesticCommGive: emptyCommodities(),
        domesticCommWant: emptyCommodities(),
      };
      render();
    });

    root.querySelector("#btn-dom-propose")?.addEventListener("click", () => {
      dispatch(actingPlayerId, {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: null,
        give: { ...model.domesticGive },
        want: { ...model.domesticWant },
        ...(state.config.enableCitiesAndKnights
          ? {
              giveCommodities: { ...model.domesticCommGive },
              wantCommodities: { ...model.domesticCommWant },
            }
          : {}),
      });
    });

    root.querySelectorAll("[data-confirm-trade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const partnerId = btn.getAttribute("data-confirm-trade")!;
        if (state.activeTradeOffer) {
          dispatch(state.activeTradeOffer.fromPlayerId, {
            type: "CONFIRM_DOMESTIC_TRADE",
            offerId: state.activeTradeOffer.id,
            partnerId,
          });
        }
      });
    });

    root.querySelectorAll("[data-accept-trade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const acceptorId = btn.getAttribute("data-accept-trade")!;
        if (state.activeTradeOffer) {
          dispatch(acceptorId, {
            type: "ACCEPT_DOMESTIC_TRADE",
            offerId: state.activeTradeOffer.id,
          });
        }
      });
    });

    root.querySelectorAll("[data-decline-trade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const declinerId = btn.getAttribute("data-decline-trade")!;
        if (state.activeTradeOffer) {
          dispatch(declinerId, {
            type: "DECLINE_DOMESTIC_TRADE",
            offerId: state.activeTradeOffer.id,
          });
        }
      });
    });

    root
      .querySelector("#btn-cancel-domestic")
      ?.addEventListener("click", () => {
        if (state.activeTradeOffer) {
          dispatch(state.activeTradeOffer.fromPlayerId, {
            type: "CANCEL_DOMESTIC_TRADE",
          });
        }
      });

    root.querySelectorAll("[data-maritime-give]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-maritime-give") as ResourceType;
        const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
        if (!actingPlayer) return;
        const ratios = getPlayerTradeRatios(state, actingPlayerId);
        const step = ratios[r];
        if (actingPlayer.resources[r] >= model.maritimeGive[r] + step) {
          model = setSharedTradeWantPure(
            {
              ...model,
              tradeGiveRes: r,
              maritimeGive: {
                ...model.maritimeGive,
                [r]: model.maritimeGive[r] + step,
              },
            },
            r,
            0
          );
          render();
        }
      });
    });

    root.querySelectorAll("[data-maritime-give-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-maritime-give-dec") as ResourceType;
        const ratios = getPlayerTradeRatios(state, actingPlayerId);
        const step = ratios[r];
        const nextVal =
          model.maritimeGive[r] >= step ? model.maritimeGive[r] - step : 0;
        model = {
          ...model,
          maritimeGive: {
            ...model.maritimeGive,
            [r]: nextVal,
          },
        };
        render();
      });
    });

    root.querySelectorAll("[data-maritime-receive]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-maritime-receive") as ResourceType;
        if (model.maritimeWant[r] < state.bank[r]) {
          model = {
            ...setSharedTradeWantPure(model, r, model.maritimeWant[r] + 1),
            tradeReceiveRes: r,
          };
          render();
        }
      });
    });

    root.querySelectorAll("[data-maritime-receive-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-maritime-receive-dec") as ResourceType;
        if (model.maritimeWant[r] > 0) {
          model = setSharedTradeWantPure(model, r, model.maritimeWant[r] - 1);
          render();
        }
      });
    });

    root.querySelectorAll("[data-ck-maritime-give]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-ck-maritime-give") as TradeGoodType;
        const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
        if (!actingPlayer) return;
        const goodRatios = getPlayerGoodTradeRatios(state, actingPlayerId);
        const step = goodRatios[g];
        const cur = isCommodityType(g)
          ? model.maritimeCommGive[g]
          : model.maritimeGive[g];
        if (getPlayerGoodCount(actingPlayer, g) >= cur + step) {
          if (isCommodityType(g)) {
            model = setSharedTradeGoodWantPure(
              {
                ...model,
                maritimeCommGive: {
                  ...model.maritimeCommGive,
                  [g]: cur + step,
                },
              },
              g,
              0
            );
          } else {
            model = setSharedTradeWantPure(
              {
                ...model,
                tradeGiveRes: g,
                maritimeGive: {
                  ...model.maritimeGive,
                  [g]: cur + step,
                },
              },
              g,
              0
            );
          }
          render();
        }
      });
    });

    root.querySelectorAll("[data-ck-maritime-give-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute(
          "data-ck-maritime-give-dec"
        ) as TradeGoodType;
        const goodRatios = getPlayerGoodTradeRatios(state, actingPlayerId);
        const step = goodRatios[g];
        if (isCommodityType(g)) {
          const nextVal =
            model.maritimeCommGive[g] >= step
              ? model.maritimeCommGive[g] - step
              : 0;
          model = {
            ...model,
            maritimeCommGive: { ...model.maritimeCommGive, [g]: nextVal },
          };
        } else {
          const nextVal =
            model.maritimeGive[g] >= step ? model.maritimeGive[g] - step : 0;
          model = {
            ...model,
            maritimeGive: { ...model.maritimeGive, [g]: nextVal },
          };
        }
        render();
      });
    });

    root.querySelectorAll("[data-ck-maritime-receive]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-ck-maritime-receive") as TradeGoodType;
        const cur = isCommodityType(g)
          ? model.maritimeCommWant[g]
          : model.maritimeWant[g];
        if (cur < getBankGoodCount(state, g)) {
          const next = setSharedTradeGoodWantPure(model, g, cur + 1);
          model = isCommodityType(g) ? next : { ...next, tradeReceiveRes: g };
          render();
        }
      });
    });

    root.querySelectorAll("[data-ck-maritime-receive-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute(
          "data-ck-maritime-receive-dec"
        ) as TradeGoodType;
        const cur = isCommodityType(g)
          ? model.maritimeCommWant[g]
          : model.maritimeWant[g];
        if (cur > 0) {
          model = setSharedTradeGoodWantPure(model, g, cur - 1);
          render();
        }
      });
    });

    root.querySelector("#btn-maritime-reset")?.addEventListener("click", () => {
      model = {
        ...model,
        maritimeGive: emptyResources(),
        maritimeWant: emptyResources(),
        maritimeCommGive: emptyCommodities(),
        maritimeCommWant: emptyCommodities(),
        domesticGive: emptyResources(),
        domesticWant: emptyResources(),
        domesticCommGive: emptyCommodities(),
        domesticCommWant: emptyCommodities(),
      };
      render();
    });

    root.querySelector("#btn-exec-maritime")?.addEventListener("click", () => {
      if (state.config.enableCitiesAndKnights) {
        const giveMap: TradeGoodMap = {
          ...model.maritimeGive,
          ...model.maritimeCommGive,
        };
        const receiveMap: TradeGoodMap = {
          ...model.maritimeWant,
          ...model.maritimeCommWant,
        };
        const activeGive = TRADE_GOODS.filter((g) => giveMap[g] > 0);
        const activeWant = TRADE_GOODS.filter((g) => receiveMap[g] > 0);
        if (activeGive.length === 0 || activeWant.length === 0) return;

        const firstGive = activeGive[0]!;
        const firstWant = activeWant[0]!;
        if (activeGive.length === 1 && activeWant.length === 1) {
          dispatch(actingPlayerId, {
            type: "MARITIME_TRADE",
            give: firstGive,
            giveAmount: giveMap[firstGive],
            receive: firstWant,
            receiveAmount: receiveMap[firstWant],
          });
        } else {
          dispatch(actingPlayerId, {
            type: "MARITIME_TRADE",
            give: firstGive,
            giveAmount: giveMap[firstGive],
            receive: firstWant,
            receiveAmount: receiveMap[firstWant],
            giveMap,
            receiveMap,
          });
        }
        return;
      }

      const activeGive = RESOURCES.filter((r) => model.maritimeGive[r] > 0);
      const activeWant = RESOURCES.filter((r) => model.maritimeWant[r] > 0);
      if (activeGive.length === 0 || activeWant.length === 0) return;

      const firstGive = activeGive[0]!;
      const firstWant = activeWant[0]!;
      if (activeGive.length === 1 && activeWant.length === 1) {
        dispatch(actingPlayerId, {
          type: "MARITIME_TRADE",
          give: firstGive,
          giveAmount: model.maritimeGive[firstGive],
          receive: firstWant,
          receiveAmount: model.maritimeWant[firstWant],
        });
      } else {
        dispatch(actingPlayerId, {
          type: "MARITIME_TRADE",
          give: firstGive,
          giveAmount: model.maritimeGive[firstGive],
          receive: firstWant,
          receiveAmount: model.maritimeWant[firstWant],
          giveMap: { ...model.maritimeGive },
          receiveMap: { ...model.maritimeWant },
        });
      }
    });

    root.querySelector("#btn-play-knight")?.addEventListener("click", () => {
      dispatchUiAction(actingPlayerId, { type: "PLAY_KNIGHT" });
    });

    root.querySelector("#btn-play-roadbuild")?.addEventListener("click", () => {
      dispatchUiAction(actingPlayerId, { type: "PLAY_ROAD_BUILDING" });
    });

    root.querySelector("#btn-mode-yop")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode:
          model.buildMode === "year_of_plenty" ? null : "year_of_plenty",
      };
      render();
    });

    root.querySelectorAll("[data-yop-pick1]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = {
          ...model,
          yopRes1: btn.getAttribute("data-yop-pick1") as ResourceType,
        };
        render();
      });
    });

    root.querySelectorAll("[data-yop-pick2]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = {
          ...model,
          yopRes2: btn.getAttribute("data-yop-pick2") as ResourceType,
        };
        render();
      });
    });

    root.querySelector("#btn-exec-yop")?.addEventListener("click", () => {
      dispatchUiAction(actingPlayerId, {
        type: "PLAY_YEAR_OF_PLENTY",
        resource1: model.yopRes1,
        resource2: model.yopRes2,
      });
    });

    root.querySelector("#btn-mode-mono")?.addEventListener("click", () => {
      model = {
        ...model,
        selectedBoardSpot: null,
        buildMode: model.buildMode === "monopoly" ? null : "monopoly",
      };
      render();
    });

    root.querySelectorAll("[data-mono-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = {
          ...model,
          monoRes: btn.getAttribute("data-mono-pick") as ResourceType,
        };
        render();
      });
    });

    root.querySelector("#btn-exec-mono")?.addEventListener("click", () => {
      dispatchUiAction(actingPlayerId, {
        type: "PLAY_MONOPOLY",
        resource: model.monoRes,
      });
    });

    root.querySelector("#btn-end-turn")?.addEventListener("click", () => {
      if (state.phase === "SPECIAL_BUILDING") {
        dispatch(actingPlayerId, { type: "END_SPECIAL_BUILD" });
      } else {
        dispatch(actingPlayerId, { type: "END_TURN" });
      }
    });
  };

  const bindInGameEvents = (
    room: ClientRoom,
    state: any,
    actingPlayerId: string | null,
    canCancelMyTrade = false
  ): void => {
    bindCommonIdentityEvents();
    root.querySelector("#btn-back-lobby")?.addEventListener("click", () => {
      stopAutoPlay();
      clearActiveRoomIdFromStorage();
      syncUrlRoomHash(null);
      model = { ...model, viewMode: "lobby" };
      if (model.useServerBackend) {
        void fetchLobbyRooms().then(() => render());
      } else {
        render();
      }
    });

    root.querySelector("#tab-setup-page")?.addEventListener("click", () => {
      stopAutoPlay();
      model = { ...model, viewMode: "room_setup" };
      render();
    });

    root
      .querySelector("#btn-toggle-game-settings")
      ?.addEventListener("click", () => {
        model = {
          ...model,
          sidebarSettingsExpanded: !model.sidebarSettingsExpanded,
        };
        render();
      });

    root
      .querySelector("#btn-sidebar-edit-setup")
      ?.addEventListener("click", () => {
        stopAutoPlay();
        model = { ...model, viewMode: "room_setup" };
        render();
      });

    root
      .querySelector("#btn-goto-setup-finished")
      ?.addEventListener("click", () => {
        stopAutoPlay();
        model = { ...model, viewMode: "room_setup" };
        render();
      });

    root.querySelector("#btn-undo")?.addEventListener("click", () => {
      undoMatch();
    });

    root.querySelector("#btn-redo")?.addEventListener("click", () => {
      redoMatch();
    });

    root.querySelector("#btn-finish-setup")?.addEventListener("click", () => {
      finishSetupWithBots();
    });

    root
      .querySelector("#btn-toggle-bot-response")
      ?.addEventListener("click", () => {
        toggleAutoRespondBots();
      });

    root.querySelector("#btn-step-bot")?.addEventListener("click", () => {
      stepOneBotMove();
    });

    root.querySelector("#btn-autoplay")?.addEventListener("click", () => {
      toggleAutoPlay();
    });

    root
      .querySelector("#btn-toggle-hand-privacy")
      ?.addEventListener("click", () => {
        model = { ...model, hidePassAndPlayHand: !model.hidePassAndPlayHand };
        render();
      });

    root.querySelector("#btn-reveal-hand")?.addEventListener("click", () => {
      model = { ...model, hidePassAndPlayHand: false };
      render();
    });

    root
      .querySelector("#btn-switch-turn-guest")
      ?.addEventListener("click", (e) => {
        const gid = (e.currentTarget as HTMLElement).getAttribute(
          "data-switch-guest"
        );
        if (gid) {
          switchActiveGuest(gid);
        }
      });

    if (room.gameId === "azul") {
      root.querySelectorAll("[data-azul-inspect-player]").forEach((el) => {
        el.addEventListener("click", () => {
          const pid = el.getAttribute("data-azul-inspect-player")!;
          model = {
            ...model,
            azulInspectedPlayerId:
              model.azulInspectedPlayerId === pid ? null : pid,
          };
          render();
        });
      });
    }

    if (room.gameId === "seven_wonders") {
      root.querySelectorAll("[data-sw-inspect-player]").forEach((el) => {
        el.addEventListener("click", () => {
          const pid = el.getAttribute("data-sw-inspect-player")!;
          model = {
            ...model,
            sevenWondersInspectedPlayerId:
              model.sevenWondersInspectedPlayerId === pid ? null : pid,
          };
          render();
        });
      });

      const handleUnselectSwPick = (ev?: any) => {
        const swRaw = (getRoomStatePure(model, room) ?? state) as SevenWondersState;
        const explicitId = ev?.currentTarget?.getAttribute?.(
          "data-sw-unselect-player"
        ) as string | null;
        if (
          explicitId &&
          canControlPlayerOnDevicePure(model, room, explicitId) &&
          canPlayerUnselectDraftPick(swRaw, explicitId)
        ) {
          dispatchUiAction(explicitId, { type: "UNSELECT_DRAFT_ACTION" });
          return;
        }
        const lockedLocal = [...swRaw.players]
          .reverse()
          .find(
            (p) =>
              !p.isBot &&
              canControlPlayerOnDevicePure(model, room, p.id) &&
              canPlayerUnselectDraftPick(swRaw, p.id)
          );
        if (lockedLocal) {
          dispatchUiAction(lockedLocal.id, { type: "UNSELECT_DRAFT_ACTION" });
        }
      };
      root
        .querySelector("#btn-sw-unselect-pick")
        ?.addEventListener("click", handleUnselectSwPick);
      root
        .querySelector("#btn-sw-unselect-pick-dock")
        ?.addEventListener("click", handleUnselectSwPick);
    }

    if (!actingPlayerId) return;

    if (!canControlPlayerOnDevicePure(model, room, actingPlayerId)) {
      if (canCancelMyTrade && state.activeTradeOffer) {
        root.querySelectorAll("[data-confirm-trade]").forEach((confirmBtn) => {
          confirmBtn.addEventListener("click", () => {
            const partnerId = confirmBtn.getAttribute("data-confirm-trade")!;
            dispatchUiAction(state.activeTradeOffer.fromPlayerId, {
              type: "CONFIRM_DOMESTIC_TRADE",
              offerId: state.activeTradeOffer.id,
              partnerId,
            });
          });
        });
        root.querySelectorAll("#btn-cancel-domestic").forEach((cancelBtn) => {
          cancelBtn.addEventListener("click", () => {
            dispatchUiAction(state.activeTradeOffer.fromPlayerId, {
              type: "CANCEL_DOMESTIC_TRADE",
            });
          });
        });
      }
      if (room.gameId === "catan") {
        bindReadOnlyCatanSpotInspect();
      }
      return;
    }

    if (room.gameId === "splendor") {
      bindSplendorEvents(state as SplendorState, actingPlayerId);
      return;
    }

    if (room.gameId === "azul") {
      bindAzulEvents(state as AzulState, actingPlayerId);
      return;
    }

    if (room.gameId === "seven_wonders") {
      bindSevenWondersEvents(state as SevenWondersState, actingPlayerId);
      return;
    }

    bindCatanEvents(state as CatanState, actingPlayerId);
  };

  const render = (): void => {
    const activeRoom = getActiveRoomPure(model);
    const inActiveGame =
      model.isAuthenticated &&
      model.viewMode === "in_game" &&
      Boolean(activeRoom && getRoomStatePure(model, activeRoom));
    if (typeof document !== "undefined" && document.body?.classList) {
      document.body.classList.toggle("ga-body--in-game", inActiveGame);
    }

    if (!model.isAuthenticated || model.viewMode === "login") {
      root.innerHTML = renderLoginViewPure(model);
      bindLoginEvents();
      model = { ...model, loginHeroEnteredOnce: true };
      return;
    }
    if (model.viewMode === "lobby") {
      root.innerHTML = renderLobbyViewPure(model);
      bindLobbyEvents();
      model = { ...model, lobbyHeroEnteredOnce: true };
      return;
    }
    if (model.viewMode === "room_setup") {
      const room = getActiveRoomPure(model);
      const setupRendered = renderRoomSetupViewPure(model, room);
      root.innerHTML = setupRendered.html;
      bindRoomSetupEvents(
        room,
        setupRendered.canEditSetup,
        setupRendered.maxBots,
        setupRendered.bounds
      );
      return;
    }

    const room = getActiveRoomPure(model);
    const rawState = getRoomStatePure(model, room);
    const usesServer = roomUsesServerPure(model, room);
    if (!rawState) {
      if (usesServer) {
        model = { ...model, viewMode: "room_setup" };
        const setupRendered = renderRoomSetupViewPure(model, room);
        root.innerHTML = setupRendered.html;
        bindRoomSetupEvents(
          room,
          setupRendered.canEditSetup,
          setupRendered.maxBots,
          setupRendered.bounds
        );
      } else {
        startRoomMatch(room.roomId);
      }
      return;
    }

    const inGameRendered = renderInGameViewPure(model, room, rawState);
    model = inGameRendered.model;
    root.innerHTML = inGameRendered.html;
    bindInGameEvents(
      room,
      inGameRendered.state,
      inGameRendered.actingPlayerId,
      inGameRendered.canCancelMyTrade
    );
  };

  registerGlobalDropdownDismiss(root);
  render();

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("hashchange", () => {
      const nextInvite = extractInviteRoomHashFromLocationPure(
        window.location?.search ?? "",
        window.location?.hash ?? ""
      );
      if (!nextInvite) return;
      if (model.isAuthenticated && model.viewMode !== "login") {
        if (nextInvite !== model.activeRoomId || model.viewMode === "lobby") {
          enterOrJoinRoom(nextInvite);
        }
      } else {
        model = { ...model, pendingInviteRoomId: nextInvite };
        render();
      }
    });
  }

  if (model.useServerBackend && model.isAuthenticated) {
    void fetchLobbyRooms();
  } else if (model.isAuthenticated && model.pendingInviteRoomId) {
    const inviteId = model.pendingInviteRoomId;
    model = { ...model, pendingInviteRoomId: null };
    enterOrJoinRoom(inviteId);
  }

  return {
    get root() {
      return root;
    },
    get viewMode() {
      return model.viewMode;
    },
    set viewMode(v: AppViewMode) {
      model = { ...model, viewMode: v };
    },
    get lobbyGameFilter() {
      return model.lobbyGameFilter;
    },
    set lobbyGameFilter(v: SupportedGameId) {
      model = { ...model, lobbyGameFilter: v, createRoomGameId: v };
    },
    get lobbyHeroEnteredOnce() {
      return model.lobbyHeroEnteredOnce;
    },
    set lobbyHeroEnteredOnce(v: boolean) {
      model = { ...model, lobbyHeroEnteredOnce: v };
    },
    get loginHeroEnteredOnce() {
      return model.loginHeroEnteredOnce;
    },
    set loginHeroEnteredOnce(v: boolean) {
      model = { ...model, loginHeroEnteredOnce: v };
    },
    get useServerBackend() {
      return model.useServerBackend;
    },
    set useServerBackend(v: boolean) {
      model = { ...model, useServerBackend: v };
    },
    get staticHostOnly() {
      return model.staticHostOnly;
    },
    set staticHostOnly(v: boolean) {
      model = { ...model, staticHostOnly: v };
    },
    get serverReachable() {
      return model.serverReachable;
    },
    set serverReachable(v: boolean) {
      model = { ...model, serverReachable: v };
    },
    get isAuthenticated() {
      return model.isAuthenticated;
    },
    set isAuthenticated(v: boolean) {
      model = { ...model, isAuthenticated: v };
    },
    get addingAdditionalGuest() {
      return model.addingAdditionalGuest;
    },
    set addingAdditionalGuest(v: boolean) {
      model = { ...model, addingAdditionalGuest: v };
    },
    get returnViewAfterAddGuest() {
      return model.returnViewAfterAddGuest;
    },
    set returnViewAfterAddGuest(v: AppViewMode) {
      model = { ...model, returnViewAfterAddGuest: v };
    },
    get loginDraftName() {
      return model.loginDraftName;
    },
    set loginDraftName(v: string) {
      model = { ...model, loginDraftName: v };
    },
    get loginErrorMsg() {
      return model.loginErrorMsg;
    },
    set loginErrorMsg(v: string) {
      model = { ...model, loginErrorMsg: v };
    },
    get currentUserId() {
      return model.currentUserId;
    },
    set currentUserId(v: string) {
      model = { ...model, currentUserId: v };
    },
    get currentUserName() {
      return model.currentUserName;
    },
    set currentUserName(v: string) {
      model = { ...model, currentUserName: v };
    },
    get deviceGuests() {
      return model.deviceGuests;
    },
    set deviceGuests(v: GuestSession[]) {
      model = { ...model, deviceGuests: [...v] };
    },
    get localFriendDraftName() {
      return model.localFriendDraftName;
    },
    set localFriendDraftName(v: string) {
      model = { ...model, localFriendDraftName: v };
    },
    get hidePassAndPlayHand() {
      return model.hidePassAndPlayHand;
    },
    set hidePassAndPlayHand(v: boolean) {
      model = { ...model, hidePassAndPlayHand: v };
    },
    get createRoomName() {
      return model.createRoomName;
    },
    set createRoomName(v: string) {
      model = { ...model, createRoomName: v };
    },
    get createRoomGameId() {
      return model.createRoomGameId;
    },
    set createRoomGameId(v: SupportedGameId) {
      model = { ...model, createRoomGameId: v, lobbyGameFilter: v };
    },
    get createRoomMode() {
      return model.createRoomMode;
    },
    set createRoomMode(v: "online" | "offline") {
      model = { ...model, createRoomMode: v };
    },
    get rooms() {
      return roomsFacade;
    },
    get nextRoomNum() {
      return model.nextRoomNum;
    },
    set nextRoomNum(v: number) {
      model = { ...model, nextRoomNum: v };
    },
    get activeRoomId() {
      return model.activeRoomId;
    },
    set activeRoomId(v: string) {
      model = { ...model, activeRoomId: v };
    },
    get buildMode() {
      return model.buildMode;
    },
    set buildMode(v: BuildMode) {
      model = { ...model, buildMode: v };
    },
    get selectedBoardSpot() {
      return model.selectedBoardSpot;
    },
    set selectedBoardSpot(v: BoardSpotSelection | null) {
      model = { ...model, selectedBoardSpot: v };
    },
    get setupEdgeKind() {
      return model.setupEdgeKind;
    },
    set setupEdgeKind(v: "road" | "ship") {
      model = { ...model, setupEdgeKind: v };
    },
    get robberOrPirateMode() {
      return model.robberOrPirateMode;
    },
    set robberOrPirateMode(v: "robber" | "pirate") {
      model = { ...model, robberOrPirateMode: v };
    },
    get selectedMoveFromEdgeId() {
      return model.selectedMoveFromEdgeId;
    },
    set selectedMoveFromEdgeId(v: string | null) {
      model = { ...model, selectedMoveFromEdgeId: v };
    },
    get discardSelection() {
      return model.discardSelection;
    },
    set discardSelection(v: ResourceMap) {
      model = { ...model, discardSelection: { ...v } };
    },
    get tradeGiveRes() {
      return model.tradeGiveRes;
    },
    set tradeGiveRes(v: ResourceType) {
      model = { ...model, tradeGiveRes: v };
    },
    get tradeReceiveRes() {
      return model.tradeReceiveRes;
    },
    set tradeReceiveRes(v: ResourceType) {
      model = { ...model, tradeReceiveRes: v };
    },
    get maritimeGive() {
      return model.maritimeGive;
    },
    set maritimeGive(v: ResourceMap) {
      model = { ...model, maritimeGive: { ...v } };
    },
    get maritimeWant() {
      return model.maritimeWant;
    },
    set maritimeWant(v: ResourceMap) {
      model = { ...model, maritimeWant: { ...v } };
    },
    get domesticGive() {
      return model.domesticGive;
    },
    set domesticGive(v: ResourceMap) {
      model = { ...model, domesticGive: { ...v } };
    },
    get domesticWant() {
      return model.domesticWant;
    },
    set domesticWant(v: ResourceMap) {
      model = { ...model, domesticWant: { ...v } };
    },
    get domesticTargetPlayerId() {
      return model.domesticTargetPlayerId;
    },
    set domesticTargetPlayerId(v: string) {
      model = { ...model, domesticTargetPlayerId: v };
    },
    get yopRes1() {
      return model.yopRes1;
    },
    set yopRes1(v: ResourceType) {
      model = { ...model, yopRes1: v };
    },
    get yopRes2() {
      return model.yopRes2;
    },
    set yopRes2(v: ResourceType) {
      model = { ...model, yopRes2: v };
    },
    get monoRes() {
      return model.monoRes;
    },
    set monoRes(v: ResourceType) {
      model = { ...model, monoRes: v };
    },
    get splendorDraftGems() {
      return model.splendorDraftGems;
    },
    set splendorDraftGems(v: Partial<Record<GemColor, number>>) {
      model = { ...model, splendorDraftGems: { ...v } };
    },
    get azulSelectedDraft() {
      return model.azulSelectedDraft;
    },
    set azulSelectedDraft(
      v: { source: AzulDraftSource; color: AzulTileColor } | null
    ) {
      model = { ...model, azulSelectedDraft: v };
    },
    get autoPlayBots() {
      return model.autoPlayBots;
    },
    set autoPlayBots(v: boolean) {
      model = { ...model, autoPlayBots: v };
    },
    get sidebarSettingsExpanded() {
      return model.sidebarSettingsExpanded;
    },
    set sidebarSettingsExpanded(v: boolean) {
      model = { ...model, sidebarSettingsExpanded: v };
    },
    get autoRespondBotsToHuman() {
      return model.autoRespondBotsToHuman;
    },
    set autoRespondBotsToHuman(v: boolean) {
      model = { ...model, autoRespondBotsToHuman: v };
    },
    get autoPlaySpeedMs() {
      return model.autoPlaySpeedMs;
    },
    set autoPlaySpeedMs(v: number) {
      model = { ...model, autoPlaySpeedMs: v };
    },
    render,
    signInAsGuest,
    startSoloGameFromLogin,
    startOfflineLocalFromLogin,
    openAddGuestView,
    switchActiveGuest,
    renameCurrentGuest,
    signOutGuest,
    removeDeviceGuest,
    getRoomBounds: getRoomBoundsPure,
    createLocalRoom,
    getActiveRoom,
    getRoomState: (room: ClientRoom) => getRoomStatePure(model, room),
    canControlPlayerOnThisDevice: (room: ClientRoom, playerId: string | null) =>
      canControlPlayerOnDevicePure(model, room, playerId),
    rebuildRoomSeats,
    addLocalFriendToRoom,
    removePlayerFromRoom,
    createAndOpenRoom,
    enterOrJoinRoom,
    leaveActiveRoom,
    startRoomMatch,
    startInteractiveTutorial,
    resetSubModes,
    dispatchUiAction,
    dispatch,
    stepOneBotMove,
    finishSetupWithBots,
    undoMatch,
    redoMatch,
    toggleAutoRespondBots,
    toggleAutoPlay,
    stopAutoPlay,
    switchTradeMode,
    setSharedTradeWant,
  };
}

export const MultiGamePlatformApp: MultiGamePlatformAppConstructor =
  createMultiGamePlatformApp as unknown as MultiGamePlatformAppConstructor;

if (typeof document !== "undefined") {
  const root = document.getElementById("app");
  if (root) {
    createMultiGamePlatformApp(root);
  }
}
