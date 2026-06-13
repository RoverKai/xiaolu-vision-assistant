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

  try {
    const answer = await requestArkResponse({
      transcript,
      prompt,
      imageDataUrl,
      history: payload.history ?? [],
    });

    let audioDataUrl: string | null = null;
    let ttsError: string | null = null;

    if (payload.speak !== false) {
      try {
        audioDataUrl = await requestVolcengineTts(answer);
      } catch (error) {
        ttsError = getErrorMessage(error);
      }
    }

    return Response.json({
      text: answer,
      audioDataUrl,
      ttsError,
    });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 502 },
    );
  }
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

  const response = await fetch(ttsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": process.env.VOLCENGINE_TTS_RESOURCE_ID ?? "seed-tts-2.0",
      "X-Api-Connect-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      user: {
        uid: process.env.VOLCENGINE_TTS_UID ?? "xiaolu-web",
      },
      event: 100,
      req_params: {
        text,
        model: process.env.VOLCENGINE_TTS_MODEL ?? "seed-tts-2.0-standard",
        speaker:
          process.env.VOLCENGINE_TTS_SPEAKER ??
          "zh_female_shuangkuaisisi_moon_bigtts",
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
    throw new Error(errorText || `TTS request failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  if (contentType.includes("application/json")) {
    const json = (await response.json().catch(() => null)) as unknown;
    const maybeAudio = extractBase64Audio(json);
    if (maybeAudio) {
      return maybeAudio;
    }
    throw new Error(readProviderError(json, "TTS response did not include audio"));
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${audioBuffer.toString("base64")}`;
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
