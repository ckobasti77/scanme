// N4 — light exhibitor logos for the map. The organizer's logos
// (public/fair/izlagaci/2026/, 300×300 JPG, ~20 KB each) have small trimmed
// WebP copies in public/sajam/izlagaci/2026/ (≤ 288×154 px, ~3 KB each, 122 KB
// for all 38). Pixel sizes are known up front, so a logo chip never changes
// size when the image arrives (no layout jump). An uploaded logo (Convex
// storage URL) or any other address is used as it is.

export const FAIR_MAP_LOGO_SOURCE_BASE = "/fair/izlagaci/2026/";
export const FAIR_MAP_LOGO_THUMB_BASE = "/sajam/izlagaci/2026/";

/** Original file → [width, height] of its WebP copy. */
export const FAIR_MAP_LOGO_THUMBS: Readonly<Record<string, readonly [number, number]>> = {
  "aster-marketing.jpg": [149, 142],
  "auto1.png": [288, 97],
  "bentu.jpg": [274, 61],
  "bracinac-artvark.jpg": [200, 154],
  "byd.jpg": [274, 81],
  "changan.jpg": [189, 154],
  "chery.jpg": [242, 154],
  "citroen.jpg": [153, 150],
  "detailing-store.jpg": [132, 152],
  "dualtron.jpg": [274, 72],
  "enigma-it.jpg": [156, 156],
  "ets-mija-stanimirovic.jpg": [152, 152],
  "ev-charging-solutions.jpg": [133, 152],
  "farizon.jpg": [255, 154],
  "ferum-baw.jpg": [117, 152],
  "ferum-yudo.jpg": [169, 154],
  "ford.jpg": [274, 122],
  "foton.jpg": [150, 150],
  "geely.jpg": [258, 154],
  "hotel-lotos.jpg": [190, 154],
  "jac.jpg": [272, 95],
  "jkp-direkcija-za-javni-prevoz.jpg": [276, 128],
  "jkp-parking-servis-nis.jpg": [198, 152],
  "jmev.jpg": [194, 154],
  "kostic-rent-a-car.jpg": [274, 115],
  "makete.jpg": [206, 154],
  "markus-pro.jpg": [133, 152],
  "mazda.jpg": [179, 152],
  "mg.jpg": [151, 150],
  "motogrini.jpg": [166, 154],
  "restoran-vidovdan.jpg": [198, 154],
  "scanme.jpg": [274, 85],
  "skoda.jpg": [208, 154],
  "toyota.jpg": [200, 154],
  "turisticka-organizacija-nis.jpg": [177, 142],
  "venera-bike.jpg": [171, 152],
  "xtreme-motors.jpg": [157, 152],
  "zepter.jpg": [270, 102],
};

export type FairMapLogo = { src: string; /** width / height; 1 when unknown */ aspect: number; thumb: boolean };

/** The logo to draw for `logoUrl`: its small copy when there is one, else the address itself; null without a logo. */
export function fairMapLogo(logoUrl: string | undefined | null): FairMapLogo | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith(FAIR_MAP_LOGO_SOURCE_BASE)) {
    const file = logoUrl.slice(FAIR_MAP_LOGO_SOURCE_BASE.length);
    const size = Object.hasOwn(FAIR_MAP_LOGO_THUMBS, file) ? FAIR_MAP_LOGO_THUMBS[file] : null;
    if (size) return { src: `${FAIR_MAP_LOGO_THUMB_BASE}${file.replace(/\.[a-z]+$/i, "")}.webp`, aspect: size[0] / size[1], thumb: true };
  }
  return { src: logoUrl, aspect: 1, thumb: false };
}
