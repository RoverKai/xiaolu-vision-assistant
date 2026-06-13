import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/asr", "routes/api.asr.ts"),
  route("api/assistant", "routes/api.assistant.ts"),
] satisfies RouteConfig;
