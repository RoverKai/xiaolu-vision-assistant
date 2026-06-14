import { useCallback, useEffect, useRef, useState } from "react";

import type { Route } from "./+types/home";

type AssistantPhase =
  | "idle"
  | "listening"
  | "capturing"
  | "thinking"
  | "speaking"
  | "error";
type MessageRole = "system" | "user" | "assistant";

type Message = {
  id: number;
  role: MessageRole;
  meta: string;
  text: string;
  imageDataUrl?: string | null;
  audioDataUrl?: string | null;
};

type AssistantResponse = {
  text?: string;
  audioDataUrl?: string | null;
  ttsError?: string | null;
  error?: string;
};

type AsrResponse = {
  text?: string;
  error?: string;
};

type AsrBackendState = "idle" | "active" | "unconfigured" | "error";

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: {
      transcript: string;
      confidence?: number;
    };
  }>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const quietWindowMs = 1000;
const asrChunkSeconds = 0.32;
const asrSampleRate = 16000;
const maxUtteranceSeconds = 30;
const maxKeyframeEdge = 768;
const keyframeJpegQuality = 0.72;
const authoritativeAsrBudgetMs = 450;
const wakeWordPattern = /(小噜|小鹿|xiaolu|小路)/i;
const defaultManualTranscript = "小噜，帮我看看画面里现在有什么重点";

const initialMessages: Message[] = [
  {
    id: 1,
    role: "system",
    meta: "系统",
    text: "说“小噜”或“小鹿”开始提问。",
  },
];

