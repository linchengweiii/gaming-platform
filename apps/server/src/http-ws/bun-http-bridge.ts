import type http from "node:http";
import {
  MAX_WS_PAYLOAD_BYTES,
  MAX_WS_WRITE_BACKPRESSURE_BYTES,
  PUBLIC_DIR,
} from "../config.ts";
import type { PlatformRoomManager } from "../room-manager.ts";
import type { GuestSessionStore } from "./guest-sessions.ts";
import { handleHttpRequest } from "./http-routes.ts";
import { resolveStaticFileMeta } from "./viewer-and-static.ts";
import type { RealtimeHub, WsTransport } from "./ws-hub-types-and-presence.ts";

interface BunWsData {
  readonly url: string;
  clientId: string | null;
}

interface BunServerWebSocketLike {
  readonly data: BunWsData;
  readonly readyState: number;
  send(data: string | Uint8Array): number;
  ping?: (data?: string | Uint8Array) => number;
  close(code?: number, reason?: string): void;
  getBufferedAmount?: () => number;
}

interface BunServerLike {
  readonly port: number;
  readonly hostname: string;
  upgrade(req: Request, opts?: { readonly data: BunWsData }): boolean;
  stop(closeActiveConnections?: boolean): void;
}

interface BunRuntimeLike {
  serve(options: {
    readonly port: number;
    readonly hostname?: string;
    readonly idleTimeout?: number;
    fetch(
      req: Request,
      server: BunServerLike
    ): Response | undefined | Promise<Response | undefined>;
    readonly websocket: {
      readonly maxPayloadLength?: number;
      readonly backpressureLimit?: number;
      readonly idleTimeout?: number;
      open(ws: BunServerWebSocketLike): void;
      message(ws: BunServerWebSocketLike, message: string | Uint8Array): void;
      ping?(ws: BunServerWebSocketLike): void;
      pong?(ws: BunServerWebSocketLike): void;
      close(ws: BunServerWebSocketLike): void;
    };
  }): BunServerLike;
  file(filePath: string): unknown;
}

function getBunRuntime(): BunRuntimeLike | null {
  const candidate = (globalThis as Record<string, unknown>).Bun as
    | BunRuntimeLike
    | undefined;
  return candidate && typeof candidate.serve === "function" ? candidate : null;
}

function createBunWsTransport(ws: BunServerWebSocketLike): WsTransport {
  let closed = false;
  const closeSocket = (): void => {
    if (closed) return;
    closed = true;
    try {
      ws.close();
    } catch {
      // Ignore close errors
    }
  };
  return {
    isClosed: () => closed || ws.readyState > 1,
    sendJson: (payload) => {
      if (closed || ws.readyState > 1) return false;
      const buffered = ws.getBufferedAmount?.();
      if (
        typeof buffered === "number" &&
        buffered > MAX_WS_WRITE_BACKPRESSURE_BYTES
      ) {
        closeSocket();
        return false;
      }
      try {
        ws.send(JSON.stringify(payload));
        return true;
      } catch {
        closeSocket();
        return false;
      }
    },
    sendPing: () => {
      if (closed || ws.readyState > 1) return false;
      try {
        ws.ping?.();
        return true;
      } catch {
        closeSocket();
        return false;
      }
    },
    close: closeSocket,
  };
}

function tryServeStaticBunResponse(
  bunRuntime: BunRuntimeLike,
  publicDir: string,
  pathname: string
): Response | null {
  const meta = resolveStaticFileMeta(publicDir, pathname);
  if (!meta) return null;
  return new Response(bunRuntime.file(meta.filePath) as BodyInit, {
    status: 200,
    headers: meta.headers,
  });
}

