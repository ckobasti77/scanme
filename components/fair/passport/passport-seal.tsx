import { useId } from "react";
import { sealCenterSize } from "@/lib/fair-client/passport-unlock";
import type { FairPassportDict } from "@/lib/i18n/types";

export type PassportSealTexts = {
  top: string;
  bottom: string;
  center: string;
  ribbon: string;
  /** Explicit centre size; defaults to a size that keeps the word inside the inner ring. */
  centerSize?: number;
};

const TICKS = Array.from({ length: 72 }, (_, index) => {
  const angle = (index / 72) * Math.PI * 2;
  const inner = index % 6 === 0 ? 76.5 : 78.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x1: (100 + inner * cos).toFixed(2),
    y1: (100 + inner * sin).toFixed(2),
    x2: (100 + 82.5 * cos).toFixed(2),
    y2: (100 + 82.5 * sin).toFixed(2),
  };
});

/** The widest centre word the inner ring (r = 49) holds before it is compressed. */
const CENTER_MAX_WIDTH = 92;

/**
 * Inked rubber-stamp seal (port of `makeSeal` from the unlock prototype).
 * Ink is `currentColor`, so the event accent token colours it; the ribbon text
 * is punched out with `--seal-paper` (the surface the seal sits on).
 */
export function PassportSeal({
  top,
  bottom,
  center,
  ribbon,
  centerSize,
  label,
  className,
}: PassportSealTexts & { label?: string; className?: string }) {
  const id = `seal${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 97;
  const size = centerSize ?? sealCenterSize(center);
  const estimatedWidth = [...center].length * size * 0.62;
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ overflow: "visible" }}
    >
      <defs>
        <path id={`${id}t`} d="M 35,100 A 65,65 0 0 1 165,100" />
        <path id={`${id}b`} d="M 27,100 A 73,73 0 0 0 173,100" />
        <filter id={`${id}ink`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={seed * 7} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.72" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" result="inked" />
          <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves={1} seed={seed * 3} result="w" />
          <feDisplacementMap in="inked" in2="w" scale={1.4} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${id}ink)`} fill="none" stroke="currentColor">
        <circle cx="100" cy="100" r="95" strokeWidth="3.2" />
        <circle cx="100" cy="100" r="89.5" strokeWidth="1" />
        <g strokeWidth="1.3">
          {TICKS.map((tick, index) => (
            <line key={index} {...tick} />
          ))}
        </g>
        <circle cx="100" cy="100" r="53" strokeWidth="1.6" />
        <circle cx="100" cy="100" r="49" strokeWidth=".8" strokeDasharray="1.6 2.6" />
        <g fill="currentColor" stroke="none" style={SEAL_TEXT}>
          <circle cx="27.5" cy="100" r="2.6" />
          <circle cx="172.5" cy="100" r="2.6" />
          <text fontSize="10.4" letterSpacing="1.5">
            <textPath href={`#${id}t`} startOffset="50%" textAnchor="middle">{top}</textPath>
          </text>
          <text fontSize="10.4" letterSpacing="2.6">
            <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle">{bottom}</textPath>
          </text>
          <path d="M103 52 93 66h7.5l-2 9 10.5-14h-7.5z" />
          <text
            x="100"
            y={108 + (size - 40) * 0.25}
            fontSize={size}
            textAnchor="middle"
            letterSpacing="-1"
            {...(estimatedWidth > CENTER_MAX_WIDTH ? { textLength: CENTER_MAX_WIDTH, lengthAdjust: "spacingAndGlyphs" } : {})}
          >
            {center}
          </text>
        </g>
        <path d="M38 118h124l-7 9 7 9H38l7-9z" fill="currentColor" stroke="none" />
      </g>
      <text
        x="100"
        y="131.2"
        fontSize="9.4"
        letterSpacing="1.5"
        textAnchor="middle"
        style={{ ...SEAL_TEXT, fill: "var(--seal-paper, #fff)" }}
      >
        {ribbon}
      </text>
    </svg>
  );
}

const SEAL_TEXT = {
  fontFamily: "inherit",
  fontWeight: 760,
  textTransform: "uppercase",
} as const;

/**
 * Seal texts per event. Only Sajam elektromobilnosti has its designed copy;
 * other events (Auto Moto Fest later) fall back to their title and year until
 * their own texts are delivered.
 */
export function passportEventSealTexts(themeClass: string, eventTitle: string, dict: FairPassportDict): PassportSealTexts {
  if (themeClass === "fair-event--electromobility") {
    return {
      top: dict.sealEventTop,
      bottom: dict.sealEventBottom,
      center: dict.sealEventCenter,
      centerSize: 40,
      ribbon: dict.sealEventRibbon,
    };
  }
  const title = eventTitle.replace(/^TEST\s+/i, "").replace(/\s*2026\s*/g, " ").trim();
  return { top: title, bottom: dict.umbrellaTitle, center: dict.sealEventCenter, centerSize: 40, ribbon: dict.overviewTitle };
}

export function passportBrandSealTexts(themeClass: string, brand: string, dict: FairPassportDict): PassportSealTexts {
  if (themeClass === "fair-event--electromobility") {
    return { top: dict.sealBrandTop, bottom: dict.sealBrandBottom, center: brand, ribbon: dict.sealBrandRibbon };
  }
  return { top: dict.umbrellaTitle, bottom: dict.sealEventCenter, center: brand, ribbon: dict.sealBrandRibbon };
}
