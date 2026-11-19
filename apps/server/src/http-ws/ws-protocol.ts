import crypto from "node:crypto";
import { MAX_WS_PAYLOAD_BYTES } from "../config.ts";

export interface DecodedWsFrame {
  readonly opcode: number;
  readonly text?: string;
  readonly payload?: Buffer;
}

export function computeWsAcceptKeyPure(secWebsocketKey: string): string {
  return crypto
    .createHash("sha1")
    .update(secWebsocketKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

export function encodeWsControlFramePure(
  opcode: number,
  payload: Buffer = Buffer.alloc(0)
): Buffer {
  const clipped = payload.length > 125 ? payload.subarray(0, 125) : payload;
  return Buffer.concat([
    Buffer.from([0x80 | (opcode & 0x0f), clipped.length]),
    clipped,
  ]);
}

export function encodeWsTextFramePure(payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const len = json.length;
  const header = (() => {
    if (len < 126) {
      return Buffer.from([0x81, len]);
    }
    if (len < 65536) {
      const buf = Buffer.alloc(4);
      buf[0] = 0x81;
      buf[1] = 126;
      buf.writeUInt16BE(len, 2);
      return buf;
    }
    const buf = Buffer.alloc(10);
    buf[0] = 0x81;
    buf[1] = 127;
    buf.writeBigUInt64BE(BigInt(len), 2);
    return buf;
  })();
  return Buffer.concat([header, json]);
}

export function decodeWsFramesStreamPure(
  buffer: Buffer,
  maxPayloadBytes: number = MAX_WS_PAYLOAD_BYTES,
  pendingFragments: readonly Buffer[] = []
): {
  readonly frames: readonly DecodedWsFrame[];
  readonly remainder: Buffer;
  readonly pendingFragments: readonly Buffer[];
} {
  const sumBytes = (parts: readonly Buffer[]): number =>
    parts.reduce((sum, b) => sum + b.length, 0);

  const parseFrom = (
    cursor: number,
    acc: readonly DecodedWsFrame[],
    fragments: readonly Buffer[]
  ): {
    readonly frames: readonly DecodedWsFrame[];
    readonly remainder: Buffer;
    readonly pendingFragments: readonly Buffer[];
  } => {
    if (cursor + 2 > buffer.length) {
      return {
        frames: acc,
        remainder: buffer.subarray(cursor),
        pendingFragments: fragments,
      };
    }
    const firstByte = buffer[cursor]!;
    const secondByte = buffer[cursor + 1]!;
    const isFin = Boolean(firstByte & 0x80);
    const opcode = firstByte & 0x0f;
    const isMasked = Boolean(secondByte & 0x80);
    const rawLen = secondByte & 0x7f;

    if (opcode >= 0x08 && (!isFin || rawLen > 125)) {
      throw new Error("Invalid WebSocket control frame");
    }

    const lengthInfo = (() => {
      if (rawLen === 126) {
        if (cursor + 4 > buffer.length) return null;
        return {
          payloadLen: buffer.readUInt16BE(cursor + 2),
          offset: cursor + 4,
        };
      }
      if (rawLen === 127) {
        if (cursor + 10 > buffer.length) return null;
        const bigLen = buffer.readBigUInt64BE(cursor + 2);
        if (bigLen > BigInt(maxPayloadBytes)) {
          throw new Error("WebSocket frame exceeds maximum payload size");
        }
        return {
          payloadLen: Number(bigLen),
          offset: cursor + 10,
        };
      }
      return { payloadLen: rawLen, offset: cursor + 2 };
    })();

    if (!lengthInfo) {
      return {
        frames: acc,
        remainder: buffer.subarray(cursor),
        pendingFragments: fragments,
      };
    }

    if (lengthInfo.payloadLen > maxPayloadBytes) {
      throw new Error("WebSocket frame exceeds maximum payload size");
    }

    const totalNeeded =
      lengthInfo.offset + (isMasked ? 4 : 0) + lengthInfo.payloadLen;
    if (totalNeeded > buffer.length) {
      return {
        frames: acc,
        remainder: buffer.subarray(cursor),
        pendingFragments: fragments,
      };
    }

    const extractPayload = (): Buffer => {
      if (!isMasked) {
        return Buffer.from(
          buffer.subarray(
            lengthInfo.offset,
            lengthInfo.offset + lengthInfo.payloadLen
          )
        );
      }
      const mask = buffer.subarray(lengthInfo.offset, lengthInfo.offset + 4);
      const dataStart = lengthInfo.offset + 4;
      const unmasked = Uint8Array.from(
        { length: lengthInfo.payloadLen },
        (_, i) => buffer[dataStart + i]! ^ mask[i % 4]!
      );
      return Buffer.from(unmasked);
    };

    if (opcode === 0x08) {
      return {
        frames: [...acc, { opcode: 0x08 }],
        remainder: Buffer.alloc(0),
        pendingFragments: [],
      };
    }

    if (opcode === 0x09 || opcode === 0x0a) {
      return parseFrom(
        totalNeeded,
        [...acc, { opcode, payload: extractPayload() }],
        fragments
      );
    }

    if (opcode === 0x01 || opcode === 0x02) {
      if (fragments.length > 0) {
        throw new Error("Unexpected new data frame before continuation FIN");
      }
      const payload = extractPayload();
      if (isFin) {
        return parseFrom(
          totalNeeded,
          [...acc, { opcode: 0x01, text: payload.toString("utf8") }],
          []
        );
      }
      return parseFrom(totalNeeded, acc, [payload]);
    }

    if (opcode === 0x00) {
      if (fragments.length === 0) {
        throw new Error("Unexpected WebSocket continuation frame");
      }
      const payload = extractPayload();
      const nextFragments = [...fragments, payload];
      if (sumBytes(nextFragments) > maxPayloadBytes) {
        throw new Error("Fragmented WebSocket message exceeds maximum size");
      }
      if (isFin) {
        const merged = Buffer.concat(nextFragments);
        return parseFrom(
          totalNeeded,
          [...acc, { opcode: 0x01, text: merged.toString("utf8") }],
          []
        );
      }
      return parseFrom(totalNeeded, acc, nextFragments);
    }

    return parseFrom(totalNeeded, [...acc, { opcode }], fragments);
  };

  return parseFrom(0, [], pendingFragments);
}

export function decodeWsFramesPure(buffer: Buffer): readonly DecodedWsFrame[] {
  return decodeWsFramesStreamPure(buffer).frames;
}
