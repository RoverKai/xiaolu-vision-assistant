import type { ActionFunctionArgs } from "react-router";

type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
};

type AssistantRequest = {
  transcript?: string;
  prompt?: string;
  imageDataUrl?: string | null;
  history?: AssistantMessage[];
  speak?: boolean;
};

type ArkContent =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
    };

const arkEndpoint =
  process.env.ARK_RESPONSES_ENDPOINT ??
  "https://ark.cn-beijing.volces.com/api/v3/responses";
const arkModel = process.env.ARK_MODEL ?? "doubao-seed-2-0-lite-260428";
const ttsEndpoint =
  process.env.VOLCENGINE_TTS_ENDPOINT ??
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const defaultTtsResourceId = "seed-tts-2.0";
const defaultTtsModel = "seed-tts-2.0-standard";
const defaultTtsSpeaker = "zh_female_cancan_mars_bigtts";
const legacyMismatchedTtsSpeaker = "zh_female_shuangkuaisisi_moon_bigtts";
const volcengineMessageTypeFullServerResponse = 0b1001;
const volcengineMessageTypeAudioOnlyResponse = 0b1011;
const volcengineMessageTypeError = 0b1111;
const volcengineEventConnectionStarted = 50;
const volcengineEventConnectionFailed = 51;
const volcengineEventConnectionFinished = 52;
const volcengineEventSessionStarted = 150;
const volcengineEventSessionCanceled = 151;
const volcengineEventSessionFinished = 152;
const volcengineEventSessionFailed = 153;
const volcengineEventTtsSentenceStart = 350;
const volcengineEventTtsSentenceEnd = 351;
const volcengineEventTtsResponse = 352;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let payload: AssistantRequest;
  try {
    payload = (await request.json()) as AssistantRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transcript = normalizeText(payload.transcript);
  const prompt = normalizeText(payload.prompt);
  const imageDataUrl = payload.imageDataUrl?.startsWith("data:image/")
    ? payload.imageDataUrl
    : null;

  if (!transcript && !prompt && !imageDataUrl) {
    return Response.json(
      { error: "transcript, prompt, or imageDataUrl is required" },
      { status: 400 },
    );
  }

  const speak = payload.speak !== false;

  // Streaming path: SSE for text + per-sentence TTS audio
  if (speak) {
    return streamAssistantResponse({
      transcript,
      prompt,
      imageDataUrl,
      history: payload.history ?? [],
    });
  }

  // Non-streaming path: JSON response (text only, no TTS)
  try {
    const answer = await requestArkResponse({
      transcript,
      prompt,
      imageDataUrl,
      history: payload.history ?? [],
    });

    return Response.json({ text: answer });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 502 },
    );
  }
}

