# Vision Voice Assistant Plan

## Goal

Implement a Xiaolu assistant flow that accepts camera and microphone input, detects the Xiaolu wake word, captures a camera keyframe after a quiet window, calls a multimodal model, synthesizes speech, and plays the response.

## Implemented

- Browser camera access with live preview and manual/automatic camera keyframe capture.
- Browser microphone access with volume metering.
- Volcengine ASR short-segment adapter through `/api/asr`, keeping ASR credentials on the server.
- Browser Web Speech fallback and manual transcript fallback.
- Wake word detection for "小噜", "小鹿", "小路", and "xiaolu".
- Two-second quiet window after recognized text before automatic keyframe capture.
- Multimodal Ark Responses call through `/api/assistant`.
- TTS call through `/api/assistant`, returning an audio data URL for playback.
- Text and audio response log in the UI.

## Runtime Configuration

Set these environment variables in `frontend/` before running the app:

```bash
ARK_API_KEY=...
ARK_MODEL=doubao-seed-2-0-lite-260428
VOLCENGINE_ASR_API_KEY=...
VOLCENGINE_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
VOLCENGINE_TTS_API_KEY=...
VOLCENGINE_TTS_RESOURCE_ID=seed-tts-2.0
VOLCENGINE_TTS_SPEAKER=zh_female_shuangkuaisisi_moon_bigtts
```

`ARK_API_KEY`, `VOLCENGINE_ASR_API_KEY`, and `VOLCENGINE_TTS_API_KEY` are intentionally server-only. Do not expose them with a `VITE_` prefix.

## Remaining Hardening

- Replace short-segment ASR requests with one long-lived server WebSocket session for lower latency and lower handshake overhead.
- Add provider-level integration tests with mocked WebSocket frames and mocked Ark/TTS HTTP responses.
- Add a user-facing settings surface for provider status instead of only inline status text.
- Add deployment documentation for required secure context constraints, since camera and microphone require HTTPS or localhost.
