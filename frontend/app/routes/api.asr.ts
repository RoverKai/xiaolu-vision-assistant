import crypto from "node:crypto";
import tls from "node:tls";
import { gunzipSync, gzipSync } from "node:zlib";

import type { ActionFunctionArgs } from "react-router";

type AsrRequest = {
  pcm16Base64?: string;
  sampleRate?: number;
};

type AsrFrame = {
  messageType: number;
  flags: number;
  payload: unknown;
};

const asrEndpoint =
  process.env.VOLCENGINE_ASR_ENDPOINT ??
  "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let payload: AsrRequest;
  try {
    payload = (await request.json()) as AsrRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.pcm16Base64) {
    return Response.json({ error: "pcm16Base64 is required" }, { status: 400 });
  }

  try {
    const audio = Buffer.from(payload.pcm16Base64, "base64");
    const text = await recognizePcm(audio, payload.sampleRate ?? 16000);
    return Response.json({ text });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "ASR request failed" },
      { status: 502 },
    );
  }
}

async function recognizePcm(audio: Buffer, sampleRate: number) {
  const apiKey = process.env.VOLCENGINE_ASR_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VOLCENGINE_ASR_API_KEY");
  }

  const url = new URL(asrEndpoint);
  const socket = await connectWebSocket(url, {
    "X-Api-Key": apiKey,
    "X-Api-Resource-Id":
      process.env.VOLCENGINE_ASR_RESOURCE_ID ?? "volc.seedasr.sauc.duration",
    "X-Api-Request-Id": crypto.randomUUID(),
    "X-Api-Connect-Id": crypto.randomUUID(),
    "X-Api-Sequence": "-1",
  });

  const frames: AsrFrame[] = [];

  try {
    socket.send(
      buildAsrPacket(0x1, 0x0, 0x1, 0x1, {
        user: {
          uid: process.env.VOLCENGINE_ASR_UID ?? "xiaolu-web",
        },
        audio: {
          format: "pcm",
          codec: "raw",
          rate: sampleRate,
          bits: 16,
          channel: 1,
          language: "zh-CN",
        },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          show_utterances: true,
          corpus: {
            context: JSON.stringify({
              context_type: "dialog_ctx",
              context_data: [{ text: "小噜和小鹿都是助手唤醒词。" }],
            }),
          },
        },
      }),
    );

    const chunkSize = 3200;
    for (let offset = 0; offset < audio.length; offset += chunkSize) {
      const chunk = audio.subarray(offset, Math.min(offset + chunkSize, audio.length));
      const isLast = offset + chunkSize >= audio.length;
      socket.send(buildAsrPacket(0x2, isLast ? 0x2 : 0x0, 0x0, 0x1, chunk));
    }

    await socket.readUntil((frame) => {
      const parsed = parseAsrFrame(frame);
      if (parsed) {
        frames.push(parsed);
      }
      return parsed?.messageType === 0x9 && parsed.flags === 0x3;
    });
  } finally {
    socket.close();
  }

  const text = frames
    .map((frame) => extractText(frame.payload))
    .filter(Boolean)
    .at(-1);

  return text ?? "";
}

function buildAsrPacket(
  messageType: number,
  flags: number,
  serialization: number,
  compression: number,
  payload: unknown,
) {
  const header = Buffer.from([
    0x11,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00,
  ]);

  const payloadBuffer =
    Buffer.isBuffer(payload) || payload instanceof Uint8Array
      ? Buffer.from(payload)
      : Buffer.from(JSON.stringify(payload));
  const finalPayload = compression === 0x1 ? gzipSync(payloadBuffer) : payloadBuffer;
  const size = Buffer.alloc(4);
  size.writeUInt32BE(finalPayload.length, 0);

  return Buffer.concat([header, size, finalPayload]);
}

function parseAsrFrame(frame: Buffer): AsrFrame | null {
  if (frame.length < 8) {
    return null;
  }

  const headerSize = (frame[0] & 0x0f) * 4;
  const messageType = frame[1] >> 4;
  const flags = frame[1] & 0x0f;
  const serialization = frame[2] >> 4;
  const compression = frame[2] & 0x0f;

  let offset = headerSize;
  if (messageType === 0xf) {
    offset += 4;
  } else if (flags === 0x1 || flags === 0x3) {
    offset += 4;
  }

  if (frame.length < offset + 4) {
    return null;
  }

  const payloadSize = frame.readUInt32BE(offset);
  offset += 4;
  const payloadBuffer = frame.subarray(offset, offset + payloadSize);
  const rawPayload = compression === 0x1 ? gunzipSync(payloadBuffer) : payloadBuffer;

  if (serialization === 0x1 || messageType === 0xf) {
    const payloadText = rawPayload.toString("utf8");
    return {
      messageType,
      flags,
      payload: JSON.parse(payloadText || "{}"),
    };
  }

  return {
    messageType,
    flags,
    payload: rawPayload,
  };
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const result = record.result;
  if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.text === "string") {
      return resultRecord.text.trim();
    }
  }

  if (typeof record.text === "string") {
    return record.text.trim();
  }

  if (typeof record.message === "string") {
    throw new Error(record.message);
  }

  return "";
}

