import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT } from "./config.ts";
import { createPlatformServer } from "./http-ws/create-server.ts";

export type { DecodedWsFrame } from "./http-ws/ws-protocol.ts";
export {
  computeWsAcceptKeyPure,
  decodeWsFramesPure,
  decodeWsFramesStreamPure,
  encodeWsControlFramePure,
  encodeWsTextFramePure,
} from "./http-ws/ws-protocol.ts";
export {
  resolveEffectiveViewerIdPure,
  resolveSafeStaticPathPure,
} from "./http-ws/viewer-and-static.ts";
export { createPlatformServer };
export type PlatformServerHandle = ReturnType<typeof createPlatformServer>;

// Start HTTP server if executed directly
const isMain =
  Boolean((import.meta as ImportMeta & { main?: boolean }).main) ||
  import.meta.url === `file://${process.argv[1]}` ||
  Boolean(process.argv[1]?.endsWith("apps/server/src/index.ts"));

if (isMain) {
  const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  const { server } = createPlatformServer();
  server.listen(port, () => {
    console.log(
      `🎲 Gaming Platform Server listening on http://${DEFAULT_SERVER_HOST}:${port}`
    );
  });
}
