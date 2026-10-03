// The ~20 domestic-menu inline SVG icons (RFC-003 §2.4, §2.14 M.12 — TASK-50):
// glyphs lucide has no equivalent for (rakija, domaća/turska kafa, burek,
// pljeskavica, ćevapi, kajmak, ajvar, …). Pure, dependency-free, inline SVG —
// no icon font, no remote fetch (RFC-003 constraint 2 / §2.12 first-paint
// budget). Stroke-based and `currentColor`-driven, matching the lucide
// convention used elsewhere in the icon set (§2.4 "lucide base + ~20
// domestic icons") so a domestic glyph and a lucide glyph read as one family
// once tinted by `--menu-icon` (see `item-icon-tile.tsx`).
//
// New icon later? Add the component here, then wire it into the single glyph
// map in `menu-glyph-map.ts` — that is the "one place" the RFC's success
// criterion requires.

import type { ComponentType, SVGProps } from "react";

export type DomesticIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Rakija(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3h6l-1.4 8.2a1 1 0 0 1-1 .8h-1.2a1 1 0 0 1-1-.8L9 3Z" />
      <path d="M12 12v6" />
      <path d="M9 21h6" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function DomacaKafa(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9h10v4a5 5 0 0 1-5 5v0a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10.5h1.5a2 2 0 0 1 0 4H16" />
      <path d="M3 19.5c2.2-1 15.8-1 18 0" />
      <path d="M8.5 5.5c-.6.6-.6 1.4 0 2" />
      <path d="M11.5 5.5c-.6.6-.6 1.4 0 2" />
    </svg>
  );
}

export function TurskaKafa(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M8 11h6.5a1.5 1.5 0 0 1 1.5 1.5v.5a3.5 3.5 0 0 1-3.5 3.5H10a3.5 3.5 0 0 1-3.5-3.5v-1a.5.5 0 0 1 .5-.5Z" />
      <path d="M8 11c0-2.5.4-4.2 1.3-6" />
      <path d="M14 11c0-2.2-.3-3.7-1-5" />
      <path d="M16 12h4.5l-1.5-3.5" />
      <path d="M3 19.5c2.2-1 15.8-1 18 0" />
    </svg>
  );
}

export function Pivo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 8h8v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8Z" />
      <path d="M6 8c0-1.7 1-3 2-3.5" />
      <path d="M14 10h1.5a2 2 0 0 1 0 4H14" />
      <path d="M6 5.5h6" />
      <path d="M7 8v9" />
    </svg>
  );
}

export function Vino(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3h10c0 5-2 8-5 8s-5-3-5-8Z" />
      <path d="M12 11v7" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function Sok(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3h8l-1 15a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2L8 3Z" />
      <path d="M8.5 8h7" />
      <path d="M15 3l1.5-2" />
    </svg>
  );
}

export function Voda(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3s5 6 5 10.5A5 5 0 0 1 7 13.5C7 9 12 3 12 3Z" />
    </svg>
  );
}

export function Burek(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 19a8 8 0 0 1 16 0" />
      <path d="M6 19a6 6 0 0 1 12 0" />
      <path d="M8.5 19a3.5 3.5 0 0 1 7 0" />
    </svg>
  );
}

export function Pljeskavica(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="12" rx="8" ry="5" />
      <path d="M6 10.5c2-1.4 10-1.4 12 0" />
      <path d="M6 13.5c2 1.4 10 1.4 12 0" />
    </svg>
  );
}

export function Cevapi(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="8" width="5.5" height="3.4" rx="1.7" />
      <rect x="9.3" y="8" width="5.5" height="3.4" rx="1.7" />
      <rect x="15.6" y="8" width="5.5" height="3.4" rx="1.7" />
      <path d="M3 15.5h18" />
    </svg>
  );
}

export function Kajmak(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 4 0 0 0 16 0v3a8 4 0 0 1-16 0v-3Z" />
      <path d="M4 12a8 4 0 0 1 16 0a8 4 0 0 1-16 0Z" />
      <path d="M9 11.5c.8-.7 1.6-.7 2.4 0s1.6.7 2.4 0" />
    </svg>
  );
}

export function Ajvar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h10v2.5H7Z" />
      <path d="M7.5 6.5h9L16 20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1L7.5 6.5Z" />
      <path d="M8 10.5h8" />
    </svg>
  );
}

export function Supa(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h18a7 7 0 0 1-14 0" />
      <path d="M4 12l-1-1.5" />
      <path d="M9.5 5c-.7.7-.7 1.6 0 2.3" />
      <path d="M12.5 5c-.7.7-.7 1.6 0 2.3" />
    </svg>
  );
}

export function Salata(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h18a7 7 0 0 1-14 0" />
      <path d="M7 12c1-3 3-5 5-6" />
      <path d="M12 12c.5-3 2-5.5 4-6.5" />
      <circle cx="9" cy="9.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Riba(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12c3-4 8-6 12-4-1 1.5-1 6.5 0 8-4 2-9 0-12-4Z" />
      <path d="M15 8c2 .5 4 2 6 4-2 2-4 3.5-6 4" />
      <circle cx="8" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Rostilj(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 9h18" />
      <path d="M3 12h18" />
      <path d="M3 15h18" />
      <path d="M6 9v-2" />
      <path d="M18 9v-2" />
      <path d="M12 21c-2.5-2-2.5-3.5-1-5.5c1 1 1.5.5 1-1c1.5.7 2 3 1 4.5" />
    </svg>
  );
}

export function Testenina(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10a8 4 0 0 0 16 0v3a8 4 0 0 1-16 0v-3Z" />
      <path d="M4 10a8 4 0 0 1 16 0a8 4 0 0 1-16 0Z" />
      <path d="M9 20l3-3.5" />
      <path d="M12 20.5l3-4" />
    </svg>
  );
}

export function Palacinke(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="8" rx="7" ry="2.2" />
      <ellipse cx="12" cy="12" rx="7" ry="2.2" />
      <ellipse cx="12" cy="16" rx="7" ry="2.2" />
      <path d="M12 6c1.5 2 1.5 8 0 12" strokeDasharray="1.5 2" />
    </svg>
  );
}

export function Sladoled(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M8 10a4 4 0 0 1 8 0c0 2-1.3 3-4 3s-4-1-4-3Z" />
      <path d="M12 13v3" />
      <path d="M9.5 16l2.5 5.5L14.5 16Z" />
    </svg>
  );
}

export function Kolac(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V12l8-6 8 6v8" />
      <path d="M4 20h16" />
      <path d="M9 20v-5" />
      <path d="M15 20v-5" />
      <path d="M12 20v-8" />
    </svg>
  );
}
