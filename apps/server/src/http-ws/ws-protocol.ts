import crypto from "node:crypto";

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

export function decodeWsFramesStreamPure(buffer: Buffer): {
  readonly frames: readonly DecodedWsFrame[];
  readonly remainder: Buffer;
} {
  const parseFrom = (
    cursor: number,
    acc: readonly DecodedWsFrame[]
  ): {
    readonly frames: readonly DecodedWsFrame[];
    readonly remainder: Buffer;
  } => {
    if (cursor + 2 > buffer.length) {
      return { frames: acc, remainder: buffer.subarray(cursor) };
    }
    const opcode = buffer[cursor]! & 0x0f;
    const isMasked = Boolean(buffer[cursor + 1]! & 0x80);
    const rawLen = buffer[cursor + 1]! & 0x7f;

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
        return {
          payloadLen: Number(buffer.readBigUInt64BE(cursor + 2)),
          offset: cursor + 10,
        };
      }
      return { payloadLen: rawLen, offset: cursor + 2 };
    })();

    if (!lengthInfo) {
      return { frames: acc, remainder: buffer.subarray(cursor) };
    }
    const totalNeeded =
      lengthInfo.offset + (isMasked ? 4 : 0) + lengthInfo.payloadLen;
    if (totalNeeded > buffer.length) {
      return { frames: acc, remainder: buffer.subarray(cursor) };
    }

    const extractPayload = (): Buffer => {
      if (!isMasked) {
        return buffer.subarray(
          lengthInfo.offset,
          lengthInfo.offset + lengthInfo.payloadLen
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
      };
    }

    if (opcode === 0x01) {
      const payload = extractPayload();
      return parseFrom(totalNeeded, [
        ...acc,
        { opcode: 0x01, text: payload.toString("utf8") },
      ]);
    }

    if (opcode === 0x09) {
      return parseFrom(totalNeeded, [
        ...acc,
        { opcode: 0x09, payload: extractPayload() },
      ]);
    }

    return parseFrom(totalNeeded, [...acc, { opcode }]);
  };

  return parseFrom(0, []);
}

export function decodeWsFramesPure(buffer: Buffer): readonly DecodedWsFrame[] {
  return decodeWsFramesStreamPure(buffer).frames;
}
