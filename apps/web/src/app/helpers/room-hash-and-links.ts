import type { AppModel } from "../types.ts";

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
    if (
      !stripped ||
      stripped.toLowerCase() === "debug" ||
      !/^[A-Za-z0-9_-]{3,40}$/.test(stripped)
    ) {
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

export function extractDebugModeFromLocationPure(
  search: string,
  hash: string
): boolean {
  const checkPart = (raw: string): boolean => {
    const trimmed = (raw ?? "").trim().replace(/^[?#]+/, "");
    if (!trimmed) return false;
    if (trimmed.toLowerCase() === "debug") return true;
    const params = new URLSearchParams(trimmed);
    if (!params.has("debug")) return false;
    const val = (params.get("debug") ?? "").trim().toLowerCase();
    return val === "" || val === "1" || val === "true" || val === "yes";
  };
  return checkPart(search) || checkPart(hash);
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
  params.delete("debug");
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
