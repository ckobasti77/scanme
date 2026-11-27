import type { SVGProps } from "react";

// Auto Expo 2026: the two brand marks of the navbar and the brand tiles, drawn as line icons in
// the lucide grid (24 × 24, round caps, currentColor) so they sit next to Pasoši and Garaža at the
// same size and weight. Simplified marks, not the brands' artwork.

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Ford: the oval with a script F. */
export function FordIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="12" rx="10.25" ry="6.6" />
      <path d="M9.4 15.3c.8-2.4 1.7-4.4 2.9-5.4.8-.7 1.8-.9 2.9-.5" />
      <path d="M9.9 12.7h3.3" />
    </svg>
  );
}

/** MG: the octagon with the two letters. */
export function MgIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8.1 2.6h7.8l5.5 5.5v7.8l-5.5 5.5H8.1l-5.5-5.5V8.1z" />
      <path d="M6.6 15V9.2l2.3 3.2 2.3-3.2V15" />
      <path d="M17.5 10a2.6 2.6 0 1 0 .1 3.9v-1.6h-1.8" />
    </svg>
  );
}

export function FairBrandIcon({ brandSlug, ...props }: IconProps & { brandSlug: string }) {
  if (brandSlug === "ford") return <FordIcon {...props} />;
  if (brandSlug === "mg") return <MgIcon {...props} />;
  return null;
}
