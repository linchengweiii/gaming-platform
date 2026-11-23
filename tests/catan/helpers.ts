import { expect } from "bun:test";
import {
  type PlayerDescriptor,
  createMatchSessionState,
  dispatchSessionActionPure,
  getSessionState,
} from "@gaming-platform/core";
import {
  COMMODITIES,
  CatanEngine,
  RESOURCES,
  type CatanConfig,
  type CatanState,
  type ImprovementDiscipline,
  type ProgressCardType,
  getNextActingPlayerId,
} from "@gaming-platform/catan";

export const FOUR_PLAYERS: PlayerDescriptor[] = [
  { id: "p1", name: "Alice", color: "#e63946", isBot: true },
  { id: "p2", name: "Bob", color: "#2563eb", isBot: true },
  { id: "p3", name: "Charlie", color: "#f59e0b", isBot: true },
  { id: "p4", name: "Diana", color: "#10b981", isBot: true },
];

export const SIX_PLAYERS: PlayerDescriptor[] = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
  color: "",
  isBot: true,
  botDifficulty: "smart",
}));

export function completeSnakeDraftSetup(state: CatanState) {
  let s = state;
  const orderTrace: string[] = [];
  while (s.phase.startsWith("SETUP_")) {
    const actor = getNextActingPlayerId(s)!;
    if (s.phase === "SETUP_SETTLEMENT_1" || s.phase === "SETUP_SETTLEMENT_2") {
      orderTrace.push(actor);
    }
    const act = CatanEngine.chooseBotAction(s, actor)!;
    s = CatanEngine.applyAction(s, actor, act).state;
  }
  return { state: s, orderTrace };
}

export function runSimulatedMatch(
  players: PlayerDescriptor[],
  config: Partial<CatanConfig>,
  seed: string,
  maxSteps = 5000
): CatanState {
  const initial = CatanEngine.initGame(players, config, seed);
  let session = createMatchSessionState(CatanEngine, initial, true);
  let steps = 0;

  while (getSessionState(session).phase !== "GAME_OVER" && steps < maxSteps) {
    const cur = getSessionState(session);
    const actor = getNextActingPlayerId(cur);
    expect(actor).not.toBeNull();
    const act = CatanEngine.chooseBotAction(cur, actor!);
    expect(act).not.toBeNull();
    session = dispatchSessionActionPure(
      CatanEngine,
      session,
      actor!,
      act!,
      steps
    ).session;
    steps++;
  }

  return getSessionState(session);
}

export function resetAllPlayerHandsToBank(state: CatanState): void {
  for (const p of state.players) {
    for (const r of RESOURCES) {
      state.bank[r] += p.resources[r];
      p.resources[r] = 0;
    }
    for (const c of COMMODITIES) {
      state.commodityBank[c] += p.commodities[c];
      p.commodities[c] = 0;
    }
  }
}

export function grantCardFromDeckForTest(
  state: CatanState,
  playerId: string,
  cardId: string,
  type: ProgressCardType,
  discipline: ImprovementDiscipline
): void {
  const deck = state.progressDecks[discipline];
  const idx = deck.indexOf(type);
  if (idx >= 0) {
    deck.splice(idx, 1);
  }
  const player = state.players.find((p) => p.id === playerId)!;
  player.progressCards.push({ id: cardId, type, discipline });
}