async function connectWebSocket(url: URL, headers: Record<string, string>) {
  if (url.protocol !== "wss:") {
    throw new Error("Only wss ASR endpoints are supported");
  }

  const port = url.port ? Number(url.port) : 443;
  const socket = tls.connect({
    host: url.hostname,
    port,
    servername: url.hostname,
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  const key = crypto.randomBytes(16).toString("base64");
  const headerLines = [
    `GET ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${url.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    "",
    "",
  ];

  socket.write(headerLines.join("\r\n"));

  const { remaining } = await readHandshake(socket);
  const parser = createFrameParser(socket, remaining);

  return {
    send(data: Buffer) {
      socket.write(encodeClientFrame(data));
    },
    readUntil(predicate: (frame: Buffer) => boolean) {
      return parser.readUntil(predicate);
    },
    close() {
      socket.end();
    },
  };
}

async function readHandshake(socket: tls.TLSSocket) {
  let buffer = Buffer.alloc(0);

  while (!buffer.includes("\r\n\r\n")) {
    const chunk = await readSocketChunk(socket);
    buffer = Buffer.concat([buffer, chunk]);
  }

  const headerEnd = buffer.indexOf("\r\n\r\n");
  const headerText = buffer.subarray(0, headerEnd).toString("utf8");
  if (!headerText.startsWith("HTTP/1.1 101")) {
    throw new Error(headerText.split("\r\n")[0] || "ASR WebSocket upgrade failed");
  }

  return {
    remaining: buffer.subarray(headerEnd + 4),
  };
}

function createFrameParser(socket: tls.TLSSocket, initialBuffer: Buffer) {
  let buffer = initialBuffer;

  async function readFrame(): Promise<Buffer> {
    while (true) {
      const parsed = tryReadFrame(buffer);
      if (parsed) {
        buffer = buffer.subarray(parsed.consumed);
        if (parsed.opcode === 0x9) {
          socket.write(encodeClientFrame(parsed.payload, 0x0a));
          continue;
        }
        if (parsed.opcode === 0x8) {
          throw new Error("ASR WebSocket closed by server");
        }
        if (parsed.opcode === 0x1) {
          const message = parsed.payload.toString("utf8");
          throw new Error(message || "ASR WebSocket returned a text error");
        }
        return parsed.payload;
      }

      const chunk = await readSocketChunk(socket);
      buffer = Buffer.concat([buffer, chunk]);
    }
  }

  return {
    async readUntil(predicate: (frame: Buffer) => boolean) {
      const timeoutAt = Date.now() + 12000;
      while (Date.now() < timeoutAt) {
        const frame = await readFrame();
        if (predicate(frame)) {
          return;
        }
      }
      throw new Error("ASR WebSocket timed out");
    },
  };
}

function tryReadFrame(buffer: Buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const opcode = buffer[0] & 0x0f;
  let payloadLength = buffer[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const largeLength = buffer.readBigUInt64BE(offset);
    if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("ASR WebSocket frame is too large");
    }
    payloadLength = Number(largeLength);
    offset += 8;
  }

  const masked = Boolean(buffer[1] & 0x80);
  let mask: Buffer | null = null;
  if (masked) {
    if (buffer.length < offset + 4) {
      return null;
    }
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLength) {
    return null;
  }

  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  if (mask) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }

  return {
    opcode,
    payload,
    consumed: offset + payloadLength,
  };
}

function encodeClientFrame(payload: Buffer, opcode = 0x2) {
  const mask = crypto.randomBytes(4);
  const length = payload.length;
  const headerLength = length < 126 ? 2 : length < 65536 ? 4 : 10;
  const frame = Buffer.alloc(headerLength + 4 + length);

  frame[0] = 0x80 | opcode;
  if (length < 126) {
    frame[1] = 0x80 | length;
    mask.copy(frame, 2);
    writeMaskedPayload(payload, mask, frame, 6);
  } else if (length < 65536) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(length, 2);
    mask.copy(frame, 4);
    writeMaskedPayload(payload, mask, frame, 8);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(length), 2);
    mask.copy(frame, 10);
    writeMaskedPayload(payload, mask, frame, 14);
  }

  return frame;
}

function writeMaskedPayload(
  payload: Buffer,
  mask: Buffer,
  target: Buffer,
  offset: number,
) {
  for (let index = 0; index < payload.length; index += 1) {
    target[offset + index] = payload[index] ^ mask[index % 4];
  }
}

function readSocketChunk(socket: tls.TLSSocket) {
  return new Promise<Buffer>((resolve, reject) => {
    const handleData = (chunk: Buffer) => {
      cleanup();
      resolve(chunk);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleEnd = () => {
      cleanup();
      reject(new Error("ASR WebSocket ended unexpectedly"));
    };
    const cleanup = () => {
      socket.off("data", handleData);
      socket.off("error", handleError);
      socket.off("end", handleEnd);
    };

    socket.once("data", handleData);
    socket.once("error", handleError);
    socket.once("end", handleEnd);
  });
}
