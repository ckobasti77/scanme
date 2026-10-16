import { useId } from "react";

// SVG parts of the stamp passport, ported 1:1 from the approved prototype
// (public/prototip/pasos-markice.html): car silhouettes, the event postmark and
// the "complex ink" seal. Ink color comes from the event theme (currentColor).

type CarKind = "hatch" | "suv" | "fast" | "bigsuv" | "sedan";

const CAR: Record<CarKind, { ys: number; yr: number; xa: number; xb: number; xc: number; xd: number; r: number; tail: number }> = {
  hatch: { ys: 50, yr: 31, xa: 72, xb: 94, xc: 150, xd: 178, r: 13, tail: 186 },
  suv: { ys: 46, yr: 25, xa: 66, xb: 88, xc: 158, xd: 180, r: 15, tail: 186 },
  fast: { ys: 51, yr: 32, xa: 70, xb: 96, xc: 126, xd: 178, r: 13, tail: 188 },
  bigsuv: { ys: 45, yr: 23, xa: 62, xb: 84, xc: 164, xd: 184, r: 15, tail: 188 },
  sedan: { ys: 51, yr: 33, xa: 72, xb: 98, xc: 134, xd: 162, r: 13, tail: 188 },
};

const CAR_ORDER: CarKind[] = ["hatch", "suv", "fast", "sedan", "bigsuv"];

/** No body type in the catalog: the silhouette only varies the rows. */
export function carKindFor(index: number): CarKind {
  return CAR_ORDER[index % CAR_ORDER.length];
}

function car(kind: CarKind) {
  const p = CAR[kind];
  const R = p.r + 3;
  const by = 80 - p.r + 1;
  const { ys, yr, xa, xb, xc, xd, tail } = p;
  return {
    body: `M12 ${by} C9 ${ys + 8} 14 ${ys + 2} 26 ${ys} L${xa} ${ys - 1} C${xa + 10} ${ys - 4} ${xb - 8} ${yr + 3} ${xb} ${yr} L${xc} ${yr} C${xc + 10} ${yr + 1} ${xd - 6} ${ys - 6} ${xd} ${ys - 1} L${tail} ${ys + 1} C${tail + 5} ${ys + 3} ${tail + 5} ${by - 6} ${tail + 2} ${by} L${154 + R} ${by} A${R} ${R} 0 0 0 ${154 - R} ${by} L${46 + R} ${by} A${R} ${R} 0 0 0 ${46 - R} ${by} Z`,
    win: `M${xa + 8} ${ys - 3} C${xa + 14} ${ys - 6} ${xb - 4} ${yr + 5} ${xb + 3} ${yr + 4} L${xc - 1} ${yr + 4} C${xc + 7} ${yr + 5} ${xd - 10} ${ys - 6} ${xd - 6} ${ys - 3} Z`,
    cy: 80 - p.r,
    r: p.r,
  };
}

/** Dashed outline in the empty slot (stroke follows the row state via CSS). */
export function CarGuide({ kind }: { kind: CarKind }) {
  const c = car(kind);
  return (
    <svg viewBox="0 0 200 92" aria-hidden="true">
      <g fill="none" stroke="#b9ab93" strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round">
        <path d={c.body} />
        <path d={c.win} />
        {[46, 154].map((x) => <circle key={x} cx={x} cy={c.cy} r={c.r} />)}
      </g>
    </svg>
  );
}

/** Stamp face for a model without a photo yet. */
export function CarArt({ kind }: { kind: CarKind }) {
  const c = car(kind);
  return (
    <svg viewBox="0 0 200 92" aria-hidden="true">
      <ellipse cx="100" cy="82" rx="88" ry="5" fill="#000" opacity=".12" />
      <path d={c.body} fill="#2a2725" />
      <path d={c.win} fill="#6d6964" />
      {[46, 154].map((x) => (
        <g key={x}>
          <circle cx={x} cy={c.cy} r={c.r} fill="#141312" />
          <circle cx={x} cy={c.cy} r={c.r * 0.5} fill="#8d8983" />
        </g>
      ))}
    </svg>
  );
}

function svgId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

const FONT = "Archivo, sans-serif";

// `side` (SVG 2) is not in React's types; the prototype sets it on the bottom arcs.
const SIDE_LEFT = { side: "left" } as Record<string, string>;

