import {
  siAudi,
  siBmw,
  siCitroen,
  siDacia,
  siFiat,
  siFord,
  siHonda,
  siKia,
  siMg,
  siOpel,
  siPeugeot,
  siRenault,
  siSkoda,
  siSuzuki,
  siToyota,
  siVolkswagen,
  siVolvo,
  type SimpleIcon,
} from "simple-icons";

// Vector brand marks for the fair (garage, map, passports). simple-icons gives
// a 24×24 path and the brand hex; brands it lacks use a single-colour SVG file
// from public/fair/brands/ (drawn through a CSS mask, so any ink colour works).
// Covers the car brands of Auto Moto Fest 2026 (sajamautomobila.com/ucesnici-2026).

export type FairBrandVector =
  | { kind: "path"; path: string; hex: string }
  | { kind: "file"; src: string; width: number; height: number; hex: string };

const icon = (value: SimpleIcon): FairBrandVector => ({ kind: "path", path: value.path, hex: `#${value.hex}` });
const file = (src: string, width: number, height: number, hex: string): FairBrandVector => ({ kind: "file", src, width, height, hex });

const MERCEDES = file("/fair/brands/mercedes-benz.svg", 42, 42, "#8c959b");

const VECTORS: Readonly<Record<string, FairBrandVector>> = {
  audi: icon(siAudi),
  bmw: icon(siBmw),
  citroen: icon(siCitroen),
  dacia: icon(siDacia),
  dongfeng: file("/fair/brands/dongfeng.svg", 42, 42, "#e60021"),
  fiat: icon(siFiat),
  ford: icon(siFord),
  geely: file("/fair/brands/geely.svg", 76, 42, "#1f4e9c"),
  honda: icon(siHonda),
  ineos: file("/fair/brands/ineos.svg", 95, 42, "#00083b"),
  kia: icon(siKia),
  mercedes: MERCEDES,
  "mercedes-benz": MERCEDES,
  mg: icon(siMg),
  opel: icon(siOpel),
  peugeot: icon(siPeugeot),
  renault: icon(siRenault),
  skoda: icon(siSkoda),
  suzuki: icon(siSuzuki),
  toyota: icon(siToyota),
  volkswagen: icon(siVolkswagen),
  vw: icon(siVolkswagen),
  volvo: icon(siVolvo),
};

/**
 * Lookup key of a brand name: no diacritics, lower case, without the test
 * markers of the DEV data ("TEST " in front, "_T" / " T" at the end), so
 * "AUDI_T" → "audi" and "Citroën" → "citroen".
 */
export function fairBrandKey(brandName: string): string {
  return brandName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^test\s+/, "")
    .replace(/(?:_| )t$/, "")
    .trim();
}

/** The vector mark of a brand, or null when there is none. */
export function fairBrandVector(brandName: string): FairBrandVector | null {
  const key = fairBrandKey(brandName);
  return Object.hasOwn(VECTORS, key) ? VECTORS[key] : null;
}
