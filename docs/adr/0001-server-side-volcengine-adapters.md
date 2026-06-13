# Keep Volcengine and Ark credentials in server-side adapters

The browser captures camera and microphone data, but all Volcengine ASR, Ark multimodal, and Volcengine TTS calls go through React Router resource routes. This keeps provider credentials out of client bundles and works around WebSocket authentication requirements that browsers cannot reliably satisfy with custom handshake headers; the trade-off is extra server code and an eventual need to optimize ASR from short-segment requests to a long-lived server WebSocket session.
