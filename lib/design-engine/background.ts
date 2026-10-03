// backgroundPresentation over the V2 background union — lifted verbatim from
// the option-two Links template (RFC-001 §2.5 "Lift, do not copy"), which
// imports it back; the golden harness proves the move is a no-op. The
// `var(--links-page)` reference in the media branch is part of the frozen
// Links output and stays byte-identical.

import type { ScanMeLinksBackgroundV2 } from "../scanme-links-design";
import { rgba } from "./color";

export function backgroundPresentation(background: ScanMeLinksBackgroundV2): {
  baseImage: string;
  detailImage: string;
  detailSize: string;
  detailOpacity: number;
} {
  switch (background.category) {
    case "flat":
      return {
        baseImage: `linear-gradient(${background.color}, ${background.color})`,
        detailImage: "none",
        detailSize: "auto",
        detailOpacity: 0,
      };
    case "gradient":
      return {
        baseImage:
          background.variant === "radial"
            ? `radial-gradient(circle at ${background.centerX}% ${background.centerY}%, ${background.startColor}, ${background.endColor})`
            : `linear-gradient(${background.angle}deg, ${background.startColor}, ${background.endColor})`,
        detailImage: "none",
        detailSize: "auto",
        detailOpacity: 0,
      };
    case "pattern": {
      const size = Math.max(4, background.scale);
      const color = rgba(background.patternColor, 1);
      const base = background.backgroundColor;
      const images: Record<typeof background.variant, string> = {
        grid: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px), linear-gradient(${base}, ${base})`,
        checker: `conic-gradient(from 90deg at 1px 1px, transparent 90deg, ${color} 0)`,
        dots: `radial-gradient(circle, ${color} 1.5px, transparent 1.7px), linear-gradient(${base}, ${base})`,
        waves: `radial-gradient(ellipse at 50% 100%, transparent 65%, ${color} 66%, transparent 69%), linear-gradient(${base}, ${base})`,
      };
      return {
        baseImage: `linear-gradient(${base}, ${base})`,
        detailImage: images[background.variant],
        detailSize:
          background.variant === "waves"
            ? `${size * 2}px ${size}px`
            : `${size}px ${size}px`,
        detailOpacity: background.opacity,
      };
    }
    case "texture": {
      const tint = rgba(background.tintColor, 0.85);
      const base = background.backgroundColor;
      const images: Record<typeof background.variant, string> = {
        paper: `radial-gradient(circle at 20% 30%, ${tint} 0 .65px, transparent .8px), radial-gradient(circle at 75% 68%, ${tint} 0 .55px, transparent .75px), linear-gradient(${base}, ${base})`,
        linen: `repeating-linear-gradient(0deg, ${tint} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${tint} 0 1px, transparent 1px 5px), linear-gradient(${base}, ${base})`,
        wood: `repeating-radial-gradient(ellipse at -20% 50%, transparent 0 15px, ${tint} 16px 17px, transparent 18px 29px), linear-gradient(${base}, ${base})`,
        metal: `repeating-linear-gradient(105deg, transparent 0 3px, ${tint} 4px, transparent 5px 9px), linear-gradient(120deg, ${base}, color-mix(in srgb, ${base} 74%, white), ${base})`,
      };
      return {
        baseImage: `linear-gradient(${base}, ${base})`,
        detailImage: images[background.variant],
        detailSize:
          background.variant === "paper"
            ? "17px 19px"
            : background.variant === "wood"
              ? "80px 46px"
              : "auto",
        detailOpacity: background.intensity,
      };
    }
    case "media":
    case "animation":
      return {
        baseImage:
          background.category === "animation"
            ? `linear-gradient(${background.baseColor}, ${background.baseColor})`
            : `linear-gradient(var(--links-page), var(--links-page))`,
        detailImage: "none",
        detailSize: "auto",
        detailOpacity: 0,
      };
  }
}
