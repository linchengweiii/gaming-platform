import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type PlatformServerHandle,
  decodeWsFramesPure,
  encodeWsTextFramePure,
} from "../../apps/server/src/index.ts";

const SERVER_TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_PUBLIC_DIR = path.resolve(SERVER_TEST_DIR, "../../apps/web/public");

export function createFakeDomRoot(): any {
  return {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
}

export function readWebIndexHtml(): string {
  return fs.readFileSync(path.join(WEB_PUBLIC_DIR, "index.html"), "utf8");
}

function extractCssImportTargets(cssSource: string): string[] {
  const targets: string[] = [];
  const importRegex =
    /@import\s+(?:url\(\s*(['"]?)([^'")\s]+)\1\s*\)|(['"])([^'"]+)\3)\s*;/g;
  let match: RegExpExecArray | null = importRegex.exec(cssSource);
  while (match !== null) {
    const rawTarget = (match[2] ?? match[4] ?? "").trim();
    if (
      rawTarget &&
      !rawTarget.startsWith("http://") &&
      !rawTarget.startsWith("https://") &&
      !rawTarget.startsWith("data:")
    ) {
      const cleanTarget = rawTarget.split("?")[0]!.split("#")[0]!;
      if (cleanTarget) {
        targets.push(cleanTarget);
      }
    }
    match = importRegex.exec(cssSource);
  }
  return targets;
}

export function readCombinedWebStyles(): string {
  const visited = new Set<string>();
  const chunks: string[] = [];

  const readCssFileRecursive = (absFilePath: string): void => {
    const resolved = path.resolve(absFilePath);
    if (visited.has(resolved) || !fs.existsSync(resolved)) {
      return;
    }
    visited.add(resolved);
    const content = fs.readFileSync(resolved, "utf8");
    chunks.push(content);
    const baseDir = path.dirname(resolved);
    for (const relImport of extractCssImportTargets(content)) {
      readCssFileRecursive(path.resolve(baseDir, relImport));
    }
  };

  readCssFileRecursive(path.join(WEB_PUBLIC_DIR, "styles.css"));

  const modularStylesDir = path.join(WEB_PUBLIC_DIR, "styles");
  if (fs.existsSync(modularStylesDir) && fs.statSync(modularStylesDir).isDirectory()) {
    const extraFiles = fs
      .readdirSync(modularStylesDir)
      .filter((name) => name.endsWith(".css"))
      .sort();
    for (const fileName of extraFiles) {
      readCssFileRecursive(path.join(modularStylesDir, fileName));
    }
  }

  return chunks.join("\n");
}

export function authHeadersForTestGuest(
  srv: PlatformServerHandle,
  playerId: string,
  extra?: Record<string, string>
): Record<string, string> {
  const token = srv.guestSessions.issueTokenForPlayer(playerId);
  return {
    "Content-Type": "application/json",
    "X-Guest-Token": token,
    ...extra,
  };
}

export function openSubscribedTestWs(
  srv: PlatformServerHandle,
  roomId: string,
  playerId: string
): {
  receivedMessages: any[];
  disconnect: () => void;
} {
  const token = srv.guestSessions.issueTokenForPlayer(playerId);
  const listeners: Record<string, Array<(arg?: any) => void>> = {};
  const receivedMessages: any[] = [];
  const fakeSocket: any = {
    destroyed: false,
    writable: true,
    on: (ev: string, fn: (arg?: any) => void) => {
      listeners[ev] = [...(listeners[ev] ?? []), fn];
    },
    write: (chunk: Buffer | string) => {
      if (Buffer.isBuffer(chunk)) {
        for (const frame of decodeWsFramesPure(chunk)) {
          if (frame.opcode === 0x01 && frame.text) {
            receivedMessages.push(JSON.parse(frame.text));
          }
        }
      }
    },
    end: () => {
      fakeSocket.destroyed = true;
      for (const fn of listeners.close ?? []) fn();
    },
    destroy: () => {
      if (fakeSocket.destroyed) return;
      fakeSocket.destroyed = true;
      for (const fn of listeners.close ?? []) fn();
    },
  };

  srv.server.emit(
    "upgrade",
    {
      url: `/?playerId=${encodeURIComponent(playerId)}&token=${encodeURIComponent(token)}`,
      headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" },
    },
    fakeSocket
  );
  for (const fn of listeners.data ?? []) {
    fn(
      encodeWsTextFramePure({
        type: "SUBSCRIBE_ROOM",
        roomId,
        playerId,
        token,
      })
    );
  }

  return {
    receivedMessages,
    disconnect: () => {
      fakeSocket.destroy();
    },
  };
}
