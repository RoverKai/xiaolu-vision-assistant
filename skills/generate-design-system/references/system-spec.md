# Design System Specification Guide

Use this reference when drafting or updating the project's design-system source of truth.

## Discovery

Start from real product surfaces:

- Identify app type, core workflows, user roles, density needs, and key pages.
- Inventory current colors, typography, spacing, radius, shadows, border styles, icons, illustrations, and motion.
- Find repeated components and near-duplicates across screens.
- Record existing brand cues: product name, logo treatment, accent colors, domain-specific states, and tone of writing.
- Separate intentional patterns from accidental drift. Preserve mature, repeated patterns; replace isolated decoration.

## Token Contract

Define tokens in the project's native style layer. For CSS-first apps, prefer `:root` variables. For Tailwind apps, map tokens into the Tailwind-compatible theme/config approach already present.

Include:

- Color: background, surface, elevated surface, text, muted text, border, primary, primary hover/active, danger, warning, success, info, focus ring, overlay.
- Typography: font families, text sizes, line heights, weights, heading levels, body text, captions, numeric/monospace treatment if used.
- Spacing: compact step scale for repeated UI, page gutters, panel padding, stack gaps, control gaps.
- Shape: radius tokens for controls, panels, cards, pills, avatars, modals.
- Elevation: shadow tokens for flat, raised, overlay, and active drag/focus states.
- Border: default line, strong line, subtle divider, focus outline.
- Motion: durations, easing, allowed transitions, reduced-motion behavior.
- Z-index: base, sticky, dropdown, modal, toast, tooltip.

Keep names semantic rather than visual when possible: `--color-action-primary`, `--surface-panel`, `--text-secondary`. Use visual names only for raw palette primitives.

## Component Standards

For each recurring component, specify purpose, anatomy, variants, states, spacing, accessibility, and examples of correct usage.

Cover these common primitives when relevant:

- Button: primary, secondary, ghost, danger, icon-only, loading, disabled.
- Input controls: text input, textarea, select/menu, checkbox, radio, switch, slider, segmented control.
- Feedback: alert, toast, inline validation, progress, spinner/skeleton, empty state, error state.
- Navigation: app shell, topbar, sidebar, tabs, breadcrumb, command/menu surfaces.
- Content: card, panel, table, list item, metric, badge, avatar, tooltip, popover, modal/drawer.
- Domain objects: any project-specific entities users repeatedly scan or act on.

State rules matter more than screenshots. Define hover, active, focus-visible, selected, disabled, loading, success, warning, danger, and empty states.

## Layout Standards

Document page-level patterns:

- App shell dimensions, gutters, safe areas, scroll ownership, sticky bars.
- Grid systems and responsive breakpoints already used by the app.
- Panel composition rules, including when not to use cards.
- Form layout, validation placement, and action alignment.
- Data-dense views, including column density, truncation, wrapping, and row actions.
- Mobile behavior for navigation, controls, tables/lists, dialogs, and fixed toolbars.

Use stable dimensions for fixed-format controls so text, hover states, badges, and icons do not shift layout.

## Writing And Tone

Define product copy patterns only where they affect consistency:

- Button verbs and destructive action wording.
- Empty/error/loading message tone.
- Label length and casing.
- Date, time, number, and status formatting.
- Chinese/English mixing rules if the product uses both.

## Deliverable Shape

Choose the smallest durable documentation target the repo will maintain:

- `docs/design-system.md` for human-readable specs.
- `frontend/app/styles/tokens.css` or equivalent for code tokens.
- `frontend/app/components/ui/*` for reusable primitives when the repo already has or needs a component layer.
- Storybook or examples only if the project already uses it or the user asks.

End with a migration checklist: files touched first, deprecated patterns, and validation commands.
