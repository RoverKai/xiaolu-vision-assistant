# Design System Implementation Patterns

Use this reference before changing frontend code.

## File Placement

Follow the existing project structure. If none exists, prefer a small structure:

```text
frontend/app/
├── styles/
│   ├── tokens.css
│   └── globals.css
└── components/
    └── ui/
        ├── button.tsx
        ├── input.tsx
        └── index.ts
```

For CSS-only prototypes or small apps, a well-organized `app.css` with token, base, layout, component, and responsive sections may be enough. Do not create a component library for a one-screen prototype unless the user asks for reusable primitives.

## Migration Flow

1. Add or consolidate tokens first.
2. Replace hard-coded values in shared surfaces next.
3. Extract reusable components only after seeing at least two real uses or a clear near-term need.
4. Migrate one representative page end to end.
5. Run build/typecheck/lint and inspect responsive states.

Avoid broad visual rewrites that mix token creation, component extraction, layout changes, and copy changes without a clear reason.

## CSS Guidance

- Put raw palette values in one place. Components should consume semantic variables.
- Keep radius consistent: 4-8px for dense operational controls unless the existing design language uses larger values intentionally.
- Prefer layout primitives over nested cards. Use cards for repeated records, modals, and clearly framed tools.
- Keep typography tied to hierarchy and density. Avoid viewport-width font scaling.
- Use `:focus-visible` styles for interactive elements.
- Respect `@media (prefers-reduced-motion: reduce)` for animated changes.
- Use logical min/max sizing for text-heavy controls to avoid overflow.

## Component Guidance

Create components with small, explicit APIs. Good props describe product meaning or interaction state, not arbitrary styling escape hatches.

Example button API:

```ts
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
```

Avoid adding unbounded `color`, `radius`, or `shadow` props unless the existing design system already supports tokenized overrides.

## Accessibility Checks

Before finishing, verify:

- Interactive elements are keyboard reachable.
- Focus order follows visual order.
- Icon-only controls have accessible names and tooltips if unclear.
- Text contrast is adequate for normal and muted states.
- Error states are not color-only.
- Dialogs/popovers have escape and outside-click behavior if implemented.

## Visual Verification

When a dev server is available, run it and inspect at least one desktop and one mobile viewport. Check:

- No text overlap or clipping.
- Navigation and primary actions remain visible.
- Cards/panels do not nest awkwardly.
- Empty/loading/error states match the same visual system.
- The palette does not collapse into a one-note color theme unless intentionally branded.

If browser automation is available, capture screenshots before and after for changed surfaces.