async function streamAssistantResponse(options: {
  transcript: string;
  prompt: string;
  imageDataUrl: string | null;
  history: AssistantMessage[];
}) {
  const apiKey = process.env.ARK_API_KEY ?? process.env.VOLCENGINE_ARK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Missing ARK_API_KEY or VOLCENGINE_ARK_API_KEY" },
      { status: 502 },
    );
  }

  const content: ArkContent[] = [];
  if (options.imageDataUrl) {
    content.push({ type: "input_image", image_url: options.imageDataUrl });
  }
  content.push({
    type: "input_text",
    text: buildPrompt(options),
  });

  const arkResponse = await fetch(arkEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: arkModel,
      stream: true,
      input: [{ role: "user", content }],
    }),
  });

  if (!arkResponse.ok) {
    const errorText = await arkResponse.text().catch(() => "");
    return Response.json(
      { error: errorText || `Ark request failed: ${arkResponse.status}` },
      { status: 502 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const writeSSE = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const reader = arkResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        // Read Ark SSE stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const event = JSON.parse(dataStr) as Record<string, unknown>;
              const type = event.type as string | undefined;

              if (type === "response.output_text.delta") {
                const delta = (event.delta as string) ?? "";
                if (delta) {
                  fullText += delta;
                  writeSSE({ type: "text_delta", text: delta });
                }
              } else if (type === "response.completed") {
                const response = event.response as Record<string, unknown> | undefined;
                if (response?.status && response.status !== "completed") {
                  const details =
                    response.status_details as Record<string, unknown> | undefined;
                  const errorObj =
                    details?.error as Record<string, unknown> | undefined;
                  const statusMsg = errorObj?.message ?? response.status;
                  writeSSE({ type: "error", message: String(statusMsg) });
                  controller.close();
                  return;
                }
              }
            } catch {
              // Skip unparseable SSE lines
            }
          }
        }

        // Flush remaining buffer
        if (buffer.startsWith("data: ")) {
          const dataStr = buffer.slice(6).trim();
          if (dataStr !== "[DONE]") {
            try {
              const event = JSON.parse(dataStr) as Record<string, unknown>;
              const delta = (event.delta as string) ?? "";
              if (delta) {
                fullText += delta;
                writeSSE({ type: "text_delta", text: delta });
              }
            } catch {
              // skip
            }
          }
        }

        if (!fullText.trim()) {
          writeSSE({
            type: "error",
            message: "Ark response did not include output text",
          });
          controller.close();
          return;
        }

        writeSSE({ type: "text_done" });

        // Per-sentence TTS synthesis
        const sentences = splitSentences(fullText);
        const ttsApiKey = process.env.VOLCENGINE_TTS_API_KEY;

        if (ttsApiKey && sentences.length > 0) {
          const concurrency = 2;
          const audioChunks = await synthesizeSentences(sentences, concurrency);
          for (const chunk of audioChunks) {
            if (chunk) {
              writeSSE({ type: "audio", data: chunk });
            }
          }
        }

        writeSSE({ type: "done" });
      } catch (error) {
        writeSSE({
          type: "error",
          message: error instanceof Error ? error.message : "Stream failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function splitSentences(text: string): string[] {
  const sentences = text.split(/(?<=[。！？\n])\s*/);
  return sentences.map((s) => s.trim()).filter(Boolean);
}

async function synthesizeSentences(
  sentences: string[],
  concurrency: number,
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(sentences.length).fill(null);
  let index = 0;

  const worker = async () => {
    while (index < sentences.length) {
      const currentIndex = index++;
      try {
        results[currentIndex] = await requestVolcengineTts(
          sentences[currentIndex],
        );
      } catch {
        results[currentIndex] = null;
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, sentences.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function requestArkResponse({
  transcript,
  prompt,
  imageDataUrl,
  history,
}: {
  transcript: string;
  prompt: string;
  imageDataUrl: string | null;
  history: AssistantMessage[];
}) {
  const apiKey = process.env.ARK_API_KEY ?? process.env.VOLCENGINE_ARK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ARK_API_KEY or VOLCENGINE_ARK_API_KEY");
  }

  const content: ArkContent[] = [];
  if (imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
    });
  }

  content.push({
    type: "input_text",
    text: buildPrompt({ transcript, prompt, history }),
  });

  const response = await fetch(arkEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: arkModel,
      input: [
        {
          role: "user",
          content,
        },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readProviderError(data, `Ark request failed: ${response.status}`));
  }

  const text = extractResponseText(data);
  if (!text) {
    throw new Error("Ark response did not include output text");
  }

  return text;
}

function buildPrompt({
  transcript,
  prompt,
  history,
}: {
  transcript: string;
  prompt: string;
  history: AssistantMessage[];
}) {
  const recentHistory = history
    .slice(-6)
    .map((message) => `${message.role === "user" ? "用户" : "小噜"}：${message.text}`)
    .join("\n");

  return [
    "你是小噜，一个多人场景中的视觉语音助手。请基于用户刚才说的话和随附的摄像头关键帧回答。",
    "回答要直接、简短、使用中文。若画面不足以判断，请明确说明不确定，并给出下一步需要用户补充的信息。",
    recentHistory ? `最近对话：\n${recentHistory}` : "",
    prompt ? `当前文字输入：${prompt}` : "",
    transcript ? `语音转写：${transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text.trim();
  }

  const chunks: string[] = [];
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") {
        chunks.push(partRecord.text);
      }
      if (typeof partRecord.output_text === "string") {
        chunks.push(partRecord.output_text);
      }
    }
  }

  return chunks.join("").trim();
}

async function requestVolcengineTts(text: string) {
  const apiKey = process.env.VOLCENGINE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VOLCENGINE_TTS_API_KEY");
  }

  const resourceId = process.env.VOLCENGINE_TTS_RESOURCE_ID ?? defaultTtsResourceId;
  const model = process.env.VOLCENGINE_TTS_MODEL ?? defaultTtsModel;
  const speaker = normalizeTtsSpeaker({
    resourceId,
    speaker: process.env.VOLCENGINE_TTS_SPEAKER ?? defaultTtsSpeaker,
  });

  const response = await fetch(ttsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Connect-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      user: {
        uid: process.env.VOLCENGINE_TTS_UID ?? "xiaolu-web",
      },
      event: 100,
      req_params: {
        text,
        model,
        speaker,
        audio_params: {
          format: "mp3",
          sample_rate: 24000,
          bit_rate: 64000,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const providerError = readProviderErrorText(errorText);
    throw new Error(
      describeTtsProviderError(providerError || `TTS request failed: ${response.status}`, {
        resourceId,
        speaker,
      }),
    );
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  if (contentType.includes("application/json")) {
    const jsonBuffer = Buffer.from(await response.arrayBuffer());
    const textStreamAudioBuffer = extractVolcengineTextStreamAudio(jsonBuffer, contentType);
    if (textStreamAudioBuffer) {
      return `data:audio/mpeg;base64,${textStreamAudioBuffer.toString("base64")}`;
    }

    const json = parseJsonBuffer(jsonBuffer);
    if (json) {
      const maybeAudio = extractBase64Audio(json);
      if (maybeAudio) {
        return maybeAudio;
      }
    }

    const providerError = readProviderErrorBuffer(jsonBuffer, contentType);
    throw new Error(
      describeTtsProviderError(providerError || "TTS response did not include audio", {
        resourceId,
        speaker,
      }),
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const ttsAudioBuffer = extractVolcengineTtsAudio(audioBuffer, {
    resourceId,
    speaker,
  });
  if (ttsAudioBuffer) {
    return `data:audio/mpeg;base64,${ttsAudioBuffer.toString("base64")}`;
  }

  const textStreamAudioBuffer = extractVolcengineTextStreamAudio(audioBuffer, contentType);
  if (textStreamAudioBuffer) {
    return `data:audio/mpeg;base64,${textStreamAudioBuffer.toString("base64")}`;
  }

  const providerError = readProviderErrorBuffer(audioBuffer, contentType);
  if (providerError) {
    throw new Error(
      describeTtsProviderError(providerError, {
        resourceId,
        speaker,
      }),
    );
  }

  if (!isAudioResponseContentType(contentType)) {
    throw new Error(`TTS response was not audio: ${contentType}`);
  }

  return `data:${contentType};base64,${audioBuffer.toString("base64")}`;
}

function extractVolcengineTtsAudio(
  buffer: Buffer,
  config: {
    resourceId: string;
    speaker: string;
  },
) {
  if (!looksLikeVolcengineFrame(buffer)) {
    return null;
  }

  const chunks: Buffer[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const frame = readVolcengineFrame(buffer, offset);
    offset = frame.nextOffset;

    if (frame.messageType === volcengineMessageTypeAudioOnlyResponse) {
      chunks.push(frame.payload);
      continue;
    }

    if (frame.messageType === volcengineMessageTypeError) {
      throw new Error(
        describeTtsProviderError(
          readProviderError(parseJsonBuffer(frame.payload), "TTS request failed"),
          config,
        ),
      );
    }

    if (
      frame.messageType === volcengineMessageTypeFullServerResponse &&
      (frame.event === volcengineEventConnectionFailed ||
        frame.event === volcengineEventSessionFailed)
    ) {
      throw new Error(
        describeTtsProviderError(
          readProviderError(parseJsonBuffer(frame.payload), "TTS request failed"),
          config,
        ),
      );
    }
  }

  if (!chunks.length) {
    throw new Error("TTS response did not include audio frames");
  }

  return Buffer.concat(chunks);
}

function looksLikeVolcengineFrame(buffer: Buffer) {
  if (buffer.length < 4) {
    return false;
  }

  const version = buffer[0] >> 4;
  const headerSize = (buffer[0] & 0x0f) * 4;
  const messageType = buffer[1] >> 4;

  return (
    version === 1 &&
    headerSize >= 4 &&
    headerSize <= buffer.length &&
    (messageType === volcengineMessageTypeFullServerResponse ||
      messageType === volcengineMessageTypeAudioOnlyResponse ||
      messageType === volcengineMessageTypeError)
  );
}

function readVolcengineFrame(buffer: Buffer, startOffset: number) {
  ensureFrameBytes(buffer, startOffset, 4);

  const headerSize = (buffer[startOffset] & 0x0f) * 4;
  const messageType = buffer[startOffset + 1] >> 4;
  const messageFlags = buffer[startOffset + 1] & 0x0f;

  let offset = startOffset + headerSize;
  let event: number | null = null;

  if (messageType === volcengineMessageTypeError) {
    ensureFrameBytes(buffer, offset, 4);
    offset += 4;
    return {
      event,
      messageType,
      nextOffset: buffer.length,
      payload: buffer.subarray(offset),
    };
  } else if (messageFlags === 0b0100) {
    ensureFrameBytes(buffer, offset, 4);
    event = buffer.readInt32BE(offset);
    offset += 4;
  }

  const payloadBounds = readVolcenginePayloadBounds(buffer, offset, event);

  return {
    event,
    messageType,
    nextOffset: payloadBounds.endOffset,
    payload: buffer.subarray(payloadBounds.startOffset, payloadBounds.endOffset),
  };
}

function readVolcenginePayloadBounds(buffer: Buffer, offset: number, event: number | null) {
  const payloadLengthOffset = findVolcenginePayloadLengthOffset(buffer, offset, event);
  const payloadLength = buffer.readUInt32BE(payloadLengthOffset);
  const startOffset = payloadLengthOffset + 4;
  const endOffset = startOffset + payloadLength;

  ensureFrameBytes(buffer, startOffset, payloadLength);

  return {
    startOffset,
    endOffset,
  };
}

function findVolcenginePayloadLengthOffset(
  buffer: Buffer,
  offset: number,
  event: number | null,
) {
  ensureFrameBytes(buffer, offset, 4);

  if (eventHasIdentifier(event)) {
    const payloadLengthOffset = readPayloadLengthOffsetAfterIdentifier(buffer, offset);
    if (payloadLengthOffset !== null) {
      return payloadLengthOffset;
    }
  }

  const possiblePayloadLength = buffer.readUInt32BE(offset);
  if (offset + 4 + possiblePayloadLength <= buffer.length) {
    return offset;
  }

  const payloadLengthOffset = readPayloadLengthOffsetAfterIdentifier(buffer, offset);
  if (payloadLengthOffset !== null) {
    return payloadLengthOffset;
  }

  throw new Error("Invalid TTS response frame payload length");
}

function readPayloadLengthOffsetAfterIdentifier(buffer: Buffer, offset: number) {
  const idLength = buffer.readUInt32BE(offset);
  const payloadLengthOffset = offset + 4 + idLength;
  if (payloadLengthOffset + 4 > buffer.length) {
    return null;
  }

  const id = buffer.subarray(offset + 4, payloadLengthOffset).toString("utf8");
  if (!/^[\w-]+$/.test(id)) {
    return null;
  }

  const payloadLength = buffer.readUInt32BE(payloadLengthOffset);
  if (payloadLengthOffset + 4 + payloadLength > buffer.length) {
    return null;
  }

  return payloadLengthOffset;
}

function eventHasIdentifier(event: number | null) {
  return (
    event === volcengineEventConnectionStarted ||
    event === volcengineEventConnectionFailed ||
    event === volcengineEventConnectionFinished ||
    event === volcengineEventSessionStarted ||
    event === volcengineEventSessionCanceled ||
    event === volcengineEventSessionFinished ||
    event === volcengineEventSessionFailed ||
    event === volcengineEventTtsSentenceStart ||
    event === volcengineEventTtsSentenceEnd ||
    event === volcengineEventTtsResponse
  );
}

function ensureFrameBytes(buffer: Buffer, offset: number, length: number) {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error("Invalid TTS response frame");
  }
}

function parseJsonBuffer(buffer: Buffer) {
  try {
    return JSON.parse(buffer.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function normalizeTtsSpeaker({
  resourceId,
  speaker,
}: {
  resourceId: string;
  speaker: string;
}) {
  if (resourceId === defaultTtsResourceId && speaker === legacyMismatchedTtsSpeaker) {
    return defaultTtsSpeaker;
  }

  return speaker;
}

function extractVolcengineTextStreamAudio(buffer: Buffer, contentType: string) {
  if (!looksLikeTextResponse(buffer, contentType)) {
    return null;
  }

  const records = parseJsonStreamRecords(buffer.toString("utf8"));
  const chunks: Buffer[] = [];
  for (const record of records) {
    const chunk = extractBase64AudioBuffer(record);
    if (chunk) {
      chunks.push(chunk);
    }
  }

  return chunks.length ? Buffer.concat(chunks) : null;
}

function readProviderErrorBuffer(buffer: Buffer, contentType: string) {
  if (!looksLikeTextResponse(buffer, contentType)) {
    return "";
  }

  const text = buffer.toString("utf8").trim();
  const records = parseJsonStreamRecords(text);
  if (records.length) {
    const errorMessage = records
      .map(readProviderErrorRecord)
      .find((message) => message);

    return errorMessage ?? "";
  }

  return readProviderErrorText(text);
}

function readProviderErrorText(text: string) {
  if (!text) {
    return "";
  }

  const json = parseJsonText(text);
  if (json) {
    return readProviderError(json, text);
  }

  return text;
}

function looksLikeTextResponse(buffer: Buffer, contentType: string) {
  if (contentType.startsWith("text/") || contentType.includes("json")) {
    return true;
  }

  return buffer.subarray(0, 16).toString("utf8").trimStart().startsWith("{");
}

function parseJsonText(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseJsonStreamRecords(text: string) {
  const records: unknown[] = [];
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (startIndex === -1) {
      if (char === "{") {
        startIndex = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;

      if (depth === 0) {
        const record = parseJsonText(text.slice(startIndex, index + 1));
        if (record) {
          records.push(record);
        }
        startIndex = -1;
      }
    }
  }

  return records;
}

function extractBase64AudioBuffer(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.data !== "string" || !record.data) {
    return null;
  }

  return Buffer.from(record.data, "base64");
}

function readProviderErrorRecord(data: unknown) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  const code = record.code;
  const message = record.message;
  if (code === 0 || code === 20000000) {
    return "";
  }

  return typeof message === "string" && message.trim()
    ? message.trim()
    : readProviderError(record, "");
}

function describeTtsProviderError(
  message: string,
  config?: {
    resourceId: string;
    speaker: string;
  },
) {
  if (!message.includes("resource ID is mismatched with speaker")) {
    return message;
  }

  const configText = config
    ? ` 当前配置：VOLCENGINE_TTS_RESOURCE_ID=${config.resourceId}, VOLCENGINE_TTS_SPEAKER=${config.speaker}。`
    : " ";

  return `${message}.${configText}请确认 resource id 与 speaker 属于同一个火山 TTS 资源；seed-tts-2.0 只能使用 TTS 2.0 音色。`;
}

function isAudioResponseContentType(contentType: string) {
  return contentType.startsWith("audio/") || contentType.includes("octet-stream");
}

function extractBase64Audio(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  const audio =
    record.audio ??
    record.data ??
    record.audio_data ??
    record.audioData ??
    record.result;

  if (typeof audio !== "string" || !audio) {
    return "";
  }

  if (audio.startsWith("data:")) {
    return audio;
  }

  return `data:audio/mpeg;base64,${audio}`;
}

function readProviderError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const record = data as Record<string, unknown>;
  const message = record.message ?? record.error ?? record.msg;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return fallback;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown assistant error";
}
