// ScanMe Menu V1 — who else is in the editor (K18; master §6.1: "više urednika
// može raditi istovremeno; sistem prikazuje ko trenutno uređuje isti
// artikal"). A signal, never a lock (convex/menuPresence.ts).
//
// PURE. The server lists everyone whose row has not expired by `nowBucket`
// (the client clock quantized, queries never read the clock); this keeps only
// OTHER people, drops what expired since the bucket, and phrases names. The
// person themself is never listed (`isMe`, the same account in another tab
// included: they know what they have open).

import { fmt } from "../../i18n/format";
import { menuStudioObjavljivanjeSr } from "../../i18n/sr/menu-studio-objava";
import type { StudioEntitetPrisustva, StudioPrisutan } from "./model";

const t = menuStudioObjavljivanjeSr.prisustvo;

/** Mirrors convex/menuPresence.ts PRESENCE_TTL_MS: a row is shown this long after its last write. */
export const PRISUSTVO_TTL_MS = 45_000;
/** The heartbeat while the editor is open (well inside the TTL). */
export const PRISUSTVO_OTKUCAJ_MS = 20_000;
/** The list's clock step (`nowBucket`): one new subscription argument per step. */
export const PRISUSTVO_KORAK_MS = 15_000;

/** One row of menuPresence.listForService. */
export type UnosPrisustva = {
  userId: string;
  name: string | null;
  isMe: boolean;
  entityType: string | null;
  entityKey: string | null;
  since: number;
};

const VRSTE: ReadonlySet<string> = new Set<StudioEntitetPrisustva["vrsta"]>(["article", "page", "room_service"]);

/** The clock quantized to the list's step (the subscription argument). */
export function nowBucket(sada: number): number {
  return Math.floor(sada / PRISUSTVO_KORAK_MS) * PRISUSTVO_KORAK_MS;
}

/** Other people in the editor now: not me, not expired, one entry per person and entity. */
export function drugiUEditoru(unosi: readonly UnosPrisustva[], sada: number): StudioPrisutan[] {
  const vidjeno = new Set<string>();
  const out: StudioPrisutan[] = [];
  for (const unos of unosi) {
    if (unos.isMe || unos.since + PRISUSTVO_TTL_MS <= sada) continue;
    const entitet =
      unos.entityType && unos.entityKey && VRSTE.has(unos.entityType)
        ? { vrsta: unos.entityType as StudioEntitetPrisustva["vrsta"], key: unos.entityKey }
        : null;
    const id = `${unos.userId}|${entitet?.vrsta ?? ""}|${entitet?.key ?? ""}`;
    if (vidjeno.has(id)) continue;
    vidjeno.add(id);
    out.push({ id: unos.userId, ime: unos.name?.trim() || null, entitet });
  }
  return out;
}

/** A name to show (a person without a name is "Član tima"). */
export function imeOsobe(ime: string | null): string {
  return ime?.trim() || t.clanTima;
}

/** Everyone once (a person on two entities counts once), by name. */
export function osobe(prisutni: readonly StudioPrisutan[]): { id: string; ime: string }[] {
  const poId = new Map<string, string>();
  for (const prisutan of prisutni) if (!poId.has(prisutan.id)) poId.set(prisutan.id, imeOsobe(prisutan.ime));
  return [...poId].map(([id, ime]) => ({ id, ime })).sort((a, b) => a.ime.localeCompare(b.ime, "sr") || a.id.localeCompare(b.id));
}

/** Names of the people who have exactly this entity open. */
export function naEntitetu(prisutni: readonly StudioPrisutan[], vrsta: StudioEntitetPrisustva["vrsta"], key: string): string[] {
  return osobe(prisutni.filter((prisutan) => prisutan.entitet?.vrsta === vrsta && prisutan.entitet.key === key)).map((osoba) => osoba.ime);
}

/** Article key → the names of the people editing it (rows of the work area). */
export function imenaPoArtiklu(prisutni: readonly StudioPrisutan[]): ReadonlyMap<string, readonly string[]> {
  const kljucevi = new Set<string>();
  for (const prisutan of prisutni) if (prisutan.entitet?.vrsta === "article") kljucevi.add(prisutan.entitet.key);
  const out = new Map<string, readonly string[]>();
  for (const key of kljucevi) out.set(key, naEntitetu(prisutni, "article", key));
  return out;
}

/** "MP" for "Marko Petrović", "A" for "Ana", "?" for nothing. */
export function inicijali(ime: string | null): string {
  const reci = (ime ?? "").trim().split(/\s+/).filter(Boolean);
  if (reci.length === 0) return "?";
  return reci
    .slice(0, 2)
    .map((rec) => rec.charAt(0).toLocaleUpperCase("sr"))
    .join("");
}

/** "Marko", "Marko i Ana", "Marko, Ana i još 2" — at most `najvise` names, the rest counted. */
export function spisakImena(imena: readonly string[], najvise = 2): string {
  if (imena.length === 0) return "";
  if (imena.length === 1) return imena[0];
  if (imena.length === 2 && najvise >= 2) return fmt(t.dvoje, { a: imena[0], b: imena[1] });
  const prikazana = imena.slice(0, najvise);
  const ostalo = imena.length - prikazana.length;
  if (ostalo <= 0) return fmt(t.dvoje, { a: prikazana.slice(0, -1).join(", "), b: prikazana[prikazana.length - 1] });
  return fmt(t.jos, { imena: prikazana.join(", "), n: ostalo });
}

/** A sentence about these people with the verb in the right number ("uređuje" / "uređuju"). */
export function recenicaOsoba(sablon: { jedan: string; vise: string }, imena: readonly string[], najvise = 2): string {
  return fmt(imena.length > 1 ? sablon.vise : sablon.jedan, { imena: spisakImena(imena, najvise) });
}
