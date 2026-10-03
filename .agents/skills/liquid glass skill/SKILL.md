---
name: liquid-glass
description: Build or retrofit polished liquid-glass and glassmorphism surfaces for web interfaces while preserving the exact upright orientation and screen-space alignment of the scene behind the glass. Use for frosted cards, refractive overlays, hero copy panels, CSS backdrop-filter effects, or WebGL/canvas glass, especially when an existing effect mirrors, flips, rotates, duplicates, or misaligns its background.
---

# Liquid Glass

Create glass that changes the light, not the orientation of the scene. Keep the background upright and aligned with the same screen position outside the glass.

## Workflow

1. Inspect the existing component, its call sites, styles, and the real background source. Determine whether the glass sits over ordinary DOM/CSS, a video, or a canvas/WebGL scene.
2. Preserve the source scene. Do not rotate, mirror, scale, or clone it merely to produce glass.
3. Choose the simplest renderer that can produce the requested result:
   - Use CSS `backdrop-filter` by default for DOM, image, gradient, and video backgrounds. Start from `assets/templates/css/liquid-glass.css`.
   - Use WebGL only when exact canvas sampling or visible refraction is required. Read `references/webgl-orientation.md` and start from `assets/templates/react/CanvasLiquidGlass.tsx`.
4. Build the surface in layers: live backdrop, subtle tint/blur, soft rim, restrained highlight, then readable foreground content.
5. Keep displacement small and continuous. A ripple may offset nearby samples, but it must never remap the image with a negative scale or fold the UV field over itself.
6. Add a static fallback and respect `prefers-reduced-motion`. Keep decorative glass layers out of pointer and accessibility interaction.
7. Verify orientation before polishing animation. Run `node scripts/check-orientation.mjs <component-file>` and perform the visual checks in `references/verification.md`.

## Non-negotiable orientation contract

- Preserve top, bottom, left, and right. Text or an asymmetric object behind the glass must remain readable and upright.
- Apply exactly one Y-origin correction in a WebGL pipeline. The bundled template uses bottom-left screen UVs plus `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)`. Do not also write `1.0 - uv.y` in the shader.
- Never fix alignment with `scaleY(-1)`, `rotate(180deg)`, negative texture scale, or a mirrored duplicate of the background.
- Sample in screen space. The point under the center of the glass should come from that same screen position, with only a small optical offset.
- Do not tilt or rotate the entire card by default. Add perspective movement only when the user explicitly wants it, and keep the sampled background screen-aligned.

## Visual direction

Read `references/visual-spec.md` before making substantial aesthetic decisions. Prefer a clear, premium pane with a restrained tint, a soft border, one believable highlight, and enough contrast for the content. Avoid milky opacity, neon borders, excessive glow, and strong wobble.

## Implementation notes

- In React, use `assets/templates/react/LiquidGlass.tsx` with the CSS template for the normal case.
- For a viewport-sized source canvas, use `assets/templates/react/CanvasLiquidGlass.tsx`. Keep the source canvas and viewport aspect mapping identical.
- Adapt tokens, radii, and spacing to the host design system rather than importing an unrelated visual style.
- If working in a project with framework-specific local guidance, read it before editing project code.
- Keep the host component API small: children, class name, intensity or tint, and optionally a source canvas identifier.

## Completion criteria

- The content behind the pane has the same orientation inside and outside it.
- The pane samples the correct screen region at desktop and mobile sizes.
- No double Y-flip or mirror transform exists.
- Foreground text and controls remain sharp, readable, and interactive.
- CSS fallback works when WebGL or backdrop filtering is unavailable.
- Reduced-motion mode removes continuous wobble without removing legibility.
- Relevant build, type, lint, and browser checks pass in the host project.