function createSyntheticNodeReq(request: Request): http.IncomingMessage {
  const urlObj = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const bodyStream = request.body;

  const syntheticReq = {
    method: request.method,
    url: `${urlObj.pathname}${urlObj.search}`,
    headers,
    async *[Symbol.asyncIterator](): AsyncGenerator<Buffer> {
      if (!bodyStream) return;
      const reader = bodyStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            yield Buffer.from(value);
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
  return syntheticReq as unknown as http.IncomingMessage;
}

function parseListenArgs(args: readonly unknown[]): {
  readonly port: number;
  readonly hostname?: string;
  readonly callback?: () => void;
} {
  let port = 0;
  let hostname: string | undefined;
  let callback: (() => void) | undefined;

  if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
    const opts = args[0] as { port?: number; host?: string; hostname?: string };
    port = typeof opts.port === "number" ? opts.port : 0;
    hostname = opts.host ?? opts.hostname;
    if (typeof args[1] === "function") {
      callback = args[1] as () => void;
    }
    return { port, hostname, callback };
  }

  for (const arg of args) {
    if (typeof arg === "number" && Number.isFinite(arg) && port === 0) {
      port = arg;
    } else if (typeof arg === "string" && !hostname) {
      hostname = arg;
    } else if (typeof arg === "function" && !callback) {
      callback = arg as () => void;
    }
  }
  return { port, hostname, callback };
}

export function attachBunNativeTransport(
  server: http.Server,
  roomManager: PlatformRoomManager,
  hub: RealtimeHub,
  guestSessions: GuestSessionStore
): boolean {
  const bunRuntime = getBunRuntime();
  if (!bunRuntime) return false;

  let bunServer: BunServerLike | null = null;
  let closeEmitted = false;

  const handleFetch = async (
    request: Request,
    liveBunServer: BunServerLike
  ): Promise<Response | undefined> => {
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const upgraded = liveBunServer.upgrade(request, {
        data: { url: request.url, clientId: null },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    let statusCode = 200;
    let headersSent = false;
    let responseHeaders: Record<string, string> = {};
    let resolvedResponse: Response | null = null;
    const chunks: Buffer[] = [];
    const pushChunk = (chunk: string | Uint8Array): void => {
      chunks.push(
        typeof chunk === "string"
          ? Buffer.from(chunk, "utf8")
          : Buffer.from(chunk)
      );
    };

    const syntheticRes = {
      get headersSent() {
        return headersSent;
      },
      writeHead(
        status: number,
        headers?: Record<string, string | number | readonly string[]>
      ) {
        statusCode = status;
        headersSent = true;
        if (headers) {
          responseHeaders = Object.fromEntries(
            Object.entries(headers).map(([k, v]) => [
              k,
              Array.isArray(v) ? v.join(", ") : String(v),
            ])
          );
        }
        return syntheticRes;
      },
      write(chunk: string | Uint8Array) {
        pushChunk(chunk);
        return true;
      },
      end(chunk?: string | Uint8Array) {
        if (chunk !== undefined) pushChunk(chunk);
        const body =
          chunks.length === 0
            ? null
            : chunks.length === 1
              ? chunks[0]!
              : Buffer.concat(chunks);
        resolvedResponse = new Response(body, {
          status: statusCode,
          headers: responseHeaders,
        });
        return syntheticRes;
      },
    } as unknown as http.ServerResponse;

    await handleHttpRequest(
      createSyntheticNodeReq(request),
      syntheticRes,
      roomManager,
      hub,
      guestSessions,
      (pathname) => {
        const staticRes = tryServeStaticBunResponse(
          bunRuntime,
          PUBLIC_DIR,
          pathname
        );
        if (!staticRes) return false;
        resolvedResponse = staticRes;
        return true;
      }
    );
    return resolvedResponse!;
  };

  const serverAny = server as any;

  serverAny.listen = (...args: unknown[]): http.Server => {
    const { port, hostname, callback } = parseListenArgs(args);
    closeEmitted = false;
    bunServer = bunRuntime.serve({
      port,
      ...(hostname ? { hostname } : {}),
      idleTimeout: 60,
      fetch: handleFetch,
      websocket: {
        maxPayloadLength: MAX_WS_PAYLOAD_BYTES,
        backpressureLimit: MAX_WS_WRITE_BACKPRESSURE_BYTES,
        idleTimeout: 120,
        open(ws) {
          const transport = createBunWsTransport(ws);
          ws.data.clientId = hub.attachNativeWsClient(ws.data.url, transport);
        },
        message(ws, rawMsg) {
          if (!ws.data.clientId) return;
          const text =
            typeof rawMsg === "string"
              ? rawMsg
              : Buffer.from(rawMsg).toString("utf8");
          hub.handleNativeWsMessage(ws.data.clientId, text);
        },
        ping(ws) {
          if (ws.data.clientId) hub.touchNativeWsClient(ws.data.clientId);
        },
        pong(ws) {
          if (ws.data.clientId) hub.touchNativeWsClient(ws.data.clientId);
        },
        close(ws) {
          if (ws.data.clientId) {
            hub.detachNativeWsClient(ws.data.clientId);
            ws.data.clientId = null;
          }
        },
      },
    });
    queueMicrotask(() => {
      server.emit("listening");
      callback?.();
    });
    return server;
  };

  serverAny.address = () => {
    if (!bunServer) return null;
    return {
      port: bunServer.port,
      address: bunServer.hostname || "0.0.0.0",
      family: "IPv4",
    };
  };

  serverAny.closeAllConnections = () => {
    if (bunServer) {
      bunServer.stop(true);
    }
  };

  serverAny.close = (cb?: (err?: Error) => void): http.Server => {
    if (bunServer) {
      const live = bunServer;
      bunServer = null;
      live.stop(true);
    }
    if (!closeEmitted) {
      closeEmitted = true;
      server.emit("close");
    }
    if (typeof cb === "function") {
      queueMicrotask(() => cb());
    }
    return server;
  };

  return true;
}
