// ScanMe Menu V1 — versions in the editor's memory (K18; master §6.1: "svako
// uspešno objavljivanje pravi snapshot; čuva se poslednjih 20"; "vraćanje
// prethodne verzije pravi novi nacrt i ne menja odmah javni meni").
//
// The same rules as convex/menuPublishing.ts listVersions / restoreVersion:
//   - a restore is refused when the draft changed since the person looked
//     (`revizija`), so nobody's newer edit is overwritten;
//   - it uses the pure plan of the server (lib/menu/restore-plan.ts): a page
//     with a QR card is never removed or archived by it, it is kept and named;
//   - it writes ONLY the draft: the published snapshot (what guests see)
//     stays until Objavi;
//   - restoring the live version exactly is "discard the draft changes": the
//     draft has no unpublished changes afterwards.
// Pure: every function returns the next state.

import { MENU_ERROR } from "../errors/core";
import { diffByIdentity, planRestore, RESTORE_IDENTITY } from "../restore-plan";
import { canonicalJson, type MenuDraftSnapshot } from "../snapshot";
import { greska, sazetakVerzije, stanjeNacrta, type MemorijaKorak, type MemorijaStanje, type MemorijaVerzija } from "./memorija";
import type { StudioVerzije, StudioVracanjeRezultat } from "./model";

/** The versions list (newest first), as menuPublishing.listVersions gives it. */
export function verzijeIzMemorije(stanje: MemorijaStanje): StudioVerzije {
  const verzije = [...(stanje.verzije ?? [])].sort((a, b) => b.broj - a.broj);
  return {
    uzivo: stanje.objavljenaVerzija,
    verzije: verzije.map((verzija) => ({
      broj: verzija.broj,
      objavljenoU: verzija.u,
      objavio: verzija.ko,
      sazetak: verzija.sazetak,
      vracenoIz: verzija.vracenoIz,
      uzivo: verzija.broj === stanje.objavljenaVerzija,
    })),
  };
}

const poKljucu = (row: { key: string }) => row.key;

/** Rows that differ between two drafts (what a restore would write); 0 = the same menu. */
export function brojRazlika(a: MenuDraftSnapshot, b: MenuDraftSnapshot): number {
  const tabele = [
    diffByIdentity(a.pages, b.pages, poKljucu),
    diffByIdentity(a.sections, b.sections, poKljucu),
    diffByIdentity(a.articles, b.articles, poKljucu),
    diffByIdentity(a.variants, b.variants, poKljucu),
    diffByIdentity(a.addonGroups, b.addonGroups, poKljucu),
    diffByIdentity(a.addonOptions, b.addonOptions, poKljucu),
    diffByIdentity(a.placements, b.placements, RESTORE_IDENTITY.placement),
    diffByIdentity(a.articleAddonGroups, b.articleAddonGroups, RESTORE_IDENTITY.articleAddonGroup),
    diffByIdentity(a.comboComponents, b.comboComponents, RESTORE_IDENTITY.comboComponent),
    diffByIdentity(a.roomService.categories, b.roomService.categories, poKljucu),
    diffByIdentity(a.roomService.items, b.roomService.items, RESTORE_IDENTITY.roomServiceItem),
  ];
  let broj = tabele.reduce((zbir, diff) => zbir + diff.inserts.length + diff.updates.length + diff.deletes.length, 0);
  if (canonicalJson(a.settings) !== canonicalJson(b.settings)) broj += 1;
  if (canonicalJson(a.presentation ?? null) !== canonicalJson(b.presentation ?? null)) broj += 1;
  if (canonicalJson(a.roomService.config) !== canonicalJson(b.roomService.config)) broj += 1;
  return broj;
}