/** Round event postmark: event name on the top arc, year on the bottom, DD.MM. in the middle. */
export function Postmark({ top, bottom, date, seed }: { top: string; bottom: string; date: string; seed: number }) {
  const id = svgId(useId());
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <path id={`t${id}`} d="M10.6 32 a21.4 21.4 0 0 1 42.8 0" />
        <path id={`b${id}`} d="M8.6 32 a23.4 23.4 0 0 0 46.8 0" />
        <filter id={`f${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={seed + 3} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={1.2} result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="2.6" numOctaves={1} seed={seed + 9} result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.5" result="m" />
          <feComposite in="d" in2="m" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#f${id})`}>
        <g fill="none" stroke="currentColor">
          <circle cx="32" cy="32" r="30" strokeWidth="1.7" />
          <circle cx="32" cy="32" r="17.5" strokeWidth="1.3" />
        </g>
        <text fontFamily={FONT} fontSize="5.6" fontWeight="800" letterSpacing=".7" fill="currentColor">
          <textPath href={`#t${id}`} startOffset="50%" textAnchor="middle">{top}</textPath>
        </text>
        <text fontFamily={FONT} fontSize="5.6" fontWeight="800" letterSpacing="1.4" fill="currentColor">
          <textPath href={`#b${id}`} startOffset="50%" textAnchor="middle" {...SIDE_LEFT}>{bottom}</textPath>
        </text>
        <text x="32" y="34.4" textAnchor="middle" fontFamily={FONT} fontSize="7" fontWeight="900" letterSpacing=".2" fill="currentColor">{date}</text>
      </g>
    </svg>
  );
}

function SealBody({ top, bottom, center, year, ids }: { top: string; bottom: string; center: string; year: string; ids: { sa: string; sb: string } }) {
  const long = center.length > 4;
  return (
    <>
      <circle cx="60" cy="60" r="55" fill="none" strokeWidth="3.4" />
      <circle cx="60" cy="60" r="49" fill="none" strokeWidth="1" />
      <circle cx="60" cy="60" r="30" fill="none" strokeWidth="1.6" />
      <text fontFamily={FONT} fontWeight="800" fontSize="9.2" letterSpacing="1.6" stroke="none">
        <textPath href={`#${ids.sa}`} startOffset="50%" textAnchor="middle">{top}</textPath>
      </text>
      <text fontFamily={FONT} fontWeight="800" fontSize="9" letterSpacing="1.6" stroke="none">
        <textPath href={`#${ids.sb}`} startOffset="50%" textAnchor="middle" {...SIDE_LEFT}>{bottom}</textPath>
      </text>
      <text
        x="60"
        y={long ? 64 : 66}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight="900"
        fontSize={long ? 14 : 17}
        stroke="none"
        {...(center.length > 8 ? { textLength: 54, lengthAdjust: "spacingAndGlyphs" } : {})}
      >
        {center}
      </text>
      <text x="60" y="78" textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="7" letterSpacing="1.5" stroke="none">{year}</text>
      <text x="22" y="64" textAnchor="middle" fontSize="7" stroke="none">★</text>
      <text x="98" y="64" textAnchor="middle" fontSize="7" stroke="none">★</text>
    </>
  );
}

/** "Complex ink" completion seal: soft offset under-print plus a grainy, unevenly pressed top print. */
export function CompletionSeal({ top, bottom, center, year }: { top: string; bottom: string; center: string; year: string }) {
  const id = svgId(useId());
  const ids = { sa: `sa${id}`, sb: `sb${id}` };
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <path id={ids.sa} d="M60 60 m-40 0 a40 40 0 1 1 80 0" />
        <path id={ids.sb} d="M60 60 m-45 0 a45 45 0 0 0 90 0" />
        <radialGradient id={`press${id}`} cx="34%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity=".62" />
        </radialGradient>
        <mask id={`pmask${id}`}>
          <rect width="120" height="120" fill={`url(#press${id})`} />
        </mask>
        <filter id={`ink${id}`} x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2.4} result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves={2} seed={11} result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.55" result="m" />
          <feComposite in="d" in2="m" operator="in" result="c" />
          <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves={1} seed={3} result="b" />
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -.9 1.35" result="bm" />
          <feComposite in="c" in2="bm" operator="in" />
        </filter>
        <filter id={`soft${id}`}>
          <feGaussianBlur stdDeviation=".6" />
        </filter>
      </defs>
      <g mask={`url(#pmask${id})`}>
        <g filter={`url(#soft${id})`} style={{ fill: "var(--fair-accent)", stroke: "var(--fair-accent)" }} opacity=".18" transform="translate(1.6 1.1) rotate(.8 60 60)">
          <SealBody top={top} bottom={bottom} center={center} year={year} ids={ids} />
        </g>
        <g filter={`url(#ink${id})`} fill="currentColor" stroke="currentColor">
          <SealBody top={top} bottom={bottom} center={center} year={year} ids={ids} />
        </g>
      </g>
    </svg>
  );
}
