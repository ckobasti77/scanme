# Verification

## Static source check

Run the bundled checker against every custom glass renderer:

```powershell
node scripts/check-orientation.mjs path\to\LiquidGlass.tsx
```

The checker catches common mirror transforms, a missing WebGL upload flip, and the common double-flip combination. Treat it as a guardrail, not a substitute for visual QA.

## Visual orientation test

1. Place `assets/orientation-fixture.svg` behind the glass at cover size.
2. Confirm `TOP`, `BOTTOM`, `LEFT`, and `RIGHT` stay in the same direction through the pane.
3. Move the pane over the diagonal arrow and the word `GLASS`. They may soften or shift a few pixels, but must never reverse or turn upside down.
4. Compare the pane center with the same point immediately outside the pane. The scene must remain screen-aligned.
5. Repeat at narrow mobile, tablet, desktop, and high-DPI desktop sizes.

## Runtime states

- Test light and dark imagery.
- Test while the background video or canvas is moving.
- Test browser zoom at 80%, 100%, and 125%.
- Test `prefers-reduced-motion: reduce`.
- Test without WebGL or with the custom renderer disabled to confirm the CSS fallback.
- Confirm buttons and links inside the pane remain clickable and keyboard focus is visible.

## Host-project checks

Run the repository's real type, lint, and production build commands. Then inspect the rendered page in the browser; a successful build cannot prove that the sampled scene is upright.
