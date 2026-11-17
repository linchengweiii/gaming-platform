export type {
  CreateRoomOptions,
  PlatformRoomManagerConstructor,
  RoomInstance,
  RoomManagerState,
  RoomRecord,
  RoomSetupUpdates,
  RoomSummary,
  StepBotOptions,
} from "./room-manager/types.ts";
export {
  canViewerControlActorPure,
  computeRoomHashPure,
  createInitialRoomManagerState,
  getRoomActingPlayerId,
  getRoomPlayerBoundsPure,
  getRoomRecordPure,
  listRoomsPure,
  normalizeRoomHashIdPure,
  rebuildRoomPlayersPure,
  removeRoomRecordFromState,
  resolveRedoTargetPlayerIdPure,
  resolveUndoTargetPlayerIdPure,
  setRoomRecordInState,
  toRoomSummaryPure,
} from "./room-manager/helpers.ts";
export {
  addLocalPlayerPure,
  createRoomPure,
  removeLocalPlayerPure,
  updateRoomSetupPure,
} from "./room-manager/lifecycle-and-setup.ts";
export {
  closeRoomPure,
  joinRoomPure,
  leaveRoomPure,
  renameGuestEverywherePure,
  signOutGuestEverywherePure,
  signOutPlayerFromRoomPure,
} from "./room-manager/seats-and-guests.ts";
export {
  dispatchActionPure,
  finishCatanSetupWithBotsPure,
  redoActionPure,
  setRoomAutoStepBotsPure,
  startGamePure,
  stepBotPure,
  undoActionPure,
} from "./room-manager/match-actions.ts";
export {
  PlatformRoomManager,
  createPlatformRoomManager,
} from "./room-manager/facade.ts";