export function meta(_: Route.MetaArgs) {
  return [
    { title: "小噜AI 视觉语音助手" },
    {
      name: "description",
      content:
        "支持摄像头、麦克风、唤醒词、静默截帧、多模态问答和 TTS 播放的视觉语音助手。",
    },
  ];
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function Icon({
  name,
  className = "icon",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${name}`}></use>
    </svg>
  );
}

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true">
      <symbol id="icon-camera" viewBox="0 0 24 24">
        <rect x="3.5" y="7" width="13" height="10" rx="2"></rect>
        <path d="M16.5 10.5 20.5 8v8l-4-2.5"></path>
      </symbol>
      <symbol id="icon-microphone" viewBox="0 0 24 24">
        <rect x="8.25" y="4.25" width="7.5" height="11" rx="3.75"></rect>
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0"></path>
        <path d="M12 17v3.5"></path>
        <path d="M9 20.5h6"></path>
      </symbol>
      <symbol id="icon-screen" viewBox="0 0 24 24">
        <rect x="3.5" y="4.5" width="17" height="11.5" rx="2"></rect>
        <path d="M8.5 19.5h7"></path>
        <path d="M12 16v3.5"></path>
      </symbol>
      <symbol id="icon-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5"></circle>
        <path d="M12 7.5V12l3 2"></path>
      </symbol>
      <symbol id="icon-phone-off" viewBox="0 0 24 24">
        <path d="M5.5 7.5a15 15 0 0 1 13 0"></path>
        <path d="M7.5 8.4V14a1.5 1.5 0 0 0 1.5 1.5H10"></path>
        <path d="M16.5 8.4V14A1.5 1.5 0 0 1 15 15.5h-1"></path>
        <path d="m5 19 14-14"></path>
      </symbol>
      <symbol id="icon-send" viewBox="0 0 24 24">
        <path d="m21 3-9.5 18-1.9-7.6L3 11.5z"></path>
        <path d="M9.6 13.4 21 3"></path>
      </symbol>
      <symbol id="icon-check" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5"></circle>
        <path d="m8.8 12.2 2.2 2.3 4.2-4.7"></path>
      </symbol>
    </svg>
  );
}

function stripWakeWord(text: string) {
  return text.replace(wakeWordPattern, "").replace(/[，,。.\s]+$/g, "").trim();
}

function buildBannerMessage(phase: AssistantPhase, microphoneOn: boolean) {
  if (phase === "thinking") return "小噜正在思考…";
  if (phase === "capturing") return "正在截取画面…";
  if (phase === "speaking") return "正在播报回答…";
  if (phase === "error") return "发生错误，请重试。";
  return microphoneOn ? "等待“小噜”或“小鹿”唤醒" : "请接入麦克风开始对话";
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function mergeAudioChunks(chunks: Float32Array[], sampleCount: number) {
  const merged = new Float32Array(sampleCount);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function downsampleToPcm16(samples: Float32Array, inputSampleRate: number) {
  if (inputSampleRate === asrSampleRate) {
    return floatToPcm16(samples);
  }

  const ratio = inputSampleRate / asrSampleRate;
  const outputLength = Math.floor(samples.length / ratio);
  const resampled = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), samples.length);
    let sum = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      sum += samples[sampleIndex];
    }

    resampled[index] = sum / Math.max(1, end - start);
  }

  return floatToPcm16(resampled);
}

function floatToPcm16(samples: Float32Array) {
  const pcm = new Int16Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcm;
}

function pcm16ToBase64(samples: Int16Array) {
  const bytes = new Uint8Array(samples.buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }

  return btoa(binary);
}

function mergeAudioDataUrls(dataUrls: string[]) {
  if (dataUrls.length === 0) {
    return null;
  }

  if (dataUrls.length === 1) {
    return dataUrls[0];
  }

  const audioChunks: Uint8Array[] = [];
  let mimeType = "audio/mpeg";
  let totalLength = 0;

  for (const dataUrl of dataUrls) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return dataUrls[0];
    }

    mimeType = match[1] || mimeType;
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    audioChunks.push(bytes);
    totalLength += bytes.length;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const bytes of audioChunks) {
    merged.set(bytes, offset);
    offset += bytes.length;
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < merged.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...merged.subarray(index, Math.min(index + chunkSize, merged.length)),
    );
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function resolveWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T) {
  return new Promise<T>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(fallbackValue), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      () => {
        window.clearTimeout(timeoutId);
        resolve(fallbackValue);
      },
    );
  });
}

function computeWordOverlap(textA: string, textB: string): number {
  // Substring containment: one text is a progressive refinement of the other
  if (textA.includes(textB) || textB.includes(textA)) {
    return 1;
  }

  const wordsA = new Set(textA.split(/\s+/).filter(Boolean));
  const wordsB = new Set(textB.split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection += 1;
    }
  }

  const union = new Set([...wordsA, ...wordsB]);
  return intersection / union.size;
}

function extractAudioSlice(
  chunks: Float32Array[],
  startSample: number,
  endSample: number,
) {
  const length = endSample - startSample;
  if (length <= 0) {
    return new Float32Array(0);
  }

  const result = new Float32Array(length);
  let resultOffset = 0;
  let chunkStartSample = 0;

  for (const chunk of chunks) {
    const chunkEndSample = chunkStartSample + chunk.length;
    if (chunkEndSample <= startSample) {
      chunkStartSample = chunkEndSample;
      continue;
    }
    if (chunkStartSample >= endSample) {
      break;
    }

    const sliceStart = Math.max(0, startSample - chunkStartSample);
    const sliceEnd = Math.min(chunk.length, endSample - chunkStartSample);
    result.set(chunk.subarray(sliceStart, sliceEnd), resultOffset);
    resultOffset += sliceEnd - sliceStart;
    chunkStartSample = chunkEndSample;
  }

  return result.subarray(0, resultOffset);
}

export default function Home() {
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [phase, setPhase] = useState<AssistantPhase>("idle");
  const [clockLabel, setClockLabel] = useState(() => formatClock());
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [manualTranscript, setManualTranscript] = useState(defaultManualTranscript);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [wakeTranscript, setWakeTranscript] = useState("");
  const [lastKeyframe, setLastKeyframe] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [microphoneError, setMicrophoneError] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [asrBackendState, setAsrBackendState] =
    useState<AsrBackendState>("idle");
  const [asrBackendMessage, setAsrBackendMessage] =
    useState("等待麦克风接入");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRecognitionRef = useRef(false);
  const quietTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioLevelFrameRef = useRef<number | null>(null);
  const asrChunksRef = useRef<Float32Array[]>([]);
  const asrSampleCountRef = useRef(0);
  const asrSessionIdRef = useRef<string | null>(null);
  const asrChunkQueueRef = useRef<Array<{ pcm16Base64: string; sampleRate: number }>>([]);
  const asrUploadInFlightRef = useRef(false);
  const asrBackendDisabledRef = useRef(false);
  const utteranceAudioChunksRef = useRef<Float32Array[]>([]);
  const utteranceSampleCountRef = useRef(0);
  const utteranceSampleRateRef = useRef(0);
  const utteranceStartSampleRef = useRef(0);
  const utteranceUploadInFlightRef = useRef(false);
  const phaseRef = useRef<AssistantPhase>("idle");
  const microphoneOnRef = useRef(false);
  const utteranceStartTimeRef = useRef(0);
  const activeUtteranceRef = useRef("");
  const lastRecognizedTextRef = useRef<{ text: string; at: number } | null>(
    null,
  );
  const messagesRef = useRef<Message[]>(initialMessages);
  const nextMessageIdRef = useRef(initialMessages.length + 1);

  const recognitionAvailable = Boolean(getSpeechRecognitionConstructor());
  const statusText =
    phase === "thinking"
      ? "小噜AI 分析中"
      : phase === "speaking"
        ? "小噜AI 播报中"
        : microphoneOn
          ? "小噜AI 收听中"
          : "小噜AI 待命";

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  const stopAudioLevel = useCallback(() => {
    if (audioLevelFrameRef.current) {
      window.cancelAnimationFrame(audioLevelFrameRef.current);
      audioLevelFrameRef.current = null;
    }

    if (audioProcessorRef.current) {
      audioProcessorRef.current.onaudioprocess = null;
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }

    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    asrChunksRef.current = [];
    asrSampleCountRef.current = 0;
    asrChunkQueueRef.current = [];
    utteranceAudioChunksRef.current = [];
    utteranceSampleCountRef.current = 0;
    utteranceStartSampleRef.current = 0;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setAudioLevel(0);
  }, []);

  const closeAsrSession = useCallback(async () => {
    const sessionId = asrSessionIdRef.current;
    asrSessionIdRef.current = null;
    asrChunkQueueRef.current = [];

    if (!sessionId || asrBackendDisabledRef.current) {
      return;
    }

    try {
      await fetch("/api/asr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "close",
          sessionId,
        }),
      });
    } catch {
      // Ignore close races during teardown.
    }
  }, []);

  const openAsrSession = useCallback(async () => {
    if (asrBackendDisabledRef.current) {
      return;
    }

    const sessionId = crypto.randomUUID();
    asrSessionIdRef.current = sessionId;
    asrChunkQueueRef.current = [];

    try {
      const response = await fetch("/api/asr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          sampleRate: asrSampleRate,
          sessionId,
        }),
      });
      const data = (await response.json()) as AsrResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || `ASR session failed: ${response.status}`);
      }

      if (asrSessionIdRef.current !== sessionId) {
        return;
      }

      setAsrBackendState("active");
      setAsrBackendMessage("火山 ASR 会话已连接，正在实时转写。");
    } catch (error) {
      if (asrSessionIdRef.current !== sessionId) {
        return;
      }

      const message =
        error instanceof Error ? error.message : "火山 ASR 会话启动失败。";

      if (message.includes("Missing VOLCENGINE_ASR_API_KEY")) {
        asrBackendDisabledRef.current = true;
        setAsrBackendState("unconfigured");
        setAsrBackendMessage(
          "未配置 VOLCENGINE_ASR_API_KEY，使用浏览器或手动转写。",
        );
      } else {
        setAsrBackendState("error");
        setAsrBackendMessage(message);
      }
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    shouldRestartRecognitionRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // Browser recognition can throw if it is already stopped.
    }
    recognitionRef.current = null;
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
    void closeAsrSession();
    stopAudioLevel();
    setMicrophoneOn(false);
    setPhase((currentPhase) =>
      currentPhase === "listening" || currentPhase === "speaking"
        ? "idle"
        : currentPhase,
    );
  }, [closeAsrSession, stopAudioLevel]);

  const clearQuietTimer = useCallback(() => {
    if (quietTimerRef.current) {
      window.clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
  }, []);

  const captureKeyframe = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      console.warn("[captureKeyframe] video or canvas ref is null");
      return null;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      console.warn(
        "[captureKeyframe] video readyState too low:",
        video.readyState,
        "(need >= HAVE_CURRENT_DATA)",
      );
      return null;
    }

    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const scale = Math.min(1, maxKeyframeEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(320, Math.round(sourceWidth * scale));
    const height = Math.max(180, Math.round(sourceHeight * scale));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", keyframeJpegQuality);
  }, []);

  const appendMessage = useCallback((message: Omit<Message, "id">) => {
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        ...message,
        id: nextMessageIdRef.current++,
      },
    ]);
  }, []);

  const submitAssistantQuestion = useCallback(
    async (question: string, imageDataUrl: string | null) => {
      const cleanQuestion = question.trim();
      if (!cleanQuestion && !imageDataUrl) {
        return;
      }

      setAssistantError("");
      setPhase("thinking");

      // Add user message first
      const userMessageId = nextMessageIdRef.current++;
      const userMessage: Message = {
        id: userMessageId,
        role: "user",
        meta: `${formatClock()} · 你`,
        text: cleanQuestion || "请根据当前画面回答。",
        imageDataUrl,
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add placeholder assistant message for streaming text
      const assistantMessageId = nextMessageIdRef.current++;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        meta: `${formatClock()} · 小噜`,
        text: "",
        audioDataUrl: null,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: cleanQuestion,
            imageDataUrl,
            speak: true,
            history: messagesRef.current
              .filter((m) => m.role !== "system")
              .slice(-8)
              .map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                text: m.text,
              })),
          }),
        });

        const contentType = response.headers.get("content-type") ?? "";

        // SSE streaming path
        if (contentType.includes("text/event-stream")) {
          await handleSseStream(response, assistantMessageId);
          return;
        }

        // JSON fallback path
        const data = (await response.json()) as AssistantResponse;
        if (!response.ok || data.error) {
          throw new Error(data.error || `Assistant request failed: ${response.status}`);
        }

        const answer = data.text?.trim() || "我没有得到可用回答。";
        finalizeAssistantMessage(assistantMessageId, answer, data.audioDataUrl);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "小噜服务调用失败。";
        setAssistantError(message);
        setPhase("error");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, text: message }
              : m,
          ),
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appendMessage, microphoneOn],
  );

  // Returns a function to avoid putting stream logic in the callback dep chain
  async function handleSseStream(response: Response, messageId: number) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    const audioChunks: string[] = [];
    let currentAudio: HTMLAudioElement | null = null;
    let audioPlayIndex = 0;
    let streamDone = false;
    let autoplayBlocked = false;

    const restoreReadyPhase = () => {
      setPhase((prev) =>
        prev === "error"
          ? prev
          : microphoneOnRef.current
            ? "listening"
            : "idle",
      );
    };

    const playNextAudio = () => {
      if (autoplayBlocked || currentAudio) {
        return;
      }

      if (audioPlayIndex >= audioChunks.length) {
        if (streamDone) {
          restoreReadyPhase();
        }
        return;
      }

      const chunk = audioChunks[audioPlayIndex++];
      currentAudio = new Audio(chunk);
      currentAudio.onended = () => {
        currentAudio = null;
        playNextAudio();
      };
      currentAudio.onerror = () => {
        currentAudio = null;
        playNextAudio();
      };
      setPhase("speaking");
      currentAudio.play().catch(() => {
        autoplayBlocked = true;
        currentAudio = null;
        setAssistantError("浏览器阻止了自动播放，可使用消息里的音频控件播放。");
        restoreReadyPhase();
      });
    };

    const finalizeAudioMessage = () => {
      const mergedAudio = mergeAudioDataUrls(audioChunks);
      if (!mergedAudio) {
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, audioDataUrl: mergedAudio } : m,
        ),
      );
    };

    const applyStreamEvent = (event: Record<string, unknown>) => {
      const type = event.type as string;

      switch (type) {
        case "text_delta": {
          const delta = (event.text as string) ?? "";
          fullText += delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, text: fullText } : m,
            ),
          );
          break;
        }
        case "text_done": {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, meta: `${formatClock()} · 小噜`, text: fullText }
                : m,
            ),
          );
          break;
        }
        case "audio": {
          const audioData = (event.data as string) ?? "";
          if (!audioData) {
            break;
          }

          audioChunks.push(audioData);
          if (audioChunks.length === 1) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId ? { ...m, audioDataUrl: audioData } : m,
              ),
            );
          }
          playNextAudio();
          break;
        }
        case "tts_error": {
          const errorMsg = (event.message as string) ?? "语音合成失败";
          setAssistantError(errorMsg);
          break;
        }
        case "error": {
          const errorMsg = (event.message as string) ?? "Stream error";
          setAssistantError(errorMsg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, text: fullText ? `${fullText}\n\n响应中断：${errorMsg}` : errorMsg }
                : m,
            ),
          );
          if (!fullText) {
            setPhase("error");
          }
          break;
        }
        case "done": {
          streamDone = true;
          if (!fullText) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId ? { ...m, text: "我没有得到可用回答。" } : m,
              ),
            );
          }
          finalizeAudioMessage();
          if (!audioChunks.length || !currentAudio) {
            playNextAudio();
            if (!audioChunks.length) {
              restoreReadyPhase();
            }
          }
          break;
        }
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            applyStreamEvent(JSON.parse(dataStr) as Record<string, unknown>);
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // Flush remaining buffer
      if (buffer.startsWith("data: ")) {
        const dataStr = buffer.slice(6).trim();
        if (dataStr) {
          try {
            applyStreamEvent(JSON.parse(dataStr) as Record<string, unknown>);
          } catch {
            // skip
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Stream read failed";
      if (fullText) {
        setAssistantError(`语音可能未完整播放：${message}`);
      } else {
        setAssistantError(message);
        setPhase("error");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, text: message } : m,
          ),
        );
      }

      streamDone = true;
      if (!currentAudio) {
        restoreReadyPhase();
      }
    }
  }

  async function finalizeAssistantMessage(
    messageId: number,
    text: string,
    audioDataUrl: string | null | undefined,
  ) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, text, audioDataUrl: audioDataUrl ?? null } : m,
      ),
    );

    if (audioDataUrl) {
      setPhase("speaking");
      const audio = new Audio(audioDataUrl);
      audio.onended = () => setPhase(microphoneOnRef.current ? "listening" : "idle");
      audio.onerror = () => setPhase(microphoneOnRef.current ? "listening" : "idle");
      const played = await audio.play().then(
        () => true,
        () => false,
      );
      if (!played) {
        setAssistantError("浏览器阻止了自动播放，可使用消息里的音频控件播放。");
        setPhase(microphoneOnRef.current ? "listening" : "idle");
      }
    } else {
      setPhase(microphoneOnRef.current ? "listening" : "idle");
    }
  }

  const uploadUtteranceAsr = useCallback(
    async (samples: Float32Array, inputSampleRate: number): Promise<string> => {
      if (utteranceUploadInFlightRef.current) {
        return "";
      }
      utteranceUploadInFlightRef.current = true;
      try {
        const pcm = downsampleToPcm16(samples, inputSampleRate);
        const response = await fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pcm16Base64: pcm16ToBase64(pcm),
            sampleRate: asrSampleRate,
          }),
        });
        const data = (await response.json()) as AsrResponse;

        if (!response.ok || data.error) {
          throw new Error(data.error || `Utterance ASR failed: ${response.status}`);
        }

        setAsrBackendState("active");
        return data.text?.trim() || "";
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Utterance ASR failed";
        if (message.includes("Missing VOLCENGINE_ASR_API_KEY")) {
          asrBackendDisabledRef.current = true;
          setAsrBackendState("unconfigured");
        } else {
          setAsrBackendState("error");
          setAsrBackendMessage(message);
        }
        return "";
      } finally {
        utteranceUploadInFlightRef.current = false;
      }
    },
    [],
  );

  const finalizeWakeQuestion = useCallback(async () => {
    clearQuietTimer();
    // Capture chunk-accumulated text as fallback
    const fallbackQuestion = activeUtteranceRef.current.trim();
    activeUtteranceRef.current = "";
    setWakeTranscript("");

    if (!fallbackQuestion) {
      return;
    }

    setPhase("capturing");
    const keyframe = cameraOn ? captureKeyframe() : null;
    if (cameraOn && !keyframe) {
      console.warn(
        "[finalizeWakeQuestion] camera is on but keyframe capture returned null",
      );
    }
    setLastKeyframe(keyframe);

    // Send accumulated utterance audio for authoritative ASR result
    let question = fallbackQuestion;
    if (!asrBackendDisabledRef.current) {
      const utteranceAudio = extractAudioSlice(
        utteranceAudioChunksRef.current,
        utteranceStartSampleRef.current,
        utteranceSampleCountRef.current,
      );

      // Reset utterance accumulation for next utterance
      utteranceAudioChunksRef.current = [];
      utteranceSampleCountRef.current = 0;
      utteranceStartSampleRef.current = 0;

      if (utteranceAudio.length > 0) {
        const authoritativeText = await resolveWithTimeout(
          uploadUtteranceAsr(
            utteranceAudio,
            utteranceSampleRateRef.current || asrSampleRate,
          ),
          authoritativeAsrBudgetMs,
          "",
        );
        if (authoritativeText) {
          const cleaned = stripWakeWord(authoritativeText);
          question = cleaned || authoritativeText;
          setLiveTranscript(question);
        }
      }
    }

    await submitAssistantQuestion(question, keyframe);
  }, [cameraOn, captureKeyframe, clearQuietTimer, submitAssistantQuestion, uploadUtteranceAsr]);

  const scheduleQuietWindow = useCallback(() => {
    clearQuietTimer();
    if (!utteranceStartTimeRef.current) {
      utteranceStartTimeRef.current = Date.now();
    }
    // Force-finalize after max utterance
    const elapsed = Date.now() - utteranceStartTimeRef.current;
    const effectiveQuietMs = Math.min(
      quietWindowMs,
      Math.max(0, maxUtteranceSeconds * 1000 - elapsed),
    );
    quietTimerRef.current = window.setTimeout(() => {
      utteranceStartTimeRef.current = 0;
      void finalizeWakeQuestion();
    }, effectiveQuietMs);
  }, [clearQuietTimer, finalizeWakeQuestion]);

  const handleRecognizedText = useCallback(
    (rawText: string, source: "browser" | "volcengine-chunk" | "volcengine-utterance" = "volcengine-chunk") => {
      const cleanText = rawText.replace(/\s+/g, " ").trim();
      if (!cleanText) {
        return;
      }

      const now = Date.now();
      const lastText = lastRecognizedTextRef.current;

      // Utterance-level results are authoritative — always accept
      if (source === "volcengine-utterance") {
        lastRecognizedTextRef.current = { text: cleanText, at: now };
        setLiveTranscript(cleanText);
        const hasWakeWord = wakeWordPattern.test(cleanText);
        const textForUtterance = hasWakeWord ? stripWakeWord(cleanText) : cleanText;
        activeUtteranceRef.current = textForUtterance;
        setWakeTranscript(textForUtterance);
        if (hasWakeWord) {
          setPhase("listening");
          scheduleQuietWindow();
        }
        return;
      }

      // Word-overlap deduplication for interim results
      if (
        lastText &&
        now - lastText.at < 3000 &&
        computeWordOverlap(lastText.text, cleanText) > 0.75
      ) {
        return;
      }

      lastRecognizedTextRef.current = { text: cleanText, at: now };

      setLiveTranscript(cleanText);
      const hasWakeWord = wakeWordPattern.test(cleanText);

      if (hasWakeWord) {
        const afterWakeWord = stripWakeWord(cleanText);
        activeUtteranceRef.current = afterWakeWord;
        setWakeTranscript(afterWakeWord || cleanText);
        setPhase("listening");

        // Record utterance audio start (with 0.5s pre-roll for wake word context)
        const preRollSamples = Math.floor(
          (utteranceSampleRateRef.current || asrSampleRate) * 0.5,
        );
        utteranceStartSampleRef.current = Math.max(
          0,
          utteranceSampleCountRef.current - preRollSamples,
        );
        utteranceStartTimeRef.current = Date.now();
        scheduleQuietWindow();
        return;
      }

      if (!activeUtteranceRef.current) {
        return;
      }

      activeUtteranceRef.current = `${activeUtteranceRef.current} ${cleanText}`.trim();
      setWakeTranscript(activeUtteranceRef.current);
      scheduleQuietWindow();
    },
    [scheduleQuietWindow],
  );

  const startBrowserRecognition = useCallback(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setMicrophoneError("当前浏览器没有 Web Speech 连续转写能力，可使用右侧手动转写框。");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      // Suppress results during phases where TTS/assistant is active
      const currentPhase = phaseRef.current;
      const suppressedPhases: AssistantPhase[] = [
        "capturing",
        "thinking",
        "speaking",
        "error",
      ];
      if (suppressedPhases.includes(currentPhase)) {
        return;
      }

      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (interimText.trim()) {
        setLiveTranscript(interimText.trim());
      }

      if (finalText.trim()) {
        handleRecognizedText(finalText.trim(), "browser");
      }
    };
    recognition.onerror = (event) => {
      setMicrophoneError(event.message || event.error || "浏览器语音识别发生错误。");
    };
    recognition.onend = () => {
      if (!shouldRestartRecognitionRef.current) {
        return;
      }

      window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          // Ignore restart races from browser speech recognition.
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    shouldRestartRecognitionRef.current = true;

    try {
      recognition.start();
    } catch {
      setMicrophoneError("语音识别启动失败，可使用右侧手动转写框。");
    }
  }, [handleRecognizedText]);

  const pumpAsrChunkQueue = useCallback(async () => {
    if (asrBackendDisabledRef.current || asrUploadInFlightRef.current) {
      return;
    }

    const nextChunk = asrChunkQueueRef.current.shift();
    if (!nextChunk) {
      return;
    }

    const sessionId = asrSessionIdRef.current;
    asrUploadInFlightRef.current = true;
    try {
      const response = await fetch("/api/asr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "append",
          pcm16Base64: nextChunk.pcm16Base64,
          sampleRate: nextChunk.sampleRate,
          sessionId,
        }),
      });
      const data = (await response.json()) as AsrResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || `ASR request failed: ${response.status}`);
      }

      if (sessionId !== asrSessionIdRef.current && !microphoneOnRef.current) {
        return;
      }

      setAsrBackendState("active");
      setAsrBackendMessage(
        data.text?.trim()
          ? "火山 ASR 正在快速返回文本。"
          : "火山 ASR 会话已连接，等待更多语音。",
      );

      if (data.text?.trim()) {
        handleRecognizedText(data.text.trim(), "volcengine-chunk");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "火山 ASR 调用失败。";

      if (
        sessionId !== asrSessionIdRef.current &&
        !microphoneOnRef.current &&
        /closed|ended unexpectedly|timed out/i.test(message)
      ) {
        return;
      }

      if (message.includes("Missing VOLCENGINE_ASR_API_KEY")) {
        asrBackendDisabledRef.current = true;
        setAsrBackendState("unconfigured");
        setAsrBackendMessage(
          "未配置 VOLCENGINE_ASR_API_KEY，使用浏览器或手动转写。",
        );
      } else {
        setAsrBackendState("error");
        setAsrBackendMessage(message);
      }
    } finally {
      asrUploadInFlightRef.current = false;
      if (asrChunkQueueRef.current.length > 0) {
        void pumpAsrChunkQueue();
      }
    }
  }, [handleRecognizedText]);

  const uploadAsrChunk = useCallback(
    async (samples: Float32Array, inputSampleRate: number) => {
      if (asrBackendDisabledRef.current) {
        return;
      }

      const pcm = downsampleToPcm16(samples, inputSampleRate);
      asrChunkQueueRef.current.push({
        pcm16Base64: pcm16ToBase64(pcm),
        sampleRate: asrSampleRate,
      });
      void pumpAsrChunkQueue();
    },
    [pumpAsrChunkQueue],
  );

  const startAudioLevel = useCallback((stream: MediaStream) => {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) {
      return;
    }

    // Reset utterance accumulation on fresh mic start
    asrChunkQueueRef.current = [];
    utteranceAudioChunksRef.current = [];
    utteranceSampleCountRef.current = 0;
    utteranceStartSampleRef.current = 0;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    audioSourceRef.current = source;
    audioProcessorRef.current = processor;
    source.connect(analyser);
    source.connect(processor);
    processor.connect(audioContext.destination);
    audioContextRef.current = audioContext;

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      setAudioLevel(Math.min(1, Math.sqrt(sum / samples.length) * 5));
      audioLevelFrameRef.current = window.requestAnimationFrame(tick);
    };

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);
      output.fill(0);

      if (asrBackendDisabledRef.current) {
        return;
      }

      // Accumulate audio for utterance-level ASR (ring buffer capped at 60s)
      const maxUtteranceSamples = audioContext.sampleRate * 60;
      utteranceAudioChunksRef.current.push(new Float32Array(input));
      utteranceSampleCountRef.current += input.length;
      utteranceSampleRateRef.current = audioContext.sampleRate;
      // Trim oldest chunks if exceeding cap
      while (
        utteranceSampleCountRef.current > maxUtteranceSamples &&
        utteranceAudioChunksRef.current.length > 0
      ) {
        const removed = utteranceAudioChunksRef.current.shift()!;
        utteranceSampleCountRef.current -= removed.length;
        utteranceStartSampleRef.current = Math.max(
          0,
          utteranceStartSampleRef.current - removed.length,
        );
      }

      // Existing chunk-based upload logic
      asrChunksRef.current.push(new Float32Array(input));
      asrSampleCountRef.current += input.length;

      const targetSamples = Math.floor(audioContext.sampleRate * asrChunkSeconds);
      if (asrSampleCountRef.current < targetSamples) {
        return;
      }

      const chunk = mergeAudioChunks(
        asrChunksRef.current,
        asrSampleCountRef.current,
      );
      asrChunksRef.current = [];
      asrSampleCountRef.current = 0;
      void uploadAsrChunk(chunk, audioContext.sampleRate);
    };

    tick();
  }, [uploadAsrChunk]);

  const startCamera = useCallback(async () => {
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });

      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch (error) {
      setCameraError(
        error instanceof Error ? error.message : "摄像头权限获取失败。",
      );
      setCameraOn(false);
    }
  }, []);

  const startMicrophone = useCallback(async () => {
    setMicrophoneError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      microphoneStreamRef.current = stream;
      setMicrophoneOn(true);
      setPhase("listening");
      if (!asrBackendDisabledRef.current) {
        setAsrBackendState("idle");
        setAsrBackendMessage("正在建立火山 ASR 会话。");
      }
      void openAsrSession();
      startAudioLevel(stream);
      startBrowserRecognition();
    } catch (error) {
      setMicrophoneError(
        error instanceof Error ? error.message : "麦克风权限获取失败。",
      );
      setMicrophoneOn(false);
    }
  }, [openAsrSession, startAudioLevel, startBrowserRecognition]);

  const handleManualTranscriptSubmit = useCallback(() => {
    handleRecognizedText(manualTranscript);
    setManualTranscript("");
  }, [handleRecognizedText, manualTranscript]);

  const handleImmediateAsk = useCallback(() => {
    const question =
      activeUtteranceRef.current.trim() || stripWakeWord(manualTranscript);
    activeUtteranceRef.current = question;
    void finalizeWakeQuestion();
  }, [finalizeWakeQuestion, manualTranscript]);

  const handleCaptureOnly = useCallback(() => {
    const keyframe = captureKeyframe();
    setLastKeyframe(keyframe);
    if (!keyframe) {
      setCameraError("摄像头未准备好，无法截取关键帧。");
    }
  }, [captureKeyframe]);

  const handleReset = useCallback(() => {
    clearQuietTimer();
    activeUtteranceRef.current = "";
    setMessages(initialMessages);
    messagesRef.current = initialMessages;
    nextMessageIdRef.current = initialMessages.length + 1;
    setManualTranscript(defaultManualTranscript);
    setLiveTranscript("");
    setWakeTranscript("");
    setLastKeyframe(null);
    setAssistantError("");
    setCameraError("");
    setMicrophoneError("");
    setAsrBackendState(asrBackendDisabledRef.current ? "unconfigured" : "idle");
    setAsrBackendMessage(
      asrBackendDisabledRef.current
        ? "未配置 VOLCENGINE_ASR_API_KEY，使用浏览器或手动转写。"
        : "等待麦克风接入",
    );
    setPhase(microphoneOn ? "listening" : "idle");
  }, [clearQuietTimer, microphoneOn]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    microphoneOnRef.current = microphoneOn;
  }, [microphoneOn]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockLabel(formatClock()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      stopMicrophone();
      clearQuietTimer();
    };
  }, [clearQuietTimer, stopCamera, stopMicrophone]);

  return (
    <>
      <IconSprite />

      <div
        className="prototype-shell"
        data-camera={cameraOn ? "on" : "off"}
        data-microphone={microphoneOn ? "on" : "off"}
        data-activity={phase}
      >
        <div className="app-surface">
          <div className="meeting-shell">
            <header className="topbar">
              <div className="topbar__left">
                <div className="logo">
                  <span className="logo__mark" aria-hidden="true"></span>
                  <span>小噜AI 视觉语音助手</span>
                </div>
                <span className="room-pill">唤醒词：小噜 / 小鹿</span>
              </div>

              <div className="topbar__center">
                <div className="clock-pill">
                  <Icon name="icon-clock" />
                  <span>{clockLabel}</span>
                </div>
                <span className="status-pill">{statusText}</span>
              </div>

              <div className="topbar__right">
                <span className="meta-pill">
                  {cameraOn ? "摄像头已接入" : "摄像头未接入"} /{" "}
                  {microphoneOn ? "麦克风已接入" : "麦克风未接入"}
                </span>
                <button className="user-chip" type="button" aria-label="当前用户">
                  林
                </button>
              </div>
            </header>

            <div className="notice-bar">
              <span className="notice-bar__dot"></span>
              <span>{buildBannerMessage(phase, microphoneOn)}</span>
            </div>

            <main className="content-area content-area--assistant">
              <section className="voice-workspace" aria-label="视觉语音助手工作台">
                <section className="vision-panel">
                  <div className="panel-header">
                    <div>
                      <p className="panel-eyebrow">视觉输入</p>
                      <h2>摄像头画面</h2>
                    </div>
                    <span className={`status-chip${cameraOn ? " status-chip--live" : ""}`}>
                      {cameraOn ? "实时" : "未接入"}
                    </span>
                  </div>

                  <div className="vision-panel__video">
                    <div className="video-grid" data-count="1">
                      <div className="video-item">
                        <video
                          ref={videoRef}
                          className="camera-preview"
                          autoPlay
                          muted
                          playsInline
                        />
                        {!cameraOn && (
                          <div className="camera-placeholder">
                            <Icon name="icon-camera" />
                            <span>未接入</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="vision-panel__keyframe">
                    <div className="keyframe-strip">
                      <div className="keyframe-preview">
                        {lastKeyframe ? (
                          <img src={lastKeyframe} alt="最近关键帧" />
                        ) : (
                          <span>暂无关键帧</span>
                        )}
                      </div>
                      <div className="keyframe-meta">
                        <strong>最近关键帧</strong>
                        <span>
                          {lastKeyframe ? "就绪" : "等待提问后自动生成"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <canvas ref={canvasRef} className="capture-canvas" />
                </section>

                <section className="voice-panel">
                  <div className="panel-header">
                    <div>
                      <p className="panel-eyebrow">语音输入</p>
                      <h2>转写</h2>
                    </div>
                    <span
                      className={`status-chip${microphoneOn ? " status-chip--live" : ""}`}
                    >
                      {microphoneOn ? "收听中" : "未接入"}
                    </span>
                  </div>

                  <div className="voice-meter" aria-label="麦克风音量">
                    <span style={{ transform: `scaleX(${Math.max(audioLevel, 0.04)})` }} />
                  </div>

                  <div className="transcript-grid">
                    <div className="transcript-box">
                      <span>实时转写</span>
                      <p>{liveTranscript || "—"}</p>
                    </div>
                    <div className="transcript-box transcript-box--active">
                      <span>唤醒片段</span>
                      <p>{wakeTranscript || "—"}</p>
                    </div>
                  </div>

                  <label className="manual-asr">
                    <span>手动输入</span>
                    <textarea
                      value={manualTranscript}
                      onChange={(event) => setManualTranscript(event.target.value)}
                      rows={4}
                    />
                  </label>

                  <div className="voice-actions">
                    <button
                      className="secondary-button secondary-button--inline"
                      type="button"
                      onClick={handleManualTranscriptSubmit}
                      disabled={!manualTranscript.trim()}
                    >
                      <Icon name="icon-check" />
                      <span>提交</span>
                    </button>
                    <button
                      className="send-button send-button--wide"
                      type="button"
                      onClick={handleImmediateAsk}
                      disabled={!manualTranscript.trim() && !wakeTranscript.trim()}
                    >
                      <Icon name="icon-send" />
                      <span>提问</span>
                    </button>
                  </div>

                  {(cameraError || microphoneError || assistantError) && (
                    <div className="error-stack">
                      {cameraError && <p>{cameraError}</p>}
                      {microphoneError && <p>{microphoneError}</p>}
                      {assistantError && <p>{assistantError}</p>}
                    </div>
                  )}
                </section>

                <section className="assistant-log">
                  <div className="panel-header">
                    <div>
                      <p className="panel-eyebrow">输出</p>
                      <h2>回答与语音</h2>
                    </div>
                    <span className="status-chip">多模态 + TTS</span>
                  </div>

                  <div className="message-list">
                    {messages.map((message) => (
                      <article
                        className={`message-card message-card--${message.role}`}
                        key={message.id}
                      >
                        <div className="message-card__meta">{message.meta}</div>
                        <p>{message.text}</p>
                        {message.imageDataUrl && (
                          <img
                            className="message-card__image"
                            src={message.imageDataUrl}
                            alt="随问题发送的摄像头关键帧"
                          />
                        )}
                        {message.audioDataUrl && (
                          <audio
                            className="message-card__audio"
                            src={message.audioDataUrl}
                            controls
                          />
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            </main>

            <footer className="toolbar">
              <div className="toolbar__group">
                <button
                  className={`control-button${cameraOn ? " control-button--active" : ""}`}
                  type="button"
                  aria-pressed={cameraOn}
                  onClick={() => {
                    if (cameraOn) {
                      stopCamera();
                    } else {
                      void startCamera();
                    }
                  }}
                >
                  <span className="control-button__icon">
                    <Icon name="icon-camera" />
                  </span>
                  <span className="control-button__label">
                    {cameraOn ? "关闭摄像头" : "开启摄像头"}
                  </span>
                </button>

                <button
                  className={`control-button${microphoneOn ? " control-button--active" : ""}`}
                  type="button"
                  aria-pressed={microphoneOn}
                  onClick={() => {
                    if (microphoneOn) {
                      stopMicrophone();
                    } else {
                      void startMicrophone();
                    }
                  }}
                >
                  <span className="control-button__icon">
                    <Icon name="icon-microphone" />
                  </span>
                  <span className="control-button__label">
                    {microphoneOn ? "关闭麦克风" : "开启麦克风"}
                  </span>
                </button>

                <button
                  className="control-button"
                  type="button"
                  onClick={handleCaptureOnly}
                  disabled={!cameraOn}
                >
                  <span className="control-button__icon">
                    <Icon name="icon-screen" />
                  </span>
                  <span className="control-button__label">截取关键帧</span>
                </button>
              </div>

              <div className="toolbar__group toolbar__group--right">
                <button className="control-button" type="button" onClick={handleReset}>
                  <span className="control-button__icon">
                    <Icon name="icon-check" />
                  </span>
                  <span className="control-button__label">重置会话</span>
                </button>
                <button className="end-button" type="button" onClick={stopMicrophone}>
                  <Icon name="icon-phone-off" />
                  <span>结束收听</span>
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}
