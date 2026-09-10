import type { ResolverDict } from "../types";

// The /r/nevazeca "card not active" page (TASK-14). Every unknown, disabled or
// broken card code lands here; the copy blames the card, never the guest.
// TASK-37 adds the bare splitter page's two lines (/r/[cardCode]/izbor).
export const resolverSr = {
  metaTitle: "Kartica nije aktivna · ScanMe",
  title: "Ova kartica trenutno nije aktivna.",
  body: "Kod sa kartice ne vodi nikuda — kartica je možda isključena ili zamenjena novom.",
  hint: "Zamolite osoblje da proveri karticu.",
  splitterMetaTitle: "{name} · ScanMe",
  splitterHint: "Izaberite:",
} as const satisfies ResolverDict;
