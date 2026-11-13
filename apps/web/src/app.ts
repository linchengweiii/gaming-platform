import {
  type BotDifficulty,
  type MatchSession,
  type PlayerDescriptor,
  createMatchSession,
} from "@gaming-platform/core";
import {
  BUILDING_COSTS,
  type CatanAction,
  CatanEngine,
  type CatanState,
  PLAYER_COLORS,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  SCENARIO_CATALOG,
  type ScenarioId,
  TERRAIN_TO_RESOURCE,
  computePlayerVictoryPoints,
  emptyResources,
  getLegalMoveShipActions,
  getLegalPirateHexes,
  getLegalRoadEdges,
  getLegalRobberHexes,
  getLegalSettlementVertices,
  getLegalShipEdges,
  getNextActingPlayerId,
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  hasResources,
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
  RESOURCE_META,
  getBoardSpotPercentPosition,
  renderActionPieceIconSvg,
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
  renderDieSvg,
  renderMiniResourceCardSvg,
  renderResourceGlyphSvg,
  renderRollDiceButtonGraphicSvg,
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

export type SupportedGameId = "catan" | "splendor" | "azul";
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

export type BuildMode =
  | null
  | "road"
  | "ship"
  | "settlement"
  | "city"
  | "wall"
  | "move_ship"
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
  enableHarbormaster: boolean;
  enableCityWalls: boolean;
  enableFriendlyRobber: boolean;
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
}

export interface CreateLocalRoomOptions {
  readonly name: string;
  readonly gameId: SupportedGameId;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly isOfflineLocal?: boolean;
  readonly botCount?: number;
  readonly allBots?: boolean;
  readonly botDifficulty?: BotDifficulty;
  readonly startingPlayerMode?: string;
  readonly scenarioId?: ScenarioId;
  readonly enableHarbormaster?: boolean;
  readonly enableCityWalls?: boolean;
  readonly enableFriendlyRobber?: boolean;
  readonly autoStart?: boolean;
}

export interface AppModel {
  readonly viewMode: AppViewMode;
  readonly lobbyGameFilter: "all" | SupportedGameId;
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
  readonly deviceGuests: GuestSession[];
  readonly localFriendDraftName: string;
  readonly hidePassAndPlayHand: boolean;
  readonly createRoomName: string;
  readonly createRoomGameId: SupportedGameId;
  readonly createRoomMode: "online" | "offline";
  readonly rooms: Readonly<Record<string, ClientRoom>>;
  readonly roomOrder: readonly string[];
  readonly nextRoomNum: number;
  readonly activeRoomId: string;
  readonly buildMode: BuildMode;
  readonly selectedBoardSpot: BoardSpotSelection | null;
  readonly setupEdgeKind: "road" | "ship";
  readonly robberOrPirateMode: "robber" | "pirate";
  readonly selectedMoveFromEdgeId: string | null;
  readonly discardSelection: ResourceMap;
  readonly tradeGiveRes: ResourceType;
  readonly tradeReceiveRes: ResourceType;
  readonly maritimeGive: ResourceMap;
  readonly maritimeWant: ResourceMap;
  readonly domesticGive: ResourceMap;
  readonly domesticWant: ResourceMap;
  readonly domesticTargetPlayerId: string;
  readonly yopRes1: ResourceType;
  readonly yopRes2: ResourceType;
  readonly monoRes: ResourceType;
  readonly splendorDraftGems: Partial<Record<GemColor, number>>;
  readonly azulSelectedDraft: {
    readonly source: AzulDraftSource;
    readonly color: AzulTileColor;
  } | null;
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
  return CatanEngine;
}

export function getActingPlayerIdPure(
  gameId: SupportedGameId,
  state: any
): string | null {
  if (gameId === "splendor") return getSplendorActingPlayerId(state);
  if (gameId === "azul") return getAzulActingPlayerId(state);
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
    room.config.scenarioId === "big_island_5_6" &&
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

export function createLocalRoomPure(
  model: Readonly<AppModel>,
  opts: CreateLocalRoomOptions,
  nowMs: number = Date.now()
): { readonly model: AppModel; readonly room: ClientRoom } {
  const roomId = `room-${model.nextRoomNum}`;
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
    name: opts.name,
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
    config: {
      scenarioId: opts.scenarioId ?? "standard",
      enableHarbormaster: opts.enableHarbormaster ?? false,
      enableCityWalls: opts.enableCityWalls ?? false,
      enableFriendlyRobber: opts.enableFriendlyRobber ?? false,
    },
    seed: `arena-${roomId}-${nowMs % 10000}`,
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
    name: "Island of Catan — Table 1",
    gameId: "catan",
    ownerId: "p1",
    ownerName: "Player 1 (You)",
    botCount: 3,
    startingPlayerMode: "first",
    scenarioId: "standard",
    autoStart: false,
  },
  {
    name: "Four Islands — Seafarers",
    gameId: "catan",
    ownerId: "host-nemo",
    ownerName: "Captain Nemo",
    botCount: 3,
    scenarioId: "seafarers_four_islands",
    enableHarbormaster: true,
    autoStart: false,
  },
  {
    name: "Florence Gem Market",
    gameId: "splendor",
    ownerId: "host-lorenzo",
    ownerName: "Lorenzo",
    botCount: 3,
    autoStart: false,
  },
  {
    name: "Evora Courtyard Wall",
    gameId: "azul",
    ownerId: "host-manuel",
    ownerName: "Manuel",
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
    config: {
      scenarioId: (cfg.scenarioId as ScenarioId) ?? "standard",
      enableHarbormaster: Boolean(cfg.enableHarbormaster),
      enableCityWalls: Boolean(cfg.enableCityWalls),
      enableFriendlyRobber: Boolean(cfg.enableFriendlyRobber),
    },
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
    selectedMoveFromEdgeId: null,
    discardSelection: emptyResources(),
    maritimeGive: emptyResources(),
    maritimeWant: emptyResources(),
    domesticGive: emptyResources(),
    domesticWant: emptyResources(),
    domesticTargetPlayerId: "all",
    splendorDraftGems: {},
    azulSelectedDraft: null,
  };
}