/** Version `broj` becomes the draft (see the header for the rules). */
export function vratiVerziju(stanje: MemorijaStanje, broj: number, revizija: number): MemorijaKorak<StudioVracanjeRezultat> {
  if (revizija !== stanje.revizija) {
    return { stanje, ishod: { ok: true, vrednost: { status: "odbijeno", razlog: "stale_draft" } } };
  }
  const verzija = stanje.verzije?.find((kandidat) => kandidat.broj === broj);
  if (!verzija) return greska(stanje, MENU_ERROR.notFound);

  // Only pages the restore would delete or archive need the QR check (as on the server).
  const uVerziji = new Map(verzija.snapshot.pages.map((page) => [page.key, page]));
  const zasticene = new Set<string>();
  for (const page of stanje.snapshot.pages) {
    const tamo = uVerziji.get(page.key);
    const odlazi = !tamo || (tamo.archivedAt !== null && page.archivedAt === null);
    if (odlazi && stanje.qrStranice.has(page.key)) zasticene.add(page.key);
  }
  const plan = planRestore(stanje.snapshot, verzija.snapshot, zasticene);
  const izmena = brojRazlika(stanje.snapshot, plan.final);
  const jednakoUzivo = broj === stanje.objavljenaVerzija && plan.keptPages.length === 0 && plan.renamedSlugs.length === 0;
  const rezultat = (sledece: MemorijaStanje): MemorijaKorak<StudioVracanjeRezultat> => ({
    stanje: sledece,
    ishod: {
      ok: true,
      vrednost: {
        status: "vraceno",
        broj,
        stanje: jednakoUzivo ? "clean" : "dirty",
        izmena,
        zadrzaneStranice: plan.keptPages.map((page) => page.name),
        bezSlike: 0,
      },
    },
  });

  if (izmena === 0) {
    // Nothing to write; restoring the live version into a draft that differs only in
    // its bookkeeping (a revision, a restore marker) marks it clean.
    if (jednakoUzivo && (stanjeNacrta(stanje) === "dirty" || (stanje.vracenoIz ?? null) !== null)) {
      return rezultat({ ...stanje, objavljenaRevizija: stanje.revizija, vracenoIz: null });
    }
    return rezultat(stanje);
  }
  const sledecaRevizija = stanje.revizija + 1;
  return rezultat({
    ...stanje,
    snapshot: plan.final,
    revizija: sledecaRevizija,
    vracenoIz: jednakoUzivo ? null : broj,
    ...(jednakoUzivo ? { objavljenaRevizija: sledecaRevizija } : {}),
  });
}

/**
 * The izlog's history: `broj` published versions ending with the live
 * `snapshot`, each older one a little different (a few prices lower, the newest
 * article missing), published by the venue's team at invented times.
 */
export function istorijaVerzija(
  snapshot: MenuDraftSnapshot,
  broj: number,
  poslednjaU: number,
  tim: readonly string[],
): MemorijaVerzija[] {
  if (broj <= 0) return [];
  const snimci: MenuDraftSnapshot[] = [snapshot];
  for (let i = 1; i < broj; i += 1) snimci.unshift(starija(snimci[0], i));
  let prethodno: MenuDraftSnapshot | null = null;
  return snimci.map((snimak, indeks) => {
    const verzija: MemorijaVerzija = {
      broj: indeks + 1,
      // Every 2 days and a few hours back from the live one.
      u: poslednjaU - (broj - 1 - indeks) * (2 * 86_400_000 + 3 * 3_600_000),
      ko: tim.length > 0 ? tim[indeks % tim.length] : null,
      snapshot: snimak,
      sazetak: sazetakVerzije(prethodno, snimak),
      vracenoIz: null,
    };
    prethodno = snimak;
    return verzija;
  });
}

/** One step back in time: three prices 30 RSD lower (rotating), and on odd steps the last article not there yet. */
function starija(snapshot: MenuDraftSnapshot, korak: number): MenuDraftSnapshot {
  const saCenom = snapshot.articles.filter((article) => article.basePriceRsd !== null && article.basePriceRsd > 100);
  const menjaju = new Set(
    [0, 1, 2].map((pomak) => saCenom[(korak * 3 + pomak) % Math.max(saCenom.length, 1)]?.key).filter(Boolean),
  );
  const poslednji = korak % 2 === 1 ? snapshot.placements[snapshot.placements.length - 1] : undefined;
  return {
    ...snapshot,
    articles: snapshot.articles.map((article) =>
      menjaju.has(article.key) && article.basePriceRsd !== null ? { ...article, basePriceRsd: article.basePriceRsd - 30 } : article,
    ),
    placements: poslednji ? snapshot.placements.filter((placement) => placement !== poslednji) : snapshot.placements,
  };
}
