---
name: generate-design-system
description: Create, document, and apply a consistent frontend design system for an existing project. Use when Codex is asked to generate a project design system, unify inconsistent UI, extract design tokens, standardize colors/typography/spacing/components, refactor screens to match a shared visual language, or produce frontend design-system documentation and implementation guidance for React, Vue, CSS, Tailwind, or similar web app codebases.
---

# Generate Design System

## Overview

Create a project-specific frontend design system from the codebase that exists now. Prefer extracting and consolidating real patterns over inventing a separate visual language.

## Workflow

1. Inspect the frontend stack, design assets, and existing screens before proposing changes.
2. Run the audit script when a repository is available:

```bash
python .codex/skills/generate-design-system/scripts/audit_frontend_ui.py --root .
```

3. Read `references/system-spec.md` before drafting design-system docs, tokens, or component inventories.
4. Read `references/implementation-patterns.md` before editing code or choosing file/module structure.
5. Produce a concise design-system source of truth in the project, then apply it to the requested UI surface.

## Required Output

Include these artifacts unless the user narrows the task:

- Design tokens for color, typography, spacing, radii, shadows, borders, motion, and z-index.
- Component standards for buttons, inputs, navigation, dialogs, cards, tables/lists, feedback, empty/loading/error states.
- Layout patterns for shell, page sections, grids, panels, forms, and responsive behavior.
- Usage rules showing what to reuse, what to avoid, and migration steps for inconsistent legacy UI.
- Validation notes covering visual regression risk, accessibility checks, responsive checks, and relevant project test/build commands.

## Decision Rules

- Treat the existing product domain as the design anchor. Operational tools should be dense, calm, and scan-friendly; consumer/marketing surfaces may be more expressive.
- Preserve recognizable brand/product signals already present in the project unless the user asks for a rebrand.
- Prefer CSS variables or the project's existing token mechanism as the contract between components and styles.
- Convert repeated one-off styles into named tokens or reusable primitives only when they remove real duplication.
- Do not introduce a UI framework, icon set, styling library, or build dependency unless the project already uses it or the user approves it.
- Use visual verification for frontend changes whenever the app can run locally.

## Resource Guide

- `scripts/audit_frontend_ui.py`: scan source files for colors, CSS variables, class names, component files, and styling libraries.
- `references/system-spec.md`: design-system content checklist and documentation structure.
- `references/implementation-patterns.md`: practical implementation and migration patterns.