export function switchTradeModePure(
  model: Readonly<AppModel>,
  nextMode: "maritime_trade" | "domestic_trade" | null
): AppModel {
  const syncedWants = (() => {
    if (model.buildMode === "domestic_trade" && nextMode === "maritime_trade") {
      return {
        maritimeWant: { ...model.domesticWant },
        domesticWant: { ...model.domesticWant },
      };
    }
    if (model.buildMode === "maritime_trade" && nextMode === "domestic_trade") {
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
      };
    }
    if (nextMode === "maritime_trade") {
      if (
        totalResourceCount(model.maritimeWant) === 0 &&
        totalResourceCount(model.domesticWant) > 0
      ) {
        return {
          maritimeWant: { ...model.domesticWant },
          domesticWant: { ...model.domesticWant },
        };
      }
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
      };
    }
    if (
      totalResourceCount(model.domesticWant) === 0 &&
      totalResourceCount(model.maritimeWant) > 0
    ) {
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
      };
    }
    return {
      maritimeWant: { ...model.domesticWant },
      domesticWant: { ...model.domesticWant },
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

  return {
    ...model,
    selectedBoardSpot: null,
    maritimeWant: syncedWants.maritimeWant,
    domesticWant: syncedWants.domesticWant,
    maritimeGive: nextMaritimeGive,
    domesticGive: nextDomesticGive,
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
  }
): AppModel {
  const staticHostOnly = env.isStaticHost;
  const useServerBackend = env.isBrowserHttp && !env.isStaticHost;
  const serverReachable = !env.isStaticHost;
  const createRoomMode: "online" | "offline" = useServerBackend
    ? "online"
    : "offline";
  const initialDraftName = `Guest ${env.randomGuestSuffix}`;

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
    lobbyGameFilter: "all",
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
    deviceGuests: authInit.deviceGuests,
    localFriendDraftName: "",
    hidePassAndPlayHand: false,
    createRoomName: "Catan harbour table",
    createRoomGameId: "catan",
    createRoomMode,
    rooms: {},
    roomOrder: [],
    nextRoomNum: 1,
    activeRoomId: "room-1",
    buildMode: null,
    selectedBoardSpot: null,
    setupEdgeKind: "road",
    robberOrPirateMode: "robber",
    selectedMoveFromEdgeId: null,
    discardSelection: emptyResources(),
    tradeGiveRes: "brick",
    tradeReceiveRes: "ore",
    maritimeGive: emptyResources(),
    maritimeWant: emptyResources(),
    domesticGive: emptyResources(),
    domesticWant: emptyResources(),
    domesticTargetPlayerId: "all",
    yopRes1: "grain",
    yopRes2: "ore",
    monoRes: "ore",
    splendorDraftGems: {},
    azulSelectedDraft: null,
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
          enableHarbormaster: rebuilt.config.enableHarbormaster,
          enableCityWalls: rebuilt.config.enableCityWalls,
          enableFriendlyRobber: rebuilt.config.enableFriendlyRobber,
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
              <dd class="ga-num">3</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>Seats per table</dt>
              <dd class="ga-num">2–6</dd>
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
              ${model.addingAdditionalGuest ? "Save and switch guest" : "Continue as guest"}${DRAWN_ARROW_SVG}
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
                          <button type="button" data-select-saved-guest="${escapeAttr(g.id)}" class="btn btn--secondary btn--sm">
                            ${escapeAttr(g.name)}
                          </button>
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
        ${renderDropdown({
          id: "sel-user-identity",
          value: model.currentUserId,
          size: "sm",
          inline: true,
          align: "end",
          title: "Switch between guest profiles on this computer",
          options,
        })}
        <button type="button" id="btn-add-guest" class="btn btn--secondary btn--sm">New guest</button>
        <button type="button" id="btn-sign-out" class="btn btn--secondary btn--sm">Sign out</button>
      </div>
    `;
}

export function renderLobbyViewPure(model: Readonly<AppModel>): string {
  const allRooms = getRoomListPure(model);
  const roomsList = allRooms.filter(
    (r) => model.lobbyGameFilter === "all" || r.gameId === model.lobbyGameFilter
  );
  const enterAttr = model.lobbyHeroEnteredOnce ? "" : "data-enter";
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
            meta: "Solo and friends",
          },
        ]
      : [
          {
            value: "offline",
            label: "Offline local",
            meta: "Solo and friends",
          },
        ];

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
        <div class="hero ga-lobby-hero grid grid--top" ${enterAttr}>
          <div class="ga-lobby-hero__copy span-7">
            <h1 class="ga-lobby-hero__title">Tabletop board games in one room.</h1>
            <p class="t-lead muted">Open an online room as host, switch guests to run multiple rooms on one computer, or play offline with local friends.</p>
          </div>
          <dl class="ga-lobby-stats span-5 start-8">
            <div class="ga-lobby-stat">
              <dt>Board games</dt>
              <dd class="ga-num">3</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>Open tables</dt>
              <dd class="ga-num">${allRooms.length}</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>Table seats</dt>
              <dd class="ga-num">2–6</dd>
            </div>
          </dl>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--s-3);">
          <div class="ga-section-bar">
            <h2>Choose a game</h2>
            <span class="t-label muted ga-num">${roomsList.length} ${roomsList.length === 1 ? "table" : "tables"} shown</span>
          </div>
          <div class="ga-filter-grid">
            <button type="button" class="game-select-card ${
              model.lobbyGameFilter === "all" ? "selected" : ""
            }" data-lobby-filter="all">
              <div class="game-select-card__top">
                <span class="game-select-card__title">All games</span>
                <span class="ga-chip ga-num">${allRooms.length}</span>
              </div>
              <span class="game-select-card__desc">Browse every active and open table across Catan, Splendor, and Azul.</span>
            </button>

            <button type="button" class="game-select-card ${
              model.lobbyGameFilter === "catan" ? "selected" : ""
            }" data-lobby-filter="catan">
              <div class="game-select-card__top">
                <span class="game-select-card__title">Settlers of Catan</span>
                <span class="ga-chip">2–6 players</span>
              </div>
              <span class="game-select-card__desc">Base island, 5–6 player extension, Seafarers scenarios, Harbormaster, and City walls.</span>
            </button>

            <button type="button" class="game-select-card ${
              model.lobbyGameFilter === "splendor" ? "selected" : ""
            }" data-lobby-filter="splendor">
              <div class="game-select-card__top">
                <span class="game-select-card__title">Splendor</span>
                <span class="ga-chip">2–4 players</span>
              </div>
              <span class="game-select-card__desc">Draft gem tokens, acquire mine cards across three tiers, and earn 15 prestige points.</span>
            </button>

            <button type="button" class="game-select-card ${
              model.lobbyGameFilter === "azul" ? "selected" : ""
            }" data-lobby-filter="azul">
              <div class="game-select-card__top">
                <span class="game-select-card__title">Azul</span>
                <span class="ga-chip">2–4 players</span>
              </div>
              <span class="game-select-card__desc">Draft ceramic tiles from factory displays to score rows and columns on a 5×5 wall.</span>
            </button>
          </div>
        </div>

        <div class="ga-lobby-columns">
          <aside class="ga-surface-card">
            <div class="ga-section-bar">
              <h2>Create a room</h2>
              <span class="ga-chip ga-chip--accent">Host controls</span>
            </div>

            <div class="ga-field">
              <label for="inp-create-room-name">Room name</label>
              <input type="text" id="inp-create-room-name" class="ga-input" value="${escapeAttr(
                model.createRoomName
              )}" placeholder="Name your table" />
            </div>

            <div class="ga-field">
              <label for="sel-create-room-game-btn">Board game</label>
              ${renderDropdown({
                id: "sel-create-room-game",
                value: model.createRoomGameId,
                options: [
                  {
                    value: "catan",
                    label: "Settlers of Catan",
                    meta: "2–6P",
                  },
                  { value: "splendor", label: "Splendor", meta: "2–4P" },
                  { value: "azul", label: "Azul", meta: "2–4P" },
                ],
              })}
            </div>

            <div class="ga-field">
              <label for="sel-create-room-mode-btn">Table mode</label>
              ${renderDropdown({
                id: "sel-create-room-mode",
                value: effectiveMode,
                options: modeOptions,
              })}
            </div>

            <p class="t-small muted">
              ${
                effectiveMode === "offline"
                  ? `Opens a local room on this computer with <strong>${escapeAttr(model.currentUserName)}</strong> as host. Add bots for a solo game or add local friends to pass and play.`
                  : `Opens an online room with <strong>${escapeAttr(model.currentUserName)}</strong> as host. Choose bots, local friends, and starting player on the setup screen.`
              }
            </p>

            <button type="button" id="btn-create-room" class="btn btn--primary" style="width: 100%;">
              Create room${DRAWN_ARROW_SVG}
            </button>
          </aside>

          <div class="ga-surface-card">
            <div class="ga-section-bar">
              <h2>Open rooms</h2>
              <span class="t-label muted">Signed in as <strong style="color: var(--ink); font-weight: 500;">${escapeAttr(model.currentUserName)}</strong></span>
            </div>

            ${
              roomsList.length === 0
                ? `
                  <div class="ga-empty-rooms">
                    <p class="t-body" style="color: var(--ink); font-weight: 500;">No open rooms yet.</p>
                    <p class="t-small muted">Create a room on the left to play solo against bots or pass and play offline with local friends.</p>
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
                        const gameBadge =
                          r.gameId === "catan"
                            ? `Catan · ${SCENARIO_CATALOG[r.config.scenarioId].name}`
                            : r.gameId === "splendor"
                              ? "Splendor"
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
                              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                                <span class="room-card__title">${escapeAttr(r.name)}</span>
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
                                  ? `<button type="button" data-join-room="${r.roomId}" class="btn ${
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
                                      isOwner
                                        ? `<button type="button" data-start-room-direct="${r.roomId}" class="btn btn--secondary btn--sm" ${
                                            !canDirectStart ? "disabled" : ""
                                          }>Start match</button>`
                                        : ""
                                    }`
                                  : `<button type="button" data-join-room="${r.roomId}" class="btn btn--primary btn--sm" style="flex: 1;">
                                      Open game board
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
      </div>
    `;
}

