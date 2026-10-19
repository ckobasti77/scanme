// URL stanje stranice /sajam/3d (PLAN P1, A03 §4.3): ?deo=, ?grupa=, ?rezim=, ?tura=1, ?kiosk=1.
// Nepoznate vrednosti se odbacuju; kanonski oblik ima stalan redosled i izostavlja podrazumevano.

import { PARTS, SYSTEMS, type PartId, type SystemId } from "./catalog";
import { MODES, type Mode } from "./filter";

export type UrlState = {
  deo: PartId | null;
  grupa: SystemId | null;
  rezim: Mode;
  tura: boolean;
  kiosk: boolean;
};

export type SearchInput = URLSearchParams | Record<string, string | string[] | undefined>;

const PART_SYSTEM = new Map<string, SystemId>(PARTS.map((p) => [p.id, p.system]));
const SYSTEM_IDS = new Set<string>(SYSTEMS.map((s) => s.id));

export const DEFAULT_URL_STATE: UrlState = { deo: null, grupa: null, rezim: "rendgen", tura: false, kiosk: false };

function read(input: SearchInput, key: string): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const v = input[key];
  return Array.isArray(v) ? v[0] : v;
}

export function isPartId(v: unknown): v is PartId {
  return typeof v === "string" && PART_SYSTEM.has(v);
}

export function isSystemId(v: unknown): v is SystemId {
  return typeof v === "string" && SYSTEM_IDS.has(v);
}

export function systemOfPart(id: PartId): SystemId {
  return PART_SYSTEM.get(id) as SystemId;
}

export function parseUrlState(input: SearchInput): UrlState {
  const deoRaw = read(input, "deo");
  const grupaRaw = read(input, "grupa");
  const rezimRaw = read(input, "rezim");
  const deo = isPartId(deoRaw) ? deoRaw : null;
  let grupa = isSystemId(grupaRaw) ? grupaRaw : null;
  // Deo pobeđuje grupu: grupa ostaje samo ako je to sistem izabranog dela.
  if (deo && grupa && systemOfPart(deo) !== grupa) grupa = null;
  const rezim = (MODES as readonly string[]).includes(rezimRaw ?? "") ? (rezimRaw as Mode) : "rendgen";
  return { deo, grupa, rezim, tura: read(input, "tura") === "1", kiosk: read(input, "kiosk") === "1" };
}

/** `""` za podrazumevano stanje, inače `?deo=…&grupa=…&rezim=…&tura=1&kiosk=1` tim redom. */
export function serializeUrlState(s: UrlState): string {
  const parts: string[] = [];
  if (s.deo) parts.push(`deo=${s.deo}`);
  if (s.grupa && !(s.deo && systemOfPart(s.deo) !== s.grupa)) parts.push(`grupa=${s.grupa}`);
  if (s.rezim !== "rendgen") parts.push(`rezim=${s.rezim}`);
  if (s.tura) parts.push("tura=1");
  if (s.kiosk) parts.push("kiosk=1");
  return parts.length ? `?${parts.join("&")}` : "";
}
