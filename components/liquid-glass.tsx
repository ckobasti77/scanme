"use client";

type MarketingTheme = "light" | "dark";

// Kept as a compatibility shim while the hero owns its renderer. Navigation
// glass no longer copies or samples that canvas; native backdrop-filter is the
// only source of pixels behind the glass.
export function syncLiquidGlassSource(
  sceneCanvas?: HTMLCanvasElement | null,
  theme?: MarketingTheme,
  force?: boolean,
) {
  void sceneCanvas;
  void theme;
  void force;
}

export function LiquidGlassSystem({ theme }: { theme: MarketingTheme }) {
  void theme;
  return null;
}
