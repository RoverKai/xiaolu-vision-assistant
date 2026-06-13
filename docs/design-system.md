# Xiaolu Vision Assistant Design System

This design system describes the current React Router frontend in `frontend/app`.
The product surface is a compact meeting-assistant prototype: dense, calm,
scan-friendly, and optimized for repeated control actions around shared page,
camera, microphone, participants, AI chat, and invite flows.

## Source Of Truth

- Code tokens live in `frontend/app/app.css` under `:root`.
- The current app is CSS-first. Tailwind is available through Vite, but current
  product UI should keep using CSS variables until a broader Tailwind migration
  is planned.
- Keep existing legacy aliases such as `--brand`, `--line`, `--card`, and
  `--text` while new work should prefer semantic tokens such as
  `--color-action-primary`, `--surface-panel`, and `--text-primary`.

## Token Contract

### Color

- Palette tokens: `--palette-blue-*`, `--palette-red-*`,
  `--palette-green-600`, `--palette-amber-500`, `--palette-gray-*`,
  `--palette-white`.
- Action tokens: `--color-action-primary`,
  `--color-action-primary-hover`, `--color-action-primary-soft`,
  `--color-action-primary-subtle`.
- Semantic state tokens: `--color-danger`, `--color-danger-soft`,
  `--color-success`, `--color-success-soft`, `--color-warning`,
  `--color-focus-ring`, `--color-overlay`.
- Surface tokens: `--surface-page`, `--surface-app`, `--surface-panel`,
  `--surface-panel-alt`, `--surface-panel-muted`, `--surface-panel-tint`,
  `--surface-glass`, `--surface-glass-strong`.
- Text tokens: `--text-primary`, `--text-secondary`, `--text-muted`,
  `--text-inverse`.
- Border tokens: `--border-subtle`, `--border-default`, `--border-strong`,
  `--border-action`, `--border-focus`.

Use blue only for active AI, selected input, sharing, focus, and primary
actions. Use red only for destructive meeting actions and blocking errors. Use
green for live or completed states. Use amber for pending or attention states.

### Typography

- Font family: `--font-sans`, currently PingFang SC, Hiragino Sans GB,
  Microsoft YaHei, Noto Sans SC, and system sans fallbacks.
- Size scale: `--font-size-xs` 11px, `--font-size-sm` 12px,
  `--font-size-md` 13px, `--font-size-lg` 14px, `--font-size-xl` 16px,
  `--font-size-2xl` 18px, `--font-size-3xl` 24px.
- Line heights: `--line-height-tight`, `--line-height-normal`,
  `--line-height-relaxed`.
- Weights: `--font-weight-regular`, `--font-weight-medium`,
  `--font-weight-semibold`.

Use 12-14px text for dense meeting controls, 16-18px for panel headings, and
24px only for modal titles or major page-level headings. Do not scale type with
viewport width and keep letter spacing at `0` unless using short uppercase
eyebrow labels.

### Spacing

- Step tokens: `--space-1` through `--space-16`, mapped from 4px to 64px.
- Controls usually use 8-16px internal padding.
- Panels and popovers usually use 16-28px padding.
- Page shell gutters use 20-24px on desktop and 14px on mobile.

### Shape

- Radius tokens: `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`,
  `--radius-xl`, `--radius-2xl`, `--radius-pill`.
- Use 8-16px for controls, input rows, participant cards, and table wrappers.
- Use 18-24px only for large stage surfaces, popovers, and modals.
- Use `--radius-pill` only for status pills and compact badges.

### Elevation

- Shadows: `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`,
  `--shadow-xl`, `--shadow-shell`.
- Most operational panels should be flat or use `--shadow-sm`.
- Popovers and modals can use `--shadow-xl`; the app shell uses
  `--shadow-shell`.

### Motion

- Durations: `--motion-fast`, `--motion-base`, `--motion-slow`.
- Easing: `--ease-standard`, `--ease-emphasized`.
- Allowed motion: opacity, transform, border color, background, and box shadow.
- Avoid layout-changing transitions. Honor reduced-motion by disabling
  nonessential animation.

### Z-Index

- `--z-base`: default local stacking.
- `--z-stage`: stage content.
- `--z-floating`: participant and camera overlays.
- `--z-assistant`: AI overlay.
- `--z-toolbar`: persistent toolbar.
- `--z-modal`: modal layer.
- `--z-popover`: input popovers and menus.
- `--z-toast`: toast messages.
- `--z-tooltip`: tooltips.

