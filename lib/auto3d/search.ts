// Pretraga delova na stranici /sajam/3d (A03 §6.1). Čisto: bez dijakritika (č ć → c, š → s, ž → z,
// đ → dj ili d), ćirilica se čita kao latinica, više reči je AND, a pogađa se naziv dela ili naziv sistema.
// Srpski menja kraj reči („kočnica“, „kočnice“, „kočnicom“), pa reč od 4+ slova bez poslednjeg samoglasnika
// traži osnovu, a množina na -ovi/-evi („diskovi“, „farovi“) osnovu bez tog nastavka.

import { PARTS, type PartId, type SystemId } from "./catalog";

export type SearchDoc = { id: PartId; name: string; system: string };

type Folded = { names: string[]; compact: string[]; systems: string[] };

const COMBINING = /[\u0300-\u036f]/g;

/** Srpska ćirilica (mala slova) → latinica, pa upit „кочнице“ traži isto što i „kočnice“ (A13). */
const CYRILLIC: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m",
  н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š",
};

/** Mala slova bez dijakritika; sve osim slova i cifara postaje jedan razmak. NFKD rastavlja i „ǉ“, „ǌ“, „ǆ“. */
export function fold(text: string, dj: "dj" | "d" = "dj"): string {
  return text
    .toLowerCase()
    .replace(/[а-џ]/g, (c) => CYRILLIC[c] ?? c)
    .replace(/đ/g, dj)
    .normalize("NFKD")
    .replace(COMBINING, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Reči upita: bez dijakritika, a duže reči bez nastavka množine -ovi/-evi ili bez završnog samoglasnika. */
export function queryTokens(query: string): string[] {
  return fold(query)
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length >= 6 && /[oe]vi$/.test(w) ? w.slice(0, -3) : w.length >= 4 && /[aeiou]$/.test(w) ? w.slice(0, -1) : w));
}

function foldDoc(doc: SearchDoc): Folded {
  const names = [...new Set([fold(doc.name, "dj"), fold(doc.name, "d")])];
  return {
    names,
    compact: names.map((n) => n.replace(/ /g, "")),
    systems: [...new Set([fold(doc.system, "dj"), fold(doc.system, "d")])],
  };
}

/** 0 početak naziva, 1 početak reči u nazivu, 2 sredina naziva, 3 samo sistem; null bez pogotka. */
function tokenRank(f: Folded, token: string): number | null {
  if (f.names.some((n) => n.startsWith(token))) return 0;
  if (f.names.some((n) => n.split(" ").some((w) => w.startsWith(token)))) return 1;
  if (f.names.some((n) => n.includes(token)) || f.compact.some((n) => n.includes(token))) return 2;
  if (f.systems.some((s) => s.includes(token))) return 3;
  return null;
}

/**
 * Delovi koji odgovaraju upitu, najbolji prvi (početak naziva pre sredine, pa redosled kataloga).
 * Prazan upit vraća sve delove redom iz `docs`.
 */
export function searchParts(docs: readonly SearchDoc[], query: string): PartId[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return docs.map((d) => d.id);
  const hits: Array<{ id: PartId; score: number; order: number }> = [];
  docs.forEach((doc, order) => {
    const f = foldDoc(doc);
    let score = 0;
    for (const token of tokens) {
      const rank = tokenRank(f, token);
      if (rank === null) return;
      score += rank;
    }
    hits.push({ id: doc.id, score, order });
  });
  return hits.sort((a, b) => a.score - b.score || a.order - b.order).map((h) => h.id);
}

/** Dokumenti pretrage za ceo katalog, iz imena delova i sistema. */
export function catalogDocs(partName: (id: PartId) => string, systemName: (id: SystemId) => string): SearchDoc[] {
  return PARTS.map((p) => ({ id: p.id, name: partName(p.id), system: systemName(p.system) }));
}
