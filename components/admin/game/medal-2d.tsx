import type { CSSProperties } from "react";
import type { Rarity } from "@/lib/admin-v2/game/ids";
import { lockedPalette, medalPalette, type MedalArt } from "@/lib/admin-v2/game/medal-art";
import { cn } from "@/lib/utils";

// ADMIN v3 V4 — the 2D medal: the same composition as the 3D one, in CSS and SVG.
// It is the grid of the Vitrina, the 2D fallback of the 3D scene and what a
// phone, a device without WebGL and the server see. A circle with a rim, the sign
// of the badge as an SVG, and the rarity in the material: common is a flat
// colour, rare a linear metallic gradient, epic a conic holographic one, legendary
// the same with a thin bright ring. A locked badge is a dark silhouette with a
// barely visible sign. Static: no animation, no tab stop, hidden from assistive
// technology (the button or the text beside it carries the name).

const FACE: Record<Rarity, string> = {
  obicna: "var(--mb)",
  retka:
    "linear-gradient(145deg, color-mix(in srgb, var(--mb) 55%, #fff) 0%, var(--mb) 35%, color-mix(in srgb, var(--mb) 70%, #000) 62%, color-mix(in srgb, var(--mb) 60%, #fff) 100%)",
  epska:
    "linear-gradient(145deg, rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 45%), linear-gradient(color-mix(in srgb, var(--mb) 45%, transparent), color-mix(in srgb, var(--mb) 45%, transparent)), conic-gradient(from 200deg at 50% 50%, #8fe9d6, #93a8ff, #d79cff, #ff9fd0, #ffd98f, #a4ecaa, #8fe9d6)",
  legendarna:
    "linear-gradient(145deg, rgb(255 255 255 / 0.4), rgb(255 255 255 / 0) 45%), linear-gradient(color-mix(in srgb, var(--mb) 40%, transparent), color-mix(in srgb, var(--mb) 40%, transparent)), conic-gradient(from 200deg at 50% 50%, #ffe9a0, #9ff0d4, #9db4ff, #e8a8ff, #ffb0a0, #ffe9a0)",
};

export function Medal2D({ art, rarity, locked = false, className }: { art: MedalArt; rarity: Rarity; locked?: boolean; className?: string }) {
  const light = locked ? lockedPalette("light") : medalPalette(rarity, "light");
  const dark = locked ? lockedPalette("dark") : medalPalette(rarity, "dark");
  // Both themes are in the markup, so the server and the first paint already have the right one.
  const colours = {
    "--mb-l": light.base,
    "--mr-l": light.rim,
    "--ms-l": light.sign,
    "--mb-d": dark.base,
    "--mr-d": dark.rim,
    "--ms-d": dark.sign,
  } as CSSProperties;
  const flat = locked || rarity === "obicna";
  return (
    <span
      aria-hidden="true"
      data-medal={rarity}
      data-locked={locked ? "" : undefined}
      style={colours}
      className={cn(
        "relative inline-block aspect-square shrink-0 rounded-full bg-[var(--mr)] shadow-[0_1px_2px_rgb(0_0_0/0.22)]",
        "[--mb:var(--mb-l)] [--mr:var(--mr-l)] [--ms:var(--ms-l)]",
        "[html[data-theme=dark]_&]:[--mb:var(--mb-d)] [html[data-theme=dark]_&]:[--mr:var(--mr-d)] [html[data-theme=dark]_&]:[--ms:var(--ms-d)]",
        className,
      )}
    >
      <span className="absolute inset-[7%] rounded-full" style={{ background: flat ? FACE.obicna : FACE[rarity] }} />
      {!locked && rarity === "legendarna" ? <span className="absolute inset-[7%] rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.75)]" /> : null}
      <svg viewBox="0 0 100 100" focusable="false" className="absolute inset-[3.5%] size-[93%] fill-[var(--ms)]">
        {art.paths.map((d) => (
          <path key={d} d={d} fillRule="evenodd" />
        ))}
      </svg>
    </span>
  );
}