## Component Standards

### Buttons

- Primary: filled blue gradient for send or core confirmation.
- Secondary: blue soft surface for non-destructive confirmation or copy.
- Ghost/icon: white or transparent surface with border, used for close,
  toolbar controls, and small utility actions.
- Danger: filled red gradient for ending or destructive meeting actions.
- Disabled: keep layout stable, reduce opacity, and remove hover transform.
- Icon-only buttons require `aria-label`.

### Inputs And Menus

- Text inputs should use transparent backgrounds inside a framed field.
- Input groups use `:focus-within` with `--border-focus`.
- Selectable source rows use `aria-pressed` and an active blue soft surface.
- Popovers close on outside pointer down and Escape. Keep the trigger and panel
  adjacent in DOM order.

### Navigation

- The app shell uses a topbar, notice bar, central content area, and bottom
  toolbar.
- Use pills for room state, time, and active input summary.
- Sidebar navigation inside shared browser previews should stay compact,
  single-column, and selected with blue text plus a small dot.

### Dialogs And Popovers

- Dialogs use `--color-overlay`, a white modal surface, `--shadow-xl`, and a
  max width instead of full-screen cards on desktop.
- Popovers use 16px padding, a strong shadow, and no nested cards.
- Close controls are icon buttons with an accessible name.

### Cards, Panels, Tables, Lists

- Cards are for repeated records, participants, messages, invite blocks, and
  framed tools. Do not wrap full page sections in decorative cards.
- Panels use `--surface-panel` or `--surface-panel-alt` and a default border.
- Tables/lists use fixed grid columns on desktop and collapse to one column on
  narrow screens.
- Row status badges use the existing todo, warn, send, and done token pairs.

### Feedback States

- Loading or thinking states may use small dots and opacity changes.
- Empty states should give one action or next step, not long explanations.
- Error states use red plus text, never color alone.
- Success states use green for live or complete indicators.

## Layout Patterns

- The shell is bounded by `.app-surface` on desktop and becomes full viewport on
  mobile.
- `.meeting-shell` owns the topbar, notice bar, main content, and toolbar grid.
- `.content-area` owns central stage content and overlays. Keep overlays
  positioned with stable dimensions so chat bubbles, participant cards, and
  camera tiles do not shift the main layout.
- `.toolbar` can wrap controls under 1540px and becomes full-width stacked
  controls under 820px.
- Shared browser previews use a chrome row, optional sidebar, and scrollable
  main content. Avoid adding a second card shell inside the preview body.
- Forms place validation directly below the field or row that caused it.

## Usage Rules

- Reuse CSS variables for new values. Add raw colors only inside `:root`.
- Prefer semantic variables in new CSS; keep legacy aliases for old selectors.
- Use existing icon sprite patterns unless an approved icon dependency is added.
- Preserve the Xiaolu AI blue brand signal, but balance it with neutral gray
  surfaces so the UI does not become one-note blue.
- Keep Chinese interface labels concise and action-oriented. English product
  docs may refer to the product as Xiaolu AI.
- Do not add a component library until at least two screens need shared React
  primitives.

## Migration Steps

1. Keep expanding token usage in `frontend/app/app.css` from top-level shell
   surfaces outward.
2. Replace repeated hard-coded blue, white, gray, red, and shadow values with
   semantic tokens.
3. Extract React UI primitives only after there are at least two real usages,
   starting with Button, IconButton, InputSource, Modal, and StatusBadge.
4. Migrate one complete surface at a time: toolbar, input popover, invite modal,
   shared preview, then assistant messages.
5. After each migrated surface, check desktop and mobile widths for clipping,
   overlap, keyboard focus, and disabled states.

## Validation

Run these commands from `frontend/`:

```bash
npm run typecheck
npm run build
```

Visual checks:

- Desktop around 1440px and wide desktop around 1892px.
- Tablet around 1024px.
- Mobile around 390px.
- States: no input selected, share on, camera on, microphone on, invite modal
  open, copied state, disabled send.
- Accessibility: keyboard reachability, visible focus, icon button labels,
  text contrast, Escape/outside-click behavior for popovers, and non-color-only
  error messaging.

