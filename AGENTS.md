# Repository Guidelines

## Project Structure & Module Organization

This repository is organized around a React Router frontend prototype plus project documentation and agent skills.

- `frontend/`: React 19 / React Router 7 application. Source lives in `frontend/app/`, route definitions in `frontend/app/routes.ts`, page routes in `frontend/app/routes/`, global CSS and design tokens in `frontend/app/app.css`, and static assets in `frontend/public/`.
- `docs/`: project documentation. Start with `docs/design-system.md` before changing visual patterns.
- `skills/`: reusable Codex skill instructions and helper scripts for repository workflows.
- Generated folders such as `frontend/build/`, `frontend/.react-router/`, and `frontend/node_modules/` should not be committed.

## Build, Test, and Development Commands

Run frontend commands from `frontend/`:

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the local development server with HMR, normally at `http://localhost:5173`.
- `npm run typecheck`: generate React Router types, then run strict TypeScript checks.
- `npm run build`: create the production client/server build in `build/`.
- `npm run start`: serve the production build from `build/server/index.js`.
- `docker build -t xiaolu-frontend .`: build the frontend container image.

## Coding Style & Naming Conventions

Use TypeScript, ES modules, React function components, and 2-space indentation. Name components and types in `PascalCase`; hooks, helpers, variables, and state setters in `camelCase`. Prefer the `~/` alias for imports from `frontend/app` when it improves clarity.

Keep UI copy concise and action-oriented, especially Chinese labels in the meeting assistant prototype. For styles, reuse CSS variables in `frontend/app/app.css`; add new raw color values only as root-level tokens and follow `docs/design-system.md`.

## Testing Guidelines

No dedicated unit test runner is configured yet. Before opening a PR, run:

```bash
cd frontend
npm run typecheck
npm run build
```

For UI changes, manually check desktop, tablet, and mobile widths, plus key states such as sharing enabled, camera enabled, microphone enabled, invite modal open, copied feedback, and disabled send.

## Commit & Pull Request Guidelines

Use Conventional Commit headers: `type(scope): imperative summary`, for example `feat(frontend): add meeting invite modal` or `docs(design-system): document color tokens`.

Work from `feature/*` branches into `develop`; promote stable `develop` to `main`. Keep each PR focused on one feature, fix, or behavior change. PR descriptions should include feature description, implementation approach, and exact validation steps. Add screenshots or screen recordings for visible frontend changes.

## Security & Configuration Tips

Do not commit `.env` files, local credentials, generated builds, or dependency directories. Treat external API keys and bot credentials as environment configuration, not source code.
