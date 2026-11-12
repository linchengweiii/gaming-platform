import {
  type BotDifficulty,
  MatchSession,
  type PlayerDescriptor,
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

type SupportedGameId = "catan" | "splendor" | "azul";
type AppViewMode = "login" | "lobby" | "room_setup" | "in_game";

export interface MultiGamePlatformAppOptions {
  startAtLogin?: boolean;
  forceLocalMode?: boolean;
  staticHostOnly?: boolean;
}

interface GuestSession {
  id: string;
  name: string;
  mode: "guest";
}

const GUEST_STORAGE_KEY = "ga_guest_session";
const DEVICE_GUESTS_STORAGE_KEY = "ga_device_guests";

type BuildMode =
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

interface ClientRoom {
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
  config: {
    scenarioId: ScenarioId;
    enableHarbormaster: boolean;
    enableCityWalls: boolean;
    enableFriendlyRobber: boolean;
  };
  seed: string;
  matchCounter: number;
  session: MatchSession<any, any, any> | null;
  remoteState: any | null;
  remoteActingPlayerId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  step: number;
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

const USER_PROFILES: Array<{ id: string; name: string; roleHint: string }> = [
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

function escapeAttr(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderDropdown(spec: DropdownSpec): string {
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

function formatPhaseLabel(phase: string): string {
  const clean = phase.replace(/_/g, " ").toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

class MultiGamePlatformApp {
  private root: HTMLElement;
  private viewMode: AppViewMode = "lobby";
  private lobbyGameFilter: "all" | SupportedGameId = "all";
  private lobbyHeroEnteredOnce = false;
  private loginHeroEnteredOnce = false;

  // Guest session, multi-host device profiles & server realtime sync state
  private useServerBackend = false;
  private staticHostOnly = false;
  private serverReachable = true;
  private isAuthenticated = true;
  private addingAdditionalGuest = false;
  private returnViewAfterAddGuest: AppViewMode = "lobby";
  private loginDraftName = "";
  private loginErrorMsg = "";
  private currentUserId = "p1";
  private currentUserName = "Player 1 (You)";
  private deviceGuests: GuestSession[] = [];
  private localFriendDraftName = "";
  private hidePassAndPlayHand = false;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private setupSyncTimer: ReturnType<typeof setTimeout> | null = null;

  // New Room creation form state in Lobby
  private createRoomName = "Catan harbour table";
  private createRoomGameId: SupportedGameId = "catan";
  private createRoomMode: "online" | "offline" = "online";

  // Client-side Room Registry
  private rooms = new Map<string, ClientRoom>();
  private nextRoomNum = 1;
  private activeRoomId: string = "room-1";

  // In-game Catan UI interaction state
  private buildMode: BuildMode = null;
  private selectedBoardSpot: {
    kind: "edge" | "vertex" | "hex";
    id: string;
  } | null = null;
  private setupEdgeKind: "road" | "ship" = "road";
  private robberOrPirateMode: "robber" | "pirate" = "robber";
  private selectedMoveFromEdgeId: string | null = null;
  private discardSelection: ResourceMap = emptyResources();
  private tradeGiveRes: ResourceType = "brick";
  private tradeReceiveRes: ResourceType = "ore";
  private domesticGive: ResourceMap = emptyResources();
  private domesticWant: ResourceMap = emptyResources();
  private domesticTargetPlayerId: string = "all";
  private yopRes1: ResourceType = "grain";
  private yopRes2: ResourceType = "ore";
  private monoRes: ResourceType = "ore";

  // Splendor UI state
  private splendorDraftGems: Partial<Record<GemColor, number>> = {};

  // Azul UI state
  private azulSelectedDraft: {
    source: AzulDraftSource;
    color: AzulTileColor;
  } | null = null;

  // Bot simulation & auto-response timers
  private autoPlayBots = false;
  private autoRespondBotsToHuman = true;
  private autoPlaySpeedMs = 150;
  private autoPlayTimer: ReturnType<typeof setInterval> | null = null;
  private botResponseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement, options?: MultiGamePlatformAppOptions) {
    this.root = root;
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

    this.staticHostOnly = isStaticHost;
    this.useServerBackend = isBrowserHttp && !isStaticHost;
    this.serverReachable = !isStaticHost;
    this.createRoomMode = this.useServerBackend ? "online" : "offline";
    this.loginDraftName = `Guest ${100 + Math.floor(Math.random() * 900)}`;

    this.deviceGuests = this.loadDeviceGuests();
    const savedGuest = this.loadSavedGuestSession();
    if (savedGuest) {
      this.currentUserId = savedGuest.id;
      this.currentUserName = savedGuest.name;
      this.loginDraftName = savedGuest.name;
      this.upsertDeviceGuest(savedGuest);
      this.isAuthenticated = true;
      this.viewMode = "lobby";
    } else if (options?.startAtLogin !== undefined) {
      this.isAuthenticated = !options.startAtLogin;
      this.viewMode = options.startAtLogin ? "login" : "lobby";
      if (this.isAuthenticated) {
        this.upsertDeviceGuest({
          id: this.currentUserId,
          name: this.currentUserName,
          mode: "guest",
        });
      }
    } else if (isBrowserHttp || isStaticHost) {
      this.isAuthenticated = false;
      this.viewMode = "login";
    } else {
      this.upsertDeviceGuest({
        id: this.currentUserId,
        name: this.currentUserName,
        mode: "guest",
      });
    }

    if (!this.useServerBackend && !this.staticHostOnly) {
      this.seedInitialLobbyRooms();
    }
    this.registerGlobalDropdownDismiss();
    this.render();

    if (this.useServerBackend && this.isAuthenticated) {
      void this.fetchLobbyRooms();
    }
  }

  private roomUsesServer(room: ClientRoom): boolean {
    return this.useServerBackend && !room.isOfflineLocal;
  }

  private loadDeviceGuests(): GuestSession[] {
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

  private saveDeviceGuests(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage?.setItem(
        DEVICE_GUESTS_STORAGE_KEY,
        JSON.stringify(this.deviceGuests)
      );
    } catch {
      // Ignore storage errors
    }
  }

  private upsertDeviceGuest(session: GuestSession): void {
    const idx = this.deviceGuests.findIndex((g) => g.id === session.id);
    if (idx >= 0) {
      this.deviceGuests[idx] = session;
    } else {
      this.deviceGuests.push(session);
    }
    this.saveDeviceGuests();
  }

  private loadSavedGuestSession(): GuestSession | null {
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

  private saveGuestSession(session: GuestSession): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage?.setItem(
        GUEST_STORAGE_KEY,
        JSON.stringify(session)
      );
    } catch {
      // Ignore storage errors
    }
  }

  private clearGuestSession(): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage?.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  public signInAsGuest(rawName?: string, existingGuestId?: string): boolean {
    const clean = (rawName ?? this.loginDraftName).trim();
    if (!clean) {
      this.loginErrorMsg = "Enter a guest display name to continue.";
      this.render();
      return false;
    }

    const matchedById = existingGuestId
      ? this.deviceGuests.find((g) => g.id === existingGuestId)
      : undefined;
    const matchedByName = !matchedById
      ? this.deviceGuests.find(
          (g) => g.name.toLowerCase() === clean.slice(0, 28).toLowerCase()
        )
      : undefined;

    const session: GuestSession = matchedById
      ? { id: matchedById.id, name: clean.slice(0, 28), mode: "guest" }
      : matchedByName
        ? { id: matchedByName.id, name: clean.slice(0, 28), mode: "guest" }
        : {
            id: `guest-${Math.random().toString(36).slice(2, 8)}-${Date.now() % 10000}`,
            name: clean.slice(0, 28),
            mode: "guest",
          };

    this.currentUserId = session.id;
    this.currentUserName = session.name;
    this.loginDraftName = session.name;
    this.loginErrorMsg = "";
    this.isAuthenticated = true;
    this.addingAdditionalGuest = false;
    this.saveGuestSession(session);
    this.upsertDeviceGuest(session);

    if (!this.useServerBackend && this.rooms.size > 0) {
      const first = this.rooms.get("room-1");
      if (first && first.status === "lobby" && first.ownerId === "p1") {
        first.ownerId = this.currentUserId;
        first.ownerName = this.currentUserName;
        first.humanPlayers = [
          {
            id: this.currentUserId,
            name: this.currentUserName,
            color: PLAYER_COLORS[0]!,
            isBot: false,
          },
        ];
        this.rebuildRoomSeats(first);
      }
    }

    this.viewMode = "lobby";
    this.render();

    if (this.useServerBackend) {
      void this.fetchLobbyRooms();
    }
    return true;
  }

  public startSoloGameFromLogin(rawName?: string): boolean {
    const fallbackName = (rawName ?? this.loginDraftName).trim() || "Player 1";
    const ok = this.signInAsGuest(fallbackName);
    if (!ok) return false;
    this.createRoomMode = "offline";
    const room = this.createLocalRoom({
      name: `${this.currentUserName}'s solo table`,
      gameId: this.createRoomGameId,
      ownerId: this.currentUserId,
      ownerName: this.currentUserName,
      isOfflineLocal: true,
      botCount: 3,
      startingPlayerMode: "random",
      autoStart: false,
    });
    this.activeRoomId = room.roomId;
    this.viewMode = "room_setup";
    this.resetSubModes();
    this.render();
    return true;
  }

  public startOfflineLocalFromLogin(rawName?: string): boolean {
    const fallbackName = (rawName ?? this.loginDraftName).trim() || "Player 1";
    const ok = this.signInAsGuest(fallbackName);
    if (!ok) return false;
    this.createRoomMode = "offline";
    const room = this.createLocalRoom({
      name: `${this.currentUserName}'s local table`,
      gameId: this.createRoomGameId,
      ownerId: this.currentUserId,
      ownerName: this.currentUserName,
      isOfflineLocal: true,
      botCount: 0,
      startingPlayerMode: "random",
      autoStart: false,
    });
    this.activeRoomId = room.roomId;
    this.viewMode = "room_setup";
    this.resetSubModes();
    this.render();
    return true;
  }

  public openAddGuestView(): void {
    this.stopAutoPlay();
    this.returnViewAfterAddGuest =
      this.viewMode === "login" ? "lobby" : this.viewMode;
    this.addingAdditionalGuest = true;
    this.loginErrorMsg = "";
    this.loginDraftName = `Guest ${this.deviceGuests.length + 1}`;
    this.viewMode = "login";
    this.render();
  }

  public switchActiveGuest(guestId: string): void {
    const found =
      this.deviceGuests.find((g) => g.id === guestId) ??
      USER_PROFILES.find((u) => u.id === guestId);
    if (!found) return;

    this.currentUserId = found.id;
    this.currentUserName = found.name;
    const session: GuestSession = {
      id: found.id,
      name: found.name,
      mode: "guest",
    };
    this.saveGuestSession(session);
    this.upsertDeviceGuest(session);

    const active = this.rooms.get(this.activeRoomId);
    if (
      active &&
      this.roomUsesServer(active) &&
      (this.viewMode === "room_setup" || this.viewMode === "in_game")
    ) {
      this.sendWsMessage({
        type: "SUBSCRIBE_ROOM",
        roomId: active.roomId,
        playerId: this.currentUserId,
      });
      void fetch(
        `/api/rooms/${encodeURIComponent(active.roomId)}?playerId=${encodeURIComponent(this.currentUserId)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.room) {
            this.upsertRoomFromSummary(
              data.room,
              data.state,
              data.actingPlayerId
            );
            this.render();
          }
        })
        .catch(() => {});
    }

    this.render();
  }

  public signOutGuest(): void {
    this.stopAutoPlay();
    if (this.useServerBackend && this.activeRoomId) {
      const active = this.rooms.get(this.activeRoomId);
      if (
        active &&
        !active.isOfflineLocal &&
        active.status !== "in_progress" &&
        this.deviceGuests.length <= 1
      ) {
        void fetch(
          `/api/rooms/${encodeURIComponent(this.activeRoomId)}/leave`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: this.currentUserId }),
          }
        ).catch(() => {});
      }
      this.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
    }
    this.clearGuestSession();
    this.isAuthenticated = false;
    this.addingAdditionalGuest = false;
    this.loginErrorMsg = "";
    this.loginDraftName = `Guest ${100 + Math.floor(Math.random() * 900)}`;
    this.viewMode = "login";
    this.resetSubModes();
    this.render();
  }

  private sendWsMessage(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private syncOnlineLobbyRooms(summaries: any[]): void {
    const incomingIds = new Set(summaries.map((s) => s.roomId));
    for (const [id, existing] of this.rooms.entries()) {
      if (!existing.isOfflineLocal && !incomingIds.has(id)) {
        this.rooms.delete(id);
      }
    }
    for (const s of summaries) {
      this.upsertRoomFromSummary(s);
    }
  }

  private connectServerRealtime(): void {
    if (!this.useServerBackend || typeof WebSocket === "undefined") return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}`);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.serverReachable = true;
      const active = this.rooms.get(this.activeRoomId);
      if (
        (this.viewMode === "room_setup" || this.viewMode === "in_game") &&
        active &&
        !active.isOfflineLocal
      ) {
        this.sendWsMessage({
          type: "SUBSCRIBE_ROOM",
          roomId: active.roomId,
          playerId: this.currentUserId,
        });
      }
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "LOBBY_ROOMS" && Array.isArray(msg.rooms)) {
          this.syncOnlineLobbyRooms(msg.rooms);
          if (this.viewMode === "lobby") {
            this.renderPreservingFocus();
          }
        } else if (msg.type === "ROOM_STATE" && msg.room) {
          const prevStatus = this.rooms.get(msg.room.roomId)?.status;
          const updated = this.upsertRoomFromSummary(
            msg.room,
            msg.state,
            msg.actingPlayerId
          );
          if (updated.roomId === this.activeRoomId) {
            if (
              this.viewMode === "room_setup" &&
              prevStatus !== "in_progress" &&
              updated.status === "in_progress"
            ) {
              this.viewMode = "in_game";
              this.resetSubModes();
            }
            if (updated.status === "finished") {
              this.stopAutoPlay();
            }
            this.renderPreservingFocus();
          }
        }
      } catch {
        // Ignore malformed frame
      }
    });

    ws.addEventListener("close", () => {
      if (this.ws === ws) {
        this.ws = null;
      }
      if (this.isAuthenticated && this.useServerBackend) {
        if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
        this.wsReconnectTimer = setTimeout(
          () => this.connectServerRealtime(),
          1500
        );
      }
    });
  }

  private renderPreservingFocus(): void {
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
    this.render();
  }

  private upsertRoomFromSummary(
    summary: any,
    remoteState?: any,
    remoteActingPlayerId?: string | null
  ): ClientRoom {
    const existing = this.rooms.get(summary.roomId);
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
        summary.autoStepBots !== undefined
          ? Boolean(summary.autoStepBots)
          : true,
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
      canRedo:
        summary.canRedo !== undefined
          ? Boolean(summary.canRedo)
          : (existing?.canRedo ?? false),
      step:
        typeof summary.step === "number" ? summary.step : (existing?.step ?? 0),
    };

    this.rooms.set(room.roomId, room);
    this.autoRespondBotsToHuman = room.autoStepBots;
    return room;
  }

  private async fetchLobbyRooms(): Promise<void> {
    if (!this.useServerBackend) return;
    try {
      const res = await fetch("/api/rooms");
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("application/json")) {
        // Running on a static host without the Node/Bun room backend
        this.staticHostOnly = true;
        this.useServerBackend = false;
        this.serverReachable = false;
        this.createRoomMode = "offline";
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = null;
        }
        if (this.viewMode === "lobby") {
          this.renderPreservingFocus();
        }
        return;
      }
      this.serverReachable = true;
      this.connectServerRealtime();
      const data = await res.json();
      if (Array.isArray(data.rooms)) {
        this.syncOnlineLobbyRooms(data.rooms);
        if (this.viewMode === "lobby") {
          this.renderPreservingFocus();
        }
      }
    } catch {
      this.serverReachable = false;
      this.createRoomMode = "offline";
      if (this.viewMode === "lobby") {
        this.renderPreservingFocus();
      }
    }
  }

  private registerGlobalDropdownDismiss(): void {
    if (typeof document === "undefined") return;
    document.addEventListener("pointerdown", (e) => {
      const target = e.target as Node | null;
      this.root.querySelectorAll(".ga-dropdown.is-open").forEach((dd) => {
        if (!target || !dd.contains(target)) {
          this.closeDropdownElement(dd as HTMLElement);
        }
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.root.querySelectorAll(".ga-dropdown.is-open").forEach((dd) => {
          const trigger = dd.querySelector(
            ".ga-dropdown__trigger"
          ) as HTMLButtonElement | null;
          this.closeDropdownElement(dd as HTMLElement);
          trigger?.focus();
        });
      }
    });
  }

  private closeDropdownElement(dd: HTMLElement): void {
    dd.classList.remove("is-open");
    const trigger = dd.querySelector(
      ".ga-dropdown__trigger"
    ) as HTMLButtonElement | null;
    const menu = dd.querySelector(".ga-dropdown__menu") as HTMLElement | null;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
  }

  private seedInitialLobbyRooms(): void {
    this.createLocalRoom({
      name: "Island of Catan — Table 1",
      gameId: "catan",
      ownerId: "p1",
      ownerName: "Player 1 (You)",
      botCount: 3,
      startingPlayerMode: "first",
      scenarioId: "standard",
      autoStart: false,
    });

    this.createLocalRoom({
      name: "Four Islands — Seafarers",
      gameId: "catan",
      ownerId: "host-nemo",
      ownerName: "Captain Nemo",
      botCount: 3,
      scenarioId: "seafarers_four_islands",
      enableHarbormaster: true,
      autoStart: false,
    });

    this.createLocalRoom({
      name: "Florence Gem Market",
      gameId: "splendor",
      ownerId: "host-lorenzo",
      ownerName: "Lorenzo",
      botCount: 3,
      autoStart: false,
    });

    this.createLocalRoom({
      name: "Evora Courtyard Wall",
      gameId: "azul",
      ownerId: "host-manuel",
      ownerName: "Manuel",
      botCount: 3,
      autoStart: false,
    });
  }

  public getRoomBounds(room: {
    gameId: SupportedGameId;
    config: { scenarioId: ScenarioId };
  }): { minPlayers: number; maxPlayers: number } {
    if (room.gameId === "catan") {
      const sc = SCENARIO_CATALOG[room.config.scenarioId];
      return { minPlayers: sc.minPlayers, maxPlayers: sc.maxPlayers };
    }
    return { minPlayers: 2, maxPlayers: 4 };
  }

  private createLocalRoom(opts: {
    name: string;
    gameId: SupportedGameId;
    ownerId: string;
    ownerName: string;
    isOfflineLocal?: boolean;
    botCount?: number;
    allBots?: boolean;
    botDifficulty?: BotDifficulty;
    startingPlayerMode?: string;
    scenarioId?: ScenarioId;
    enableHarbormaster?: boolean;
    enableCityWalls?: boolean;
    enableFriendlyRobber?: boolean;
    autoStart?: boolean;
  }): ClientRoom {
    const roomId = `room-${this.nextRoomNum++}`;
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

    const room: ClientRoom = {
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
      seed: `arena-${roomId}-${Date.now() % 10000}`,
      matchCounter: 0,
      session: null,
      remoteState: null,
      remoteActingPlayerId: null,
      canUndo: false,
      canRedo: false,
      step: 0,
    };

    this.rebuildRoomSeats(room);
    this.rooms.set(roomId, room);
    if (opts.autoStart) {
      this.startRoomMatch(roomId);
    }
    return room;
  }

  private getEngineForGame(gameId: SupportedGameId): any {
    if (gameId === "splendor") return SplendorEngine;
    if (gameId === "azul") return AzulEngine;
    return CatanEngine;
  }

  private getActiveRoom(): ClientRoom {
    return (
      this.rooms.get(this.activeRoomId) ??
      Array.from(this.rooms.values())[0]!
    );
  }

  private getRoomState(room: ClientRoom): any | null {
    if (this.roomUsesServer(room)) {
      return room.remoteState;
    }
    return room.session?.getState() ?? null;
  }

  private canControlPlayerOnThisDevice(
    room: ClientRoom,
    playerId: string | null
  ): boolean {
    if (!playerId) return false;
    if (!this.roomUsesServer(room) || room.allBots) {
      return true;
    }
    if (playerId === this.currentUserId) {
      return true;
    }
    const seat = room.players.find((p) => p.id === playerId);
    return Boolean(seat && seat.controllerId === this.currentUserId);
  }

  private getActingPlayerId(gameId: SupportedGameId, state: any): string | null {
    if (gameId === "splendor") return getSplendorActingPlayerId(state);
    if (gameId === "azul") return getAzulActingPlayerId(state);
    return getNextActingPlayerId(state);
  }

  private rebuildRoomSeats(room: ClientRoom): void {
    if (room.status === "in_progress") return;

    const bounds = this.getRoomBounds(room);
    if (
      room.gameId === "catan" &&
      room.config.scenarioId === "big_island_5_6" &&
      room.humanPlayers.length + room.botCount < 5
    ) {
      room.botCount = Math.max(room.botCount, 5 - room.humanPlayers.length);
    }

    const nextPlayers: PlayerDescriptor[] = [];

    if (room.allBots) {
      room.botCount = Math.max(
        bounds.minPlayers,
        Math.min(bounds.maxPlayers, room.botCount || 4)
      );
      for (let i = 0; i < room.botCount; i++) {
        nextPlayers.push({
          id: `p${i + 1}`,
          name: `Bot ${i + 1}`,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        });
      }
    } else {
      if (room.humanPlayers.length === 0 && room.ownerId) {
        room.humanPlayers.push({
          id: room.ownerId,
          name: room.ownerName,
          color: PLAYER_COLORS[0]!,
          isBot: false,
        });
      }
      room.humanPlayers = room.humanPlayers.slice(0, bounds.maxPlayers);
      const maxBots = Math.max(0, bounds.maxPlayers - room.humanPlayers.length);
      room.botCount = Math.max(0, Math.min(maxBots, room.botCount));

      for (const h of room.humanPlayers) {
        const idx = nextPlayers.length;
        nextPlayers.push({
          ...h,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
          isBot: false,
        });
      }

      for (let b = 0; b < room.botCount; b++) {
        const idx = nextPlayers.length;
        const defaultId = `p${idx + 1}`;
        const finalId = nextPlayers.some((p) => p.id === defaultId)
          ? `bot-${b + 1}`
          : defaultId;
        nextPlayers.push({
          id: finalId,
          name: `Bot ${b + 1}`,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        });
      }
    }

    room.players = nextPlayers;
    if (
      room.startingPlayerMode !== "random" &&
      room.startingPlayerMode !== "first" &&
      !room.players.some((p) => p.id === room.startingPlayerMode)
    ) {
      room.startingPlayerMode = "random";
    }
  }

  private pushServerRoomSetup(room: ClientRoom, debounceMs = 0): void {
    if (!this.roomUsesServer(room)) return;
    if (this.setupSyncTimer) {
      clearTimeout(this.setupSyncTimer);
      this.setupSyncTimer = null;
    }
    const send = async () => {
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/setup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requesterId: this.currentUserId,
              name: room.name,
              gameId: room.gameId,
              botCount: room.botCount,
              allBots: room.allBots,
              botDifficulty: room.botDifficulty,
              startingPlayerMode: room.startingPlayerMode,
              config: room.config,
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.room) {
            this.upsertRoomFromSummary(data.room);
            this.renderPreservingFocus();
          }
        }
      } catch {
        // Ignore transient network errors
      }
    };
    if (debounceMs > 0) {
      this.setupSyncTimer = setTimeout(() => void send(), debounceMs);
    } else {
      void send();
    }
  }

  public addLocalFriendToRoom(room: ClientRoom, rawName: string): void {
    const cleanName = rawName.trim() || `Player ${room.humanPlayers.length + 1}`;
    const bounds = this.getRoomBounds(room);
    if (room.humanPlayers.length >= bounds.maxPlayers) return;

    if (this.roomUsesServer(room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(room.roomId)}/local-players`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: this.currentUserId,
                playerName: cleanName.slice(0, 28),
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Unable to add local player");
            return;
          }
          this.localFriendDraftName = "";
          this.upsertRoomFromSummary(data.room);
          this.render();
        } catch (err: any) {
          alert(`Unable to add local player: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    const localId = `local-${Math.random().toString(36).slice(2, 7)}-${room.humanPlayers.length + 1}`;
    room.humanPlayers.push({
      id: localId,
      name: cleanName.slice(0, 28),
      color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
      isBot: false,
      controllerId: room.ownerId,
    });
    this.localFriendDraftName = "";
    this.rebuildRoomSeats(room);
    this.render();
  }

  public removePlayerFromRoom(room: ClientRoom, targetPlayerId: string): void {
    if (targetPlayerId === room.ownerId) return;

    if (this.roomUsesServer(room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(room.roomId)}/remove-player`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: this.currentUserId,
                targetPlayerId,
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Unable to remove player");
            return;
          }
          this.upsertRoomFromSummary(data.room);
          this.render();
        } catch (err: any) {
          alert(`Unable to remove player: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    room.humanPlayers = room.humanPlayers.filter(
      (p) => p.id !== targetPlayerId
    );
    this.rebuildRoomSeats(room);
    this.render();
  }

  private createAndOpenRoom(): void {
    const cleanName =
      this.createRoomName.trim() ||
      `${this.createRoomGameId} table ${this.nextRoomNum}`;

    const openAsOfflineLocal =
      this.createRoomMode === "offline" ||
      !this.useServerBackend ||
      !this.serverReachable;

    if (!openAsOfflineLocal) {
      void (async () => {
        try {
          const res = await fetch("/api/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: cleanName,
              gameId: this.createRoomGameId,
              ownerId: this.currentUserId,
              hostName: this.currentUserName,
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
          const created = this.upsertRoomFromSummary(
            data.room,
            data.state,
            data.actingPlayerId
          );
          this.activeRoomId = created.roomId;
          this.sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: created.roomId,
            playerId: this.currentUserId,
          });
          this.viewMode =
            created.status === "in_progress" ? "in_game" : "room_setup";
          this.resetSubModes();
          this.render();
        } catch {
          // Automatic offline fallback if the server becomes unreachable
          this.serverReachable = false;
          this.createRoomMode = "offline";
          const fallbackRoom = this.createLocalRoom({
            name: cleanName,
            gameId: this.createRoomGameId,
            ownerId: this.currentUserId,
            ownerName: this.currentUserName,
            isOfflineLocal: true,
            botCount: 0,
            startingPlayerMode: "random",
            autoStart: false,
          });
          this.activeRoomId = fallbackRoom.roomId;
          this.viewMode = "room_setup";
          this.resetSubModes();
          this.render();
        }
      })();
      return;
    }

    const room = this.createLocalRoom({
      name: cleanName,
      gameId: this.createRoomGameId,
      ownerId: this.currentUserId,
      ownerName: this.currentUserName,
      isOfflineLocal: true,
      botCount: 0,
      startingPlayerMode: "random",
      autoStart: false,
    });
    this.activeRoomId = room.roomId;
    this.viewMode = "room_setup";
    this.resetSubModes();
    this.render();
  }

  private enterOrJoinRoom(roomId: string): void {
    this.stopAutoPlay();
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.activeRoomId = roomId;

    if (this.roomUsesServer(room)) {
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
                  playerId: this.currentUserId,
                  playerName: this.currentUserName,
                }),
              }
            );
            const joinData = await joinRes.json();
            if (!joinRes.ok) {
              alert(joinData.error ?? "Unable to join room");
              return;
            }
            latestRoom = this.upsertRoomFromSummary(
              joinData.room,
              joinData.state,
              joinData.actingPlayerId
            );
          } else {
            const getRes = await fetch(
              `/api/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(this.currentUserId)}`
            );
            if (getRes.ok) {
              const getData = await getRes.json();
              latestRoom = this.upsertRoomFromSummary(
                getData.room,
                getData.state,
                getData.actingPlayerId
              );
            }
          }

          this.sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId,
            playerId: this.currentUserId,
          });
          this.viewMode =
            latestRoom.status === "in_progress" ? "in_game" : "room_setup";
          this.resetSubModes();
          this.render();
        } catch (err: any) {
          alert(`Unable to enter room: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    if (room.status === "lobby" || room.status === "finished") {
      const alreadySeated = room.humanPlayers.some(
        (p) => p.id === this.currentUserId
      );
      const bounds = this.getRoomBounds(room);
      if (
        !alreadySeated &&
        !room.allBots &&
        room.humanPlayers.length < bounds.maxPlayers
      ) {
        room.humanPlayers.push({
          id: this.currentUserId,
          name: this.currentUserName,
          color:
            PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
          isBot: false,
        });
        this.rebuildRoomSeats(room);
      }
      this.viewMode = "room_setup";
    } else {
      this.viewMode = "in_game";
    }
    this.resetSubModes();
    this.render();
  }

  private leaveActiveRoom(): void {
    const room = this.getActiveRoom();
    if (!room) return;
    this.stopAutoPlay();

    if (this.roomUsesServer(room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(room.roomId)}/leave`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId: this.currentUserId }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.closed) {
              this.rooms.delete(room.roomId);
            }
          }
        } catch {
          // Ignore network errors
        }
        this.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
        this.viewMode = "lobby";
        this.resetSubModes();
        await this.fetchLobbyRooms();
        this.render();
      })();
      return;
    }

    if (room.status !== "in_progress") {
      room.humanPlayers = room.humanPlayers.filter(
        (p) =>
          p.id !== this.currentUserId && p.controllerId !== this.currentUserId
      );
      if (room.humanPlayers.length === 0 && !room.allBots) {
        this.rooms.delete(room.roomId);
        const remaining = Array.from(this.rooms.keys())[0];
        this.activeRoomId = remaining ?? "";
      } else {
        if (room.ownerId === this.currentUserId && room.humanPlayers.length > 0) {
          room.ownerId = room.humanPlayers[0]!.id;
          room.ownerName = room.humanPlayers[0]!.name;
        }
        this.rebuildRoomSeats(room);
      }
    }
    this.viewMode = "lobby";
    this.resetSubModes();
    this.render();
  }

  private startRoomMatch(roomId: string): void {
    this.stopAutoPlay();
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (this.roomUsesServer(room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(roomId)}/start`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterId: this.currentUserId }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Cannot start match");
            return;
          }
          this.upsertRoomFromSummary(
            data.room,
            data.state,
            data.actingPlayerId
          );
          this.activeRoomId = roomId;
          this.sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId,
            playerId: this.currentUserId,
          });
          this.viewMode = "in_game";
          this.resetSubModes();
          this.render();
        } catch (err: any) {
          alert(`Unable to start match: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    this.rebuildRoomSeats(room);
    const bounds = this.getRoomBounds(room);
    if (room.players.length < bounds.minPlayers) {
      return;
    }

    const engine = this.getEngineForGame(room.gameId);
    let startingPlayerIndex: number | undefined;
    let randomizeStartingPlayer = false;
    if (room.startingPlayerMode === "first") {
      startingPlayerIndex = 0;
    } else if (room.startingPlayerMode === "random") {
      randomizeStartingPlayer = true;
    } else {
      const idx = room.players.findIndex(
        (p) => p.id === room.startingPlayerMode
      );
      if (idx >= 0) {
        startingPlayerIndex = idx;
      } else {
        randomizeStartingPlayer = true;
      }
    }

    const engineConfig =
      room.gameId === "catan"
        ? {
            scenarioId: room.config.scenarioId,
            enableHarbormaster: room.config.enableHarbormaster,
            enableCityWalls: room.config.enableCityWalls,
            enableFriendlyRobber: room.config.enableFriendlyRobber,
            startingPlayerIndex,
            randomizeStartingPlayer,
          }
        : { startingPlayerIndex, randomizeStartingPlayer };

    const matchSeed =
      room.matchCounter === 0
        ? room.seed
        : `${room.seed}-g${room.matchCounter}`;
    room.matchCounter += 1;

    const initialState = engine.initGame(room.players, engineConfig, matchSeed);

    room.session = new MatchSession(engine, initialState, true);
    room.status = "in_progress";
    this.activeRoomId = roomId;
    this.viewMode = "in_game";
    this.resetSubModes();
    this.render();
    this.scheduleBotAutoResponseIfNeeded();
  }

  private resetSubModes(): void {
    this.buildMode = null;
    this.selectedBoardSpot = null;
    this.selectedMoveFromEdgeId = null;
    this.discardSelection = emptyResources();
    this.domesticGive = emptyResources();
    this.domesticWant = emptyResources();
    this.domesticTargetPlayerId = "all";
    this.splendorDraftGems = {};
    this.azulSelectedDraft = null;
  }

  private dispatch(playerId: string, action: any): void {
    const room = this.getActiveRoom();
    if (this.roomUsesServer(room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(room.roomId)}/action`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId, action }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(`Action error: ${data.error ?? "Illegal action"}`);
            return;
          }
          this.upsertRoomFromSummary(
            data.room,
            data.state,
            data.actingPlayerId
          );
          this.resetSubModes();
          this.render();
        } catch (err: any) {
          alert(`Action error: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    if (!room.session) return;
    try {
      const prevActorId = this.getActingPlayerId(
        room.gameId,
        room.session.getState()
      );
      const result = room.session.dispatch(playerId, action);
      const nextActorId = this.getActingPlayerId(room.gameId, result.state);
      if (result.state.phase === "GAME_OVER") {
        room.status = "finished";
      } else if (
        room.gameId === "catan" &&
        prevActorId !== nextActorId &&
        result.state.players.filter((p: any) => !p.isBot).length >= 2
      ) {
        const nextActor = result.state.players.find(
          (p: any) => p.id === nextActorId
        );
        if (nextActor && !nextActor.isBot && this.hidePassAndPlayHand) {
          this.hidePassAndPlayHand = true;
        }
      }
      this.resetSubModes();
      this.render();
      this.scheduleBotAutoResponseIfNeeded();
    } catch (err: any) {
      alert(`Action error: ${err?.message ?? String(err)}`);
    }
  }

  private scheduleBotAutoResponseIfNeeded(): void {
    const room = this.getActiveRoom();
    if (!room || this.roomUsesServer(room)) return; // Server steps bots centrally for online rooms
    if (this.botResponseTimeout) {
      clearTimeout(this.botResponseTimeout);
      this.botResponseTimeout = null;
    }
    if (!this.autoRespondBotsToHuman || this.autoPlayBots) return;
    if (!room.session || this.viewMode !== "in_game") return;
    const state = room.session.getState();
    if (state.phase === "GAME_OVER") return;

    const actorId = this.getActingPlayerId(room.gameId, state);
    const actor = state.players.find((p: any) => p.id === actorId);
    if (actor && actor.isBot) {
      this.botResponseTimeout = setTimeout(() => {
        this.stepOneBotMove();
      }, 140);
    }
  }

  private stepOneBotMove(): boolean {
    const room = this.getActiveRoom();
    if (this.roomUsesServer(room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/bot-step`,
          { method: "POST" }
        );
        if (res.ok) {
          const data = await res.json();
          this.upsertRoomFromSummary(
            data.room,
            data.state,
            data.actingPlayerId
          );
          this.resetSubModes();
          this.render();
        }
      })();
      return true;
    }

    if (!room.session) return false;
    const state = room.session.getState();
    if (state.phase === "GAME_OVER") {
      room.status = "finished";
      this.stopAutoPlay();
      return false;
    }
    const actorId = this.getActingPlayerId(room.gameId, state);
    if (!actorId) return false;
    const engine = this.getEngineForGame(room.gameId);
    const action = engine.chooseBotAction(state, actorId);
    if (!action) return false;
    const res = room.session.dispatch(actorId, action);
    if (res.state.phase === "GAME_OVER") {
      room.status = "finished";
    }
    this.resetSubModes();
    this.render();
    this.scheduleBotAutoResponseIfNeeded();
    return true;
  }

  private finishSetupWithBots(): void {
    const room = this.getActiveRoom();
    if (this.roomUsesServer(room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/finish-setup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: this.currentUserId }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          this.upsertRoomFromSummary(
            data.room,
            data.state,
            data.actingPlayerId
          );
          this.resetSubModes();
          this.render();
        }
      })();
      return;
    }

    if (!room.session || room.gameId !== "catan") return;
    let guard = 0;
    while (
      room.session.getState().phase.startsWith("SETUP_") &&
      guard < 40
    ) {
      const state = room.session.getState();
      const actorId = getNextActingPlayerId(state);
      if (!actorId) break;
      const action = CatanEngine.chooseBotAction(state, actorId);
      if (!action) break;
      room.session.dispatch(actorId, action);
      guard++;
    }
    this.resetSubModes();
    this.render();
    this.scheduleBotAutoResponseIfNeeded();
  }

  private undoMatch(): void {
    const room = this.getActiveRoom();
    this.stopAutoPlay();
    if (this.roomUsesServer(room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/undo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: this.currentUserId }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          this.upsertRoomFromSummary(
            data.room,
            data.state,
            data.actingPlayerId
          );
          this.resetSubModes();
          this.render();
        }
      })();
      return;
    }
    room.session?.undo();
    this.resetSubModes();
    this.render();
  }

  private redoMatch(): void {
    const room = this.getActiveRoom();
    this.stopAutoPlay();
    if (this.roomUsesServer(room)) {
      void (async () => {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.roomId)}/redo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requesterId: this.currentUserId }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          this.upsertRoomFromSummary(
            data.room,
            data.state,
            data.actingPlayerId
          );
          this.resetSubModes();
          this.render();
        }
      })();
      return;
    }
    room.session?.redo();
    this.resetSubModes();
    this.render();
  }

  private toggleAutoRespondBots(): void {
    const room = this.getActiveRoom();
    const next = !this.autoRespondBotsToHuman;
    this.autoRespondBotsToHuman = next;
    room.autoStepBots = next;
    if (this.roomUsesServer(room)) {
      void fetch(`/api/rooms/${encodeURIComponent(room.roomId)}/auto-bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      }).catch(() => {});
    }
    this.render();
    this.scheduleBotAutoResponseIfNeeded();
  }

  private toggleAutoPlay(): void {
    if (this.autoPlayBots) {
      this.stopAutoPlay();
    } else {
      this.autoPlayBots = true;
      this.autoPlayTimer = setInterval(() => {
        const room = this.getActiveRoom();
        const state = this.getRoomState(room);
        if (!state) {
          this.stopAutoPlay();
          return;
        }
        if (state.phase === "GAME_OVER") {
          room.status = "finished";
          this.stopAutoPlay();
          this.render();
          return;
        }
        this.stepOneBotMove();
      }, this.autoPlaySpeedMs);
    }
    this.render();
  }

  private stopAutoPlay(): void {
    this.autoPlayBots = false;
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
    if (this.botResponseTimeout) {
      clearTimeout(this.botResponseTimeout);
      this.botResponseTimeout = null;
    }
  }

  public render(): void {
    if (!this.isAuthenticated || this.viewMode === "login") {
      this.renderLoginView();
      this.loginHeroEnteredOnce = true;
      return;
    }
    if (this.viewMode === "lobby") {
      this.renderLobbyView();
      this.lobbyHeroEnteredOnce = true;
      return;
    }
    if (this.viewMode === "room_setup") {
      this.renderRoomSetupView();
      return;
    }
    this.renderInGameView();
  }

  /**
   * VIEW 0: GUEST LOGIN PAGE
   */
  private renderLoginView(): void {
    const enterAttr = this.loginHeroEnteredOnce ? "" : "data-enter";
    const heroTitle = this.addingAdditionalGuest
      ? "Add another guest on this computer."
      : "Enter Game Arena as a guest.";
    const heroLead = this.addingAdditionalGuest
      ? "Create a second guest profile on this computer to host another table or join an open room."
      : "Sign in as a guest to host an online table, represent multiple hosts on one computer, or play offline with local friends.";

    this.root.innerHTML = `
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
            <h2>${this.addingAdditionalGuest ? "New guest profile" : "Guest sign-in"}</h2>
            <span class="ga-chip ga-chip--accent">Guest mode</span>
          </div>

          <div class="ga-field">
            <label for="inp-guest-name">Guest display name</label>
            <input
              type="text"
              id="inp-guest-name"
              class="ga-input"
              maxlength="28"
              value="${escapeAttr(this.loginDraftName)}"
              placeholder="Enter your display name"
              autocomplete="nickname"
            />
          </div>

          ${
            this.loginErrorMsg
              ? `<div id="login-error" class="ga-login-error" role="alert">${escapeAttr(this.loginErrorMsg)}</div>`
              : ""
          }

          <div style="display: flex; flex-direction: column; gap: var(--s-2);">
            <button type="submit" id="btn-guest-login" class="btn btn--primary" style="width: 100%;">
              ${this.addingAdditionalGuest ? "Save and switch guest" : "Continue as guest"}${DRAWN_ARROW_SVG}
            </button>

            ${
              !this.addingAdditionalGuest
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
            this.deviceGuests.length > 0
              ? `
                <div class="ga-saved-guests">
                  <span class="t-label muted">Guests on this computer</span>
                  <div class="ga-saved-guests__list">
                    ${this.deviceGuests
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

    this.root
      .querySelector("#inp-guest-name")
      ?.addEventListener("input", (e) => {
        this.loginDraftName = (e.target as HTMLInputElement).value;
        if (this.loginErrorMsg) {
          this.loginErrorMsg = "";
        }
      });

    this.root
      .querySelector("#form-guest-login")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        this.signInAsGuest(this.loginDraftName);
      });

    this.root
      .querySelector("#btn-start-solo-game")
      ?.addEventListener("click", () => {
        this.startSoloGameFromLogin(this.loginDraftName);
      });

    this.root
      .querySelector("#btn-start-offline-local")
      ?.addEventListener("click", () => {
        this.startOfflineLocalFromLogin(this.loginDraftName);
      });

    this.root
      .querySelector("#btn-cancel-add-guest")
      ?.addEventListener("click", () => {
        this.addingAdditionalGuest = false;
        this.loginErrorMsg = "";
        this.viewMode = this.returnViewAfterAddGuest;
        this.render();
      });

    this.root.querySelectorAll("[data-select-saved-guest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const guestId = btn.getAttribute("data-select-saved-guest")!;
        const found = this.deviceGuests.find((g) => g.id === guestId);
        if (found) {
          this.signInAsGuest(found.name, found.id);
        }
      });
    });
  }

  private renderTopbarUserSelector(): string {
    const seenIds = new Set<string>();
    const options: DropdownOption[] = [];

    const pushProfile = (id: string, name: string, fallbackMeta: string) => {
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      const hostedCount = Array.from(this.rooms.values()).filter(
        (r) => r.ownerId === id
      ).length;
      options.push({
        value: id,
        label: name,
        meta:
          hostedCount > 0
            ? hostedCount === 1
              ? "1 room"
              : `${hostedCount} rooms`
            : fallbackMeta,
      });
    };

    pushProfile(this.currentUserId, this.currentUserName, "Active");
    for (const g of this.deviceGuests) {
      pushProfile(g.id, g.name, "Guest");
    }
    if (!this.useServerBackend && !this.staticHostOnly) {
      for (const u of USER_PROFILES) {
        pushProfile(u.id, u.name, u.roleHint);
      }
    }

    return `
      <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">
        ${
          this.staticHostOnly
            ? `<span class="ga-chip ga-chip--ok">Solo and local play</span>`
            : this.useServerBackend && !this.serverReachable
              ? `<span class="ga-chip ga-chip--warn">Offline mode</span>`
              : ""
        }
        <label class="ga-inline-label" for="sel-user-identity-btn">Guest</label>
        ${renderDropdown({
          id: "sel-user-identity",
          value: this.currentUserId,
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

  /**
   * VIEW 1: PLATFORM LOBBY
   */
  private renderLobbyView(): void {
    const roomsList = Array.from(this.rooms.values()).filter(
      (r) =>
        this.lobbyGameFilter === "all" || r.gameId === this.lobbyGameFilter
    );
    const enterAttr = this.lobbyHeroEnteredOnce ? "" : "data-enter";
    const effectiveMode: "online" | "offline" =
      !this.useServerBackend || !this.serverReachable
        ? "offline"
        : this.createRoomMode;
    const modeOptions: DropdownOption[] =
      this.useServerBackend && this.serverReachable
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

    this.root.innerHTML = `
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
            ${this.renderTopbarUserSelector()}
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
              <dd class="ga-num">${this.rooms.size}</dd>
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
              this.lobbyGameFilter === "all" ? "selected" : ""
            }" data-lobby-filter="all">
              <div class="game-select-card__top">
                <span class="game-select-card__title">All games</span>
                <span class="ga-chip ga-num">${this.rooms.size}</span>
              </div>
              <span class="game-select-card__desc">Browse every active and open table across Catan, Splendor, and Azul.</span>
            </button>

            <button type="button" class="game-select-card ${
              this.lobbyGameFilter === "catan" ? "selected" : ""
            }" data-lobby-filter="catan">
              <div class="game-select-card__top">
                <span class="game-select-card__title">Settlers of Catan</span>
                <span class="ga-chip">2–6 players</span>
              </div>
              <span class="game-select-card__desc">Base island, 5–6 player extension, Seafarers scenarios, Harbormaster, and City walls.</span>
            </button>

            <button type="button" class="game-select-card ${
              this.lobbyGameFilter === "splendor" ? "selected" : ""
            }" data-lobby-filter="splendor">
              <div class="game-select-card__top">
                <span class="game-select-card__title">Splendor</span>
                <span class="ga-chip">2–4 players</span>
              </div>
              <span class="game-select-card__desc">Draft gem tokens, acquire mine cards across three tiers, and earn 15 prestige points.</span>
            </button>

            <button type="button" class="game-select-card ${
              this.lobbyGameFilter === "azul" ? "selected" : ""
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
                this.createRoomName
              )}" placeholder="Name your table" />
            </div>

            <div class="ga-field">
              <label for="sel-create-room-game-btn">Board game</label>
              ${renderDropdown({
                id: "sel-create-room-game",
                value: this.createRoomGameId,
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
                  ? `Opens a local room on this computer with <strong>${escapeAttr(this.currentUserName)}</strong> as host. Add bots for a solo game or add local friends to pass and play.`
                  : `Opens an online room with <strong>${escapeAttr(this.currentUserName)}</strong> as host. Choose bots, local friends, and starting player on the setup screen.`
              }
            </p>

            <button type="button" id="btn-create-room" class="btn btn--primary" style="width: 100%;">
              Create room${DRAWN_ARROW_SVG}
            </button>
          </aside>

          <div class="ga-surface-card">
            <div class="ga-section-bar">
              <h2>Open rooms</h2>
              <span class="t-label muted">Signed in as <strong style="color: var(--ink); font-weight: 500;">${escapeAttr(this.currentUserName)}</strong></span>
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
                          r.ownerId && r.ownerId === this.currentUserId
                        );
                        const isJoinedGuest =
                          !isOwner &&
                          r.humanPlayers.some(
                            (p) => p.id === this.currentUserId
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
                        const bounds = this.getRoomBounds(r);
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

    this.bindCommonIdentityEvents();

    this.root.querySelectorAll("[data-lobby-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        this.lobbyGameFilter = el.getAttribute("data-lobby-filter") as
          | "all"
          | SupportedGameId;
        this.defaultGameOnFilter();
        this.render();
      });
    });

    this.root
      .querySelector("#inp-create-room-name")
      ?.addEventListener("input", (e) => {
        this.createRoomName = (e.target as HTMLInputElement).value;
      });

    this.root
      .querySelector("#sel-create-room-game")
      ?.addEventListener("change", (e) => {
        this.createRoomGameId = (e.target as HTMLSelectElement)
          .value as SupportedGameId;
        this.render();
      });

    this.root
      .querySelector("#sel-create-room-mode")
      ?.addEventListener("change", (e) => {
        this.createRoomMode = (e.target as HTMLSelectElement).value as
          | "online"
          | "offline";
        this.render();
      });

    this.root
      .querySelector("#btn-create-room")
      ?.addEventListener("click", () => {
        this.createAndOpenRoom();
      });

    this.root.querySelectorAll("[data-join-room]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rId = btn.getAttribute("data-join-room")!;
        this.enterOrJoinRoom(rId);
      });
    });

    this.root.querySelectorAll("[data-start-room-direct]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rId = btn.getAttribute("data-start-room-direct")!;
        this.startRoomMatch(rId);
      });
    });
  }

  private defaultGameOnFilter(): void {
    if (this.lobbyGameFilter !== "all") {
      this.createRoomGameId = this.lobbyGameFilter;
    }
  }

  /**
   * Shared room navigation header used identically by both Setup and Game views
   * so switching tabs produces zero horizontal or vertical layout jump.
   */
  private renderRoomHeader(
    room: ClientRoom,
    activeTab: "setup" | "game"
  ): string {
    const hasMatchState = Boolean(this.getRoomState(room));
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
            ${this.renderTopbarUserSelector()}
          </div>
        </div>
      </header>
    `;
  }

  private getStartingPlayerSummaryLabel(room: ClientRoom, state: any): string {
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

  private getRoomSetupSummaryData(room: ClientRoom): {
    gameTitle: string;
    formatTitle: string;
    formatDescription: string;
    targetLabel: string;
    seatsLabel: string;
    seatsSubLabel: string;
    ruleChips: string[];
  } {
    const state = this.getRoomState(room);
    const humanCount = room.players.filter((p) => !p.isBot).length;
    const botCount = room.players.length - humanCount;
    const diffLabel = BOT_DIFFICULTY_META[room.botDifficulty].label.toLowerCase();
    const seatsLabel = `${room.players.length} ${room.players.length === 1 ? "player" : "players"}`;
    const seatsSubLabel = room.allBots
      ? `All-bot simulation (${diffLabel})`
      : `${humanCount} ${humanCount === 1 ? "human" : "humans"}, ${botCount} ${diffLabel} ${botCount === 1 ? "bot" : "bots"}`;
    const firstTurnChip = this.getStartingPlayerSummaryLabel(room, state);
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
    const ruleChips: string[] = [modeLabel, firstTurnChip];
    if (sc.enableSeafarers) ruleChips.push("Seafarers ships and islands");
    if (sc.enableSpecialBuildingPhase) ruleChips.push("Special building phase");
    if (room.config.enableHarbormaster) ruleChips.push("Harbormaster (+2 VP)");
    if (room.config.enableCityWalls) ruleChips.push("City walls (+2 safe hand)");
    if (room.config.enableFriendlyRobber) ruleChips.push("Friendly robber");
    if (ruleChips.length === 2) ruleChips.push("Standard island rules");

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

  private renderSetupSummaryCard(room: ClientRoom, isOwner: boolean): string {
    const info = this.getRoomSetupSummaryData(room);
    const badgeLabel =
      room.status === "in_progress"
        ? "Match active"
        : `Joined as ${escapeAttr(this.currentUserName)}`;
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

  /**
   * VIEW 2: SETUP PAGE
   * Editable configuration for Room Owner when `status === "lobby"` or `status === "finished"`.
   * Clean Setup Summary (instead of disabled form controls) after joining a room or during an active match.
   */
  private renderRoomSetupView(): void {
    const room = this.getActiveRoom();
    const isOwner = Boolean(
      room.ownerId && room.ownerId === this.currentUserId
    );
    const isEditablePhase =
      room.status === "lobby" || room.status === "finished";
    const canEditSetup = isOwner && isEditablePhase;
    const bounds = this.getRoomBounds(room);
    const humanCount = room.humanPlayers.length;
    const maxBots = room.allBots
      ? bounds.maxPlayers
      : Math.max(0, bounds.maxPlayers - humanCount);
    const minBots = room.allBots ? bounds.minPlayers : 0;

    const botCountOptions: DropdownOption[] = [];
    for (let b = minBots; b <= maxBots; b++) {
      const totalP = room.allBots ? b : humanCount + b;
      botCountOptions.push({
        value: String(b),
        label: room.allBots
          ? `${b} bots`
          : b === 0
            ? "0 bots (humans only)"
            : `${b} ${b === 1 ? "bot" : "bots"}`,
        meta: `${totalP} ${totalP === 1 ? "player" : "players"}`,
      });
    }

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
    const hasMatchState = Boolean(this.getRoomState(room));
    const isSeatedHuman = room.humanPlayers.some(
      (p) => p.id === this.currentUserId
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

    this.root.innerHTML = `
      ${this.renderRoomHeader(room, "setup")}

      <div class="ga-room-shell">
        ${canEditSetup ? editableFormCard : this.renderSetupSummaryCard(room, isOwner)}

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
                    p.id === this.currentUserId
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
                            value="${escapeAttr(this.localFriendDraftName)}"
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
                  : this.roomUsesServer(room)
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

    this.bindCommonIdentityEvents();

    this.root
      .querySelector("#btn-back-lobby")
      ?.addEventListener("click", () => {
        this.viewMode = "lobby";
        if (this.useServerBackend) {
          void this.fetchLobbyRooms().then(() => this.render());
        } else {
          this.render();
        }
      });

    this.root
      .querySelector("#btn-leave-room")
      ?.addEventListener("click", () => {
        this.leaveActiveRoom();
      });

    this.root.querySelector("#tab-game-page")?.addEventListener("click", () => {
      if (this.getRoomState(room)) {
        this.viewMode = "in_game";
        this.render();
      }
    });

    this.root
      .querySelector("#btn-return-active-game")
      ?.addEventListener("click", () => {
        if (this.getRoomState(room)) {
          this.viewMode = "in_game";
          this.render();
        }
      });

    if (canEditSetup) {
      this.root
        .querySelector("#setup-room-name")
        ?.addEventListener("input", (e) => {
          room.name = (e.target as HTMLInputElement).value;
          this.pushServerRoomSetup(room, 250);
        });

      this.root
        .querySelector("#inp-local-friend-name")
        ?.addEventListener("input", (e) => {
          this.localFriendDraftName = (e.target as HTMLInputElement).value;
        });

      this.root
        .querySelector("#inp-local-friend-name")
        ?.addEventListener("keydown", (e) => {
          if ((e as KeyboardEvent).key === "Enter") {
            e.preventDefault();
            this.addLocalFriendToRoom(room, this.localFriendDraftName);
          }
        });

      this.root
        .querySelector("#btn-add-local-friend")
        ?.addEventListener("click", () => {
          this.addLocalFriendToRoom(room, this.localFriendDraftName);
        });

      this.root.querySelectorAll("[data-remove-player]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetId = btn.getAttribute("data-remove-player")!;
          this.removePlayerFromRoom(room, targetId);
        });
      });

      this.root
        .querySelector("#setup-sel-game")
        ?.addEventListener("change", (e) => {
          room.gameId = (e.target as HTMLSelectElement)
            .value as SupportedGameId;
          this.rebuildRoomSeats(room);
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#setup-sel-scenario")
        ?.addEventListener("change", (e) => {
          room.config.scenarioId = (e.target as HTMLSelectElement)
            .value as ScenarioId;
          this.rebuildRoomSeats(room);
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#setup-sel-bots")
        ?.addEventListener("change", (e) => {
          room.botCount = Number((e.target as HTMLSelectElement).value);
          this.rebuildRoomSeats(room);
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#btn-seat-remove-bot")
        ?.addEventListener("click", () => {
          if (room.botCount > 0) {
            room.botCount -= 1;
            this.rebuildRoomSeats(room);
            this.pushServerRoomSetup(room);
            this.render();
          }
        });

      this.root
        .querySelector("#btn-seat-add-bot")
        ?.addEventListener("click", () => {
          if (room.botCount < maxBots) {
            room.botCount += 1;
            this.rebuildRoomSeats(room);
            this.pushServerRoomSetup(room);
            this.render();
          }
        });

      this.root
        .querySelector("#setup-sel-starting-player")
        ?.addEventListener("change", (e) => {
          room.startingPlayerMode = (e.target as HTMLSelectElement).value;
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#setup-sel-bot-difficulty")
        ?.addEventListener("change", (e) => {
          room.botDifficulty = (e.target as HTMLSelectElement)
            .value as BotDifficulty;
          this.rebuildRoomSeats(room);
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#setup-chk-allbots")
        ?.addEventListener("change", (e) => {
          room.allBots = (e.target as HTMLInputElement).checked;
          if (room.allBots && room.botCount < bounds.minPlayers) {
            room.botCount = Math.min(bounds.maxPlayers, 4);
          }
          this.rebuildRoomSeats(room);
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#setup-chk-harbormaster")
        ?.addEventListener("change", (e) => {
          room.config.enableHarbormaster = (
            e.target as HTMLInputElement
          ).checked;
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#setup-chk-citywalls")
        ?.addEventListener("change", (e) => {
          room.config.enableCityWalls = (e.target as HTMLInputElement).checked;
          this.pushServerRoomSetup(room);
          this.render();
        });

      this.root
        .querySelector("#setup-chk-friendlyrobber")
        ?.addEventListener("change", (e) => {
          room.config.enableFriendlyRobber = (
            e.target as HTMLInputElement
          ).checked;
          this.pushServerRoomSetup(room);
          this.render();
        });
    }

    this.root
      .querySelector("#btn-launch-match")
      ?.addEventListener("click", () => {
        this.startRoomMatch(room.roomId);
      });
  }

  /**
   * VIEW 3: ACTIVE GAME TABLE
   */
  private renderInGameView(): void {
    const room = this.getActiveRoom();
    const state = this.getRoomState(room);
    const usesServer = this.roomUsesServer(room);
    if (!state) {
      if (usesServer) {
        this.viewMode = "room_setup";
        this.renderRoomSetupView();
      } else {
        this.startRoomMatch(room.roomId);
      }
      return;
    }

    const engine = this.getEngineForGame(room.gameId);
    const actingPlayerId = usesServer
      ? room.remoteActingPlayerId ?? this.getActingPlayerId(room.gameId, state)
      : this.getActingPlayerId(room.gameId, state);
    const actingPlayer =
      state.players.find((p: any) => p.id === actingPlayerId) ?? null;
    const invariantCheck = engine.checkInvariants(state);

    const mySeatedPlayer =
      state.players.find((p: any) => p.id === this.currentUserId) ?? null;
    const isMyTurn = this.canControlPlayerOnThisDevice(room, actingPlayerId);
    const controllableHumansCount = state.players.filter(
      (p: any) => !p.isBot && this.canControlPlayerOnThisDevice(room, p.id)
    ).length;
    const handPlayer =
      isMyTurn && actingPlayer && !actingPlayer.isBot
        ? actingPlayer
        : mySeatedPlayer ??
          state.players.find((p: any) => !p.isBot) ??
          actingPlayer ??
          state.players[0];

    const localDeviceGuestForTurn =
      !isMyTurn && actingPlayerId
        ? this.deviceGuests.find((g) => g.id === actingPlayerId)
        : undefined;

    const canCancelMyTrade =
      room.gameId === "catan" &&
      Boolean(
        state.activeTradeOffer &&
          this.canControlPlayerOnThisDevice(
            room,
            state.activeTradeOffer.fromPlayerId
          )
      );

    const summaryInfo = this.getRoomSetupSummaryData(room);
    const isOwner = Boolean(
      room.ownerId && room.ownerId === this.currentUserId
    );
    const canUndo = usesServer
      ? room.canUndo
      : Boolean(room.session?.canUndo());
    const canRedo = usesServer
      ? room.canRedo
      : Boolean(room.session?.canRedo());
    const stepNum = usesServer ? room.step : room.session?.getStep() ?? 0;

    const catanLegalActions =
      room.gameId === "catan" && actingPlayerId && isMyTurn
        ? CatanEngine.getLegalActions(state, actingPlayerId)
        : [];
    const boardActingPlayerId = isMyTurn ? actingPlayerId : null;

    this.root.innerHTML = `
      ${this.renderRoomHeader(room, "game")}

      <div class="ga-room-shell ga-room-shell--game">
        <div class="board-container ${
          room.gameId !== "catan" ? "board-container--neutral" : ""
        }">
          <div class="board-banner">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
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
                    ? `<span style="display: inline-flex; align-items: center; gap: 6px;">
                        ${renderDieSvg(state.lastRoll.die1, 24)}
                        ${renderDieSvg(state.lastRoll.die2, 24)}
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

            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
              ${
                room.gameId === "catan" && controllableHumansCount >= 2
                  ? `<button type="button" id="btn-toggle-hand-privacy" class="btn btn--secondary btn--sm">
                      ${this.hidePassAndPlayHand ? "Show hand" : "Hide hand"}
                    </button>`
                  : ""
              }
              <button type="button" id="btn-undo" class="btn btn--secondary btn--sm ga-num" ${
                !canUndo ? "disabled" : ""
              }>Undo (${stepNum})</button>
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
                this.autoRespondBotsToHuman ? "is-selected" : ""
              }">
                Auto-bots: ${this.autoRespondBotsToHuman ? "on" : "off"}
              </button>
              <button type="button" id="btn-step-bot" class="btn btn--secondary btn--sm" ${
                state.phase === "GAME_OVER" ? "disabled" : ""
              }>Step bot</button>
              <button type="button" id="btn-autoplay" class="btn ${
                this.autoPlayBots ? "btn--primary" : "btn--secondary"
              } btn--sm">
                ${this.autoPlayBots ? "Pause sim" : "Auto-sim"}
              </button>
            </div>
          </div>

          <div class="board-svg-wrap" style="overflow-y: auto;">
            ${
              room.gameId === "catan"
                ? `
                  ${this.renderCatanMapDiceHud(state as CatanState)}
                  ${renderCatanBoardSvg(
                    state as CatanState,
                    boardActingPlayerId,
                    {
                      buildMode: isMyTurn ? this.buildMode : null,
                      setupEdgeKind: this.setupEdgeKind,
                      robberOrPirateMode: this.robberOrPirateMode,
                      selectedMoveFromEdgeId: isMyTurn
                        ? this.selectedMoveFromEdgeId
                        : null,
                      selectedSpot: this.selectedBoardSpot,
                    }
                  )}
                  ${this.renderCatanSpotPopover(
                    state as CatanState,
                    isMyTurn ? actingPlayer : mySeatedPlayer ?? actingPlayer,
                    catanLegalActions
                  )}
                  ${
                    isMyTurn || canCancelMyTrade
                      ? this.renderCatanMapDecisionPopup(
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
                      isMyTurn ? this.splendorDraftGems : {}
                    )
                  : renderAzulBoardView(
                      state as AzulState,
                      isMyTurn ? this.azulSelectedDraft : null
                    )
            }
          </div>

          <div class="action-dock">
            ${
              state.phase !== "GAME_OVER" && !isMyTurn
                ? `<div class="action-buttons" style="justify-content: space-between;">
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
                      ${
                        canCancelMyTrade
                          ? `<button type="button" id="btn-cancel-domestic" class="btn btn--secondary btn--sm">Cancel offer</button>`
                          : ""
                      }
                    </div>
                  </div>`
                : room.gameId === "catan"
                  ? this.renderCatanActionDock(
                      state as CatanState,
                      actingPlayer,
                      catanLegalActions
                    )
                  : room.gameId === "splendor"
                    ? renderSplendorActionDock(
                        state as SplendorState,
                        actingPlayer
                      )
                    : renderAzulActionDock(
                        state as AzulState,
                        actingPlayer,
                        this.azulSelectedDraft
                      )
            }
          </div>

          ${
            room.gameId === "catan" && handPlayer
              ? controllableHumansCount >= 2 && this.hidePassAndPlayHand
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
              : ""
          }
        </div>

        <aside class="ga-sidebar">
          <div class="ga-sidebar__head">
            <span>Setup summary</span>
            <span class="ga-num">${summaryInfo.seatsLabel} · Turn ${state.turn}</span>
          </div>
          <div class="ga-inline-summary">
            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
              <strong style="font-size: var(--t-small); font-weight: 500;">${summaryInfo.formatTitle}</strong>
              <span class="t-label muted ga-num">${summaryInfo.targetLabel}</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
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

          <div class="ga-sidebar__head" style="margin-top: 2px;">
            <span>Standings (${state.players.length})</span>
            <span class="ga-num">${
              room.gameId === "catan"
                ? `Target ${state.config.targetVictoryPoints} VP`
                : room.gameId === "splendor"
                  ? `Target ${state.config.targetPoints} VP`
                  : `5×5 wall`
            }</span>
          </div>
          ${state.players
            .map((p: any) =>
              room.gameId === "catan"
                ? this.renderCatanPlayerCard(
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

          ${
            room.gameId === "catan"
              ? `
            <div class="ga-sidebar__head" style="margin-top: 4px;">
              <span>Bank supply and awards</span>
              <span class="ga-num">Dev deck: ${state.devCardDeck.length}</span>
            </div>
            <div class="res-pills">
              ${RESOURCES.map(
                (r) =>
                  `<span class="res-pill res-${r}">${renderResourceGlyphSvg(r)} ${RESOURCE_META[r].label} ${state.bank[r]}</span>`
              ).join("")}
            </div>
            <div class="ga-stat-list">
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

          <div class="ga-sidebar__head" style="margin-top: 4px;">
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
    `;

    this.bindInGameEvents(room, state, actingPlayerId);
  }

  private renderCostPipStrip(cost: Partial<ResourceMap>): string {
    const pips: string[] = [];
    for (const r of RESOURCES) {
      const n = cost[r] ?? 0;
      for (let i = 0; i < n; i++) {
        pips.push(
          `<span class="cost-pip res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r, 11)}</span>`
        );
      }
    }
    return `<span class="cost-pip-strip">${pips.join("")}</span>`;
  }

  private renderResourceColumnHeaders(
    playerResources?: ResourceMap,
    showBank?: ResourceMap
  ): string {
    return `
      <div class="ga-res-matrix__row-label">Resource</div>
      ${RESOURCES.map(
        (r) => `
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
          ${renderMiniResourceCardSvg(r, 52, 34)}
        </div>
      `
      ).join("")}
    `;
  }

  private renderCatanMapDiceHud(state: CatanState): string {
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
    const producedByRes: Partial<Record<ResourceType, number>> = {};
    let goldHexes = 0;
    let blockedHexes = 0;

    if (!isSeven) {
      for (const hId of state.topology.hexOrder) {
        const tile = state.hexes[hId]!;
        if (tile.numberToken !== total) continue;
        if (state.robberHexId === hId) {
          blockedHexes++;
          continue;
        }
        if (tile.terrain === "gold") {
          goldHexes++;
        } else {
          const res = TERRAIN_TO_RESOURCE[tile.terrain];
          if (res) {
            producedByRes[res] = (producedByRes[res] ?? 0) + 1;
          }
        }
      }
    }

    const prodEntries = RESOURCES.filter((r) => (producedByRes[r] ?? 0) > 0);
    let yieldsHtml = "";
    if (isSeven) {
      yieldsHtml = `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#ef4444", 18)} 7 rolled · robber active</span>`;
    } else if (prodEntries.length > 0 || goldHexes > 0) {
      yieldsHtml = [
        ...prodEntries.map(
          (r) =>
            `<span class="map-yield-chip" title="${RESOURCE_META[r].label} hex produced">${renderMiniResourceCardSvg(r, 36, 23)}${
              (producedByRes[r] ?? 0) > 1 ? ` ×${producedByRes[r]}` : ""
            }</span>`
        ),
        goldHexes > 0
          ? `<span class="map-yield-chip">${renderActionPieceIconSvg("year_of_plenty", "#facc15", 18)} Gold ×${goldHexes}</span>`
          : "",
      ]
        .filter(Boolean)
        .join("");
    } else if (blockedHexes > 0) {
      yieldsHtml = `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#f87171", 16)} Blocked by robber</span>`;
    } else {
      yieldsHtml = `<span class="t-label muted">No matching island hex</span>`;
    }

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

  private renderMissingCostBadge(
    have: ResourceMap,
    cost: ResourceMap
  ): string {
    const missing: string[] = [];
    for (const r of RESOURCES) {
      const diff = (cost[r] ?? 0) - (have[r] ?? 0);
      for (let i = 0; i < diff; i++) {
        missing.push(
          `<span class="cost-pip res-${r}" title="Need ${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r, 11)}</span>`
        );
      }
    }
    return `<span class="cost-pip-strip">${missing.join("")}</span>`;
  }

  private renderCatanSpotPopover(
    state: CatanState,
    actingPlayer: CatanState["players"][number] | null,
    legalActions: CatanAction[]
  ): string {
    if (
      !this.selectedBoardSpot ||
      !actingPlayer ||
      state.phase === "GAME_OVER"
    ) {
      return "";
    }

    const spot = this.selectedBoardSpot;
    const { xPct, yPct } = getBoardSpotPercentPosition(state, spot);
    const belowClass = yPct < 36 ? "map-spot-popover--below" : "";
    const pColor = actingPlayer.color;
    const actionItems: string[] = [];
    let titleHtml = "";
    let hintHtml = "";

    if (spot.kind === "edge") {
      const eNode = state.topology.edges[spot.id];
      if (!eNode) return "";
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
      titleHtml = `${renderActionPieceIconSvg(hasSea && !hasLand ? "ship" : "road", pColor, 18)} <span>${spotKindLabel}</span>`;

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
      const moveToHere = this.selectedMoveFromEdgeId
        ? legalActions.some(
            (a) =>
              a.type === "MOVE_SHIP" &&
              a.fromEdgeId === this.selectedMoveFromEdgeId &&
              a.toEdgeId === spot.id
          )
        : false;

      if (canSetupRoadHere) {
        actionItems.push(
          `<button type="button" data-spot-action="setup_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("road", pColor, 18)} <span>Place starting road</span></button>`
        );
      }
      if (canSetupShipHere) {
        actionItems.push(
          `<button type="button" data-spot-action="setup_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("ship", pColor, 18)} <span>Place starting ship</span></button>`
        );
      }
      if (canBuildRoadHere) {
        actionItems.push(
          `<button type="button" data-spot-action="build_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("road", pColor, 18)} Build road</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">Free</span>` : this.renderCostPipStrip(BUILDING_COSTS.road)}
          </button>`
        );
      }
      if (canBuildShipHere) {
        actionItems.push(
          `<button type="button" data-spot-action="build_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("ship", pColor, 18)} Build ship</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">Free</span>` : this.renderCostPipStrip(BUILDING_COSTS.ship)}
          </button>`
        );
      }
      if (moveToHere) {
        actionItems.push(
          `<button type="button" data-spot-action="complete_move_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>Sail ship here</span></button>`
        );
      }
      if (moveFromHere) {
        actionItems.push(
          `<button type="button" data-spot-action="start_move_ship" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>Move this ship</span></button>`
        );
      }

      if (actionItems.length === 0) {
        if (route) {
          const owner = state.players.find((p) => p.id === route.ownerId);
          hintHtml = `<div class="t-label muted" style="display: flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg(route.type, owner?.color ?? pColor, 18)} <span>${owner?.name ?? "Player"} ${route.type}</span></div>`;
        } else {
          const roadGeomOk = getLegalRoadEdges(
            state,
            actingPlayer.id,
            null
          ).includes(spot.id);
          const shipGeomOk =
            state.config.enableSeafarers &&
            getLegalShipEdges(state, actingPlayer.id, null).includes(spot.id);
          if (roadGeomOk && !hasResources(actingPlayer.resources, BUILDING_COSTS.road)) {
            hintHtml = `
              <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span>Road needs</span>
                ${this.renderMissingCostBadge(actingPlayer.resources, BUILDING_COSTS.road)}
              </div>
              ${
                state.phase === "MAIN_PHASE"
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                  : ""
              }
            `;
          } else if (shipGeomOk && !hasResources(actingPlayer.resources, BUILDING_COSTS.ship)) {
            hintHtml = `
              <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span>Ship needs</span>
                ${this.renderMissingCostBadge(actingPlayer.resources, BUILDING_COSTS.ship)}
              </div>
              ${
                state.phase === "MAIN_PHASE"
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                  : ""
              }
            `;
          } else {
            hintHtml = `<div class="t-label muted">Connect a road or ship to build on this edge.</div>`;
          }
        }
      }
    } else if (spot.kind === "vertex") {
      const vNode = state.topology.vertices[spot.id];
      if (!vNode) return "";
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
      titleHtml = `${renderActionPieceIconSvg(existing?.type === "city" ? "city" : "settlement", existing ? state.players.find((p) => p.id === existing.ownerId)?.color ?? pColor : pColor, 18)} <span>${spotTitle}</span>`;

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

      if (canSetupSettleHere) {
        actionItems.push(
          `<button type="button" data-spot-action="setup_settlement" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("settlement", pColor, 18)} <span>Place starting settlement</span></button>`
        );
      }
      if (canSettleHere) {
        actionItems.push(
          `<button type="button" data-spot-action="build_settlement" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("settlement", pColor, 18)} Build settlement</span>
            ${this.renderCostPipStrip(BUILDING_COSTS.settlement)}
          </button>`
        );
      }
      if (canCityHere) {
        actionItems.push(
          `<button type="button" data-spot-action="build_city" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("city", pColor, 18)} Upgrade city</span>
            ${this.renderCostPipStrip(BUILDING_COSTS.city)}
          </button>`
        );
      }
      if (canWallHere) {
        actionItems.push(
          `<button type="button" data-spot-action="build_wall" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("wall", pColor, 18)} Build city wall</span>
            ${this.renderCostPipStrip(BUILDING_COSTS.cityWall)}
          </button>`
        );
      }

      if (actionItems.length === 0) {
        if (
          existing &&
          existing.ownerId === actingPlayer.id &&
          existing.type === "settlement" &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.city)
        ) {
          hintHtml = `
            <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span>City upgrade needs</span>
              ${this.renderMissingCostBadge(actingPlayer.resources, BUILDING_COSTS.city)}
            </div>
            ${
              state.phase === "MAIN_PHASE"
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                : ""
            }
          `;
        } else if (
          !existing &&
          getLegalSettlementVertices(state, actingPlayer.id, false).includes(
            spot.id
          ) &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.settlement)
        ) {
          hintHtml = `
            <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span>Settlement needs</span>
              ${this.renderMissingCostBadge(actingPlayer.resources, BUILDING_COSTS.settlement)}
            </div>
            ${
              state.phase === "MAIN_PHASE"
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                : ""
            }
          `;
        } else if (existing) {
          const owner = state.players.find((p) => p.id === existing.ownerId);
          hintHtml = `<div class="t-label muted">${owner?.name ?? "Player"} ${existing.type}${existing.hasWall ? " · walled" : ""}</div>`;
        } else {
          const adjOccupied = vNode.adjacentVertexIds.some(
            (nbV) => Boolean(state.buildings[nbV])
          );
          hintHtml = `<div class="t-label muted">${
            adjOccupied
              ? "Distance rule: adjacent intersection occupied."
              : "Connect your road or ship to settle here."
          }</div>`;
        }
      }
    } else {
      const tile = state.hexes[spot.id];
      if (!tile) return "";
      const res = TERRAIN_TO_RESOURCE[tile.terrain];
      const terrainName =
        tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1);
      titleHtml = `${
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

      if (canRobHere) {
        actionItems.push(
          `<button type="button" data-spot-action="move_robber" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", pColor, 18)} <span>Move robber here</span></button>`
        );
      }
      if (canPirateHere) {
        actionItems.push(
          `<button type="button" data-spot-action="move_pirate" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("pirate", pColor, 18)} <span>Move pirate here</span></button>`
        );
      }
      if (
        canPlayKnight &&
        ((tile.terrain !== "sea" && state.robberHexId !== spot.id) ||
          (tile.terrain === "sea" &&
            state.config.enableSeafarers &&
            state.pirateHexId !== spot.id))
      ) {
        actionItems.push(
          `<button type="button" data-spot-action="play_knight" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("knight", pColor, 18)} <span>Play knight card</span></button>`
        );
      }

      if (actionItems.length === 0) {
        hintHtml = `<div class="t-label muted">${
          state.robberHexId === spot.id
            ? "Robber currently blocks this tile."
            : state.pirateHexId === spot.id
              ? "Pirate ship currently blocks this sea."
              : res
                ? `Produces ${RESOURCE_META[res].label.toLowerCase()} on roll ${tile.numberToken}.`
                : "No resource yield on this tile."
        }</div>`;
      }
    }

    return `
      <div class="map-spot-popover ${belowClass}" style="left: ${xPct.toFixed(1)}%; top: ${yPct.toFixed(1)}%;">
        <div class="map-spot-popover__head">
          <div class="map-spot-popover__title">${titleHtml}</div>
          <button type="button" id="btn-close-spot-popover" class="map-spot-popover__close" aria-label="Close spot menu">×</button>
        </div>
        <div class="map-spot-popover__actions">
          ${actionItems.join("")}
          ${hintHtml}
        </div>
      </div>
    `;
  }

  private renderActiveTradeOfferCard(
    state: CatanState,
    actingPlayer: CatanState["players"][number]
  ): string {
    const offer = state.activeTradeOffer!;
    const fromP = state.players.find((p) => p.id === offer.fromPlayerId)!;
    const isResponder = actingPlayer.id !== offer.fromPlayerId;
    const otherPlayers = state.players.filter(
      (p) => p.id !== offer.fromPlayerId
    );
    const room = this.getActiveRoom();
    const canRespond =
      isResponder && this.canControlPlayerOnThisDevice(room, actingPlayer.id);
    const canCancel = this.canControlPlayerOnThisDevice(
      room,
      offer.fromPlayerId
    );

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <span class="player-dot" style="background: ${fromP.color}"></span>
          <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(fromP.name)} trade offer</strong>
        </div>
        <span class="t-label muted">${
          isResponder
            ? `${escapeAttr(actingPlayer.name)} responding`
            : "Awaiting player response"
        }</span>
      </div>

      <div class="ga-res-matrix">
        ${this.renderResourceColumnHeaders(actingPlayer.resources)}

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
        <div class="action-buttons" style="width: 100%; justify-content: flex-end;">
          ${
            canRespond
              ? isResponder
                ? `
                  <button type="button" data-decline-trade="${actingPlayer.id}" class="btn btn--secondary btn--sm">Decline</button>
                  <button type="button" data-accept-trade="${actingPlayer.id}" class="btn btn--primary btn--sm action-btn-graphic" ${
                    !hasResources(actingPlayer.resources, offer.want)
                      ? "disabled"
                      : ""
                  }>${renderActionPieceIconSvg("domestic_trade", actingPlayer.color, 16)} <span>${escapeAttr(actingPlayer.name)} accepts</span></button>
                `
                : otherPlayers
                    .map((op) => {
                      const canAccept = hasResources(op.resources, offer.want);
                      return `<button type="button" data-accept-trade="${op.id}" class="btn btn--primary btn--sm" ${
                        !canAccept ? "disabled" : ""
                      }>${escapeAttr(op.name)} accepts</button>`;
                    })
                    .join("")
              : ""
          }
          ${
            canCancel
              ? `<button type="button" id="btn-cancel-domestic" class="btn btn--secondary btn--sm">Cancel offer</button>`
              : ""
          }
        </div>
      </div>
    `;
  }

  private renderCatanMapDecisionPopup(
    state: CatanState,
    actingPlayer: CatanState["players"][number] | null,
    legalActions: CatanAction[]
  ): string {
    if (!actingPlayer || state.phase === "GAME_OVER" || this.autoPlayBots) {
      return "";
    }

    if (state.phase === "PRE_ROLL") {
      const canKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
      return `
        <div class="map-decision-popup map-decision-popup--compact">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn-roll-graphic">
            <span class="roll-dice-btn-graphic" style="display: inline-flex; align-items: center;">${renderRollDiceButtonGraphicSvg(36)}</span>
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

    if (state.phase === "DISCARD_ON_SEVEN") {
      const req = state.pendingDiscards[actingPlayer.id] ?? 0;
      const currentSelected = totalResourceCount(this.discardSelection);
      return `
        <div class="map-decision-popup">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="action-prompt"><strong>Roll of 7 · ${actingPlayer.name}:</strong> Discard ${req} cards</span>
            <span class="ga-chip ${currentSelected === req ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${currentSelected}/${req} selected</span>
          </div>
          <div class="ga-res-matrix">
            ${this.renderResourceColumnHeaders(actingPlayer.resources)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Discard
            </div>
            ${RESOURCES.map((r) => {
              const sel = this.discardSelection[r];
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
      `;
    }

    if (state.phase === "GOLD_RESOURCE_SELECTION") {
      const rem = state.pendingGoldPicks[actingPlayer.id] ?? 0;
      return `
        <div class="map-decision-popup">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span class="action-prompt"><strong>Gold river · ${actingPlayer.name}:</strong> Pick ${rem} free resource${rem === 1 ? "" : "s"}</span>
            <span class="ga-chip ga-chip--warn ga-num">${rem} left</span>
          </div>
          <div class="ga-res-matrix">
            ${this.renderResourceColumnHeaders(actingPlayer.resources)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>Take 1
            </div>
            ${RESOURCES.map(
              (r) => `
                <button type="button" data-gold-pick="${r}" class="ga-res-port-btn is-selected-want" ${state.bank[r] <= 0 ? "disabled" : ""}>
                  <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
                  <span class="t-label muted ga-num">bank ${state.bank[r]}</span>
                </button>
              `
            ).join("")}
          </div>
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
                <span>${victim.name} (${totalResourceCount(victim.resources)})</span>
              </button>`;
            })
            .join("")}
        </div>
      `;
    }

    if (state.phase === "MAIN_PHASE" && state.activeTradeOffer) {
      return `
        <div class="map-decision-popup">
          ${this.renderActiveTradeOfferCard(state, actingPlayer)}
        </div>
      `;
    }

    return "";
  }

  private renderCatanActionDock(
    state: CatanState,
    actingPlayer: CatanState["players"][number] | null,
    legalActions: CatanAction[]
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
        ${renderActionPieceIconSvg(this.setupEdgeKind, pColor, 22)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Click a pulsing edge next to your settlement to place a starting ${this.setupEdgeKind}.</span>
        ${
          canShip
            ? `<button type="button" id="btn-toggle-setup-edge" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(this.setupEdgeKind === "road" ? "ship" : "road", pColor, 18)}
                 <span>Switch to ${this.setupEdgeKind === "road" ? "ship" : "road"}</span>
               </button>`
            : ""
        }
      </div>`;
    }

    if (state.phase === "DISCARD_ON_SEVEN") {
      if (this.autoPlayBots) {
        return `<div class="action-buttons"><span class="action-prompt"><strong>Roll of 7:</strong> Resolving discards...</span></div>`;
      }
      return `<div class="action-buttons">
        ${renderActionPieceIconSvg("robber", pColor, 20)}
        <span class="action-prompt"><strong>Roll of 7:</strong> Choose cards to discard in the popup directly on the map (or click cards in your hand below).</span>
      </div>`;
    }

    if (state.phase === "GOLD_RESOURCE_SELECTION") {
      if (this.autoPlayBots) {
        return `<div class="action-buttons"><span class="action-prompt"><strong>Gold river:</strong> Selecting resources...</span></div>`;
      }
      return `<div class="action-buttons">
        ${renderActionPieceIconSvg("year_of_plenty", pColor, 20)}
        <span class="action-prompt"><strong>Gold river:</strong> Select your free resource card on the map popup above.</span>
      </div>`;
    }

    if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
      return `<div class="action-buttons">
        ${renderActionPieceIconSvg(this.robberOrPirateMode, pColor, 22)}
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Click any pulsing hex on the map to move the ${
          this.robberOrPirateMode === "pirate" ? "pirate ship" : "robber"
        }.</span>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-toggle-robber-pirate" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(this.robberOrPirateMode === "robber" ? "pirate" : "robber", pColor, 18)}
                 <span>Switch to ${
                   this.robberOrPirateMode === "robber"
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
      if (this.autoPlayBots) {
        return `<div class="action-buttons">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn--sm action-btn-graphic">${renderRollDiceButtonGraphicSvg(24)} <span>Roll dice</span></button>
        </div>`;
      }
      return `<div class="action-buttons">
        <span class="action-prompt"><strong>${actingPlayer.name}:</strong> Roll the dice directly on the map above to start your turn (or click any map hex to inspect).</span>
      </div>`;
    }

    if (state.phase === "MAIN_PHASE" && state.activeTradeOffer) {
      if (this.autoPlayBots) {
        return `<div class="sub-modal">${this.renderActiveTradeOfferCard(state, actingPlayer)}</div>`;
      }
      return `<div class="action-buttons">
        ${renderActionPieceIconSvg("domestic_trade", pColor, 20)}
        <span class="action-prompt"><strong>Active player trade:</strong> Respond to the aligned resource offer on the map popup above.</span>
      </div>`;
    }

    const canRoad = legalActions.some((a) => a.type === "BUILD_ROAD");
    const canShip = legalActions.some((a) => a.type === "BUILD_SHIP");
    const canMoveShip = legalActions.some((a) => a.type === "MOVE_SHIP");
    const canSettlement = legalActions.some(
      (a) => a.type === "BUILD_SETTLEMENT"
    );
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

    let subModalHtml = "";
    if (this.buildMode === "maritime_trade") {
      const ratios = getPlayerTradeRatios(state, actingPlayer.id);
      const reqAmt = ratios[this.tradeGiveRes];
      const canExec =
        this.tradeGiveRes !== this.tradeReceiveRes &&
        actingPlayer.resources[this.tradeGiveRes] >= reqAmt &&
        state.bank[this.tradeReceiveRes] > 0;

      subModalHtml = `<div class="sub-modal">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("maritime_trade", pColor, 20)}
            <strong style="font-size: var(--t-small); font-weight: 500;">Harbor and bank trade</strong>
          </div>
          <span class="t-label muted">Each resource column is aligned vertically</span>
        </div>

        <div class="ga-res-matrix">
          ${this.renderResourceColumnHeaders(actingPlayer.resources)}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>Give port
          </div>
          ${RESOURCES.map((r) => {
            const ratio = ratios[r];
            const enough = actingPlayer.resources[r] >= ratio;
            const isSel = this.tradeGiveRes === r;
            return `
              <button type="button" data-maritime-give="${r}" class="ga-res-port-btn ${
                isSel ? "is-selected-give" : ""
              }">
                <span class="ga-num" style="font-size: 13px; font-weight: 600; color: ${
                  ratio < 4 ? "#fde047" : "var(--ink)"
                };">${ratio}:1</span>
                <span class="t-label ${enough ? "muted" : ""}" style="font-size: 13px; color: ${
                  enough ? "var(--muted)" : "#fca5a5"
                };">have ${actingPlayer.resources[r]}</span>
              </button>
            `;
          }).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Receive 1
          </div>
          ${RESOURCES.map((r) => {
            const isSel = this.tradeReceiveRes === r;
            return `
              <button type="button" data-maritime-receive="${r}" class="ga-res-port-btn ${
                isSel ? "is-selected-want" : ""
              }" ${state.bank[r] <= 0 ? "disabled" : ""}>
                <span class="ga-num" style="font-size: 13px; font-weight: 600;">+1</span>
                <span class="t-label muted ga-num" style="font-size: 13px;">bank ${state.bank[r]}</span>
              </button>
            `;
          }).join("")}
        </div>

        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            <span class="ga-chip ga-num">−${reqAmt}</span>
            ${renderMiniResourceCardSvg(this.tradeGiveRes, 44, 28)}
            ${DRAWN_ARROW_SVG}
            <span class="ga-chip ga-chip--ok ga-num">+1</span>
            ${renderMiniResourceCardSvg(this.tradeReceiveRes, 44, 28)}
          </div>
          <button type="button" id="btn-exec-maritime" class="btn btn--primary btn--sm action-btn-graphic" ${
            !canExec ? "disabled" : ""
          }>
            ${renderActionPieceIconSvg("maritime_trade", pColor, 16)}
            <span>Trade ${reqAmt} ${RESOURCE_META[this.tradeGiveRes].label.toLowerCase()} for 1 ${RESOURCE_META[this.tradeReceiveRes].label.toLowerCase()}</span>
          </button>
        </div>
      </div>`;
    } else if (this.buildMode === "domestic_trade") {
      const canPropose =
        totalResourceCount(this.domesticGive) > 0 &&
        totalResourceCount(this.domesticWant) > 0 &&
        RESOURCES.every(
          (r) => !(this.domesticGive[r] > 0 && this.domesticWant[r] > 0)
        ) &&
        hasResources(actingPlayer.resources, this.domesticGive);

      const opponents = state.players.filter((p) => p.id !== actingPlayer.id);
      const giveCardsPreview = RESOURCES.filter((r) => this.domesticGive[r] > 0)
        .map(
          (r) =>
            `<span class="map-yield-chip">−${this.domesticGive[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
        )
        .join("");
      const wantCardsPreview = RESOURCES.filter((r) => this.domesticWant[r] > 0)
        .map(
          (r) =>
            `<span class="map-yield-chip">+${this.domesticWant[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
        )
        .join("");

      subModalHtml = `<div class="sub-modal">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("domestic_trade", pColor, 20)}
            <strong style="font-size: var(--t-small); font-weight: 500;">Player trade offer</strong>
          </div>
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <label class="ga-inline-label" for="sel-dom-target-btn">Partner</label>
            ${renderDropdown({
              id: "sel-dom-target",
              value: this.domesticTargetPlayerId,
              size: "sm",
              inline: true,
              direction: "up",
              options: [
                { value: "all", label: "All players", meta: "Broadcast" },
                ...opponents.map((op) => ({
                  value: op.id,
                  label: op.name,
                  meta: `${totalResourceCount(op.resources)} cards`,
                })),
              ],
            })}
          </div>
        </div>

        <div class="ga-res-matrix">
          ${this.renderResourceColumnHeaders(actingPlayer.resources)}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>Offer
          </div>
          ${RESOURCES.map((r) => {
            const val = this.domesticGive[r];
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
            const val = this.domesticWant[r];
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
              giveCardsPreview && wantCardsPreview
                ? `${giveCardsPreview} ${DRAWN_ARROW_SVG} ${wantCardsPreview}`
                : `<span class="t-label muted">Use + and − in each resource column to align your offer and request</span>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-dom-reset" class="btn btn--secondary btn--sm">Reset</button>
            <button type="button" id="btn-dom-propose" class="btn btn--primary btn--sm action-btn-graphic" ${
              !canPropose ? "disabled" : ""
            }>
              ${renderActionPieceIconSvg("domestic_trade", pColor, 16)}
              <span>Send trade offer</span>
            </button>
          </div>
        </div>
      </div>`;
    } else if (this.buildMode === "year_of_plenty") {
      subModalHtml = `<div class="sub-modal">
        <div style="display: inline-flex; align-items: center; gap: 7px;">
          ${renderActionPieceIconSvg("year_of_plenty", pColor, 20)}
          <strong style="font-size: var(--t-small); font-weight: 500;">Year of plenty — choose 2 free bank cards</strong>
        </div>
        <div class="ga-res-matrix">
          ${this.renderResourceColumnHeaders(undefined, state.bank)}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>1st card
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-yop-pick1="${r}" class="ga-res-port-btn ${
                this.yopRes1 === r ? "is-selected-want" : ""
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
                this.yopRes2 === r ? "is-selected-want" : ""
              }" ${
                state.bank[r] <= (this.yopRes1 === r ? 1 : 0) ? "disabled" : ""
              }>
                <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(this.yopRes1, 42, 27)}
            ${renderMiniResourceCardSvg(this.yopRes2, 42, 27)}
          </div>
          <button type="button" id="btn-exec-yop" class="btn btn--primary btn--sm">Take 2 resources</button>
        </div>
      </div>`;
    } else if (this.buildMode === "monopoly") {
      subModalHtml = `<div class="sub-modal">
        <div style="display: inline-flex; align-items: center; gap: 7px;">
          ${renderActionPieceIconSvg("monopoly", pColor, 20)}
          <strong style="font-size: var(--t-small); font-weight: 500;">Monopoly — claim every opponent copy of 1 resource</strong>
        </div>
        <div class="ga-res-matrix">
          ${this.renderResourceColumnHeaders(actingPlayer.resources)}
          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Claim all
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-mono-pick="${r}" class="ga-res-port-btn ${
                this.monoRes === r ? "is-selected-want" : ""
              }">
                <span style="font-size: 13px; font-weight: 600;">${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(this.monoRes, 44, 28)}
          </div>
          <button type="button" id="btn-exec-mono" class="btn btn--primary btn--sm">Claim all ${RESOURCE_META[this.monoRes].label.toLowerCase()}</button>
        </div>
      </div>`;
    }

    return `
      ${subModalHtml}
      <div class="action-buttons">
        <button type="button" id="btn-mode-road" class="btn btn--secondary btn--sm action-btn-graphic ${
          this.buildMode === "road" ? "is-selected" : ""
        }" ${!canRoad ? "disabled" : ""}>
          ${renderActionPieceIconSvg("road", pColor, 18)}
          <span>Road</span>
          ${this.renderCostPipStrip(BUILDING_COSTS.road)}
        </button>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-mode-ship" class="btn btn--secondary btn--sm action-btn-graphic ${
                this.buildMode === "ship" ? "is-selected" : ""
              }" ${!canShip ? "disabled" : ""}>
                ${renderActionPieceIconSvg("ship", pColor, 18)}
                <span>Ship</span>
                ${this.renderCostPipStrip(BUILDING_COSTS.ship)}
              </button>
              <button type="button" id="btn-mode-moveship" class="btn btn--secondary btn--sm action-btn-graphic ${
                this.buildMode === "move_ship" ? "is-selected" : ""
              }" ${!canMoveShip ? "disabled" : ""}>
                ${renderActionPieceIconSvg("move_ship", pColor, 18)}
                <span>Move ship</span>
              </button>`
            : ""
        }
        <button type="button" id="btn-mode-settlement" class="btn btn--secondary btn--sm action-btn-graphic ${
          this.buildMode === "settlement" ? "is-selected" : ""
        }" ${!canSettlement ? "disabled" : ""}>
          ${renderActionPieceIconSvg("settlement", pColor, 18)}
          <span>Settlement</span>
          ${this.renderCostPipStrip(BUILDING_COSTS.settlement)}
        </button>
        <button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic ${
          this.buildMode === "city" ? "is-selected" : ""
        }" ${!canCity ? "disabled" : ""}>
          ${renderActionPieceIconSvg("city", pColor, 18)}
          <span>City</span>
          ${this.renderCostPipStrip(BUILDING_COSTS.city)}
        </button>
        ${
          state.config.enableCityWalls
            ? `<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic ${
                this.buildMode === "wall" ? "is-selected" : ""
              }" ${!canWall ? "disabled" : ""}>
                ${renderActionPieceIconSvg("wall", pColor, 18)}
                <span>Wall</span>
                ${this.renderCostPipStrip(BUILDING_COSTS.cityWall)}
              </button>`
            : ""
        }
        <button type="button" id="btn-buy-dev" class="btn btn--secondary btn--sm action-btn-graphic" ${
          !canBuyDev ? "disabled" : ""
        }>
          ${renderActionPieceIconSvg("dev_card", pColor, 18)}
          <span>Dev card</span>
          ${this.renderCostPipStrip(BUILDING_COSTS.devCard)}
        </button>
        ${
          state.phase === "MAIN_PHASE"
            ? `<button type="button" id="btn-mode-maritime" class="btn btn--secondary btn--sm action-btn-graphic ${
                this.buildMode === "maritime_trade" ? "is-selected" : ""
              }" ${!canMaritime ? "disabled" : ""}>
                ${renderActionPieceIconSvg("maritime_trade", pColor, 18)}
                <span>Port trade</span>
              </button>
              <button type="button" id="btn-mode-domestic" class="btn btn--secondary btn--sm action-btn-graphic ${
                this.buildMode === "domestic_trade" ? "is-selected" : ""
              }" ${
                totalResourceCount(actingPlayer.resources) === 0
                  ? "disabled"
                  : ""
              }>
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
                this.buildMode === "year_of_plenty" ? "is-selected" : ""
              }">${renderActionPieceIconSvg("year_of_plenty", pColor, 18)} <span>Year of plenty</span></button>`
            : ""
        }
        ${
          canMonopoly
            ? `<button type="button" id="btn-mode-mono" class="btn btn--secondary btn--sm action-btn-graphic ${
                this.buildMode === "monopoly" ? "is-selected" : ""
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

  private renderCatanPlayerCard(
    state: CatanState,
    p: CatanState["players"][number],
    isActing: boolean
  ): string {
    const totalVp = computePlayerVictoryPoints(state, p.id, false);
    const visibleVp = computePlayerVictoryPoints(state, p.id, true);
    const safeLimit = getPlayerSafeHandLimit(state, p.id);
    const unplayedDevs = p.devCards.filter((c) => !c.played);
    const botBadge = p.isBot
      ? `Bot · ${BOT_DIFFICULTY_META[p.botDifficulty ?? "smart"].badge}`
      : p.id === this.currentUserId
        ? "You · Guest"
        : "Guest";

    return `
      <div class="player-card ${isActing ? "active-turn" : ""}">
        <div class="player-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="player-dot" style="background: ${p.color}"></span>
            <strong style="font-weight: 500;">${escapeAttr(p.name)}</strong>
            <span class="ga-chip">${botBadge}</span>
          </div>
          <span class="ga-chip ga-chip--warn ga-num">${totalVp} VP${
            totalVp !== visibleVp ? ` (${visibleVp})` : ""
          }</span>
        </div>

        <div class="res-pills">
          ${RESOURCES.map(
            (r) =>
              `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r)} ${p.resources[r]}</span>`
          ).join("")}
          <span class="ga-chip ga-num" title="Cards in hand vs safe limit on 7">${totalResourceCount(
            p.resources
          )}/${safeLimit}</span>
        </div>

        <div style="font-size: var(--t-label); color: var(--muted); display: flex; flex-wrap: wrap; gap: 10px;">
          <span>Route <strong class="ga-num" style="color: var(--ink); font-weight: 500;">${p.longestRoadLength}</strong></span>
          <span>Knights <strong class="ga-num" style="color: var(--ink); font-weight: 500;">${p.knightsPlayed}</strong></span>
          <span>Devs <strong class="ga-num" style="color: var(--ink); font-weight: 500;">${unplayedDevs.length}</strong></span>
          ${
            state.config.enableHarbormaster
              ? `<span>Harbors <strong class="ga-num" style="color: var(--ink); font-weight: 500;">${p.harborPoints}</strong></span>`
              : ""
          }
          ${
            p.bonusVictoryPoints > 0
              ? `<span>Island <strong class="ga-num" style="color: var(--ink); font-weight: 500;">+${p.bonusVictoryPoints}</strong></span>`
              : ""
          }
        </div>
      </div>
    `;
  }

  private bindDropdownEvents(): void {
    this.root.querySelectorAll("[data-dropdown-root]").forEach((el) => {
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
        this.root.querySelectorAll(".ga-dropdown.is-open").forEach((other) => {
          if (other !== dd) this.closeDropdownElement(other as HTMLElement);
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
          this.closeDropdownElement(dd);
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
          this.closeDropdownElement(dd);
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
          this.closeDropdownElement(dd);
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    });
  }

  private bindCommonIdentityEvents(): void {
    this.bindDropdownEvents();
    this.root
      .querySelector("#sel-user-identity")
      ?.addEventListener("change", (e) => {
        const selectedId = (e.target as HTMLSelectElement).value;
        this.switchActiveGuest(selectedId);
      });

    this.root.querySelector("#btn-add-guest")?.addEventListener("click", () => {
      this.openAddGuestView();
    });

    this.root.querySelector("#btn-sign-out")?.addEventListener("click", () => {
      this.signOutGuest();
    });
  }

  private bindReadOnlyCatanSpotInspect(): void {
    this.root
      .querySelector("#btn-close-spot-popover")
      ?.addEventListener("click", () => {
        this.selectedBoardSpot = null;
        this.render();
      });

    this.root.querySelectorAll("[data-spot-hex]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const hexId = el.getAttribute("data-spot-hex")!;
        this.selectedBoardSpot =
          this.selectedBoardSpot?.kind === "hex" &&
          this.selectedBoardSpot.id === hexId
            ? null
            : { kind: "hex", id: hexId };
        this.render();
      });
    });

    this.root.querySelectorAll("[data-spot-vertex]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const vertexId = el.getAttribute("data-spot-vertex")!;
        this.selectedBoardSpot =
          this.selectedBoardSpot?.kind === "vertex" &&
          this.selectedBoardSpot.id === vertexId
            ? null
            : { kind: "vertex", id: vertexId };
        this.render();
      });
    });

    this.root.querySelectorAll("[data-spot-edge]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const edgeId = el.getAttribute("data-spot-edge")!;
        this.selectedBoardSpot =
          this.selectedBoardSpot?.kind === "edge" &&
          this.selectedBoardSpot.id === edgeId
            ? null
            : { kind: "edge", id: edgeId };
        this.render();
      });
    });
  }

  private bindInGameEvents(
    room: ClientRoom,
    state: any,
    actingPlayerId: string | null
  ): void {
    this.bindCommonIdentityEvents();
    this.root
      .querySelector("#btn-back-lobby")
      ?.addEventListener("click", () => {
        this.stopAutoPlay();
        this.viewMode = "lobby";
        if (this.useServerBackend) {
          void this.fetchLobbyRooms().then(() => this.render());
        } else {
          this.render();
        }
      });

    this.root
      .querySelector("#tab-setup-page")
      ?.addEventListener("click", () => {
        this.stopAutoPlay();
        this.viewMode = "room_setup";
        this.render();
      });

    this.root
      .querySelector("#btn-sidebar-edit-setup")
      ?.addEventListener("click", () => {
        this.stopAutoPlay();
        this.viewMode = "room_setup";
        this.render();
      });

    this.root
      .querySelector("#btn-goto-setup-finished")
      ?.addEventListener("click", () => {
        this.stopAutoPlay();
        this.viewMode = "room_setup";
        this.render();
      });

    this.root.querySelector("#btn-undo")?.addEventListener("click", () => {
      this.undoMatch();
    });

    this.root.querySelector("#btn-redo")?.addEventListener("click", () => {
      this.redoMatch();
    });

    this.root
      .querySelector("#btn-finish-setup")
      ?.addEventListener("click", () => {
        this.finishSetupWithBots();
      });

    this.root
      .querySelector("#btn-toggle-bot-response")
      ?.addEventListener("click", () => {
        this.toggleAutoRespondBots();
      });

    this.root.querySelector("#btn-step-bot")?.addEventListener("click", () => {
      this.stepOneBotMove();
    });

    this.root.querySelector("#btn-autoplay")?.addEventListener("click", () => {
      this.toggleAutoPlay();
    });

    this.root
      .querySelector("#btn-toggle-hand-privacy")
      ?.addEventListener("click", () => {
        this.hidePassAndPlayHand = !this.hidePassAndPlayHand;
        this.render();
      });

    this.root
      .querySelector("#btn-reveal-hand")
      ?.addEventListener("click", () => {
        this.hidePassAndPlayHand = false;
        this.render();
      });

    this.root
      .querySelector("#btn-switch-turn-guest")
      ?.addEventListener("click", (e) => {
        const gid = (e.currentTarget as HTMLElement).getAttribute(
          "data-switch-guest"
        );
        if (gid) {
          this.switchActiveGuest(gid);
        }
      });

    if (!actingPlayerId) return;

    // Multi-guest turn isolation: in online rooms, only seats controlled by this computer
    // (the active guest or local friends added on this computer) can dispatch turn actions.
    if (!this.canControlPlayerOnThisDevice(room, actingPlayerId)) {
      if (
        room.gameId === "catan" &&
        state.activeTradeOffer &&
        this.canControlPlayerOnThisDevice(
          room,
          state.activeTradeOffer.fromPlayerId
        )
      ) {
        this.root
          .querySelectorAll("#btn-cancel-domestic")
          .forEach((cancelBtn) => {
            cancelBtn.addEventListener("click", () => {
              this.dispatch(state.activeTradeOffer.fromPlayerId, {
                type: "CANCEL_DOMESTIC_TRADE",
              });
            });
          });
      }
      if (room.gameId === "catan") {
        this.bindReadOnlyCatanSpotInspect();
      }
      return;
    }

    if (room.gameId === "splendor") {
      this.bindSplendorEvents(state as SplendorState, actingPlayerId);
      return;
    }

    if (room.gameId === "azul") {
      this.bindAzulEvents(state as AzulState, actingPlayerId);
      return;
    }

    this.bindCatanEvents(state as CatanState, actingPlayerId);
  }

  private bindSplendorEvents(
    state: SplendorState,
    actingPlayerId: string
  ): void {
    this.root.querySelectorAll("[data-sp-gem]").forEach((el) => {
      el.addEventListener("click", () => {
        if (state.phase !== "MAIN_ACTION") return;
        const color = el.getAttribute("data-sp-gem") as GemColor;
        if (state.bank[color] <= 0) return;

        const current = this.splendorDraftGems[color] ?? 0;
        const distinctSelected = Object.keys(this.splendorDraftGems).filter(
          (k) => (this.splendorDraftGems[k as GemColor] ?? 0) > 0
        );

        if (current === 0) {
          if (distinctSelected.length < 3) {
            for (const k of distinctSelected) {
              if ((this.splendorDraftGems[k as GemColor] ?? 0) > 1) {
                this.splendorDraftGems[k as GemColor] = 1;
              }
            }
            this.splendorDraftGems[color] = 1;
          }
        } else if (
          current === 1 &&
          distinctSelected.length === 1 &&
          state.bank[color] >= 4
        ) {
          this.splendorDraftGems[color] = 2;
        } else {
          delete this.splendorDraftGems[color];
        }
        this.render();
      });
    });

    this.root
      .querySelector("#btn-sp-clear-gems")
      ?.addEventListener("click", () => {
        this.splendorDraftGems = {};
        this.render();
      });

    this.root
      .querySelector("#btn-sp-take-gems")
      ?.addEventListener("click", () => {
        this.dispatch(actingPlayerId, {
          type: "TAKE_GEMS",
          gems: { ...this.splendorDraftGems },
        });
      });

    this.root.querySelectorAll("[data-sp-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-sp-buy")!;
        this.dispatch(actingPlayerId, { type: "PURCHASE_CARD", cardId });
      });
    });

    this.root.querySelectorAll("[data-sp-reserve]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cardId = btn.getAttribute("data-sp-reserve")!;
        this.dispatch(actingPlayerId, { type: "RESERVE_CARD", cardId });
      });
    });

    this.root.querySelectorAll("[data-sp-reserve-deck]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const deckTier = Number(
          btn.getAttribute("data-sp-reserve-deck")
        ) as 1 | 2 | 3;
        this.dispatch(actingPlayerId, { type: "RESERVE_CARD", deckTier });
      });
    });

    this.root.querySelectorAll("[data-sp-return-one]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = btn.getAttribute("data-sp-return-one") as TokenColor;
        const activePlayer = state.players[state.activePlayerIndex]!;
        const excess =
          Object.values(activePlayer.tokens).reduce((a, b) => a + b, 0) - 10;
        if (excess === 1) {
          this.dispatch(actingPlayerId, {
            type: "RETURN_TOKENS",
            tokens: { [c]: 1 },
          });
        } else {
          const botAct = SplendorEngine.chooseBotAction(state, actingPlayerId);
          if (botAct) this.dispatch(actingPlayerId, botAct);
        }
      });
    });

    this.root.querySelectorAll("[data-sp-noble]").forEach((el) => {
      el.addEventListener("click", () => {
        const nobleId = el.getAttribute("data-sp-noble")!;
        this.dispatch(actingPlayerId, { type: "SELECT_NOBLE", nobleId });
      });
    });
  }

  private bindAzulEvents(_state: AzulState, actingPlayerId: string): void {
    this.root.querySelectorAll("[data-azul-factory]").forEach((el) => {
      el.addEventListener("click", () => {
        const factoryIndex = Number(el.getAttribute("data-azul-factory"));
        const color = el.getAttribute("data-azul-color") as AzulTileColor;
        this.azulSelectedDraft = {
          source: { kind: "factory", factoryIndex },
          color,
        };
        this.render();
      });
    });

    this.root.querySelectorAll("[data-azul-center]").forEach((el) => {
      el.addEventListener("click", () => {
        const color = el.getAttribute("data-azul-color") as AzulTileColor;
        this.azulSelectedDraft = {
          source: { kind: "center" },
          color,
        };
        this.render();
      });
    });

    this.root.querySelectorAll("[data-azul-target-line]").forEach((el) => {
      el.addEventListener("click", () => {
        if (!this.azulSelectedDraft) return;
        const raw = el.getAttribute("data-azul-target-line")!;
        const targetLine: AzulTargetLine =
          raw === "floor" ? "floor" : (Number(raw) as 0 | 1 | 2 | 3 | 4);
        this.dispatch(actingPlayerId, {
          type: "DRAFT_TILES",
          source: this.azulSelectedDraft.source,
          color: this.azulSelectedDraft.color,
          targetLine,
        });
      });
    });

    this.root
      .querySelector("#btn-azul-cancel-draft")
      ?.addEventListener("click", () => {
        this.azulSelectedDraft = null;
        this.render();
      });
  }

  private bindCatanEvents(state: CatanState, actingPlayerId: string): void {
    this.root.querySelectorAll("[data-hand-res-card]").forEach((cardEl) => {
      cardEl.addEventListener("click", () => {
        const r = cardEl.getAttribute("data-hand-res-card") as ResourceType;
        const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
        if (!actingPlayer || actingPlayer.resources[r] <= 0) return;

        if (state.phase === "DISCARD_ON_SEVEN") {
          const req = state.pendingDiscards[actingPlayerId] ?? 0;
          if (
            this.discardSelection[r] < actingPlayer.resources[r] &&
            totalResourceCount(this.discardSelection) < req
          ) {
            this.discardSelection[r]++;
            this.render();
          }
        } else if (this.buildMode === "domestic_trade") {
          if (this.domesticGive[r] < actingPlayer.resources[r]) {
            this.domesticGive[r]++;
            this.render();
          }
        } else if (state.phase === "MAIN_PHASE") {
          this.tradeGiveRes = r;
          this.buildMode = "maritime_trade";
          this.render();
        }
      });
    });

    this.root
      .querySelector("#btn-hand-play-knight")
      ?.addEventListener("click", () => {
        this.dispatch(actingPlayerId, { type: "PLAY_KNIGHT" });
      });
    this.root
      .querySelector("#btn-hand-play-roadbuild")
      ?.addEventListener("click", () => {
        this.dispatch(actingPlayerId, { type: "PLAY_ROAD_BUILDING" });
      });
    this.root
      .querySelector("#btn-hand-play-yop")
      ?.addEventListener("click", () => {
        this.buildMode = "year_of_plenty";
        this.render();
      });
    this.root
      .querySelector("#btn-hand-play-mono")
      ?.addEventListener("click", () => {
        this.buildMode = "monopoly";
        this.render();
      });

    this.root
      .querySelector("#btn-close-spot-popover")
      ?.addEventListener("click", () => {
        this.selectedBoardSpot = null;
        this.render();
      });

    this.root.querySelectorAll("[data-spot-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-spot-action")!;
        const spotId = btn.getAttribute("data-spot-id") ?? "";
        if (act === "build_road") {
          this.dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId: spotId });
        } else if (act === "build_ship") {
          this.dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId: spotId });
        } else if (act === "setup_road") {
          this.dispatch(actingPlayerId, {
            type: "PLACE_SETUP_EDGE",
            edgeId: spotId,
            edgeKind: "road",
          });
        } else if (act === "setup_ship") {
          this.dispatch(actingPlayerId, {
            type: "PLACE_SETUP_EDGE",
            edgeId: spotId,
            edgeKind: "ship",
          });
        } else if (act === "start_move_ship") {
          this.buildMode = "move_ship";
          this.selectedMoveFromEdgeId = spotId;
          this.selectedBoardSpot = null;
          this.render();
        } else if (act === "complete_move_ship" && this.selectedMoveFromEdgeId) {
          this.dispatch(actingPlayerId, {
            type: "MOVE_SHIP",
            fromEdgeId: this.selectedMoveFromEdgeId,
            toEdgeId: spotId,
          });
        } else if (act === "setup_settlement") {
          this.dispatch(actingPlayerId, {
            type: "PLACE_SETUP_SETTLEMENT",
            vertexId: spotId,
          });
        } else if (act === "build_settlement") {
          this.dispatch(actingPlayerId, {
            type: "BUILD_SETTLEMENT",
            vertexId: spotId,
          });
        } else if (act === "build_city") {
          this.dispatch(actingPlayerId, {
            type: "BUILD_CITY",
            vertexId: spotId,
          });
        } else if (act === "build_wall") {
          this.dispatch(actingPlayerId, {
            type: "BUILD_CITY_WALL",
            vertexId: spotId,
          });
        } else if (act === "move_robber") {
          this.dispatch(actingPlayerId, { type: "MOVE_ROBBER", hexId: spotId });
        } else if (act === "move_pirate") {
          this.dispatch(actingPlayerId, { type: "MOVE_PIRATE", hexId: spotId });
        } else if (act === "play_knight") {
          this.dispatch(actingPlayerId, { type: "PLAY_KNIGHT" });
        } else if (act === "open_trade") {
          this.selectedBoardSpot = null;
          this.buildMode = "domestic_trade";
          this.render();
        }
      });
    });

    this.root.querySelectorAll("[data-spot-hex]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const hexId = el.getAttribute("data-spot-hex")!;
        if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
          if (
            this.robberOrPirateMode === "pirate" &&
            state.config.enableSeafarers
          ) {
            if (getLegalPirateHexes(state).includes(hexId)) {
              this.dispatch(actingPlayerId, { type: "MOVE_PIRATE", hexId });
              return;
            }
          } else {
            if (getLegalRobberHexes(state, actingPlayerId).includes(hexId)) {
              this.dispatch(actingPlayerId, { type: "MOVE_ROBBER", hexId });
              return;
            }
          }
        }
        this.selectedBoardSpot =
          this.selectedBoardSpot?.kind === "hex" &&
          this.selectedBoardSpot.id === hexId
            ? null
            : { kind: "hex", id: hexId };
        this.render();
      });
    });

    this.root.querySelectorAll("[data-spot-vertex]").forEach((el) => {
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
          this.dispatch(actingPlayerId, {
            type: "PLACE_SETUP_SETTLEMENT",
            vertexId,
          });
          return;
        }
        if (
          this.buildMode === "settlement" &&
          getLegalSettlementVertices(state, actingPlayerId, false).includes(
            vertexId
          )
        ) {
          this.dispatch(actingPlayerId, { type: "BUILD_SETTLEMENT", vertexId });
          return;
        }
        if (
          this.buildMode === "city" &&
          state.buildings[vertexId]?.ownerId === actingPlayerId &&
          state.buildings[vertexId]?.type === "settlement"
        ) {
          this.dispatch(actingPlayerId, { type: "BUILD_CITY", vertexId });
          return;
        }
        if (
          this.buildMode === "wall" &&
          state.buildings[vertexId]?.ownerId === actingPlayerId &&
          state.buildings[vertexId]?.type === "city" &&
          !state.buildings[vertexId]?.hasWall
        ) {
          this.dispatch(actingPlayerId, { type: "BUILD_CITY_WALL", vertexId });
          return;
        }
        this.selectedBoardSpot =
          this.selectedBoardSpot?.kind === "vertex" &&
          this.selectedBoardSpot.id === vertexId
            ? null
            : { kind: "vertex", id: vertexId };
        this.render();
      });
    });

    this.root.querySelectorAll("[data-spot-edge]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const edgeId = el.getAttribute("data-spot-edge")!;
        if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
          const anchor = state.lastSetupSettlementVertexId;
          const legals =
            this.setupEdgeKind === "ship" && state.config.enableSeafarers
              ? getLegalShipEdges(state, actingPlayerId, anchor)
              : getLegalRoadEdges(state, actingPlayerId, anchor);
          if (legals.includes(edgeId)) {
            this.dispatch(actingPlayerId, {
              type: "PLACE_SETUP_EDGE",
              edgeId,
              edgeKind: this.setupEdgeKind,
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
            this.dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId });
            return;
          }
          if (isShip) {
            this.dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId });
            return;
          }
        } else if (
          this.buildMode === "road" &&
          getLegalRoadEdges(state, actingPlayerId, null).includes(edgeId)
        ) {
          this.dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId });
          return;
        } else if (
          this.buildMode === "ship" &&
          getLegalShipEdges(state, actingPlayerId, null).includes(edgeId)
        ) {
          this.dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId });
          return;
        } else if (this.buildMode === "move_ship") {
          const moves = getLegalMoveShipActions(state, actingPlayerId);
          if (
            !this.selectedMoveFromEdgeId &&
            moves.some((m) => m.fromEdgeId === edgeId)
          ) {
            this.selectedMoveFromEdgeId = edgeId;
            this.selectedBoardSpot = null;
            this.render();
            return;
          }
          if (
            this.selectedMoveFromEdgeId &&
            moves.some(
              (m) =>
                m.fromEdgeId === this.selectedMoveFromEdgeId &&
                m.toEdgeId === edgeId
            )
          ) {
            this.dispatch(actingPlayerId, {
              type: "MOVE_SHIP",
              fromEdgeId: this.selectedMoveFromEdgeId,
              toEdgeId: edgeId,
            });
            return;
          }
        }

        this.selectedBoardSpot =
          this.selectedBoardSpot?.kind === "edge" &&
          this.selectedBoardSpot.id === edgeId
            ? null
            : { kind: "edge", id: edgeId };
        this.render();
      });
    });

    this.root
      .querySelector("#btn-toggle-setup-edge")
      ?.addEventListener("click", () => {
        this.setupEdgeKind = this.setupEdgeKind === "road" ? "ship" : "road";
        this.render();
      });

    this.root
      .querySelector("#btn-toggle-robber-pirate")
      ?.addEventListener("click", () => {
        this.robberOrPirateMode =
          this.robberOrPirateMode === "robber" ? "pirate" : "robber";
        this.render();
      });

    this.root.querySelectorAll("[data-discard-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-discard-add") as ResourceType;
        this.discardSelection[r]++;
        this.render();
      });
    });

    this.root.querySelectorAll("[data-discard-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-discard-sub") as ResourceType;
        if (this.discardSelection[r] > 0) {
          this.discardSelection[r]--;
          this.render();
        }
      });
    });

    this.root
      .querySelector("#btn-discard-reset")
      ?.addEventListener("click", () => {
        this.discardSelection = emptyResources();
        this.render();
      });

    this.root
      .querySelector("#btn-discard-submit")
      ?.addEventListener("click", () => {
        this.dispatch(actingPlayerId, {
          type: "DISCARD_CARDS",
          resources: { ...this.discardSelection },
        });
      });

    this.root
      .querySelector("#btn-discard-auto")
      ?.addEventListener("click", () => {
        const botAct = CatanEngine.chooseBotAction(state, actingPlayerId);
        if (botAct) this.dispatch(actingPlayerId, botAct);
      });

    this.root.querySelectorAll("[data-gold-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const resource = btn.getAttribute("data-gold-pick") as ResourceType;
        this.dispatch(actingPlayerId, {
          type: "SELECT_GOLD_RESOURCE",
          resource,
        });
      });
    });

    this.root.querySelectorAll("[data-steal-victim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const victimId = btn.getAttribute("data-steal-victim")!;
        this.dispatch(actingPlayerId, {
          type: "STEAL_FROM_PLAYER",
          victimId,
        });
      });
    });

    this.root.querySelector("#btn-roll-dice")?.addEventListener("click", () => {
      this.dispatch(actingPlayerId, { type: "ROLL_DICE" });
    });

    this.root.querySelector("#btn-mode-road")?.addEventListener("click", () => {
      this.selectedBoardSpot = null;
      this.buildMode = this.buildMode === "road" ? null : "road";
      this.render();
    });

    this.root.querySelector("#btn-mode-ship")?.addEventListener("click", () => {
      this.selectedBoardSpot = null;
      this.buildMode = this.buildMode === "ship" ? null : "ship";
      this.render();
    });

    this.root
      .querySelector("#btn-mode-moveship")
      ?.addEventListener("click", () => {
        this.selectedBoardSpot = null;
        this.buildMode = this.buildMode === "move_ship" ? null : "move_ship";
        this.selectedMoveFromEdgeId = null;
        this.render();
      });

    this.root
      .querySelector("#btn-mode-settlement")
      ?.addEventListener("click", () => {
        this.selectedBoardSpot = null;
        this.buildMode = this.buildMode === "settlement" ? null : "settlement";
        this.render();
      });

    this.root.querySelector("#btn-mode-city")?.addEventListener("click", () => {
      this.selectedBoardSpot = null;
      this.buildMode = this.buildMode === "city" ? null : "city";
      this.render();
    });

    this.root.querySelector("#btn-mode-wall")?.addEventListener("click", () => {
      this.selectedBoardSpot = null;
      this.buildMode = this.buildMode === "wall" ? null : "wall";
      this.render();
    });

    this.root.querySelector("#btn-buy-dev")?.addEventListener("click", () => {
      this.dispatch(actingPlayerId, { type: "BUY_DEV_CARD" });
    });

    this.root
      .querySelector("#btn-mode-maritime")
      ?.addEventListener("click", () => {
        this.selectedBoardSpot = null;
        this.buildMode =
          this.buildMode === "maritime_trade" ? null : "maritime_trade";
        this.render();
      });

    this.root
      .querySelector("#btn-mode-domestic")
      ?.addEventListener("click", () => {
        this.selectedBoardSpot = null;
        this.buildMode =
          this.buildMode === "domestic_trade" ? null : "domestic_trade";
        this.render();
      });

    this.root
      .querySelector("#sel-dom-target")
      ?.addEventListener("change", (e) => {
        this.domesticTargetPlayerId = (e.target as HTMLSelectElement).value;
        this.render();
      });

    this.root.querySelectorAll("[data-dom-give]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-give") as ResourceType;
        this.domesticGive[r]++;
        this.domesticWant[r] = 0;
        this.render();
      });
    });

    this.root.querySelectorAll("[data-dom-give-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-give-dec") as ResourceType;
        if (this.domesticGive[r] > 0) {
          this.domesticGive[r]--;
          this.render();
        }
      });
    });

    this.root.querySelectorAll("[data-dom-want]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-want") as ResourceType;
        this.domesticWant[r]++;
        this.domesticGive[r] = 0;
        this.render();
      });
    });

    this.root.querySelectorAll("[data-dom-want-dec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-dom-want-dec") as ResourceType;
        if (this.domesticWant[r] > 0) {
          this.domesticWant[r]--;
          this.render();
        }
      });
    });

    this.root.querySelector("#btn-dom-reset")?.addEventListener("click", () => {
      this.domesticGive = emptyResources();
      this.domesticWant = emptyResources();
      this.render();
    });

    this.root
      .querySelector("#btn-dom-propose")
      ?.addEventListener("click", () => {
        this.dispatch(actingPlayerId, {
          type: "OFFER_DOMESTIC_TRADE",
          toPlayerId:
            this.domesticTargetPlayerId === "all"
              ? null
              : this.domesticTargetPlayerId,
          give: { ...this.domesticGive },
          want: { ...this.domesticWant },
        });
      });

    this.root.querySelectorAll("[data-accept-trade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const acceptorId = btn.getAttribute("data-accept-trade")!;
        if (state.activeTradeOffer) {
          this.dispatch(acceptorId, {
            type: "ACCEPT_DOMESTIC_TRADE",
            offerId: state.activeTradeOffer.id,
          });
        }
      });
    });

    this.root.querySelectorAll("[data-decline-trade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const declinerId = btn.getAttribute("data-decline-trade")!;
        if (state.activeTradeOffer) {
          this.dispatch(declinerId, {
            type: "DECLINE_DOMESTIC_TRADE",
            offerId: state.activeTradeOffer.id,
          });
        }
      });
    });

    this.root
      .querySelector("#btn-cancel-domestic")
      ?.addEventListener("click", () => {
        if (state.activeTradeOffer) {
          this.dispatch(state.activeTradeOffer.fromPlayerId, {
            type: "CANCEL_DOMESTIC_TRADE",
          });
        }
      });

    this.root.querySelectorAll("[data-maritime-give]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextGive = btn.getAttribute("data-maritime-give") as ResourceType;
        this.tradeGiveRes = nextGive;
        if (this.tradeReceiveRes === nextGive) {
          this.tradeReceiveRes =
            RESOURCES.find((r) => r !== nextGive) ?? "ore";
        }
        this.render();
      });
    });

    this.root.querySelectorAll("[data-maritime-receive]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextRecv = btn.getAttribute(
          "data-maritime-receive"
        ) as ResourceType;
        this.tradeReceiveRes = nextRecv;
        if (this.tradeGiveRes === nextRecv) {
          this.tradeGiveRes =
            RESOURCES.find((r) => r !== nextRecv) ?? "brick";
        }
        this.render();
      });
    });

    this.root
      .querySelector("#btn-exec-maritime")
      ?.addEventListener("click", () => {
        const ratios = getPlayerTradeRatios(state, actingPlayerId);
        this.dispatch(actingPlayerId, {
          type: "MARITIME_TRADE",
          give: this.tradeGiveRes,
          giveAmount: ratios[this.tradeGiveRes],
          receive: this.tradeReceiveRes,
        });
      });

    this.root
      .querySelector("#btn-play-knight")
      ?.addEventListener("click", () => {
        this.dispatch(actingPlayerId, { type: "PLAY_KNIGHT" });
      });

    this.root
      .querySelector("#btn-play-roadbuild")
      ?.addEventListener("click", () => {
        this.dispatch(actingPlayerId, { type: "PLAY_ROAD_BUILDING" });
      });

    this.root.querySelector("#btn-mode-yop")?.addEventListener("click", () => {
      this.selectedBoardSpot = null;
      this.buildMode =
        this.buildMode === "year_of_plenty" ? null : "year_of_plenty";
      this.render();
    });

    this.root.querySelectorAll("[data-yop-pick1]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.yopRes1 = btn.getAttribute("data-yop-pick1") as ResourceType;
        this.render();
      });
    });

    this.root.querySelectorAll("[data-yop-pick2]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.yopRes2 = btn.getAttribute("data-yop-pick2") as ResourceType;
        this.render();
      });
    });

    this.root.querySelector("#btn-exec-yop")?.addEventListener("click", () => {
      this.dispatch(actingPlayerId, {
        type: "PLAY_YEAR_OF_PLENTY",
        resource1: this.yopRes1,
        resource2: this.yopRes2,
      });
    });

    this.root.querySelector("#btn-mode-mono")?.addEventListener("click", () => {
      this.selectedBoardSpot = null;
      this.buildMode = this.buildMode === "monopoly" ? null : "monopoly";
      this.render();
    });

    this.root.querySelectorAll("[data-mono-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.monoRes = btn.getAttribute("data-mono-pick") as ResourceType;
        this.render();
      });
    });

    this.root.querySelector("#btn-exec-mono")?.addEventListener("click", () => {
      this.dispatch(actingPlayerId, {
        type: "PLAY_MONOPOLY",
        resource: this.monoRes,
      });
    });

    this.root.querySelector("#btn-end-turn")?.addEventListener("click", () => {
      if (state.phase === "SPECIAL_BUILDING") {
        this.dispatch(actingPlayerId, { type: "END_SPECIAL_BUILD" });
      } else {
        this.dispatch(actingPlayerId, { type: "END_TURN" });
      }
    });
  }
}

export { MultiGamePlatformApp };

if (typeof document !== "undefined") {
  const root = document.getElementById("app");
  if (root) {
    new MultiGamePlatformApp(root);
  }
}
