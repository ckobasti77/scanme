# WebGL orientation and alignment

## The invariant

For any screen point `P`, the base sample under the glass must come from the same screen point `P`. Refraction may add a small local offset, but it must not change the scene's handedness or turn top into bottom.

## Recommended coordinate contract

The bundled WebGL template uses one consistent contract:

1. `gl_FragCoord` is read in its native bottom-left framebuffer coordinates.
2. Divide by device pixel ratio to obtain local CSS pixels.
3. Convert the card's top-left DOM rect to a bottom-left viewport position.
4. Divide by the CSS viewport size to obtain bottom-left screen UVs.
5. Upload a DOM canvas with `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)`.
6. Sample the texture directly with the screen UV. Do not invert `uv.y` in the shader.

This is the required pairing:

```ts
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
```

```glsl
float cardBottom = uViewportCss.y - (uCardRectCss.y + uCardRectCss.w);
vec2 localCss = gl_FragCoord.xy / uDpr;
vec2 screenUv = (vec2(uCardRectCss.x, cardBottom) + localCss) / uViewportCss;
vec4 scene = texture2D(uScene, clamp(screenUv + displacement, 0.0, 1.0));
```

## Why upside-down glass happens

DOM images and canvases use a top-left mental model, while WebGL fragment and texture conventions are commonly handled from the bottom-left. If the source is uploaded without correcting its row order, the scene appears vertically flipped. If both upload and shader correct Y, it flips twice and alignment breaks again.

Use exactly one correction. The template chooses upload-time correction because it keeps screen-space shader math readable.

## Keep refraction non-folding

Treat refraction as a small additive displacement in normalized screen space:

```glsl
vec2 displacement = wavePixels / uViewportCss;
vec2 sampleUv = screenUv + displacement;
```

Keep displacement below roughly 8 CSS pixels for interface glass. Avoid multiplying UVs by a negative value or using a radial function whose slope is strong enough to cross neighboring samples. If text behind the pane becomes reversed or duplicated, reduce displacement immediately.

## Source sizing

The viewport UV approach assumes the source canvas visually covers the viewport and its normalized texture coordinates correspond to the same visible scene. If the source is contained, cropped, translated, or letterboxed, pass the source's displayed rect and reproduce its object-fit mapping before sampling.

Use CSS pixels for DOM rectangles and viewport measurements. Use device pixel ratio only to convert `gl_FragCoord` from backing-store pixels to CSS pixels.

## Alternate valid contract

It is also possible to keep upload flipping disabled and invert Y exactly once in shader math. Do not mix that approach with this skill's template. When adapting existing code, pick one contract, remove the other correction, and test with the asymmetric fixture.