export function renderRoomHeaderPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  activeTab: "setup" | "game"
): string {
  const hasMatchState = Boolean(getRoomStatePure(model, room));
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
                <span>${escapeAttr(room.name)}</span>
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
                : ""
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

  const sc = SCENARIO_CATALOG[room.config.scenarioId];
  const targetVp = state?.config?.targetVictoryPoints ?? sc.defaultTargetVp;
  const expansionChips = [
    sc.enableSeafarers ? "Seafarers ships and islands" : "",
    sc.enableSpecialBuildingPhase ? "Special building phase" : "",
    room.config.enableHarbormaster ? "Harbormaster (+2 VP)" : "",
    room.config.enableCityWalls ? "City walls (+2 safe hand)" : "",
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
            <span class="ga-summary-cell__sub">${escapeAttr(room.name)}</span>
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
          <span class="ga-chip ga-chip--ok">Owner editable</span>
        </div>

        ${
          room.status === "finished"
            ? `<div class="ga-notice ga-notice--accent">
                 The previous match has finished. Adjust any rules below and start the next game.
               </div>`
            : ""
        }

        <div class="ga-field">
          <label for="setup-room-name">Room name</label>
          <input type="text" id="setup-room-name" class="ga-input" value="${escapeAttr(
            room.name
          )}" />
        </div>

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
            ],
          })}
        </div>

        ${
          room.gameId === "catan"
            ? `
          <div class="ga-field">
            <label for="setup-sel-scenario-btn">Catan scenario</label>
            ${renderDropdown({
              id: "setup-sel-scenario",
              value: room.config.scenarioId,
              options: Object.values(SCENARIO_CATALOG).map((sc) => ({
                value: sc.id,
                label: sc.name,
                meta: `${sc.minPlayers}–${sc.maxPlayers}P`,
              })),
            })}
            <p class="t-small muted">${SCENARIO_CATALOG[room.config.scenarioId].description}</p>
          </div>
        `
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

        <div>
          <label class="ga-check-row" for="setup-chk-allbots">
            <span>All seats controlled by bots (spectator simulation)</span>
            <input type="checkbox" id="setup-chk-allbots" ${
              room.allBots ? "checked" : ""
            } />
          </label>

          ${
            room.gameId === "catan"
              ? `
            <label class="ga-check-row" for="setup-chk-harbormaster">
              <span>Harbormaster (+2 VP at 3 harbor points)</span>
              <input type="checkbox" id="setup-chk-harbormaster" ${
                room.config.enableHarbormaster ? "checked" : ""
              } />
            </label>
            <label class="ga-check-row" for="setup-chk-citywalls">
              <span>City walls (+2 safe hand limit on 7)</span>
              <input type="checkbox" id="setup-chk-citywalls" ${
                room.config.enableCityWalls ? "checked" : ""
              } />
            </label>
            <label class="ga-check-row" for="setup-chk-friendlyrobber">
              <span>Friendly robber (protects players at 2 VP or below)</span>
              <input type="checkbox" id="setup-chk-friendlyrobber" ${
                room.config.enableFriendlyRobber ? "checked" : ""
              } />
            </label>
          `
              : ""
          }
        </div>
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
          </div>
        </aside>
      </div>
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

  const { die1, die2, total } = state.lastRoll;
  const isSeven = total === 7;
  const rollStats = isSeven
    ? {
        producedByRes: {} as Partial<Record<ResourceType, number>>,
        goldHexes: 0,
        blockedHexes: 0,
      }
    : state.topology.hexOrder.reduce<{
        readonly producedByRes: Partial<Record<ResourceType, number>>;
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
          return {
            ...acc,
            producedByRes: {
              ...acc.producedByRes,
              [res]: (acc.producedByRes[res] ?? 0) + 1,
            },
          };
        },
        { producedByRes: {}, goldHexes: 0, blockedHexes: 0 }
      );

  const prodEntries = RESOURCES.filter(
    (r) => (rollStats.producedByRes[r] ?? 0) > 0
  );
  const yieldsHtml = isSeven
    ? `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#ef4444", 18)} 7 rolled · robber active</span>`
    : prodEntries.length > 0 || rollStats.goldHexes > 0
      ? [
          ...prodEntries.map(
            (r) =>
              `<span class="map-yield-chip" title="${RESOURCE_META[r].label} hex produced">${renderMiniResourceCardSvg(r, 36, 23)}${
                (rollStats.producedByRes[r] ?? 0) > 1
                  ? ` ×${rollStats.producedByRes[r]}`
                  : ""
              }</span>`
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

  return `
      <div class="map-dice-hud ${isSeven ? "map-dice-hud--seven" : "map-dice-hud--rolled"}">
        <div class="map-dice-hud__row">
          ${renderDieSvg(die1, 34)}
          ${renderDieSvg(die2, 34)}
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
      const harbor = state.harbors.find((h) => {
        const he = state.topology.edges[h.edgeId];
        return he && (he.v1 === spot.id || he.v2 === spot.id);
      });
      const spotTitle = harbor
        ? harbor.type === "generic"
          ? "3:1 Harbor spot"
          : `2:1 ${RESOURCE_META[harbor.type].label} port`
        : existing
          ? existing.type === "city"
            ? "Fortified city"
            : "Settlement"
          : "Island intersection";
      const titleHtml = `${renderActionPieceIconSvg(existing?.type === "city" ? "city" : "settlement", existing ? state.players.find((p) => p.id === existing.ownerId)?.color ?? pColor : pColor, 18)} <span>${spotTitle}</span>`;

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

      const actionItems = [
        canSetupSettleHere
          ? `<button type="button" data-spot-action="setup_settlement" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("settlement", pColor, 18)} <span>Place starting settlement</span></button>`
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
            ${renderCostPipStripPure(BUILDING_COSTS.city)}
          </button>`
          : "",
        canWallHere
          ? `<button type="button" data-spot-action="build_wall" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("wall", pColor, 18)} Build city wall</span>
            ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
          </button>`
          : "",
      ].filter(Boolean);

      const hintHtml = (() => {
        if (actionItems.length > 0) return "";
        if (
          existing &&
          existing.ownerId === actingPlayer.id &&
          existing.type === "settlement" &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.city)
        ) {
          return `
            <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span>City upgrade needs</span>
              ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.city)}
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

    const actionItems = [
      canRobHere
        ? `<button type="button" data-spot-action="move_robber" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", pColor, 18)} <span>Move robber here</span></button>`
        : "",
      canPirateHere
        ? `<button type="button" data-spot-action="move_pirate" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("pirate", pColor, 18)} <span>Move pirate here</span></button>`
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

  return `
      <div class="ga-trade-head">
        <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">
          <span class="player-dot" style="background: ${fromP.color}"></span>
          <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(fromP.name)} trade offer</strong>
          ${responderChipsHtml}
        </div>
        <span class="t-label muted">${statusLabel}</span>
      </div>

      <div class="ga-res-matrix">
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
      </div>

      <div class="ga-trade-preview">
        <span class="t-label muted">Inspect the map above while deciding on this trade</span>
        <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto;">
          ${
            canRespond
              ? `
                <button type="button" data-decline-trade="${actingPlayer.id}" class="btn btn--secondary btn--sm">Decline</button>
                <button type="button" data-accept-trade="${actingPlayer.id}" class="btn btn--primary btn--sm action-btn-graphic" ${
                  !hasResources(actingPlayer.resources, offer.want)
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
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg(model.setupEdgeKind, pColor, 22)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Click a pulsing edge next to your settlement to place a starting ${model.setupEdgeKind}.</span>
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

  if (state.phase === "DISCARD_ON_SEVEN") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Roll of 7:</strong> Resolving discards...</span></div>`;
    }
    const req = state.pendingDiscards[actingPlayer.id] ?? 0;
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
      </div>`;
  }

  if (state.phase === "PRE_ROLL") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn--sm action-btn-graphic">${renderRollDiceButtonGraphicSvg(24)} <span>Roll dice</span></button>
        </div>`;
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
  isActing: boolean
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

  const hiddenCardIconSvg = `<svg width="13" height="15" viewBox="0 0 14 16" aria-hidden="true"><rect x="1.5" y="1" width="11" height="14" rx="2.2" fill="#27272a" stroke="#a1a1aa" stroke-width="1.2"/><path d="M4.2 4.5h5.6M4.2 8h5.6M4.2 11.5h3.6" stroke="#fb923c" stroke-width="1.1" stroke-linecap="round"/></svg>`;

  return `
      <div class="player-card ${isActing ? "active-turn" : ""}">
        <div class="player-header">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span class="player-dot" style="background: ${p.color}"></span>
            <strong class="player-card__name">${escapeAttr(p.name)}</strong>
            <span class="ga-chip">${botBadge}</span>
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
  const actingPlayerId = usesServer
    ? room.remoteActingPlayerId ?? getActingPlayerIdPure(room.gameId, rawState)
    : getActingPlayerIdPure(room.gameId, rawState);
  const isMyTurn = canControlPlayerOnDevicePure(
    rawModel,
    room,
    actingPlayerId
  );
  const model: AppModel = !isMyTurn
    ? {
        ...rawModel,
        buildMode: null,
        selectedMoveFromEdgeId: null,
      }
    : rawModel;

  const controllableHumans = rawState.players.filter(
    (p: any) => !p.isBot && canControlPlayerOnDevicePure(model, room, p.id)
  );
  const controllableHumansCount = controllableHumans.length;
  const rawActingPlayer =
    rawState.players.find((p: any) => p.id === actingPlayerId) ?? null;

  const effectiveViewerId = ((): string | null => {
    if (rawState.phase === "GAME_OVER") return null;
    if (controllableHumansCount >= 2 && model.hidePassAndPlayHand) return null;
    if (isMyTurn && rawActingPlayer && !rawActingPlayer.isBot) {
      return rawActingPlayer.id;
    }
    if (controllableHumansCount === 1) {
      return controllableHumans[0]!.id;
    }
    return null;
  })();

  const state =
    room.gameId === "catan"
      ? CatanEngine.getPlayerView(rawState as CatanState, effectiveViewerId)
      : rawState;

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
  const undoableSteps = usesServer
    ? isMyTurn
      ? room.undoableSteps
      : 0
    : isMyTurn && actingPlayerId && room.session
      ? room.session.getUndoableStepCount(actingPlayerId)
      : 0;
  const canUndo = isMyTurn && undoableSteps > 0;
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
                           ? " (You)"
                           : isMyTurn && !actingPlayer.isBot
                             ? " (Local)"
                             : ""
                       }</strong>`
                    : `<strong style="font-weight: 500;">Match complete</strong>`
                }
                <span class="ga-chip">${formatPhaseLabel(state.phase)}</span>
                ${
                  room.gameId === "catan"
                    ? state.lastRoll
                      ? `<span style="display: inline-flex; align-items: center; gap: 5px;">
                          ${renderDieSvg(state.lastRoll.die1, 22)}
                          ${renderDieSvg(state.lastRoll.die2, 22)}
                          <span class="ga-chip ga-chip--warn ga-num">Roll ${
                            state.lastRoll.total
                          }</span>
                        </span>`
                      : `<span class="ga-chip">Awaiting dice roll</span>`
                    : room.gameId === "splendor"
                      ? `<span class="ga-chip ga-num">Round ${state.round} · Target ${state.config.targetPoints}</span>`
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
                ${
                  room.gameId === "catan" && controllableHumansCount >= 2
                    ? `<button type="button" id="btn-toggle-hand-privacy" class="btn btn--secondary btn--sm">
                        ${model.hidePassAndPlayHand ? "Show hand" : "Hide hand"}
                      </button>`
                    : ""
                }
                <button type="button" id="btn-undo" class="btn btn--secondary btn--sm ga-num" title="${
                  canUndo
                    ? "Undo your last reversible step in this turn"
                    : "Undo is only available during your turn for steps after a dice roll or card reveal"
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
              ${
                room.gameId === "catan"
                  ? `
                    ${renderCatanMapDiceHudPure(state as CatanState)}
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
                      }
                    )}
                    ${renderCatanSpotPopoverPure(
                      model,
                      state as CatanState,
                      isMyTurn ? actingPlayer : mySeatedPlayer ?? actingPlayer,
                      catanLegalActions
                    )}
                    ${
                      isMyTurn
                        ? renderCatanMapDecisionPopupPure(
                            model,
                            state as CatanState,
                            actingPlayer,
                            catanLegalActions
                          )
                        : ""
                    }
                  `
                  : room.gameId === "splendor"
                    ? renderSplendorBoardView(
                        state as SplendorState,
                        isMyTurn ? model.splendorDraftGems : {}
                      )
                    : renderAzulBoardView(
                        state as AzulState,
                        isMyTurn ? model.azulSelectedDraft : null
                      )
              }
            </div>

            <div class="action-dock">
              ${
                state.phase !== "GAME_OVER" && !isMyTurn
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
            <div class="ga-inline-summary" title="${escapeAttr(summaryInfo.ruleChips.join(" · "))}">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                <strong style="font-size: var(--t-label); font-weight: 500;">${summaryInfo.formatTitle}</strong>
                <span class="t-label muted ga-num">${summaryInfo.seatsLabel} · T${state.turn} · ${summaryInfo.targetLabel}</span>
              </div>
              <div class="ga-inline-summary__chips">
                ${summaryInfo.ruleChips
                  .map((chip) => `<span class="ga-chip">${escapeAttr(chip)}</span>`)
                  .join("")}
              </div>
              ${
                room.status === "finished" && isOwner
                  ? `<button type="button" id="btn-sidebar-edit-setup" class="btn btn--secondary btn--sm" style="width: 100%;">Edit setup for next game</button>`
                  : ""
              }
            </div>

            <div class="ga-sidebar__head">
              <span>Standings (${state.players.length})</span>
              <span class="ga-num">${
                room.gameId === "catan"
                  ? `Target ${state.config.targetVictoryPoints} VP`
                  : room.gameId === "splendor"
                    ? `Target ${state.config.targetPoints} VP`
                    : `5×5 wall`
              }</span>
            </div>
            <div class="ga-standings-list">
              ${state.players
                .map((p: any) =>
                  room.gameId === "catan"
                    ? renderCatanPlayerCardPure(
                        model.currentUserId,
                        state as CatanState,
                        p,
                        p.id === actingPlayerId
                      )
                    : room.gameId === "splendor"
                      ? renderSplendorPlayerCard(
                          state as SplendorState,
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

            ${
              room.gameId === "catan"
                ? `
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
            `
                : ""
            }

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
          </aside>
        </div>
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
  lobbyGameFilter: "all" | SupportedGameId;
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
  autoRespondBotsToHuman: boolean;
  autoPlaySpeedMs: number;
  render(): void;
  signInAsGuest(rawName?: string, existingGuestId?: string): boolean;
  startSoloGameFromLogin(rawName?: string): boolean;
  startOfflineLocalFromLogin(rawName?: string): boolean;
  openAddGuestView(): void;
  switchActiveGuest(guestId: string): void;
  signOutGuest(): void;
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
  });

  if (model.isAuthenticated) {
    saveDeviceGuestsToStorage(model.deviceGuests);
  }

  let ws: WebSocket | null = null;
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let setupSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let autoPlayTimer: ReturnType<typeof setInterval> | null = null;
  let botResponseTimeout: ReturnType<typeof setTimeout> | null = null;

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
    const ok = signInAsGuest(fallbackName);
    if (!ok) return false;
    model = { ...model, createRoomMode: "offline" };
    const room = createLocalRoom({
      name: `${model.currentUserName}'s solo table`,
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
    const ok = signInAsGuest(fallbackName);
    if (!ok) return false;
    model = { ...model, createRoomMode: "offline" };
    const room = createLocalRoom({
      name: `${model.currentUserName}'s local table`,
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

  const signOutGuest = (): void => {
    stopAutoPlay();
    if (model.useServerBackend && model.activeRoomId) {
      const active = model.rooms[model.activeRoomId];
      if (
        active &&
        !active.isOfflineLocal &&
        active.status !== "in_progress" &&
        model.deviceGuests.length <= 1
      ) {
        void fetch(
          `/api/rooms/${encodeURIComponent(model.activeRoomId)}/leave`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: model.currentUserId }),
          }
        ).catch(() => {});
      }
      sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
    }
    clearGuestSessionFromStorage();
    model = resetSubModesPure({
      ...model,
      isAuthenticated: false,
      addingAdditionalGuest: false,
      loginErrorMsg: "",
      loginDraftName: `Guest ${100 + Math.floor(Math.random() * 900)}`,
      viewMode: "login",
    });
    render();
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
    const cleanName =
      model.createRoomName.trim() ||
      `${model.createRoomGameId} table ${model.nextRoomNum}`;

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
              name: cleanName,
              gameId: model.createRoomGameId,
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
          model = resetSubModesPure({
            ...upserted.model,
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
            name: cleanName,
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
            activeRoomId: fallbackRoom.roomId,
            viewMode: "room_setup",
          });
          render();
        }
      })();
      return;
    }

    const room = createLocalRoom({
      name: cleanName,
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
  };

  const enterOrJoinRoom = (roomId: string): void => {
    stopAutoPlay();
    const room = model.rooms[roomId];
    if (!room) return;
    model = { ...model, activeRoomId: roomId };

    if (roomUsesServerPure(model, room)) {
      void (async () => {
        try {
          let latestRoom = room;
          if (room.status === "lobby" || room.status === "finished") {
            const joinRes = await fetch(
              `/api/rooms/${encodeURIComponent(roomId)}/join`,
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
              `/api/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(model.currentUserId)}`
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

          sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId,
            playerId: model.currentUserId,
          });
          model = resetSubModesPure({
            ...model,
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

    model = enterOfflineRoomPure(model, roomId);
    render();
  };

  const leaveActiveRoom = (): void => {
    const room = getActiveRoomPure(model);
    if (!room) return;
    stopAutoPlay();

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
      !hasResources(actor.resources, state.activeTradeOffer.want)
    ) {
      dispatch(actor.id, {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId: state.activeTradeOffer.id,
      });
      return;
    }

    if (!model.autoRespondBotsToHuman || model.autoPlayBots) return;
    if (actor && actor.isBot) {
      botResponseTimeout = setTimeout(() => {
        stepOneBotMove();
      }, 140);
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
      if (playerId !== actingId && !isTradeProposerAction) {
        return;
      }
    }
    dispatch(playerId, action);
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
    const actingId = getActingPlayerIdPure(room.gameId, rawState);
    if (
      !actingId ||
      !canControlPlayerOnDevicePure(model, room, actingId) ||
      !room.session.canPlayerUndo(actingId)
    ) {
      return;
    }
    room.session.undoForPlayer(actingId);
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

  const bindCommonIdentityEvents = (): void => {
    bindDropdownEventsOnRoot(root);
    root
      .querySelector("#sel-user-identity")
      ?.addEventListener("change", (e) => {
        const selectedId = (e.target as HTMLSelectElement).value;
        switchActiveGuest(selectedId);
      });

    root.querySelector("#btn-add-guest")?.addEventListener("click", () => {
      openAddGuestView();
    });

    root.querySelector("#btn-sign-out")?.addEventListener("click", () => {
      signOutGuest();
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
  };

  const bindLobbyEvents = (): void => {
    bindCommonIdentityEvents();

    root.querySelectorAll("[data-lobby-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        const filter = el.getAttribute("data-lobby-filter") as
          | "all"
          | SupportedGameId;
        model = {
          ...model,
          lobbyGameFilter: filter,
          createRoomGameId:
            filter !== "all" ? filter : model.createRoomGameId,
        };
        render();
      });
    });

    root
      .querySelector("#inp-create-room-name")
      ?.addEventListener("input", (e) => {
        model = {
          ...model,
          createRoomName: (e.target as HTMLInputElement).value,
        };
      });

    root
      .querySelector("#sel-create-room-game")
      ?.addEventListener("change", (e) => {
        model = {
          ...model,
          createRoomGameId: (e.target as HTMLSelectElement)
            .value as SupportedGameId,
        };
        render();
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
      root.querySelector("#setup-room-name")?.addEventListener("input", (e) => {
        const nextName = (e.target as HTMLInputElement).value;
        model = updateRoomInModelPure(model, room.roomId, (r) => ({
          ...r,
          name: nextName,
        }));
        const latest = model.rooms[room.roomId];
        if (latest) pushServerRoomSetup(latest, 250);
      });

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
            rebuildRoomSeatsPure({ ...r, gameId: nextGame })
          );
          const latest = model.rooms[room.roomId];
          if (latest) pushServerRoomSetup(latest);
          render();
        });

      root
        .querySelector("#setup-sel-scenario")
        ?.addEventListener("change", (e) => {
          const nextScenario = (e.target as HTMLSelectElement)
            .value as ScenarioId;
          model = updateRoomInModelPure(model, room.roomId, (r) =>
            rebuildRoomSeatsPure({
              ...r,
              config: { ...r.config, scenarioId: nextScenario },
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
        .querySelector("#setup-chk-allbots")
        ?.addEventListener("change", (e) => {
          const checked = (e.target as HTMLInputElement).checked;
          model = updateRoomInModelPure(model, room.roomId, (r) =>
            rebuildRoomSeatsPure({
              ...r,
              allBots: checked,
              botCount:
                checked && r.botCount < bounds.minPlayers
                  ? Math.min(bounds.maxPlayers, 4)
                  : r.botCount,
            })
          );
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
        const activePlayer = state.players[state.activePlayerIndex]!;
        const excess =
          Object.values(activePlayer.tokens).reduce((a, b) => a + b, 0) - 10;
        if (excess === 1) {
          dispatch(actingPlayerId, {
            type: "RETURN_TOKENS",
            tokens: { [c]: 1 },
          });
        } else {
          const botAct = SplendorEngine.chooseBotAction(state, actingPlayerId);
          if (botAct) dispatch(actingPlayerId, botAct);
        }
      });
    });

    root.querySelectorAll("[data-sp-noble]").forEach((el) => {
      el.addEventListener("click", () => {
        const nobleId = el.getAttribute("data-sp-noble")!;
        dispatch(actingPlayerId, { type: "SELECT_NOBLE", nobleId });
      });
    });
  };

  const bindAzulEvents = (_state: AzulState, actingPlayerId: string): void => {
    root.querySelectorAll("[data-azul-factory]").forEach((el) => {
      el.addEventListener("click", () => {
        const factoryIndex = Number(el.getAttribute("data-azul-factory"));
        const color = el.getAttribute("data-azul-color") as AzulTileColor;
        model = {
          ...model,
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

  const bindCatanEvents = (state: CatanState, actingPlayerId: string): void => {
    const room = getActiveRoomPure(model);
    if (!canControlPlayerOnDevicePure(model, room, actingPlayerId)) {
      bindReadOnlyCatanSpotInspect();
      return;
    }

    root.querySelectorAll("[data-close-submodal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        model = { ...model, selectedBoardSpot: null, buildMode: null };
        render();
      });
    });

    root.querySelectorAll("[data-hand-res-card]").forEach((cardEl) => {
      cardEl.addEventListener("click", () => {
        const r = cardEl.getAttribute("data-hand-res-card") as ResourceType;
        const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
        if (!actingPlayer || actingPlayer.resources[r] <= 0) return;

        if (state.phase === "DISCARD_ON_SEVEN") {
          const req = state.pendingDiscards[actingPlayerId] ?? 0;
          if (
            model.discardSelection[r] < actingPlayer.resources[r] &&
            totalResourceCount(model.discardSelection) < req
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
          const ratios = getPlayerTradeRatios(state, actingPlayerId);
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
          const legals =
            model.setupEdgeKind === "ship" && state.config.enableSeafarers
              ? getLegalShipEdges(state, actingPlayerId, anchor)
              : getLegalRoadEdges(state, actingPlayerId, anchor);
          if (legals.includes(edgeId)) {
            dispatch(actingPlayerId, {
              type: "PLACE_SETUP_EDGE",
              edgeId,
              edgeKind: model.setupEdgeKind,
            });
            return;
          }
        } else if (state.phase === "ROAD_BUILDING_DEV") {
          const isRoad = getLegalRoadEdges(
            state,
            actingPlayerId,
            null
          ).includes(edgeId);
          const isShip = getLegalShipEdges(
            state,
            actingPlayerId,
            null
          ).includes(edgeId);
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
      model = { ...model, discardSelection: emptyResources() };
      render();
    });

    root.querySelector("#btn-discard-submit")?.addEventListener("click", () => {
      dispatch(actingPlayerId, {
        type: "DISCARD_CARDS",
        resources: { ...model.discardSelection },
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

    root.querySelector("#btn-dom-reset")?.addEventListener("click", () => {
      model = {
        ...model,
        maritimeGive: emptyResources(),
        maritimeWant: emptyResources(),
        domesticGive: emptyResources(),
        domesticWant: emptyResources(),
      };
      render();
    });

    root.querySelector("#btn-dom-propose")?.addEventListener("click", () => {
      dispatch(actingPlayerId, {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: null,
        give: { ...model.domesticGive },
        want: { ...model.domesticWant },
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

    root.querySelector("#btn-maritime-reset")?.addEventListener("click", () => {
      model = {
        ...model,
        maritimeGive: emptyResources(),
        maritimeWant: emptyResources(),
        domesticGive: emptyResources(),
        domesticWant: emptyResources(),
      };
      render();
    });

    root.querySelector("#btn-exec-maritime")?.addEventListener("click", () => {
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

  if (model.useServerBackend && model.isAuthenticated) {
    void fetchLobbyRooms();
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
    set lobbyGameFilter(v: "all" | SupportedGameId) {
      model = { ...model, lobbyGameFilter: v };
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
      model = { ...model, createRoomGameId: v };
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
    signOutGuest,
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
