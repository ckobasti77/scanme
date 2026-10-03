# Visual specification

## Target character

Build a quiet, premium glass pane that feels physically present without becoming the main visual. The scene remains recognizable through the pane; blur, tint, and refraction merely soften it.

## Layer recipe

Use these as starting ranges and adapt to the host design system:

| Layer | Starting value | Purpose |
| --- | --- | --- |
| Blur | 16-28px | Soften detail without erasing the scene |
| Saturation | 115-145% | Restore color lost to blur and tint |
| Light tint | white at 7-14% | Create body in light scenes |
| Dark tint | near-black at 12-24% | Preserve text contrast in cinematic scenes |
| Border | white at 18-32% | Define the rim |
| Inner highlight | white at 12-22% | Suggest thickness |
| Shadow | black at 12-20%, broad | Separate the pane from the scene |
| Refraction | 2-8 screen pixels | Add a subtle optical response |

Use one primary highlight direction. Keep the opposite edge dimmer. Let the host typography and spacing remain dominant.

## Composition rules

- Keep the original background visible through the pane.
- Keep foreground content outside blur and refraction layers.
- Clip decorative layers to the pane radius.
- Use `isolation: isolate` so blend and highlight layers do not leak into nearby UI.
- Prefer a subtle gradient tint over a flat opaque fill.
- Keep controls at normal contrast and preserve visible focus states.

## Avoid

- Opaque gray rectangles labeled as glass.
- Mirrored or upside-down scenery.
- Large animated ripples that make the image swim.
- Multiple bright borders, rainbow chromatic fringes, or permanent cursor spotlights unless requested.
- Perspective rotation that disconnects the sampled scene from the real background.
- Blur on the pane's foreground text or interactive children.

## Suggested variants

### Clear

Use 8-11% light tint, 18-22px blur, and a fine border. Best over detailed photography.

### Cinematic dark

Use 16-22% dark tint, 20-28px blur, and a restrained top-left highlight. Best for hero copy over video or frame sequences.

### Compact control

Use 10-14px blur, a smaller radius, and almost no refraction. Best for navigation, pills, and floating controls.
