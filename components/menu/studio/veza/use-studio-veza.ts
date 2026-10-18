"use client";

// ScanMe Menu V1 — the editor's connection to Convex (K10, K09 §1.3). The only
// place in the editor that uses convex/react: queries become StudioPodaci,
// mutations become StudioRadnje (lib/menu/studio/model.ts). Subscriptions per
// recipe §7: the service context, the page column, ONE page's content, the
// draft status and the live availability — nothing per article.

import { useAction, useConvex, useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { menuImageType } from "@/lib/menu/image-validation";
import { izgledKaoTekst, izmenaIzCas } from "@/lib/menu/studio/izgled-red";
import type { MenuTranslations } from "@/lib/menu/translation-status";
import type {
  StudioAlergeni,
  StudioBrisanjeRezultat,
  StudioDetaljArtikla,
  StudioCeneRezultat,
  StudioIshod,
  StudioKontekst,
  StudioJezici,
  StudioPodaci,
  StudioPregledObjave,
  StudioPrevodiPogled,
  StudioRoomService,
  StudioRadnje,
  StudioRadniSadrzaj,
  StudioStatusNacrta,
  StudioSekcijaStranice,
  StudioStranica,
  StudioUticajArtikla,
  StudioUticajBrisanja,
} from "@/lib/menu/studio/model";
import { ISHOD_OK } from "@/lib/menu/studio/model";
import type { StudioPogled } from "../studio-editor";
import { izGreske, izvrsi } from "./ishod";
import { obradiNaServeru, posaljiOriginal } from "./otpremanje";

type Stranice = Id<"menuPages">;
type Sekcija = Id<"menuSections">;
type Artikal = Id<"menuArticles">;
type Prikaz = Id<"menuPlacements">;
type Varijanta = Id<"menuVariants">;
type Grupa = Id<"menuAddonGroups">;
type Opcija = Id<"menuAddonOptions">;
type RsKategorija = Id<"menuRoomServiceCategories">;
type RsStavka = Id<"menuRoomServiceItems">;

const BEZ_POGLEDA: StudioPogled = { roomService: false, prevodi: null };

const NEMA: StudioIshod<never> = { ok: false, vrsta: "greska", kod: "menu/not_found", ponovljivo: false };

/** A compare-and-set answer whose `current` is an object: the conflict carries it as JSON. */
function kaoKonflikt(rezultat: unknown, sacuvano: (current: Record<string, unknown>) => unknown): StudioIshod | null {
  if (typeof rezultat !== "object" || rezultat === null || (rezultat as { ok?: unknown }).ok !== false) return null;
  const current = ((rezultat as { current?: Record<string, unknown> }).current ?? {}) as Record<string, unknown>;
  return { ok: false, vrsta: "konflikt", sacuvano: JSON.stringify(sacuvano(current)), pokusano: null };
}

function alergeniZaServer(alergeni: StudioAlergeni | null) {
  if (alergeni === null) return null;
  return {
    contains: alergeni.sadrzi as never[],
    mayContain: alergeni.tragovi as never[],
    ...(alergeni.drugo ? { otherText: alergeni.drugo } : {}),
  };
}

/** One article of menuBulk's deletion impact as the editor shows it. */
function uticajIzImpacta(impact: {
  articleId: string;
  name: string;
  kind: "item" | "combo";
  pages: { name: string; archived: boolean; placements: number }[];
  combos: { name: string }[];
  variants: number;
  inRoomService: boolean;
}): StudioUticajArtikla {
  return {
    artikalId: impact.articleId,
    naziv: impact.name,
    vrsta: impact.kind,
    stranice: impact.pages.map((page) => ({ naziv: page.name, arhivirana: page.archived, prikaza: page.placements })),
    kombo: impact.combos.map((combo) => combo.name),
    varijante: impact.variants,
    roomService: impact.inRoomService,
  };
}

export type StudioVeza =
  | { stanje: "ucitava" }
  | { stanje: "nema" }
  | { stanje: "spremno"; podaci: StudioPodaci; radnje: StudioRadnje; menuServiceId: Id<"menuServices"> };

/**
 * `izbor`: the page open in the work area — by id once chosen in the editor,
 * by key from the URL on entry; neither = the default page.
 */
export function useStudioVeza(
  slug: string,
  izbor: { id: string | null; key: string | null },
  /** K15: the key of the article whose detail is open (null = none). */
  otvorenArtikal: string | null = null,
  /** K16: Room service and the translations view are subscribed only while open. */
  pogled: StudioPogled = BEZ_POGLEDA,
): StudioVeza {
  const { isLoading } = useConvexAuth();
  const convex = useConvex();
  const veza = useConvexConnectionState();
  const kontekst = useQuery(api.menuServices.context, isLoading ? "skip" : { businessSlug: slug });
  const menuServiceId = kontekst?.menuServiceId;
  const stranice = useQuery(api.menuStudio.pages, menuServiceId ? { menuServiceId } : "skip");
  const status = useQuery(api.menuPublishing.draftStatus, menuServiceId ? { menuServiceId } : "skip");
  const nedostupni = useQuery(api.menuAvailability.unavailableArticles, menuServiceId ? { menuServiceId } : "skip");
  const pageId: Stranice | null =
    (izbor.id as Stranice | null) ??
    (izbor.key ? stranice?.find((page) => page.key === izbor.key)?.pageId : undefined) ??
    stranice?.find((page) => page.isDefault && !page.archived)?.pageId ??
    stranice?.find((page) => !page.archived)?.pageId ??
    null;
  const sadrzaj = useQuery(api.menuCatalog.pageContent, pageId ? { pageId } : "skip");
  // K15: one subscription for the open article only.
  const detalj = useQuery(
    api.menuStudio.articleDetail,
    menuServiceId && otvorenArtikal ? { menuServiceId, articleKey: otvorenArtikal } : "skip",
  );

  // K16: languages (always; small), the open translations view and Room service (only while open).
  const jezici = useQuery(api.menuTranslations.status, menuServiceId ? { menuServiceId } : "skip");
  const prevodi = useQuery(
    api.menuTranslations.view,
    menuServiceId && pogled.prevodi === "room-service"
      ? { menuServiceId, scope: { kind: "roomService" as const } }
      : menuServiceId && pogled.prevodi === "stranica" && pageId
        ? { menuServiceId, scope: { kind: "page" as const, pageId } }
        : "skip",
  );
  const roomService = useQuery(api.menuRoomService.get, menuServiceId && pogled.roomService ? { menuServiceId } : "skip");

  const addPage = useMutation(api.menuPages.add);
  const renamePage = useMutation(api.menuPages.rename);
  const duplicatePage = useMutation(api.menuPages.duplicate);
  const movePage = useMutation(api.menuPages.move);
  const archivePage = useMutation(api.menuPages.archive);
  const restorePage = useMutation(api.menuPages.restore);
  const removePage = useMutation(api.menuPages.remove);
  const addSection = useMutation(api.menuCatalog.addSection);
  const renameSection = useMutation(api.menuCatalog.renameSection);
  const removeSection = useMutation(api.menuCatalog.removeSection);
  const quickAdd = useMutation(api.menuCatalog.quickAddArticle);
  const quickAddMany = useMutation(api.menuStudio.quickAddMany);
  const addPlacement = useMutation(api.menuCatalog.addPlacement);
  const createCombo = useMutation(api.menuCombos.createCombo);
  const setBasePrice = useMutation(api.menuCatalog.setBasePrice);
  const publish = useMutation(api.menuPublishing.publish);
  // K11
  const movePlacement = useMutation(api.menuCatalog.movePlacement);
  const moveSection = useMutation(api.menuCatalog.moveSection);
  const bulkAvailability = useMutation(api.menuBulk.setAvailability);
  const bulkVisibility = useMutation(api.menuBulk.setVisibility);
  const bulkRemove = useMutation(api.menuBulk.removeFromPage);
  const bulkMove = useMutation(api.menuBulk.moveToSection);
  const bulkAdd = useMutation(api.menuBulk.addToPage);
  const bulkPrices = useMutation(api.menuBulk.setPrices);
  const bulkDelete = useMutation(api.menuBulk.deleteArticles);
  // K15
  const updateFields = useMutation(api.menuCatalog.updateArticleFields);
  const setMedia = useMutation(api.menuMedia.setArticleMedia);
  const reserveUpload = useMutation(api.menuMedia.reserveUpload);
  const setSwitches = useMutation(api.menuArticleOptions.setArticleOptionSwitches);
  const addVariant = useMutation(api.menuArticleOptions.addVariant);
  const updateVariant = useMutation(api.menuArticleOptions.updateVariant);
  const removeVariant = useMutation(api.menuArticleOptions.removeVariant);
  const createGroup = useMutation(api.menuArticleOptions.createAddonGroup);
  const attachGroup = useMutation(api.menuArticleOptions.attachAddonGroup);
  const detachGroup = useMutation(api.menuArticleOptions.detachAddonGroup);
  const updateGroup = useMutation(api.menuArticleOptions.updateAddonGroup);
  const addOption = useMutation(api.menuArticleOptions.addAddonOption);
  const updateOption = useMutation(api.menuArticleOptions.updateAddonOption);
  const removeOption = useMutation(api.menuArticleOptions.removeAddonOption);
  const applyGroup = useMutation(api.menuArticleOptions.applyAddonGroupToArticles);
  const setAllergens = useMutation(api.menuArticleDetails.setArticleAllergens);
  const setTags = useMutation(api.menuArticleDetails.setArticleTags);
  const setPromo = useMutation(api.menuPromos.setPromo);
  // K16
  const setComponents = useMutation(api.menuCombos.setComboComponents);
  const resolvePriceCheck = useMutation(api.menuCombos.resolvePriceCheck);
  const setTranslation = useMutation(api.menuTranslations.setTranslation);
  const confirmSuggestion = useMutation(api.menuTranslations.confirmSuggestion);
  const dropSuggestion = useMutation(api.menuTranslations.dropSuggestion);
  const markReviewed = useMutation(api.menuTranslations.markReviewed);
  const suggest = useAction(api.menuTranslations.suggest);
  const rsSettings = useMutation(api.menuRoomService.updateSettings);
  const rsAddCategory = useMutation(api.menuRoomService.addCategory);
  const rsRenameCategory = useMutation(api.menuRoomService.renameCategory);
  const rsMoveCategory = useMutation(api.menuRoomService.moveCategory);
  const rsRemoveCategory = useMutation(api.menuRoomService.removeCategory);
  const rsImport = useMutation(api.menuRoomService.importWholeMenu);
  const rsAddItems = useMutation(api.menuRoomService.addItems);
  const rsRemoveItem = useMutation(api.menuRoomService.removeItem);
  const rsMoveItem = useMutation(api.menuRoomService.moveItem);
  const rsMarkup = useMutation(api.menuRoomService.setItemsMarkup);
  const rsManual = useMutation(api.menuRoomService.setManualPrice);
  const rsResolve = useMutation(api.menuRoomService.resolvePriceWarning);
  // K17 — Izgled: the draft appearance (small; also feeds the preview) and its writer.
  const izgled = useQuery(api.menuPresentation.get, menuServiceId ? { menuServiceId } : "skip");
  const postaviIzgled = useMutation(api.menuPresentation.update);


  const radnje = useMemo<StudioRadnje | null>(() => {
    if (!menuServiceId) return null;
    return {
      dodajStranicu: (naziv) => izvrsi(() => addPage({ menuServiceId, name: naziv }), (r) => ({ id: r.pageId })),
      preimenujStranicu: (id, naziv, ocekivano) =>
        izvrsi(() => renamePage({ pageId: id as Stranice, name: naziv, expectedName: ocekivano }), () => null, "name", naziv),
      duplirajStranicu: (id) => izvrsi(() => duplicatePage({ pageId: id as Stranice }), (r) => ({ id: r.pageId })),
      premestiStranicu: (id, naIndeks) => izvrsi(() => movePage({ pageId: id as Stranice, toIndex: naIndeks }), () => null),
      arhivirajStranicu: (id) => izvrsi(() => archivePage({ pageId: id as Stranice }), () => null),
      vratiStranicu: (id) => izvrsi(() => restorePage({ pageId: id as Stranice }), () => null),
      obrisiStranicu: (id) => izvrsi(() => removePage({ pageId: id as Stranice }), () => null),
      dodajSekciju: (stranicaId, naziv) =>
        izvrsi(() => addSection({ pageId: stranicaId as Stranice, name: naziv }), (r) => ({ id: r.sectionId })),
      preimenujSekciju: (id, naziv, ocekivano) =>
        izvrsi(
          () => renameSection({ sectionId: id as Sekcija, name: naziv, expectedName: ocekivano }),
          () => null,
          "name",
          naziv,
        ),
      obrisiSekciju: (id) => izvrsi(() => removeSection({ sectionId: id as Sekcija }), () => null),
      brziUnos: (sekcijaId, unos, dozvoliDuplikat) =>
        izvrsi(
          () =>
            quickAdd({
              sectionId: sekcijaId as Sekcija,
              name: unos.naziv,
              ...(unos.cena !== null ? { priceRsd: unos.cena } : {}),
              ...(dozvoliDuplikat ? { allowDuplicate: true } : {}),
            }),
          (r) =>
            r.status === "similar"
              ? {
                  status: "slicno" as const,
                  kandidati: r.candidates.map((c) => ({ artikalId: c.articleId, naziv: c.name, cena: c.basePriceRsd })),
                }
              : { status: "dodato" as const, artikalId: r.articleId, prikazId: r.placementId },
        ),
      brziUnosVise: (stranicaId, redovi) =>
        izvrsi(
          () =>
            quickAddMany({
              pageId: stranicaId as Stranice,
              rows: redovi.map((red) => ({
                sectionId: red.sekcijaId as Sekcija,
                name: red.naziv,
                priceRsd: red.cena,
                ...(red.odluka
                  ? { decision: red.odluka === "novi" ? ("new" as const) : red.odluka === "postojeci" ? ("existing" as const) : ("skip" as const) }
                  : {}),
                ...(red.postojeciId ? { existingArticleId: red.postojeciId as Artikal } : {}),
              })),
            }),
          (r) =>
            r.status === "similar"
              ? {
                  status: "slicno" as const,
                  redovi: r.rows.map((row) => ({
                    indeks: row.index,
                    kandidati: row.candidates.map((c) => ({ artikalId: c.articleId, naziv: c.name, cena: c.basePriceRsd })),
                  })),
                }
              : { status: "dodato" as const, novih: r.created, postojecih: r.reused, preskoceno: r.skipped },
        ),
      dodajPostojeci: (sekcijaId, artikalId) =>
        izvrsi(() => addPlacement({ sectionId: sekcijaId as Sekcija, articleId: artikalId as Artikal }), () => null),
      noviKombo: (sekcijaId, unos) =>
        izvrsi(
          () =>
            createCombo({
              sectionId: sekcijaId as Sekcija,
              name: unos.naziv,
              ...(unos.cena !== null ? { priceRsd: unos.cena } : {}),
              components: unos.sastojci.map((articleId) => ({ articleId: articleId as Artikal, quantity: 1 })),
            }),
          (r) => ({ id: r.articleId }),
        ),
      postaviCenu: (artikalId, ocekivana, nova) =>
        izvrsi(
          () => setBasePrice({ articleId: artikalId as Artikal, expectedPriceRsd: ocekivana, priceRsd: nova }),
          (r) => {
            // K16: the article has a manual Room service price: the editor asks at once.
            const w = "roomServiceWarning" in r ? (r.roomServiceWarning ?? null) : null;
            return w
              ? {
                  stavkaId: w.itemId,
                  naziv: "",
                  staraOsnovna: w.oldBaseRsd,
                  novaOsnovna: w.newBaseRsd,
                  rsCena: w.roomServicePriceRsd,
                  izracunata: w.recomputedPriceRsd,
                }
              : null;
          },
          "basePriceRsd",
          nova,
        ),
      pregledObjave: async (): Promise<StudioIshod<StudioPregledObjave>> => {
        try {
          const r = await convex.query(api.menuPublishing.publishPreview, { menuServiceId });
          if (!r) return { ok: false, vrsta: "greska", kod: "menu/not_found", ponovljivo: false };
          return {
            ok: true,
            vrednost: {
              revizija: r.revision,
              stanje: r.state,
              mozeObjavu: r.canPublish,
              menjaSe: r.wouldChange,
              prevelik: r.tooLarge,
              greske: r.errors.map((issue) => ({ kod: issue.code, artikalKey: issue.articleKey ?? null })),
              upozorenja: r.warnings.map((issue) => ({
                kod: issue.code,
                artikalKey: issue.articleKey ?? null,
                jezik: issue.lang ?? null,
                broj: issue.count ?? null,
              })),
              otisak: r.fingerprint,
              sazetak: r.summary
                ? {
                    cene: r.summary.changedPrices,
                    novi: r.summary.newArticles,
                    uklonjeni: r.summary.removedArticles,
                    sakriveno: r.summary.structural.hidden,
                    uklonjenoSaStranice: r.summary.structural.removedFromPage,
                    obrisano: r.summary.structural.deleted,
                    redosled: r.summary.structural.reordered,
                  }
                : null,
            },
          };
        } catch (error) {
          return izGreske(error);
        }
      },
      objavi: (revizija, potvrda) =>
        izvrsi(
          () =>
            publish({
              menuServiceId,
              expectedRevision: revizija,
              ...(potvrda !== undefined ? { acknowledgedWarnings: potvrda } : {}),
            }),
          (r) =>
            r.ok
              ? { status: "objavljeno" as const, verzija: r.versionNumber }
              : { status: "odbijeno" as const, razlog: r.reason },
        ),
      // K11 — order, states and group actions (convex/menuBulk.ts).
      premestiPrikaz: (prikazId, uSekciju, prePrikaza) =>
        izvrsi(
          () =>
            movePlacement({
              placementId: prikazId as Prikaz,
              toSectionId: uSekciju as Sekcija,
              ...(prePrikaza ? { beforePlacementId: prePrikaza as Prikaz } : {}),
            }),
          () => null,
        ),
      premestiSekciju: (sekcijaId, naIndeks) => izvrsi(() => moveSection({ sectionId: sekcijaId as Sekcija, toIndex: naIndeks }), () => null),
      postaviDostupnost: (artikalIds, dostupno) =>
        izvrsi(
          () => bulkAvailability({ menuServiceId, articleIds: artikalIds as Artikal[], available: dostupno }),
          (r) => ({ promenjeno: r.changed }),
        ),
      postaviVidljivost: (prikazIds, sakriveno) =>
        izvrsi(
          () => bulkVisibility({ menuServiceId, placementIds: prikazIds as Prikaz[], visibility: sakriveno ? "hidden" : "visible" }),
          (r) => ({ promenjeno: r.changed }),
        ),
      ukloniSaStranice: (prikazIds) =>
        izvrsi(() => bulkRemove({ menuServiceId, placementIds: prikazIds as Prikaz[] }), (r) => ({ uklonjeno: r.removed })),
      premestiUSekciju: (prikazIds, sekcijaId) =>
        izvrsi(
          () => bulkMove({ menuServiceId, placementIds: prikazIds as Prikaz[], toSectionId: sekcijaId as Sekcija }),
          (r) => ({ premesteno: r.moved, preskoceno: r.skipped }),
        ),
      dodajNaStranicu: (artikalIds, sekcijaId) =>
        izvrsi(
          () => bulkAdd({ menuServiceId, articleIds: artikalIds as Artikal[], sectionId: sekcijaId as Sekcija }),
          (r) => ({ dodato: r.added, preskoceno: r.skipped }),
        ),
      sekcijeStranice: async (stranicaId): Promise<StudioIshod<StudioSekcijaStranice[]>> => {
        try {
          const r = await convex.query(api.menuBulk.pageSections, { pageId: stranicaId as Stranice });
          if (!r) return { ok: false, vrsta: "greska", kod: "menu/not_found", ponovljivo: false };
          return { ok: true, vrednost: r.sections.map((section) => ({ id: section.sectionId, naziv: section.name })) };
        } catch (error) {
          return izGreske(error);
        }
      },
      postaviCene: (promene) =>
        izvrsi(
          () =>
            bulkPrices({
              menuServiceId,
              changes: promene.map((promena) => ({
                articleId: promena.artikalId as Artikal,
                expectedPriceRsd: promena.ocekivana,
                priceRsd: promena.nova,
              })),
            }),
          (r): StudioCeneRezultat =>
            r.status === "conflict"
              ? { status: "konflikt", artikli: r.conflicts.map((c) => ({ artikalId: c.articleId, sacuvano: c.currentPriceRsd })) }
              : { status: "promenjeno", broj: r.changed },
        ),
      uticajBrisanja: async (artikalIds): Promise<StudioIshod<StudioUticajBrisanja>> => {
        try {
          const r = await convex.query(api.menuBulk.deleteImpact, { menuServiceId, articleIds: artikalIds as Artikal[] });
          if (!r) return { ok: false, vrsta: "greska", kod: "menu/not_found", ponovljivo: false };
          return { ok: true, vrednost: { artikli: r.articles.map(uticajIzImpacta), token: r.confirmToken, prevelik: r.overLimit } };
        } catch (error) {
          return izGreske(error);
        }
      },
      obrisiArtikle: (artikalIds, token) =>
        izvrsi(
          () => bulkDelete({ menuServiceId, articleIds: artikalIds as Artikal[], confirmToken: token }),
          (r): StudioBrisanjeRezultat =>
            r.status === "confirm"
              ? { status: "potvrdi", uticaj: { artikli: r.articles.map(uticajIzImpacta), token: r.confirmToken, prevelik: false } }
              : { status: "obrisano", broj: r.deleted },
        ),
      // K15 — the article detail (convex/menuCatalog, menuMedia, menuArticleOptions, menuArticleDetails, menuPromos).
      izmeniPolje: (artikalId, polje, ocekivano, vrednost) =>
        izvrsi(
          () =>
            updateFields({
              articleId: artikalId as Artikal,
              expected: { [polje]: ocekivano } as never,
              patch: { [polje]: vrednost } as never,
            }),
          () => null,
          polje,
          vrednost,
        ),
      postaviMedij: async (artikalId, ocekivano, novo) => {
        const izbor = (m: typeof novo) => ({
          mediaMode: m.medij,
          iconKey: m.ikonica,
          imageMediaId: m.slikaId as Id<"mediaAssets"> | null,
        });
        return izvrsi(() => setMedia({ articleId: artikalId as Artikal, expected: izbor(ocekivano), next: izbor(novo) }), () => null, "media");
      },
      otpremiSliku: async (artikalId, fajl, onNapredak) => {
        const tip = menuImageType(fajl);
        if (tip === null || tip === "heic") return { ok: false, vrsta: "greska", kod: "media/wrong_type", ponovljivo: false };
        let rezervacija: { uploadId: string; uploadUrl: string };
        try {
          rezervacija = await reserveUpload({ articleId: artikalId as Artikal, contentType: tip, size: fajl.size });
        } catch (error) {
          return izGreske(error);
        }
        onNapredak({ faza: "slanje", udeo: 0 });
        const storageId = await posaljiOriginal(rezervacija.uploadUrl, fajl, tip, (udeo) => onNapredak({ faza: "slanje", udeo }));
        if (!storageId) return { ok: false, vrsta: "greska", kod: "mreza", ponovljivo: true };
        onNapredak({ faza: "obrada" });
        const obrada = await obradiNaServeru(rezervacija.uploadId, storageId);
        if (!obrada.ok) return { ok: false, vrsta: "greska", kod: obrada.kod ?? "mreza", ponovljivo: obrada.kod === null };
        return { ok: true, vrednost: { slikaId: obrada.slikaId } };
      },
      postaviPrekidace: (artikalId, prekidaci) =>
        izvrsi(
          () =>
            setSwitches({
              articleId: artikalId as Artikal,
              ...(prekidaci.varijante !== undefined ? { variantsEnabled: prekidaci.varijante } : {}),
              ...(prekidaci.dodaci !== undefined ? { addonsEnabled: prekidaci.dodaci } : {}),
              ...(prekidaci.napomena !== undefined ? { noteEnabled: prekidaci.napomena } : {}),
            }),
          () => null,
        ),
      dodajVarijantu: (artikalId, naziv, cena) =>
        izvrsi(
          () => addVariant({ articleId: artikalId as Artikal, name: naziv, ...(cena !== null ? { priceRsd: cena } : {}) }),
          (r) => ({ id: r.variantId }),
        ),
      izmeniVarijantu: (varijantaId, ocekivano, izmena) =>
        izvrsi(
          () =>
            updateVariant({
              variantId: varijantaId as Varijanta,
              expected: {
                ...(ocekivano.naziv !== undefined ? { name: ocekivano.naziv } : {}),
                ...(ocekivano.cena !== undefined ? { priceRsd: ocekivano.cena } : {}),
              },
              patch: {
                ...(izmena.naziv !== undefined ? { name: izmena.naziv } : {}),
                ...(izmena.cena !== undefined ? { priceRsd: izmena.cena } : {}),
              },
            }),
          () => null,
        ),
      obrisiVarijantu: (varijantaId) => izvrsi(() => removeVariant({ variantId: varijantaId as Varijanta }), () => null),
      novaGrupa: (artikalId, unos, opcije) =>
        izvrsi(
          () =>
            createGroup({
              articleId: artikalId as Artikal,
              name: unos.naziv,
              selection: unos.izbor,
              required: unos.obavezna,
              ...(unos.min !== null ? { minSelect: unos.min } : {}),
              ...(unos.max !== null ? { maxSelect: unos.max } : {}),
              options: opcije.map((opcija) => ({ name: opcija.naziv, priceDeltaRsd: opcija.doplata })),
            }),
          (r) => ({ id: r.groupId }),
        ),
      postojeceGrupe: async () => {
        try {
          const r = await convex.query(api.menuArticleOptions.listAddonGroups, { menuServiceId });
          if (!r) return NEMA;
          return {
            ok: true,
            vrednost: r.map((grupa) => ({
              id: grupa.groupId,
              naziv: grupa.name,
              izbor: grupa.selection,
              obavezna: grupa.required,
              brojArtikala: grupa.linkCount,
            })),
          };
        } catch (error) {
          return izGreske(error);
        }
      },
      prikaciGrupu: (artikalId, grupaId) =>
        izvrsi(() => attachGroup({ articleId: artikalId as Artikal, groupId: grupaId as Grupa }), () => null),
      otkaciGrupu: (artikalId, grupaId) =>
        izvrsi(() => detachGroup({ articleId: artikalId as Artikal, groupId: grupaId as Grupa }), () => null),
      uticajGrupe: async (grupaId) => {
        try {
          const r = await convex.query(api.menuArticleOptions.addonGroupUsage, { groupId: grupaId as Grupa });
          if (!r) return NEMA;
          return {
            ok: true,
            vrednost: { artikli: r.articles.map((a) => ({ id: a.articleId, naziv: a.name })), ukupno: r.linkCount, skraceno: r.truncated },
          };
        } catch (error) {
          return izGreske(error);
        }
      },
      izmeniGrupu: (grupaId, ocekivano, izmena, samoZaArtikal) => {
        const polja = (unos: typeof izmena) => ({
          ...(unos.naziv !== undefined ? { name: unos.naziv } : {}),
          ...(unos.izbor !== undefined ? { selection: unos.izbor } : {}),
          ...(unos.obavezna !== undefined ? { required: unos.obavezna } : {}),
          ...(unos.min !== undefined ? { minSelect: unos.min } : {}),
          ...(unos.max !== undefined ? { maxSelect: unos.max } : {}),
        });
        return izvrsi(
          () =>
            updateGroup({
              groupId: grupaId as Grupa,
              expected: polja(ocekivano),
              patch: polja(izmena),
              ...(samoZaArtikal ? { onlyForArticleId: samoZaArtikal as Artikal } : {}),
            }),
          () => null,
        );
      },
      dodajOpciju: (grupaId, opcija, samoZaArtikal) =>
        izvrsi(
          () =>
            addOption({
              groupId: grupaId as Grupa,
              name: opcija.naziv,
              priceDeltaRsd: opcija.doplata,
              ...(samoZaArtikal ? { onlyForArticleId: samoZaArtikal as Artikal } : {}),
            }),
          () => null,
        ),
      izmeniOpciju: (opcijaId, ocekivano, izmena, samoZaArtikal) =>
        izvrsi(
          () =>
            updateOption({
              optionId: opcijaId as Opcija,
              expected: {
                ...(ocekivano.naziv !== undefined ? { name: ocekivano.naziv } : {}),
                ...(ocekivano.doplata !== undefined ? { priceDeltaRsd: ocekivano.doplata } : {}),
              },
              patch: {
                ...(izmena.naziv !== undefined ? { name: izmena.naziv } : {}),
                ...(izmena.doplata !== undefined ? { priceDeltaRsd: izmena.doplata } : {}),
              },
              ...(samoZaArtikal ? { onlyForArticleId: samoZaArtikal as Artikal } : {}),
            }),
          () => null,
        ),
      obrisiOpciju: (opcijaId, samoZaArtikal) =>
        izvrsi(
          () =>
            removeOption({ optionId: opcijaId as Opcija, ...(samoZaArtikal ? { onlyForArticleId: samoZaArtikal as Artikal } : {}) }),
          () => null,
        ),
      primeniGrupuNa: (grupaId, artikalIds) =>
        izvrsi(
          () => applyGroup({ groupId: grupaId as Grupa, articleIds: artikalIds as Artikal[] }),
          (r) => ({ dodato: r.attached, preskoceno: r.alreadyAttached + r.skippedAtLimit }),
        ),
      traziArtikle: async (upit) => {
        try {
          const r = await convex.query(api.menuStudio.searchArticles, { menuServiceId, query: upit });
          if (!r) return NEMA;
          return { ok: true, vrednost: r.map((a) => ({ artikalId: a.articleId, naziv: a.name, cena: a.basePriceRsd, vrsta: a.kind })) };
        } catch (error) {
          return izGreske(error);
        }
      },
      postaviAlergene: async (artikalId, ocekivano, alergeni) => {
        try {
          const r = await setAllergens({
            articleId: artikalId as Artikal,
            expected: alergeniZaServer(ocekivano),
            allergens: alergeniZaServer(alergeni),
          });
          const konflikt = kaoKonflikt(r, (current) => {
            const zapis = current.allergens as { contains: string[]; mayContain: string[]; otherText?: string } | null;
            return zapis ? { sadrzi: zapis.contains, tragovi: zapis.mayContain, drugo: zapis.otherText ?? null } : null;
          });
          return konflikt ?? { ok: true, vrednost: null };
        } catch (error) {
          return izGreske(error);
        }
      },
      postaviOznake: async (artikalId, ocekivano, oznake) => {
        try {
          const r = await setTags({ articleId: artikalId as Artikal, expected: ocekivano as never[], tags: oznake as never[] });
          return kaoKonflikt(r, (current) => current.tags) ?? { ok: true, vrednost: null };
        } catch (error) {
          return izGreske(error);
        }
      },
      postaviAkciju: async (artikalId, ocekivano, akcija) => {
        try {
          const r = await setPromo({ articleId: artikalId as Artikal, expected: ocekivano, promo: akcija });
          return kaoKonflikt(r, (current) => current.promo) ?? { ok: true, vrednost: null };
        } catch (error) {
          return izGreske(error);
        }
      },
      // K16 — combos (menuCombos).
      postaviSastav: (komboId, sastojci) =>
        izvrsi(
          () =>
            setComponents({
              comboArticleId: komboId as Artikal,
              components: sastojci.map((s) => ({ articleId: s.artikalId as Artikal, quantity: s.kolicina })),
            }),
          () => null,
        ),
      zadrziCenuKomboa: (komboId) => izvrsi(() => resolvePriceCheck({ comboArticleId: komboId as Artikal }), () => null),
      // K16 — translations (menuTranslations). Typed text is confirmed at once; the AI suggestion is only stored.
      prevedi: (cilj, jezik, polje, ocekivano, vrednost) =>
        izvrsi(
          () => setTranslation({ kind: cilj.vrsta, id: cilj.id, lang: jezik, field: polje, expected: ocekivano, value: vrednost }),
          () => null,
          "translation",
          vrednost,
        ),
      predloziPrevod: (cilj, jezik) => izvrsi(() => suggest({ kind: cilj.vrsta, id: cilj.id, lang: jezik }), (r) => ({ polja: r.fields })),
      potvrdiPredlog: (cilj, jezik, izmene) =>
        izvrsi(() => confirmSuggestion({ kind: cilj.vrsta, id: cilj.id, lang: jezik, edited: izmene }), () => null),
      odbaciPredlog: (cilj, jezik) => izvrsi(() => dropSuggestion({ kind: cilj.vrsta, id: cilj.id, lang: jezik }), () => null),
      prevodJeDobar: (cilj, jezik) => izvrsi(() => markReviewed({ kind: cilj.vrsta, id: cilj.id, lang: jezik }), () => null),
      // K16 — Room service (menuRoomService; Premium).
      rsPravila: (ocekivano, izmena) => {
        const polja = (p: typeof izmena) => ({
          ...(p.uvecanje !== undefined ? { markupPercent: p.uvecanje } : {}),
          ...(p.obuhvat !== undefined ? { markupScope: p.obuhvat } : {}),
          ...(p.naknada !== undefined ? { deliveryFeeRsd: p.naknada } : {}),
        });
        const kljucevi = Object.keys(izmena) as (keyof typeof izmena)[];
        const ocekivanoSamo = Object.fromEntries(kljucevi.map((k) => [k, ocekivano[k] ?? null])) as typeof izmena;
        return izvrsi(() => rsSettings({ menuServiceId, expected: polja(ocekivanoSamo), patch: polja(izmena) }), () => null);
      },
      rsDodajKategoriju: (naziv) => izvrsi(() => rsAddCategory({ menuServiceId, name: naziv }), (r) => ({ id: r.categoryId })),
      rsPreimenujKategoriju: (id, naziv, ocekivano) =>
        izvrsi(() => rsRenameCategory({ categoryId: id as RsKategorija, name: naziv, expectedName: ocekivano }), () => null, "name", naziv),
      rsPremestiKategoriju: (id, naIndeks) => izvrsi(() => rsMoveCategory({ categoryId: id as RsKategorija, toIndex: naIndeks }), () => null),
      rsObrisiKategoriju: (id) => izvrsi(() => rsRemoveCategory({ categoryId: id as RsKategorija }), () => null),
      rsPreuzmiCeoMeni: () =>
        izvrsi(
          () => rsImport({ menuServiceId }),
          (r) => ({ kategorija: r.categoriesCreated, artikala: r.itemsAdded, vecU: r.alreadyIn }),
        ),
      rsDodajArtikle: (kategorijaId, artikalIds) =>
        izvrsi(
          () => rsAddItems({ categoryId: kategorijaId as RsKategorija, articleIds: artikalIds as Artikal[] }),
          (r) => ({ dodato: r.added, vecU: r.alreadyIn }),
        ),
      rsUkloni: (stavkaId) => izvrsi(() => rsRemoveItem({ itemId: stavkaId as RsStavka }), () => null),
      rsPremestiStavku: (stavkaId, uKategoriju, preStavke) =>
        izvrsi(
          () =>
            rsMoveItem({
              itemId: stavkaId as RsStavka,
              toCategoryId: uKategoriju as RsKategorija,
              ...(preStavke ? { beforeItemId: preStavke as RsStavka } : {}),
            }),
          () => null,
        ),
      rsUvecanje: (stavkaIds, primeni) =>
        izvrsi(() => rsMarkup({ menuServiceId, itemIds: stavkaIds as RsStavka[], markupApplies: primeni }), () => null),
      rsRucnaCena: (stavkaId, ocekivana, nova) =>
        izvrsi(
          () => rsManual({ itemId: stavkaId as RsStavka, expectedManualPriceRsd: ocekivana, manualPriceRsd: nova }),
          () => null,
          "manualPriceRsd",
          nova,
        ),
      rsResiUpozorenje: (stavkaId, akcija) => izvrsi(() => rsResolve({ itemId: stavkaId as RsStavka, action: akcija }), () => null),
      // K17 — Izgled (draft).
      postaviIzgled: async (ocekivano, izmena) => {
        const ishod = await izvrsi(() => postaviIzgled({ menuServiceId, expected: ocekivano, patch: izmena }), (r) => r);
        if (!ishod.ok) return ishod;
        const rezultat = ishod.vrednost;
        // A conflict: the whole group as saved meanwhile (the queue holds Izgled by group, as JSON text).
        if (rezultat.ok === false) {
          return { ok: false, vrsta: "konflikt", sacuvano: izgledKaoTekst(izmenaIzCas(rezultat.current)), pokusano: izgledKaoTekst(izmena) };
        }
        return ISHOD_OK;
      },
    };
  }, [
    menuServiceId,
    convex,
    addPage,
    renamePage,
    duplicatePage,
    movePage,
    archivePage,
    restorePage,
    removePage,
    addSection,
    renameSection,
    removeSection,
    quickAdd,
    quickAddMany,
    addPlacement,
    createCombo,
    setBasePrice,
    publish,
    movePlacement,
    moveSection,
    bulkAvailability,
    bulkVisibility,
    bulkRemove,
    bulkMove,
    bulkAdd,
    bulkPrices,
    bulkDelete,
    updateFields,
    setMedia,
    reserveUpload,
    setSwitches,
    addVariant,
    updateVariant,
    removeVariant,
    createGroup,
    attachGroup,
    detachGroup,
    updateGroup,
    addOption,
    updateOption,
    removeOption,
    applyGroup,
    setAllergens,
    setTags,
    setPromo,
    setComponents,
    resolvePriceCheck,
    setTranslation,
    confirmSuggestion,
    dropSuggestion,
    markReviewed,
    suggest,
    rsSettings,
    rsAddCategory,
    rsRenameCategory,
    rsMoveCategory,
    rsRemoveCategory,
    rsImport,
    rsAddItems,
    rsRemoveItem,
    rsMoveItem,
    rsMarkup,
    rsManual,
    rsResolve,
    postaviIzgled,
  ]);

  const kontekstEditora = useMemo<StudioKontekst | null>(() => {
    if (!kontekst) return null;
    const dozvole = new Set<string>(kontekst.permissions);
    return {
      lokal: kontekst.business.name,
      slug: kontekst.business.slug,
      rezim: kontekst.mode,
      actor: kontekst.actor,
      mozeUredjivanje: kontekst.canEdit && dozvole.has("menu.edit"),
      mozeObjavu: kontekst.canEdit && dozvole.has("menu.publish"),
      mozeDostupnost: dozvole.has("menu.availability"),
      plan: kontekst.capabilities.tier,
      roomService: kontekst.capabilities.roomService && kontekst.features.roomService,
    };
  }, [kontekst]);

  const straniceEditora = useMemo<StudioStranica[] | undefined>(
    () =>
      stranice?.map((page) => ({
        id: page.pageId,
        key: page.key,
        slug: page.slug,
        naziv: page.name,
        podrazumevana: page.isDefault,
        arhivirana: page.archived,
        sakrivena: page.visibility === "hidden",
        imaQr: page.hasQr,
        brojPrikaza: page.placementCount,
      })),
    [stranice],
  );

  const sadrzajEditora = useMemo<StudioRadniSadrzaj | null | undefined>(() => {
    if (sadrzaj === undefined) return undefined;
    if (sadrzaj === null) return null;
    return {
      stranica: {
        id: sadrzaj.page.pageId,
        key: sadrzaj.page.key,
        naziv: sadrzaj.page.name,
        podrazumevana: sadrzaj.page.isDefault,
        arhivirana: sadrzaj.page.archived,
      },
      sekcije: sadrzaj.sections.map((section) => ({
        id: section.sectionId,
        key: section.key,
        naziv: section.name,
        redosled: section.order,
        redovi: section.placements.map((placement) => ({
          prikazId: placement.placementId,
          redosled: placement.order,
          sakriven: placement.visibility === "hidden",
          artikal: {
            id: placement.article.articleId,
            key: placement.article.key,
            vrsta: placement.article.kind,
            naziv: placement.article.name,
            opis: placement.article.description,
            cena: placement.article.basePriceRsd,
            kolicina: placement.article.quantityValue,
            jedinica: placement.article.quantityUnit,
            medij: placement.article.mediaMode,
            ikonica: placement.article.iconKey,
            varijante: placement.article.variantsEnabled,
            proveriCenu: placement.article.priceCheck,
          },
        })),
      })),
      skraceno: sadrzaj.truncated,
    };
  }, [sadrzaj]);

  const statusEditora = useMemo<StudioStatusNacrta | undefined>(
    () =>
      status
        ? { stanje: status.state, objavljenaVerzija: status.liveVersionNumber, objavljenoU: status.livePublishedAt }
        : undefined,
    [status],
  );

  const detaljEditora = useMemo<StudioDetaljArtikla | null | undefined>(() => {
    if (!detalj) return detalj;
    const a = detalj.article;
    return {
      artikal: {
        id: a.articleId,
        key: a.key,
        vrsta: a.kind,
        naziv: a.name,
        opis: a.description,
        cena: a.basePriceRsd,
        kolicina: a.quantityValue,
        jedinica: a.quantityUnit,
        medij: a.mediaMode,
        ikonica: a.iconKey,
        varijante: a.variantsEnabled,
        proveriCenu: a.priceCheck,
      },
      slika: detalj.image ? { id: detalj.image.mediaId, url: detalj.image.url } : null,
      ukljuceno: { varijante: a.variantsEnabled, dodaci: a.addonsEnabled, napomena: a.noteEnabled },
      varijante: detalj.variants.map((v) => ({ id: v.variantId, key: v.key, naziv: v.name, cena: v.priceRsd })),
      grupe: detalj.addonGroups.map((g) => ({
        id: g.groupId,
        key: g.key,
        naziv: g.name,
        izbor: g.selection,
        obavezna: g.required,
        min: g.minSelect,
        max: g.maxSelect,
        brojArtikala: g.linkCount,
        opcije: g.options.map((o) => ({ id: o.optionId, key: o.key, naziv: o.name, doplata: o.priceDeltaRsd })),
      })),
      alergeniUkljuceni: detalj.allergensEnabled,
      alergeni: a.allergens ? { sadrzi: a.allergens.contains, tragovi: a.allergens.mayContain, drugo: a.allergens.otherText } : null,
      oznake: a.tags,
      akcija: a.promo,
      kombo: detalj.combo
        ? {
            sastojci: detalj.combo.components.map((c) => ({ artikalId: c.articleId, key: c.key, naziv: c.name, kolicina: c.quantity, cena: c.unitPriceRsd })),
            proveri: detalj.combo.priceCheck
              ? { od: detalj.combo.priceCheck.since, promenjeni: detalj.combo.priceCheck.changedNames, uklonjeni: detalj.combo.priceCheck.removedNames }
              : null,
          }
        : null,
      prevodi: [
        {
          vrsta: "article" as const,
          id: a.articleId,
          key: a.key,
          izvor: { name: a.name, description: a.description },
          prevodi: (a.translations ?? null) as MenuTranslations | null,
          grupa: { vrsta: "sekcija" as const, naziv: null },
          pripada: null,
        },
        ...(a.variantsEnabled
          ? detalj.variants.map((v) => ({
              vrsta: "variant" as const,
              id: v.variantId,
              key: v.key,
              izvor: { name: v.name },
              prevodi: (v.translations ?? null) as MenuTranslations | null,
              grupa: { vrsta: "sekcija" as const, naziv: null },
              pripada: a.name,
            }))
          : []),
      ],
      prikazi: detalj.placements.map((p) => ({
        prikazId: p.placementId,
        stranicaId: p.pageId,
        stranica: p.pageName,
        podrazumevana: p.pageIsDefault,
        arhivirana: p.pageArchived,
        sekcijaId: p.sectionId,
        sekcija: p.sectionName,
        sakriven: p.visibility === "hidden",
      })),
    };
  }, [detalj]);

  const jeziciEditora = useMemo<StudioJezici | undefined>(
    () =>
      jezici
        ? {
            izvorni: jezici.source,
            prevodi: jezici.translations,
            vanLimita: jezici.overLimit,
            max: jezici.maxLanguages,
            ai: { dostupno: jezici.ai.available, razlog: jezici.ai.reason === "key" ? "kljuc" : jezici.ai.reason },
          }
        : undefined,
    [jezici],
  );

  const prevodiEditora = useMemo<StudioPrevodiPogled | null | undefined>(() => {
    if (!prevodi) return prevodi;
    return {
      obuhvat: pogled.prevodi === "room-service" ? "room-service" : "stranica",
      naslov: prevodi.title ?? "",
      stavke: prevodi.items.map((item) => ({ ...item, prevodi: item.prevodi as MenuTranslations | null })),
      skraceno: prevodi.truncated,
    };
  }, [prevodi, pogled.prevodi]);

  const roomServiceEditora = useMemo<StudioRoomService | null | undefined>(() => {
    if (!roomService) return roomService;
    return {
      pravila: {
        uvecanje: roomService.settings.markupPercent,
        obuhvat: roomService.settings.markupScope,
        naknada: roomService.settings.deliveryFeeRsd,
      },
      kategorije: roomService.categories.map((k) => ({
        id: k.categoryId,
        key: k.key,
        naziv: k.name,
        redovi: k.items.map((item) => ({
          stavkaId: item.itemId,
          artikalId: item.article.articleId,
          artikalKey: item.article.key,
          naziv: item.article.name,
          osnovna: item.basePriceRsd,
          uvecanje: item.markupApplies,
          rucna: item.manualPriceRsd,
          cena: item.priceRsd,
          poreklo: item.origin,
          upozorenje: item.warning
            ? {
                stavkaId: item.itemId,
                naziv: item.article.name,
                staraOsnovna: item.warning.oldBaseRsd,
                novaOsnovna: item.warning.newBaseRsd,
                rsCena: item.warning.roomServicePriceRsd,
                izracunata: item.warning.recomputedPriceRsd,
              }
            : null,
          varijante: item.variants.map((v) => ({ key: v.key, naziv: v.name, cena: v.priceRsd, poreklo: v.origin })),
        })),
      })),
      vanRs: roomService.notInRoomService,
      skraceno: roomService.truncated,
    };
  }, [roomService]);

  const izgledEditora = useMemo(
    () => (izgled ? { vrednosti: izgled.values, plan: izgled.plan } : izgled),
    [izgled],
  );

  const nedostupniSet = useMemo(() => new Set(nedostupni?.map((row) => row.articleKey) ?? []), [nedostupni]);

  if (kontekst === undefined) return { stanje: "ucitava" };
  if (kontekst === null || !kontekstEditora || !radnje || !menuServiceId) return { stanje: "nema" };
  return {
    stanje: "spremno",
    menuServiceId,
    radnje,
    podaci: {
      kontekst: kontekstEditora,
      stranice: straniceEditora,
      sadrzaj: pageId ? sadrzajEditora : stranice === undefined ? undefined : null,
      status: statusEditora,
      nedostupni: nedostupniSet,
      povezano: !veza.hasEverConnected || veza.isWebSocketConnected,
      detalj: otvorenArtikal ? detaljEditora : undefined,
      jezici: jeziciEditora,
      prevodi: pogled.prevodi ? prevodiEditora : undefined,
      roomServicePodaci: pogled.roomService ? roomServiceEditora : undefined,
      izgled: izgledEditora,
    },
  };
}
