// K21 render tests: the guest's side of the public menu (components/menu/gost)
// over the izlog fixtures, which go through the REAL publish path
// (fixtureMenu -> compileSnapshot -> parsePublicPage), and over hand-made
// objects for the cases the fixtures do not cover. Server markup only
// (renderToStaticMarkup, no DOM): a <dialog> sheet renders with its content,
// effects do not run, and useSyncExternalStore answers with its server
// snapshot (the phone is "online", the stored cart is not read). Texts come
// from the dictionaries; the Serbian literals here are the sentences the
// owner's brief names (kept literal on purpose, so a dictionary edit that
// changes a promised sentence fails loudly). Invented data only.

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { IZLOG_SADA } from "@/components/menu/fixtures";
import { fixtureKorpaSobe, fixtureKorpaStola, fixtureMojiZahtevi } from "@/components/menu/fixtures/gost";
import { javniIzlog, javniRoomServiceIzlog, type JavniIzlogPrikaz } from "@/components/menu/fixtures/javni";
import type { IzlogMemorija } from "@/components/menu/izlog/gost-memorija";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { DetaljSadrzaj } from "@/components/menu/javni/detalj";
import { JavniMeni } from "@/components/menu/javni/javni-meni";
import { JavniMeniUzivo } from "@/components/menu/javni/javni-meni-uzivo";
import { formatRsd } from "@/components/menu/menu-view";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { cartCount, isOrderAttemptKey, orderFingerprint, orderLinesOf, orderTotals } from "@/lib/menu/cart";
import { REQUEST_ERROR } from "@/lib/menu/errors/requests";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { MENU_MAX_CART_QUANTITY, MENU_TEXT } from "@/lib/menu/limits";
import type { MenuRequestStatus } from "@/lib/menu/request-status";
import { roomServiceSections } from "@/lib/menu/room-service-view";
import type { PublicAddonGroup, PublicArticle } from "@/lib/menu/snapshot";
import { DodajUKorpu } from "./dodaj-u-korpu";
import { GostPanel } from "./gost-panel";
import type { GostKontekst, GostRadnje, GostZahtev } from "./model";
import { MojiZahtevi, skoriZahtevi } from "./moji-zahtevi";
import { porukaGreske, satBeograd, StatusZahteva } from "./stanje-zahteva";
import { kljucSlanja, zavrsiSlanje } from "./use-korpa";

// The global stubs (harness/vitest-stubs) keep only src/alt/size/className of an
// image and only href/className of a link. The tests need the other props
// (`data-moji-link`, `data-radnja`, `loading`), so these two mocks pass them through.
vi.mock("next/image", () => ({
  default: (props: ComponentProps<"img">) =>
    createElement("img", {
      src: props.src,
      alt: props.alt,
      width: props.width,
      height: props.height,
      sizes: props.sizes,
      className: props.className,
      loading: props.loading,
    }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));
// JavniMeniUzivo (the live wrapper) needs a Convex client, the router and next/dynamic;
// the guest chunk it would load lazily renders nothing here.
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => null }));

const t = menuGostSr;
const j = menuJavniSr;
const d = menuDomenSr;

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in javni.test.tsx)
// -----------------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;
const bezTagova = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();
/** What a guest could read: no tags, no styles, one line. */
const tekst = (html: string) => unesc(bezTagova(html.replace(/<style[\s\S]*?<\/style>/g, ""))).replace(/\s+/g, " ");

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The text of every <h{nivo}>. */
function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => tekst(match[1]));
}

/** The sheet (<dialog data-gost-list="…">) of the guest. */
function list(html: string, oznaka: string): string {
  const dijalog = new RegExp(`<dialog\\b[^>]*\\sdata-gost-list="${oznaka}"[^>]*>[\\s\\S]*?</dialog>`).exec(html)?.[0];
  if (!dijalog) throw new Error(`no guest sheet "${oznaka}" in the markup`);
  return dijalog;
}

/** The article detail <dialog> of an open article. */
function dijalogDetalja(html: string): string {
  const dijalog = /<dialog\b[^>]*\sdata-detalj="[^"]*"[^>]*>[\s\S]*?<\/dialog>/.exec(html)?.[0];
  if (!dijalog) throw new Error("no article detail <dialog> in the markup");
  return dijalog;
}

/** The bar fixed to the bottom. */
function traka(html: string): string {
  const bar = /<section\b[^>]*\sdata-traka-gosta=""[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0];
  if (!bar) throw new Error("no guest bar in the markup");
  return bar;
}

type Radnja = { tag: string; tekst: string; iskljucena: boolean };

/** The buttons and links of the bar by their `data-radnja`. */
function radnjeBara(html: string): Record<string, Radnja> {
  const out: Record<string, Radnja> = {};
  for (const match of html.matchAll(/<(button|a)\b([^>]*\sdata-radnja="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g)) {
    out[match[3]] = { tag: `<${match[1]}${match[2]}>`, tekst: tekst(match[4]), iskljucena: /\sdisabled=""/.test(match[2]) };
  }
  return out;
}

/** The "Moji zahtevi" link of the bar. */
function mojiLink(html: string): { href: string | undefined; tekst: string } {
  const match = /<a\b([^>]*\sdata-moji-link=""[^>]*)>([\s\S]*?)<\/a>/.exec(html);
  if (!match) throw new Error("no Moji zahtevi link in the markup");
  return { href: attr(`<a${match[1]}>`, "href"), tekst: tekst(match[2]) };
}

/** The first button with this data attribute (`data-posalji`, or `data-nacin` whatever its value). */
function dugme(html: string, oznaka: string): { tekst: string; iskljuceno: boolean; tag: string } | null {
  const match = new RegExp(`<button\\b([^>]*\\s${oznaka}(?:="[^"]*")?[^>]*)>([\\s\\S]*?)</button>`).exec(html);
  return match ? { tekst: tekst(match[2]), iskljuceno: /\sdisabled=""/.test(match[1]), tag: `<button${match[1]}>` } : null;
}

/** The opening tag of the button with this `aria-label` (the quantity and remove buttons name their article). */
function dugmeSaOznakom(html: string, oznaka: string): { tag: string; iskljuceno: boolean } | null {
  const pozicija = html.indexOf(`aria-label="${oznaka}"`);
  if (pozicija < 0) return null;
  const tag = html.slice(html.lastIndexOf("<button", pozicija), html.indexOf(">", pozicija) + 1);
  return { tag, iskljuceno: /\sdisabled=""/.test(tag) };
}

const ukupno = (html: string): number | null => {
  const vrednost = /\sdata-ukupno="(\d+)"/.exec(html)?.[1];
  return vrednost === undefined ? null : Number(vrednost);
};

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

type Over = Record<string, string>;
type StranicaPrikaz = Extract<JavniIzlogPrikaz, { vrsta: "stranica" }>;

const kes = new Map<string, string>();
/** The public izlog for these address parameters (rendered once per address). */
function izlog(over: Over): string {
  const kljuc = JSON.stringify(over);
  let html = kes.get(kljuc);
  if (html === undefined) {
    html = renderToStaticMarkup(<JavniIzlog params={parsePublicPreview(over)} />);
    kes.set(kljuc, html);
  }
  return html;
}

function stranica(over: Over = {}): StranicaPrikaz {
  const prikaz = javniIzlog(parsePublicPreview(over));
  if (prikaz.vrsta !== "stranica") throw new Error(`expected a menu page for ${JSON.stringify(over)}`);
  return prikaz;
}

// "Demo restoran": the standard pages, a table.
const STO = stranica({});
const STO_LINIJE = fixtureKorpaStola(STO.view.sekcije, STO.view.stranica.key);
const STO_UKUPNO = STO_LINIJE.reduce((zbir, linija) => zbir + linija.pieceRsd * linija.quantity, 0);
const STO_ARTIKLI = new Map<string, PublicArticle>(
  STO.view.sekcije.flatMap((sekcija) => sekcija.articles.map((article) => [article.key, article] as const)),
);

// "Hotel Primer": Room service, a room.
const RS = javniRoomServiceIzlog(parsePublicPreview({ pozicija: "soba" }));
const RS_SEKCIJE = roomServiceSections(RS.doc);
const SOBA_LINIJE = fixtureKorpaSobe(RS_SEKCIJE);
const SOBA_STAVKE = SOBA_LINIJE.reduce((zbir, linija) => zbir + linija.pieceRsd * linija.quantity, 0);
const RS_ARTIKLI = new Map<string, PublicArticle>(
  RS_SEKCIJE.flatMap((sekcija) => sekcija.articles.map((article) => [article.key, article] as const)),
);
const DOSTAVA = RS.doc.deliveryFeeRsd ?? 0;

function kontekstStola(over: Partial<GostKontekst> = {}): GostKontekst {
  return {
    slug: STO.view.lokal.slug,
    pozicija: { naziv: "Sto 12", vrsta: "table" },
    radnje: { call: true, bill: true, order: true, roomService: false },
    kanal: "standard",
    pageKey: STO.view.stranica.key,
    dostavaRsd: null,
    linkovi: { meni: "/demo-restoran/meni", mojiZahtevi: "/demo-restoran/meni/zahtevi", roomService: null },
    ...over,
  };
}

function kontekstSobe(over: Partial<GostKontekst> = {}): GostKontekst {
  return {
    slug: RS.lokal.slug,
    pozicija: { naziv: "Soba 204", vrsta: "room" },
    radnje: { call: false, bill: false, order: false, roomService: true },
    kanal: "room_service",
    pageKey: null,
    dostavaRsd: RS.doc.deliveryFeeRsd,
    linkovi: { meni: "/demo-hotel/meni", mojiZahtevi: "/demo-hotel/meni/zahtevi", roomService: null },
    ...over,
  };
}

// Rendering must never send anything: every action throws if it is ever called.
const RADNJE: GostRadnje = {
  pozovi: vi.fn(async () => {
    throw new Error("rendering must not send a call");
  }),
  racun: vi.fn(async () => {
    throw new Error("rendering must not send a bill");
  }),
  posalji: vi.fn(async () => {
    throw new Error("rendering must not send an order");
  }),
  otkazi: vi.fn(async () => {
    throw new Error("rendering must not cancel");
  }),
};

function panel(over: Partial<ComponentProps<typeof GostPanel>> = {}): string {
  return renderToStaticMarkup(
    <GostPanel kontekst={kontekstStola()} radnje={RADNJE} zahtevi={[]} nedostupni={[]} cuvaj={false} {...over} />,
  );
}

function zahtev(over: Partial<GostZahtev> = {}): GostZahtev {
  return {
    id: "rq_probni",
    kind: "call",
    status: "new",
    channel: "standard",
    positionLabel: "Sto 12",
    paymentPreference: null,
    subtotalRsd: null,
    deliveryFeeRsd: null,
    totalRsd: null,
    createdAt: IZLOG_SADA - 60_000,
    acceptedAt: null,
    doneAt: null,
    cancelledAt: null,
    cancelledBy: null,
    items: [],
    ...over,
  };
}

function clanak(over: Partial<PublicArticle> = {}): PublicArticle {
  return {
    key: "ar_probni",
    kind: "item",
    name: "Probno jelo",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: 1040,
    variants: [],
    addonGroups: [],
    noteEnabled: false,
    media: { mode: "none", imageMediaId: null, iconKey: null },
    allergens: null,
    tags: [],
    promo: null,
    combo: null,
    ...over,
  };
}

function grupa(over: Partial<PublicAddonGroup> = {}): PublicAddonGroup {
  return {
    key: "ag_obavezna",
    name: "Obavezna grupa",
    selection: "single",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { key: "ao_a", name: "Opcija A", priceDeltaRsd: 0 },
      { key: "ao_b", name: "Opcija B", priceDeltaRsd: 60 },
    ],
    ...over,
  };
}

const VARIJANTE = [
  { key: "va_mala", name: "Mala porcija", priceRsd: 500 },
  { key: "va_velika", name: "Velika porcija", priceRsd: 700 },
];

function dodaj(article: PublicArticle, over: Partial<ComponentProps<typeof DodajUKorpu>> = {}): string {
  return renderToStaticMarkup(
    <DodajUKorpu
      article={article}
      slug="demo-restoran"
      kanal="standard"
      pageKey="pg_probna"
      sadaMs={IZLOG_SADA}
      nedostupan={false}
      cuvaj={false}
      onDodato={() => undefined}
      {...over}
    />,
  );
}

function meni(extra: Partial<ComponentProps<typeof JavniMeni>> = {}, prikaz: StranicaPrikaz = STO): string {
  return renderToStaticMarkup(
    <JavniMeni
      view={prikaz.view}
      izgled={javniIzgled(prikaz.presentation)}
      slike={prikaz.slike}
      sadaMs={prikaz.sadaMs}
      nedostupni={prikaz.nedostupni}
      cuvaj={false}
      {...extra}
    />,
  );
}

// -----------------------------------------------------------------------------
// A. Without a position there are no guest actions
// -----------------------------------------------------------------------------

describe("a plain menu link (no position)", () => {
  test("the izlog menu has no bar, no call, no cart and no ordering in the detail", () => {
    const html = izlog({ primer: "restoran" });
    expect(html).not.toContain("data-traka-gosta");
    expect(html).not.toContain("data-radnja");
    expect(html).not.toContain("data-poruci");
    expect(html).not.toContain("data-gost-list");
    expect(html).not.toContain("data-moji-link");
    expect(tekst(html)).not.toContain("Pozovi konobara");
    expect(tekst(html)).not.toContain("Korpa");
    expect(tekst(html)).not.toContain(t.traka.mojiZahtevi);
  });

  test("with the detail open it only informs: the variants and add-ons are lists, nothing can be ordered", () => {
    const html = izlog({ primer: "restoran", layout: "tok", detalj: "1" });
    const dijalog = dijalogDetalja(html);
    expect(dijalog).not.toContain("data-poruci");
    expect(dijalog).not.toContain("data-dodaj");
    const podnaslovi = naslovi(dijalog, 3);
    expect(podnaslovi.some((naslov) => naslov === j.detalj.dodaci || naslov === j.detalj.varijante)).toBe(true);
    expect(podnaslovi).not.toContain(t.dodaj.naslov);
  });

  test("JavniMeni without radnjeGosta and dodajUKorpu renders no bar", () => {
    const html = meni();
    expect(html).not.toContain("data-traka-gosta");
    expect(html).not.toContain("data-radnja");
    const sDetaljem = meni({ pocetniDetalj: stranica({ detalj: "1" }).pocetniDetalj });
    expect(dijalogDetalja(sDetaljem)).not.toContain("data-poruci");
  });

  test("JavniMeniUzivo for a guest without a position is the same plain menu", () => {
    const html = renderToStaticMarkup(
      <JavniMeniUzivo
        view={STO.view}
        izgled={javniIzgled(STO.presentation)}
        slike={STO.slike}
        sadaMs={STO.sadaMs}
        uzivo={{ versionNumber: 3, unavailableKeys: [] }}
        cuvaj={false}
      />,
    );
    expect(html).toContain("data-javni-meni");
    expect(html).not.toContain("data-traka-gosta");
    expect(html).not.toContain("data-radnja");
    expect(html).not.toContain("data-poruci");
  });

  test("the bar and the ordering reach JavniMeni only as slots, and the editor preview never shows them", () => {
    const sBarom = meni({ radnjeGosta: <p data-proba-bar="">probna traka</p> });
    expect(count(sBarom, "data-proba-bar")).toBe(1);
    expect(count(meni({ radnjeGosta: <p data-proba-bar="">probna traka</p>, ugradjen: true }), "data-proba-bar")).toBe(0);

    const detalj = stranica({ detalj: "1" });
    const primljeno: string[] = [];
    const sPorucivanjem = meni(
      {
        pocetniDetalj: detalj.pocetniDetalj,
        dodajUKorpu: ({ article, nedostupan }) => {
          primljeno.push(`${article.key}:${nedostupan}`);
          return <p data-proba-poruci="">probno poručivanje</p>;
        },
      },
      detalj,
    );
    expect(count(dijalogDetalja(sPorucivanjem), "data-proba-poruci")).toBe(1);
    expect(primljeno).toEqual([`${detalj.pocetniDetalj}:false`]);

    // In the editor preview the detail does not open at all.
    expect(meni({ ugradjen: true, pocetniDetalj: detalj.pocetniDetalj, dodajUKorpu: () => <p data-proba-poruci="" /> }, detalj)).not.toContain(
      "data-proba-poruci",
    );
  });

  test("the Room service note is a slot above the menu", () => {
    expect(count(meni({ napomena: <p data-proba-napomena="">probna napomena</p> }), "data-proba-napomena")).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// B. A table and a room
// -----------------------------------------------------------------------------

describe("a table card (pozicija=sto)", () => {
  const html = izlog({ pozicija: "sto" });

  test("the bar shows the place and the three actions, all enabled", () => {
    expect(count(html, "data-traka-gosta")).toBe(1);
    const bar = traka(html);
    expect(tekst(bar)).toContain("Sto 12");
    expect(tekst(bar)).toContain(fmt(t.traka.mesto, { mesto: "Sto 12" }));

    const radnje = radnjeBara(bar);
    expect(Object.keys(radnje).sort()).toEqual(["korpa", "poziv", "racun"]);
    expect(radnje.poziv.tekst).toBe("Pozovi konobara");
    expect(radnje.racun.tekst).toBe("Račun");
    expect(radnje.korpa.tekst).toContain("Korpa");
    expect(radnje.poziv.tekst).toBe(t.traka.pozovi);
    expect(radnje.racun.tekst).toBe(t.traka.racun);
    for (const radnja of Object.values(radnje)) expect(radnja.iskljucena).toBe(false);
    expect(bar).not.toContain('data-radnja="room-service"');
  });

  test("the cart button names its count for a screen reader", () => {
    const korpa = radnjeBara(traka(html)).korpa;
    expect(attr(korpa.tag, "aria-label")).toBe(fmt(t.traka.korpaCitac[srPluralCategory(0)], { n: 0 }));
    expect(attr(korpa.tag, "aria-haspopup")).toBe("dialog");
  });

  test("Moji zahtevi links to the izlog with moji-zahtevi=1 and shows how many requests are open", () => {
    const link = mojiLink(html);
    expect(link.href).toBe("/dev/menu-public-preview?pozicija=sto&moji-zahtevi=1");
    const adresa = new URL(link.href as string, "https://izlog.test");
    expect(parsePublicPreview(Object.fromEntries(adresa.searchParams))).toMatchObject({ pozicija: "sto", mojiZahtevi: true });
    // The fixture requests: Novi and Prihvaćen are open, Završen and Otkazan are not.
    const otvoreni = fixtureMojiZahtevi(STO_LINIJE).filter((row) => row.status === "new" || row.status === "accepted").length;
    expect(otvoreni).toBe(2);
    expect(link.tekst).toContain(t.traka.mojiZahtevi);
    expect(link.tekst).toContain(fmt(t.traka.otvoreni[srPluralCategory(otvoreni)], { n: otvoreni }));
    expect(link.tekst).toContain("2 otvorena zahteva");
  });

  test("no sheet is open and nothing was sent", () => {
    expect(html).not.toContain("data-gost-list");
    expect(html).not.toContain("data-potvrda");
    expect(html).not.toContain("data-vrsta=");
    expect(tekst(traka(html))).not.toContain(t.traka.bezVeze);
    expect(RADNJE.pozovi).not.toHaveBeenCalled();
  });
});

describe("a room card (pozicija=soba)", () => {
  const html = izlog({ pozicija: "soba" });

  test("the bar has only the cart: no call, no bill", () => {
    const bar = traka(html);
    expect(tekst(bar)).toContain(fmt(t.traka.mesto, { mesto: "Soba 204" }));
    const radnje = radnjeBara(bar);
    expect(Object.keys(radnje)).toEqual(["korpa"]);
    expect(radnje.korpa.iskljucena).toBe(false);
    expect(bar).not.toContain('data-radnja="poziv"');
    expect(bar).not.toContain('data-radnja="racun"');
    expect(tekst(bar)).not.toContain("Pozovi konobara");
    expect(mojiLink(html).href).toBe("/dev/menu-public-preview?pozicija=soba&moji-zahtevi=1");
  });

  test("the Room service note: Room service prices, the delivery fee once, and the heading", () => {
    expect(count(html, "data-rs-napomena")).toBe(1);
    expect(naslovi(html, 2)).toContain("Room service");
    const napomena = tekst(/<div\b[^>]*\sdata-rs-napomena=""[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? "");
    expect(napomena).toContain("Dostava do sobe: 300 RSD");
    expect(napomena).toContain(fmt(t.roomService.dostava, { iznos: formatRsd(DOSTAVA) }));
    expect(napomena).toContain(t.roomService.cene);
    expect(DOSTAVA).toBe(300);
    // This guest is in the room: no "order from your room" hint.
    expect(napomena).not.toContain(t.roomService.izSobe);
  });

  test("the menu shows the Room service sections, with no promotion of the standard menu", () => {
    for (const sekcija of RS_SEKCIJE) expect(tekst(html)).toContain(sekcija.name);
    for (const article of RS_ARTIKLI.values()) expect(article.promo).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// C. GostPanel on its own
// -----------------------------------------------------------------------------

describe("GostPanel", () => {
  test("with every action off it renders nothing at all", () => {
    const nista = { call: false, bill: false, order: false, roomService: false };
    expect(panel({ kontekst: kontekstStola({ radnje: nista }) })).toBe("");
    expect(panel({ kontekst: kontekstSobe({ radnje: nista }) })).toBe("");
  });

  test("Room service switched on for a room whose page has no link renders nothing either", () => {
    expect(panel({ kontekst: kontekstSobe({ kanal: "standard", pageKey: "pg_glavna" }) })).toBe("");
  });

  test("a room on a standard page gets only the way to Room service", () => {
    const html = panel({
      kontekst: kontekstSobe({
        kanal: "standard",
        pageKey: "pg_glavna",
        linkovi: { meni: "/demo-hotel/meni", mojiZahtevi: "/demo-hotel/meni/zahtevi", roomService: "/demo-hotel/meni/room-service" },
      }),
    });
    const radnje = radnjeBara(traka(html));
    expect(Object.keys(radnje)).toEqual(["room-service"]);
    expect(radnje["room-service"].tekst).toBe(t.traka.roomService);
    expect(attr(radnje["room-service"].tag, "href")).toBe("/demo-hotel/meni/room-service");
    expect(html).not.toContain('data-radnja="korpa"');
    expect(html).not.toContain('data-radnja="poziv"');
    expect(html).not.toContain('data-radnja="racun"');
  });

  test("each action shows only when the venue turned it on", () => {
    const samoPoziv = radnjeBara(panel({ kontekst: kontekstStola({ radnje: { call: true, bill: false, order: false, roomService: false } }) }));
    expect(Object.keys(samoPoziv)).toEqual(["poziv"]);
    const racunIKorpa = radnjeBara(panel({ kontekst: kontekstStola({ radnje: { call: false, bill: true, order: true, roomService: false } }) }));
    expect(Object.keys(racunIKorpa).sort()).toEqual(["korpa", "racun"]);
  });

  test("the open requests are counted, and the list is the live one", () => {
    const otvoreniZahtevi = [zahtev({ id: "rq_1", kind: "call", status: "new" }), zahtev({ id: "rq_2", kind: "bill", status: "accepted" }), zahtev({ id: "rq_3", status: "done" })];
    const link = mojiLink(panel({ zahtevi: otvoreniZahtevi }));
    expect(link.tekst).toContain("2 otvorena zahteva");
    expect(link.tekst).not.toContain("otvoren zahtev");
    expect(mojiLink(panel({ zahtevi: [otvoreniZahtevi[2]] })).tekst).toBe(t.traka.mojiZahtevi);
    // Still loading: no count.
    expect(mojiLink(panel({ zahtevi: undefined })).tekst).toBe(t.traka.mojiZahtevi);
  });

  const potvrdaPoziva = (over: Partial<NonNullable<NonNullable<ComponentProps<typeof GostPanel>["pocetno"]>["traka"]>> = {}) =>
    traka(
      panel({
        pocetno: {
          traka: {
            vrsta: "call",
            requestId: "rq_probni",
            createdAt: IZLOG_SADA,
            status: "new",
            deduped: false,
            tudji: false,
            nacin: null,
            ...over,
          },
        },
      }),
    );

  test("a call that was already sent from ANOTHER phone says so and claims no status", () => {
    const poziv = potvrdaPoziva({ requestId: null, deduped: true, tudji: true });
    expect(tekst(poziv)).toContain("Poziv za Sto 12 je već poslat sa drugog telefona");
    expect(tekst(poziv)).toContain(fmt(t.potvrda.vecPoslatPozivDrugi, { mesto: "Sto 12" }));
    // That request is not followed live from this phone, so there is no status chip at all.
    expect(poziv).not.toContain("data-status");
    for (const rec of Object.values(d.requestStatuses)) expect(tekst(poziv)).not.toContain(rec);
    expect(poziv).toContain('data-potvrda="call"');

    const racun = potvrdaPoziva({ vrsta: "bill", requestId: null, deduped: true, tudji: true, nacin: "cash" });
    expect(tekst(racun)).toContain("Zahtev za račun za Sto 12 je već poslat sa drugog telefona");
    expect(racun).not.toContain("data-status");
  });

  test("a call that is this phone's own and already open says so, and its status is followed", () => {
    const poziv = potvrdaPoziva({ deduped: true, tudji: false, status: "accepted" });
    expect(tekst(poziv)).toContain(fmt(t.potvrda.vecPoslatPoziv, { mesto: "Sto 12" }));
    expect(tekst(poziv)).not.toContain("sa drugog telefona");
    expect(poziv).toContain('data-status="accepted"');
    expect(tekst(poziv)).toContain("Prihvaćen");
  });

  test("the live list wins over the status the answer carried (own requests only)", () => {
    const html = panel({
      pocetno: {
        traka: { vrsta: "call", requestId: "rq_zivo", createdAt: IZLOG_SADA, status: "new", deduped: false, tudji: false, nacin: null },
      },
      zahtevi: [zahtev({ id: "rq_zivo", kind: "call", status: "done" })],
    });
    expect(traka(html)).toContain('data-status="done"');
    expect(tekst(traka(html))).toContain("Završen");
  });

  test("a bill shows the way of paying the request carries", () => {
    expect(tekst(potvrdaPoziva({ vrsta: "bill", nacin: "cash" }))).toContain("Gotovina");
    expect(tekst(potvrdaPoziva({ vrsta: "bill", nacin: "cash" }))).not.toContain("Kartica");
    expect(tekst(potvrdaPoziva({ vrsta: "bill", nacin: "card" }))).toContain("Kartica");
    // A call has no way of paying.
    expect(tekst(potvrdaPoziva({ vrsta: "call", nacin: null }))).not.toMatch(/Gotovina|Kartica/);
  });

  test("the bill sheet: cash or card, each sends at once; nothing says it was sent", () => {
    const html = panel({ pocetno: { list: "racun" } });
    const racun = list(html, "racun");
    expect(naslovi(racun, 2)).toEqual(["Zatraži račun"]);
    expect(tekst(racun)).toContain(fmt(t.korpa.zaMesto, { mesto: "Sto 12" }));
    expect(tekst(racun)).toContain(fmt(t.racun.opis, { mesto: "Sto 12" }));
    expect(tekst(racun)).toContain("Konobar donosi račun za Sto 12.");
    expect(tekst(racun)).toContain("kod osoblja");
    const gotovina = dugme(racun, "data-nacin");
    expect(gotovina?.tekst).toBe("Gotovinom");
    expect(racun).toContain('data-nacin="card"');
    expect(tekst(racun)).toContain("Karticom");
    expect(racun).not.toMatch(/\sdisabled=""/);
    expect(html).not.toMatch(/poslat/i);
  });

  test("the bill sheet offline: both choices are disabled and the reason is said", () => {
    const racun = list(panel({ offline: true, pocetno: { list: "racun" } }), "racun");
    expect(count(racun, 'disabled=""')).toBe(2);
    expect(tekst(racun)).toContain(t.traka.bezVeze);
  });
});

// -----------------------------------------------------------------------------
// D. The cart
// -----------------------------------------------------------------------------

describe("the cart of a table", () => {
  test("the fixture really has a few lines to show", () => {
    expect(STO_LINIJE.length).toBeGreaterThanOrEqual(3);
    expect(STO_LINIJE.some((linija) => linija.variantName)).toBe(true);
    expect(STO_LINIJE.some((linija) => linija.addonNames.length > 0)).toBe(true);
    expect(STO_LINIJE.some((linija) => linija.note)).toBe(true);
    expect(STO_UKUPNO).toBe(orderTotals(STO_LINIJE, "standard", null).totalRsd);
  });

  const html = panel({ pocetno: { list: "korpa", linije: STO_LINIJE } });
  const korpa = list(html, "korpa");

  test("every line with its name, details and sum, and the total", () => {
    expect(naslovi(korpa, 2)).toEqual(["Korpa"]);
    expect(tekst(korpa)).toContain(fmt(t.korpa.zaMesto, { mesto: "Sto 12" }));
    expect(count(korpa, "data-linija=")).toBe(STO_LINIJE.length);
    for (const linija of STO_LINIJE) {
      expect(korpa).toContain(`data-linija="${linija.articleKey}"`);
      expect(tekst(korpa)).toContain(linija.name);
      if (linija.variantName) expect(tekst(korpa)).toContain(linija.variantName);
      for (const dodatak of linija.addonNames) expect(tekst(korpa)).toContain(`+ ${dodatak}`);
      if (linija.note) expect(tekst(korpa)).toContain(fmt(t.korpa.napomena, { tekst: linija.note }));
      expect(tekst(korpa)).toContain(`${formatRsd(linija.pieceRsd * linija.quantity)}RSD`);
    }
    expect(tekst(korpa)).toContain("Ukupno");
    expect(count(korpa, "data-ukupno=")).toBe(1);
    expect(ukupno(korpa)).toBe(STO_UKUPNO);
    expect(tekst(korpa)).toContain(`Ukupno${formatRsd(STO_UKUPNO)}RSD`);
    // A table has no delivery.
    expect(korpa).not.toContain("data-dostava");
    expect(tekst(korpa)).not.toContain(t.korpa.dostava);
  });

  test("it says the order goes to the waiter for review and that payment is with the staff", () => {
    expect(tekst(korpa)).toContain("Porudžbina se šalje konobaru na proveru. Plaćanje je kod osoblja.");
    expect(t.korpa.proveraOpis).toBe("Porudžbina se šalje konobaru na proveru. Plaćanje je kod osoblja.");
    expect(tekst(korpa)).not.toContain(t.korpa.proveraOpisRs);
  });

  test("the send button is `Pošalji konobaru`, enabled when everything is fine", () => {
    const posalji = dugme(korpa, "data-posalji");
    expect(posalji?.tekst).toBe("Pošalji konobaru");
    expect(posalji?.iskljuceno).toBe(false);
    expect(tekst(korpa)).not.toContain(t.korpa.posaljiRs);
  });

  test("each line can be changed or removed, with a label that names the article", () => {
    for (const linija of STO_LINIJE) {
      expect(korpa).toContain(`aria-label="${fmt(t.korpa.ukloniCitac, { naziv: linija.name })}"`);
      expect(korpa).toContain(`aria-label="${fmt(t.korpa.smanji, { naziv: linija.name })}"`);
      expect(korpa).toContain(`aria-label="${fmt(t.korpa.povecaj, { naziv: linija.name })}"`);
    }
  });

  test("the minus is off at one piece (removing a line is `Ukloni`), the plus is off at the maximum", () => {
    const jedan = { ...STO_LINIJE[0], quantity: 1 };
    const dva = { ...STO_LINIJE[1], quantity: 2 };
    const najvise = { ...STO_LINIJE[2], quantity: MENU_MAX_CART_QUANTITY };
    const sheet = list(panel({ pocetno: { list: "korpa", linije: [jedan, dva, najvise] } }), "korpa");
    const smanji = (linija: { name: string }) => dugmeSaOznakom(sheet, fmt(t.korpa.smanji, { naziv: linija.name }));
    const povecaj = (linija: { name: string }) => dugmeSaOznakom(sheet, fmt(t.korpa.povecaj, { naziv: linija.name }));
    const ukloni = (linija: { name: string }) => dugmeSaOznakom(sheet, fmt(t.korpa.ukloniCitac, { naziv: linija.name }));

    expect(smanji(jedan)?.iskljuceno).toBe(true);
    expect(povecaj(jedan)?.iskljuceno).toBe(false);
    expect(smanji(dva)?.iskljuceno).toBe(false);
    expect(povecaj(dva)?.iskljuceno).toBe(false);
    expect(smanji(najvise)?.iskljuceno).toBe(false);
    expect(povecaj(najvise)?.iskljuceno).toBe(true);
    // Removing is always possible.
    for (const linija of [jedan, dva, najvise]) expect(ukloni(linija)?.iskljuceno).toBe(false);
  });

  test("the bar counts the pieces in the cart", () => {
    const brojKomada = cartCount(STO_LINIJE);
    const radnja = radnjeBara(traka(html)).korpa;
    expect(radnja.tekst).toBe(`Korpa · ${brojKomada}`);
    expect(attr(radnja.tag, "aria-label")).toBe(fmt(t.traka.korpaCitac[srPluralCategory(brojKomada)], { n: brojKomada }));
  });

  test("an empty cart says so and offers nothing to send", () => {
    const prazna = list(panel({ pocetno: { list: "korpa" } }), "korpa");
    expect(tekst(prazna)).toContain(t.korpa.prazno);
    expect(tekst(prazna)).toContain(t.korpa.praznoOpis);
    expect(prazna).not.toContain("data-posalji");
    expect(prazna).not.toContain("data-ukupno");
  });

  test("the izlog opens the sheet from `korpa=1` (the lines come from the in-memory cart in the browser)", () => {
    const izlogKorpa = izlog({ pozicija: "sto", korpa: "1" });
    expect(naslovi(list(izlogKorpa, "korpa"), 2)).toEqual(["Korpa"]);
    expect(count(izlogKorpa, "data-traka-gosta")).toBe(1);
  });
});

describe("the cart of a room (Room service)", () => {
  const html = panel({
    kontekst: kontekstSobe(),
    pocetno: { list: "korpa", linije: SOBA_LINIJE },
  });
  const korpa = list(html, "korpa");

  test("the fixture really is a Room service cart", () => {
    expect(SOBA_LINIJE).toHaveLength(3);
    expect(DOSTAVA).toBe(300);
    for (const linija of SOBA_LINIJE) {
      expect(linija.pageKey).toBeNull();
      const article = RS_ARTIKLI.get(linija.articleKey);
      expect(article, linija.name).toBeDefined();
      // The Room service price, as published: no promotion of the standard menu.
      if (article && article.variants.length === 0 && linija.addonKeys.length === 0) {
        expect(linija.pieceRsd).toBe(article.priceRsd);
      }
    }
    // A manual Room service price wins over the markup.
    expect(SOBA_LINIJE.find((linija) => linija.name === "Club sendvič")?.pieceRsd).toBe(950);
  });

  test("the sheet is titled Room service and the delivery is its own row", () => {
    expect(naslovi(korpa, 2)).toEqual(["Room service"]);
    expect(tekst(korpa)).toContain(fmt(t.korpa.zaMesto, { mesto: "Soba 204" }));
    expect(count(korpa, "data-dostava")).toBe(1);
    const dostava = tekst(/<div\b[^>]*\sdata-dostava=""[^>]*>[\s\S]*?<\/div>/.exec(korpa)?.[0] ?? "");
    expect(dostava).toContain("Dostava do sobe");
    expect(dostava).toContain(t.korpa.dostavaJednom);
    expect(dostava).toContain(`${formatRsd(DOSTAVA)}RSD`);
    expect(tekst(korpa)).toContain(`${t.korpa.artikli}${formatRsd(SOBA_STAVKE)}RSD`);
  });

  test("the total is the items plus the delivery fee, exactly once", () => {
    expect(count(korpa, "data-ukupno=")).toBe(1);
    expect(ukupno(korpa)).toBe(SOBA_STAVKE + DOSTAVA);
    expect(ukupno(korpa)).toBe(orderTotals(SOBA_LINIJE, "room_service", DOSTAVA).totalRsd);
    expect(ukupno(korpa)).not.toBe(SOBA_STAVKE + 2 * DOSTAVA);
    expect(ukupno(korpa)).not.toBe(SOBA_STAVKE);
    expect(tekst(korpa)).toContain(`Ukupno${formatRsd(SOBA_STAVKE + DOSTAVA)}RSD`);
  });

  test("it is `Pošalji osoblju`, and the staff reviews the order", () => {
    expect(dugme(korpa, "data-posalji")?.tekst).toBe("Pošalji osoblju");
    expect(tekst(korpa)).toContain("Porudžbina se šalje osoblju na proveru. Plaćanje je kod osoblja.");
    expect(tekst(korpa)).not.toContain("Pošalji konobaru");
    expect(tekst(korpa)).not.toContain(t.korpa.proveraOpis);
  });

  test("an empty Room service cart has no delivery row and no total", () => {
    const prazna = list(panel({ kontekst: kontekstSobe(), pocetno: { list: "korpa" } }), "korpa");
    expect(prazna).not.toContain("data-dostava");
    expect(prazna).not.toContain("data-ukupno");
    expect(tekst(prazna)).toContain(t.korpa.prazno);
  });
});

// -----------------------------------------------------------------------------
// E. Offline: nothing is sent, nothing says "poslato"
// -----------------------------------------------------------------------------

describe("offline", () => {
  test("the cart's send button is disabled and the reason is said, with no word of 'sent'", () => {
    const html = panel({ offline: true, pocetno: { list: "korpa", linije: STO_LINIJE } });
    const posalji = dugme(html, "data-posalji");
    expect(posalji).not.toBeNull();
    expect(posalji?.iskljuceno).toBe(true);
    expect(tekst(html)).toContain("Nema veze sa internetom");
    expect(count(html, 'role="status"')).toBe(2);
    expect(html).not.toMatch(/poslat/i);
    expect(html).not.toMatch(/poslato/i);
  });

  test("the bar's call is disabled too; the bill and cart buttons only open their sheets", () => {
    const radnje = radnjeBara(traka(panel({ offline: true })));
    expect(radnje.poziv.iskljucena).toBe(true);
    expect(radnje.racun.iskljucena).toBe(false);
    expect(radnje.korpa.iskljucena).toBe(false);
  });

  test("the izlog's veza=offline: the bar says there is no connection and sends nothing", () => {
    const html = izlog({ pozicija: "sto", korpa: "1", veza: "offline" });
    const bar = traka(html);
    expect(tekst(bar)).toContain("Nema veze sa internetom");
    expect(radnjeBara(bar).poziv.iskljucena).toBe(true);
    expect(html).not.toMatch(/poslat/i);
    expect(html).not.toMatch(/poslato/i);
    // And the send button, wherever it is, is off.
    const posalji = dugme(html, "data-posalji");
    if (posalji) expect(posalji.iskljuceno).toBe(true);
  });

  test("a control: the same izlog online has no warning, and 'sent' appears once something was sent", () => {
    const online = izlog({ pozicija: "sto", korpa: "1" });
    expect(tekst(traka(online))).not.toContain("Nema veze sa internetom");
    expect(radnjeBara(traka(online)).poziv.iskljucena).toBe(false);
    expect(izlog({ pozicija: "sto", zahtev: "poziv" })).toMatch(/poslat/i);
  });

  test("a Room service cart offline is disabled as well", () => {
    const html = panel({ kontekst: kontekstSobe(), offline: true, pocetno: { list: "korpa", linije: SOBA_LINIJE } });
    expect(dugme(html, "data-posalji")?.iskljuceno).toBe(true);
    expect(html).not.toMatch(/poslat/i);
  });
});

// -----------------------------------------------------------------------------
// F. Confirmations: what the guest learns is what the server answered
// -----------------------------------------------------------------------------

describe("confirmations", () => {
  test("zahtev=poziv: the call was sent to the staff, with its time and status Novi", () => {
    const html = izlog({ pozicija: "sto", zahtev: "poziv" });
    const bar = traka(html);
    expect(bar).toContain('data-potvrda="call"');
    expect(tekst(bar)).toContain("Poziv je poslat osoblju");
    expect(tekst(bar)).toContain("18:27");
    expect(satBeograd(IZLOG_SADA)).toBe("18:27");
    expect(bar).toContain('data-status="new"');
    expect(tekst(/<span\b[^>]*\sdata-status="new"[^>]*>[\s\S]*?<\/span>/.exec(bar)?.[0] ?? "")).toBe("Novi");
    expect(bar).toContain("<svg");
    expect(html).not.toContain("data-gost-list");
  });

  test("zahtev=racun&stanje-zahteva=prihvacen: the bill request, the way to pay and the live status", () => {
    const html = izlog({ pozicija: "sto", zahtev: "racun", "stanje-zahteva": "prihvacen" });
    const bar = traka(html);
    expect(bar).toContain('data-potvrda="bill"');
    expect(tekst(bar)).toContain("Zahtev za račun je poslat osoblju");
    expect(tekst(bar)).toContain("Kartica");
    expect(tekst(bar)).toContain("Prihvaćen");
    expect(bar).toContain('data-status="accepted"');
    expect(tekst(bar)).not.toContain("Poziv je poslat osoblju");
  });

  test("every status shows as its word in the bar's confirmation", () => {
    for (const [param, rec] of [
      ["novi", "Novi"],
      ["prihvacen", "Prihvaćen"],
      ["zavrsen", "Završen"],
      ["otkazan", "Otkazan"],
    ] as const) {
      const bar = traka(izlog({ pozicija: "sto", zahtev: "poziv", "stanje-zahteva": param }));
      expect(tekst(bar), param).toContain(rec);
    }
  });

  test("zahtev=porudzbina: the order was sent to the waiter; the sheet shows time, status, total and what happens next", () => {
    const html = izlog({ pozicija: "sto", zahtev: "porudzbina" });
    const potvrda = list(html, "potvrda");
    expect(tekst(potvrda)).toContain("Porudžbina je poslata konobaru");
    expect(naslovi(potvrda, 2)).toEqual(["Porudžbina je poslata konobaru"]);
    // The sentence is the dialog's title only: there is no second paragraph repeating it.
    expect(count(tekst(potvrda), "Porudžbina je poslata konobaru")).toBe(1);
    expect(tekst(potvrda)).toContain(fmt(t.potvrda.vreme, { vreme: "18:27" }));
    expect(potvrda).toContain('data-status="new"');
    expect(tekst(potvrda)).toContain("Novi");
    expect(tekst(potvrda)).toContain(`Ukupno: ${formatRsd(STO_UKUPNO)}RSD`);
    expect(tekst(potvrda)).toContain(t.potvrda.porudzbinaOpis);
    expect(tekst(potvrda)).toContain(t.traka.mojiZahtevi);
    expect(tekst(potvrda)).toContain(t.potvrda.nazadNaMeni);
    // It replaces the cart: no lines, no send button.
    expect(potvrda).not.toContain("data-posalji");
    expect(html).not.toContain('data-gost-list="korpa"');
  });

  test("zahtev=porudzbina on Room service: sent to the staff, with the delivery in the total", () => {
    const potvrda = list(izlog({ pozicija: "soba", zahtev: "porudzbina" }), "potvrda");
    expect(tekst(potvrda)).toContain("Porudžbina je poslata osoblju");
    expect(tekst(potvrda)).toContain(`Ukupno: ${formatRsd(SOBA_STAVKE + DOSTAVA)}RSD`);
    expect(tekst(potvrda)).toContain(t.potvrda.porudzbinaRsOpis);
    // The confirmation is the sheet's own title, so a screen reader announces it first.
    expect(naslovi(potvrda, 2)).toEqual(["Porudžbina je poslata osoblju"]);
    expect(count(tekst(potvrda), "Porudžbina je poslata osoblju")).toBe(1);
  });

  test("the status of the confirmation follows the live list when the request is in it", () => {
    const html = panel({
      pocetno: {
        list: "korpa",
        korpaPotvrda: { requestId: "rq_zivo", createdAt: IZLOG_SADA, status: "new", totals: null },
      },
      zahtevi: [zahtev({ id: "rq_zivo", kind: "order", status: "accepted" })],
    });
    expect(tekst(list(html, "potvrda"))).toContain("Prihvaćen");
    expect(tekst(list(html, "potvrda"))).not.toContain("Novi");
  });
});

// -----------------------------------------------------------------------------
// G. Errors: a refusal says what to do and keeps the cart
// -----------------------------------------------------------------------------

describe("errors", () => {
  const prva = STO_LINIJE[0];

  test("greska=cena: the price alert, with the new total", () => {
    const html = izlog({ pozicija: "sto", greska: "cena" });
    const korpa = list(html, "korpa");
    expect(korpa).toContain(`data-greska="${REQUEST_ERROR.cartPriceChanged}"`);
    expect(korpa).toContain('data-greska="request/cart_price_changed"');
    // The server answered with today's prices, which the izlog's cart already shows: its total is the new one.
    expect(tekst(korpa)).toContain(fmt(t.korpa.ceneNove, { iznos: formatRsd(STO_UKUPNO) }));
    expect(tekst(korpa)).toContain("Cene su se promenile od kada ste ih videli.");
    expect(/<p\b[^>]*role="alert"[^>]*data-greska="request\/cart_price_changed"/.test(korpa)).toBe(true);
  });

  test("a price refusal turns the button into `Pošalji po novoj ceni` and keeps the cart", () => {
    const nove = STO_LINIJE.map((linija, index) => (index === 0 ? { ...linija, pieceRsd: linija.pieceRsd + 40 } : linija));
    const totals = orderTotals(nove, "standard", null);
    const html = panel({
      pocetno: {
        list: "korpa",
        linije: nove,
        korpaGreska: {
          ok: false,
          code: REQUEST_ERROR.cartPriceChanged,
          prices: nove.map((linija, index) => ({ index, pieceRsd: linija.pieceRsd, lineTotalRsd: linija.pieceRsd * linija.quantity })),
          totals,
        },
      },
    });
    const korpa = list(html, "korpa");
    expect(korpa).toContain('data-greska="request/cart_price_changed"');
    const posalji = dugme(korpa, "data-posalji");
    expect(posalji?.tekst).toBe("Pošalji po novoj ceni");
    expect(posalji?.iskljuceno).toBe(false);
    expect(ukupno(korpa)).toBe(totals.totalRsd);
    expect(count(korpa, "data-linija=")).toBe(STO_LINIJE.length);
  });

  test("greska=nedostupno: the alert says which kind of refusal it was", () => {
    const korpa = list(izlog({ pozicija: "sto", greska: "nedostupno" }), "korpa");
    expect(korpa).toContain('data-greska="request/cart_unavailable"');
    expect(tekst(korpa)).toContain(d.errors[REQUEST_ERROR.cartUnavailable]);
  });

  test("an unavailable article is marked on its line and blocks the send button", () => {
    const html = panel({
      pocetno: {
        list: "korpa",
        linije: STO_LINIJE,
        korpaGreska: { ok: false, code: REQUEST_ERROR.cartUnavailable, unavailableKeys: [prva.articleKey] },
      },
    });
    const korpa = list(html, "korpa");
    const linija = new RegExp(`<li\\b[^>]*\\sdata-problem="nedostupno"[^>]*\\sdata-linija="${prva.articleKey}"[^>]*>`).exec(korpa);
    expect(linija).not.toBeNull();
    expect(count(korpa, 'data-problem="nedostupno"')).toBe(1);
    expect(tekst(korpa)).toContain(t.korpa.nedostupno);
    expect(dugme(korpa, "data-posalji")?.iskljuceno).toBe(true);
    // The other lines stay as they were.
    expect(count(korpa, "data-linija=")).toBe(STO_LINIJE.length);
  });

  test("an article that became unavailable while the cart was open (the live list) blocks it as well", () => {
    const korpa = list(panel({ nedostupni: [prva.articleKey], pocetno: { list: "korpa", linije: STO_LINIJE } }), "korpa");
    expect(korpa).toContain('data-problem="nedostupno"');
    expect(korpa).not.toContain("data-greska");
    expect(dugme(korpa, "data-posalji")?.iskljuceno).toBe(true);
  });

  test("an article that is no longer in the menu is marked and blocks the send button", () => {
    const korpa = list(
      panel({
        pocetno: {
          list: "korpa",
          linije: STO_LINIJE,
          korpaGreska: { ok: false, code: REQUEST_ERROR.cartStale, staleLines: [1] },
        },
      }),
      "korpa",
    );
    expect(korpa).toContain('data-greska="request/cart_stale"');
    expect(count(korpa, 'data-problem="staro"')).toBe(1);
    expect(tekst(korpa)).toContain(t.korpa.nemaViseUMeniju);
    expect(dugme(korpa, "data-posalji")?.iskljuceno).toBe(true);
  });

  test("greska=limit: the rate-limit sentence", () => {
    const korpa = list(izlog({ pozicija: "sto", greska: "limit" }), "korpa");
    expect(korpa).toContain('data-greska="request/rate_limited"');
    expect(tekst(korpa)).toContain(d.errors[REQUEST_ERROR.rateLimited]);
    expect(tekst(korpa)).toContain("Previše zahteva u kratkom roku. Pokušajte ponovo za minut.");
  });

  test("a request that never reached a decision (network) says to check the connection", () => {
    const korpa = list(
      panel({ pocetno: { list: "korpa", linije: STO_LINIJE, korpaGreska: { ok: false, code: "network" } } }),
      "korpa",
    );
    expect(korpa).toContain('data-greska="network"');
    expect(tekst(korpa)).toContain(t.greska.nepoznata);
    expect(tekst(korpa)).toContain("Nismo dobili odgovor. Pokušajte ponovo — isti zahtev neće stići dvaput.");
    expect(porukaGreske("network")).toBe(t.greska.nepoznata);
    expect(dugme(korpa, "data-posalji")?.tekst).toBe("Pošalji konobaru");
  });

  test("every refusal code has a Serbian sentence for the guest", () => {
    for (const code of Object.values(REQUEST_ERROR)) {
      expect(porukaGreske(code).length, code).toBeGreaterThan(10);
      expect(porukaGreske(code)).toBe(d.errors[code]);
    }
  });
});

// -----------------------------------------------------------------------------
// H. Statuses: an icon and a word, never colour alone
// -----------------------------------------------------------------------------

describe("request statuses", () => {
  const STATUSI: [MenuRequestStatus, string][] = [
    ["new", "Novi"],
    ["accepted", "Prihvaćen"],
    ["done", "Završen"],
    ["cancelled", "Otkazan"],
  ];

  test("each status renders an icon, its word and data-status", () => {
    const ikonice = new Set<string>();
    for (const [status, rec] of STATUSI) {
      const html = renderToStaticMarkup(<StatusZahteva status={status} />);
      expect(html, status).toContain(`data-status="${status}"`);
      expect(html, status).toContain("<svg");
      expect(html, status).toContain('aria-hidden="true"');
      expect(bezTagova(html), status).toBe(rec);
      ikonice.add(/<svg\b[\s\S]*<\/svg>/.exec(html)?.[0] ?? "");
    }
    // A different icon for each (the colour only helps).
    expect(ikonice.size).toBe(4);
  });

  test("the words are the shared ones, and there is no 'Konobar je krenuo'", () => {
    expect(d.requestStatuses).toEqual({ new: "Novi", accepted: "Prihvaćen", done: "Završen", cancelled: "Otkazan" });
    expect(Object.keys(d.requestStatuses).sort()).toEqual(["accepted", "cancelled", "done", "new"]);
    expect(JSON.stringify(d.requestStatuses)).not.toMatch(/krenu/i);
    expect(JSON.stringify(t)).not.toMatch(/krenu/i);
    expect(JSON.stringify(t)).not.toContain("Konobar je krenuo");
  });

  test("the kinds and the payment words", () => {
    expect(d.requestKinds).toEqual({ call: "Poziv konobara", bill: "Račun", order: "Porudžbina" });
    expect(d.paymentPreferences).toEqual({ cash: "Gotovina", card: "Kartica" });
  });
});

// -----------------------------------------------------------------------------
// I. Moji zahtevi
// -----------------------------------------------------------------------------

describe("Moji zahtevi (pozicija=sto&moji-zahtevi=1)", () => {
  const html = izlog({ pozicija: "sto", "moji-zahtevi": "1" });
  const pocetci = [...html.matchAll(/<li\b[^>]*\sdata-zahtev="(\w+)"[^>]*\sdata-status="(\w+)"[^>]*>/g)];
  /** The markup of each request, up to the start of the next one. */
  const odeljci = pocetci.map((pocetak, index) => html.slice(pocetak.index ?? 0, pocetci[index + 1]?.index ?? html.length));

  test("the page is the list, without the bar", () => {
    expect(count(html, "data-moji-zahtevi")).toBe(1);
    expect(naslovi(html, 2)).toEqual(["Moji zahtevi"]);
    expect(html).not.toContain("data-traka-gosta");
    expect(tekst(html)).toContain(t.zahtevi.uvod);
    const nazad = /<a\b[^>]*href="([^"]*)"[^>]*>\s*(?:<svg[\s\S]*?<\/svg>)?\s*Nazad na meni<\/a>/.exec(html);
    expect(unesc(nazad?.[1] ?? "")).toBe("/dev/menu-public-preview?pozicija=sto");
  });

  test("four requests, newest first, one in every status", () => {
    expect(pocetci.map((pocetak) => pocetak[1])).toEqual(["order", "order", "call", "bill"]);
    expect(pocetci.map((pocetak) => pocetak[2])).toEqual(["new", "accepted", "done", "cancelled"]);
    for (const [index, [status, rec]] of [
      ["new", "Novi"],
      ["accepted", "Prihvaćen"],
      ["done", "Završen"],
      ["cancelled", "Otkazan"],
    ].entries()) {
      expect(odeljci[index], status).toContain(`<span class="`);
      expect(odeljci[index], status).toContain(`data-status="${status}"`);
      expect(odeljci[index], status).toContain("<svg");
      expect(tekst(odeljci[index]), status).toContain(rec);
    }
  });

  test("each request says its kind, how many items, the place and the time", () => {
    const fixtura = fixtureMojiZahtevi(STO_LINIJE);
    const naslovZahteva = naslovi(html, 3);
    expect(naslovZahteva[0]).toBe(`Porudžbina · ${fmt(t.zahtevi.stavke[srPluralCategory(3)], { n: 3 })}`);
    expect(naslovZahteva[0]).toBe("Porudžbina · 3 stavke");
    expect(naslovZahteva[1]).toBe("Porudžbina · 1 stavka");
    expect(naslovZahteva[2]).toBe("Poziv konobara");
    expect(naslovZahteva[3]).toBe("Račun · Gotovina");
    fixtura.forEach((red, index) => {
      expect(tekst(odeljci[index])).toContain(fmt(t.zahtevi.mestoVreme, { mesto: "Sto 12", vreme: satBeograd(red.createdAt) }));
    });
  });

  test("an order lists its lines and the total", () => {
    const prvi = tekst(odeljci[0]);
    for (const linija of STO_LINIJE.slice(0, 3)) {
      expect(prvi).toContain(`${linija.quantity} × ${linija.name}`);
    }
    expect(prvi).toContain(t.korpa.ukupno);
    const zbir = orderTotals(STO_LINIJE.slice(0, 3), "standard", null).totalRsd;
    expect(prvi).toContain(`${formatRsd(zbir)}RSD`);
  });

  test("when it was accepted, finished or cancelled (by the guest) is said", () => {
    const fixtura = fixtureMojiZahtevi(STO_LINIJE);
    expect(tekst(odeljci[1])).toContain(fmt(t.zahtevi.prihvacenU, { vreme: satBeograd(fixtura[1].acceptedAt as number) }));
    expect(tekst(odeljci[2])).toContain(fmt(t.zahtevi.zavrsenU, { vreme: satBeograd(fixtura[2].doneAt as number) }));
    expect(tekst(odeljci[3])).toContain(fmt(t.zahtevi.otkazaliSteU, { vreme: satBeograd(fixtura[3].cancelledAt as number) }));
    expect(tekst(odeljci[3])).not.toContain(t.zahtevi.otkazaloOsobljeU.replace("{vreme}", ""));
  });

  test("`Otkaži` is on the Novi request only", () => {
    expect(count(html, ' data-otkazi=""')).toBe(1);
    expect(odeljci[0]).toContain(' data-otkazi=""');
    for (const index of [1, 2, 3]) expect(odeljci[index], String(index)).not.toContain("data-otkazi");
    expect(dugme(odeljci[0], "data-otkazi")?.tekst).toBe("Otkaži");
    expect(dugme(odeljci[0], "data-otkazi")?.iskljuceno).toBe(false);
    // The question comes first: no confirmation is on the page yet.
    expect(html).not.toContain("data-otkazi-potvrda");
  });

  test("each request has a live region for the answer of a cancel, empty until there is one", () => {
    expect(t.zahtevi.otkazano).toBe("Zahtev je otkazan.");
    for (const odeljak of odeljci) {
      expect(count(odeljak, 'role="status"')).toBe(1);
      expect(/<p\b[^>]*role="status"[^>]*><\/p>/.test(odeljak)).toBe(true);
    }
    expect(html).not.toContain("Zahtev je otkazan");
    expect(html).not.toContain('role="alert"');
  });
});

describe("MojiZahtevi on its own", () => {
  const moji = (zahtevi: ComponentProps<typeof MojiZahtevi>["zahtevi"], over: Partial<ComponentProps<typeof MojiZahtevi>> = {}) =>
    renderToStaticMarkup(
      <MojiZahtevi zahtevi={zahtevi} sadaMs={IZLOG_SADA} online meniHref="/demo-restoran/meni" onOtkazi={async () => ({ ok: true })} {...over} />,
    );

  test("a phone without a device (null) is told to scan the QR code, and sees no list", () => {
    const html = moji(null);
    expect(tekst(html)).toContain(t.zahtevi.bezUredjaja);
    expect(tekst(html)).toContain("skenirajte QR kod");
    expect(html).not.toContain("data-zahtev=");
    expect(html).not.toContain("<ul");
    expect(html).not.toContain(t.zahtevi.uvod);
    expect(html).toContain('href="/demo-restoran/meni"');
  });

  test("no requests yet ([]) says so", () => {
    const html = moji([]);
    expect(tekst(html)).toContain(t.zahtevi.prazno);
    expect(html).not.toContain("data-zahtev=");
    expect(tekst(html)).not.toContain("skenirajte QR kod");
  });

  test("still loading (undefined) says so, without the empty text", () => {
    const html = moji(undefined);
    expect(tekst(html)).toContain(t.zahtevi.ucitava);
    expect(tekst(html)).not.toContain(t.zahtevi.prazno);
    expect(html).not.toContain("data-zahtev=");
  });

  test("requests older than 12 hours are not shown (and the 12-hour mark itself still is)", () => {
    const SAT = 60 * 60 * 1000;
    const zahtevi = [
      zahtev({ id: "rq_svez", kind: "call", createdAt: IZLOG_SADA - 5 * 60_000 }),
      zahtev({ id: "rq_granica", kind: "bill", paymentPreference: "card", createdAt: IZLOG_SADA - 12 * SAT }),
      zahtev({ id: "rq_star", kind: "call", createdAt: IZLOG_SADA - 12 * SAT - 1 }),
      zahtev({ id: "rq_jucerasnji", kind: "call", createdAt: IZLOG_SADA - 30 * SAT }),
    ];
    expect(skoriZahtevi(zahtevi, IZLOG_SADA).map((red) => red.id)).toEqual(["rq_svez", "rq_granica"]);
    const html = moji(zahtevi);
    expect(count(html, "data-zahtev=")).toBe(2);

    const samoStari = moji([zahtevi[2], zahtevi[3]]);
    expect(tekst(samoStari)).toContain(t.zahtevi.prazno);
    expect(samoStari).not.toContain("data-zahtev=");
  });

  test("skoriZahtevi sorts newest first and leaves the input alone", () => {
    const ulaz = [
      zahtev({ id: "rq_a", createdAt: IZLOG_SADA - 3 * 60_000 }),
      zahtev({ id: "rq_b", createdAt: IZLOG_SADA - 1 * 60_000 }),
      zahtev({ id: "rq_c", createdAt: IZLOG_SADA - 2 * 60_000 }),
    ];
    expect(skoriZahtevi(ulaz, IZLOG_SADA).map((red) => red.id)).toEqual(["rq_b", "rq_c", "rq_a"]);
    expect(ulaz.map((red) => red.id)).toEqual(["rq_a", "rq_b", "rq_c"]);
  });

  test("a Room service order is named so, and shows the delivery before the total", () => {
    const html = moji([
      zahtev({
        id: "rq_rs",
        kind: "order",
        channel: "room_service",
        positionLabel: "Soba 204",
        subtotalRsd: 1_000,
        deliveryFeeRsd: 300,
        totalRsd: 1_300,
        items: [
          { name: "Probno jelo", variantName: "Mala porcija", addons: [{ optionName: "Opcija B", priceDeltaRsd: 60 }], quantity: 1, unitPriceRsd: 1_000, lineTotalRsd: 1_000, note: "bez soli" },
        ],
      }),
    ]);
    expect(naslovi(html, 3)).toEqual(["Porudžbina · Room service · 1 stavka"]);
    const tekstZahteva = tekst(html);
    expect(tekstZahteva).toContain("1 × Probno jelo");
    expect(tekstZahteva).toContain("Mala porcija, + Opcija B");
    expect(tekstZahteva).toContain(fmt(t.korpa.napomena, { tekst: "bez soli" }));
    expect(tekstZahteva).toContain(`${t.korpa.dostava}300RSD`);
    expect(tekstZahteva).toContain(`${t.korpa.ukupno}1.300RSD`);
    expect(tekstZahteva.indexOf(t.korpa.dostava)).toBeLessThan(tekstZahteva.lastIndexOf(t.korpa.ukupno));
  });

  test("a request the staff cancelled says so, and none of the finished ones can be cancelled", () => {
    const html = moji([
      zahtev({ id: "rq_osoblje", status: "cancelled", cancelledAt: IZLOG_SADA - 60_000, cancelledBy: "staff" }),
      zahtev({ id: "rq_gotov", status: "done", doneAt: IZLOG_SADA - 120_000, createdAt: IZLOG_SADA - 180_000 }),
      zahtev({ id: "rq_prihvacen", status: "accepted", acceptedAt: IZLOG_SADA - 120_000, createdAt: IZLOG_SADA - 180_000 }),
    ]);
    expect(tekst(html)).toContain(fmt(t.zahtevi.otkazaloOsobljeU, { vreme: satBeograd(IZLOG_SADA - 60_000) }));
    expect(tekst(html)).not.toContain(t.zahtevi.otkazaliSteU.replace("{vreme}", ""));
    expect(html).not.toContain("data-otkazi");
  });

  test("offline, even `Otkaži` is disabled", () => {
    const html = moji([zahtev({ status: "new" })], { online: false });
    expect(dugme(html, "data-otkazi")?.iskljuceno).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// J. Ordering inside the article detail
// -----------------------------------------------------------------------------

describe("ordering in the detail (pozicija=sto&layout=tok&detalj=1)", () => {
  const prikaz = stranica({ layout: "tok", detalj: "1" });
  const html = izlog({ pozicija: "sto", layout: "tok", detalj: "1" });
  const dijalog = dijalogDetalja(html);
  const otvoreni = STO_ARTIKLI.get(prikaz.pocetniDetalj ?? "");

  test("the richest article is open, available, and carries the ordering block", () => {
    expect(otvoreni).toBeDefined();
    expect(prikaz.nedostupni).not.toContain(prikaz.pocetniDetalj);
    expect(dijalog).toContain(`data-detalj="${prikaz.pocetniDetalj}"`);
    expect(count(dijalog, "data-poruci")).toBe(1);
    expect(count(html, "data-poruci")).toBe(1);
    expect(dugme(dijalog, "data-dodaj")).not.toBeNull();
  });

  test("the informational Varijante and Dodaci headings are not duplicated next to the ordering", () => {
    const podnaslovi = naslovi(dijalog, 3);
    expect(podnaslovi).toContain(t.dodaj.naslov);
    expect(podnaslovi).not.toContain(j.detalj.varijante);
    expect(podnaslovi).not.toContain(j.detalj.dodaci);
  });

  test("each add-on group of the article is offered once, and each variant once", () => {
    for (const grupaDodataka of otvoreni?.addonGroups ?? []) {
      expect(count(dijalog, `data-grupa="${grupaDodataka.key}"`), grupaDodataka.name).toBe(1);
      for (const opcija of grupaDodataka.options) expect(count(tekst(dijalog), opcija.name), opcija.name).toBeGreaterThanOrEqual(1);
    }
    for (const varijanta of otvoreni?.variants ?? []) expect(count(dijalog, `<span>${varijanta.name}</span>`), varijanta.name).toBe(1);
  });

  test("the cart button of the bar is still there, behind the detail", () => {
    expect(Object.keys(radnjeBara(traka(html))).sort()).toEqual(["korpa", "poziv", "racun"]);
  });

  test("a room's Room service menu offers ordering in the detail too", () => {
    const rsPrikaz = RS_SEKCIJE[0].articles[0];
    const detalj = renderToStaticMarkup(
      <DetaljSadrzaj
        article={rsPrikaz}
        layout="flow"
        slike={{}}
        sadaMs={IZLOG_SADA}
        nedostupan={false}
        alergeniUkljuceni={false}
        naslovId="naslov-probe"
        poruci={
          <DodajUKorpu
            article={rsPrikaz}
            slug={RS.lokal.slug}
            kanal="room_service"
            pageKey={null}
            sadaMs={IZLOG_SADA}
            nedostupan={false}
            cuvaj={false}
            onDodato={() => undefined}
          />
        }
      />,
    );
    expect(count(detalj, "data-poruci")).toBe(1);
  });
});

describe("DetaljSadrzaj with and without the ordering slot", () => {
  const SA_IZBOROM = clanak({
    priceRsd: null,
    variants: VARIJANTE,
    addonGroups: [
      grupa(),
      grupa({ key: "ag_neobavezna", name: "Neobavezna grupa", selection: "multiple", required: false, minSelect: 0, maxSelect: 2 }),
    ],
    noteEnabled: true,
  });

  const detalj = (poruci?: ComponentProps<typeof DetaljSadrzaj>["poruci"]) =>
    renderToStaticMarkup(
      <DetaljSadrzaj
        article={SA_IZBOROM}
        layout="flow"
        slike={{}}
        sadaMs={IZLOG_SADA}
        nedostupan={false}
        alergeniUkljuceni={false}
        naslovId="naslov-probe"
        poruci={poruci}
      />,
    );

  test("without `poruci` the detail only informs: the variants and add-ons are listed under their headings", () => {
    const html = detalj();
    expect(naslovi(html, 3)).toEqual([j.detalj.varijante, j.detalj.dodaci]);
    expect(j.detalj.varijante).not.toBe("");
    expect(j.detalj.dodaci).not.toBe("");
    for (const varijanta of VARIJANTE) expect(tekst(html)).toContain(varijanta.name);
    expect(tekst(html)).toContain("Opcija A");
    expect(html).not.toContain("data-poruci");
    expect(html).not.toContain("<input");
  });

  test("with `poruci` the slot replaces both lists: no headings, and nothing is shown twice", () => {
    const html = detalj(<section data-proba-poruci="">probno poručivanje</section>);
    expect(count(html, "data-proba-poruci")).toBe(1);
    expect(naslovi(html, 3)).not.toContain(j.detalj.varijante);
    expect(naslovi(html, 3)).not.toContain(j.detalj.dodaci);
    expect(naslovi(html, 3)).toEqual([]);
    for (const varijanta of VARIJANTE) expect(tekst(html)).not.toContain(varijanta.name);
    expect(tekst(html)).not.toContain("Opcija A");
  });

  test("with the real ordering block each variant and each group appears exactly once", () => {
    const html = detalj(
      <DodajUKorpu
        article={SA_IZBOROM}
        slug="demo-restoran"
        kanal="standard"
        pageKey="pg_probna"
        sadaMs={IZLOG_SADA}
        nedostupan={false}
        cuvaj={false}
        onDodato={() => undefined}
      />,
    );
    expect(naslovi(html, 3)).toEqual(["Poručite"]);
    for (const varijanta of VARIJANTE) expect(count(html, `<span>${varijanta.name}</span>`)).toBe(1);
    expect(count(html, 'data-grupa="ag_obavezna"')).toBe(1);
    expect(count(html, 'data-grupa="ag_neobavezna"')).toBe(1);
    expect(count(html, "data-poruci")).toBe(1);
  });
});

describe("DodajUKorpu", () => {
  test("an unavailable article cannot be ordered: the reason, and no add button", () => {
    const html = dodaj(clanak(), { nedostupan: true });
    expect(tekst(html)).toBe("Privremeno nedostupno — ne može da se poruči.");
    expect(t.dodaj.nedostupno).toBe("Privremeno nedostupno — ne može da se poruči.");
    expect(html).not.toContain("data-dodaj");
    expect(html).not.toContain("data-poruci");
    expect(html).not.toContain("<button");
  });

  test("an article without any price cannot be ordered either", () => {
    const html = dodaj(clanak({ priceRsd: null }));
    expect(tekst(html)).toBe(t.dodaj.bezCene);
    expect(html).not.toContain("<button");
  });

  test("a simple article: `Dodaj u korpu · <price> RSD`", () => {
    const html = dodaj(clanak({ priceRsd: 1040 }));
    const dugmeDodaj = dugme(html, "data-dodaj");
    expect(dugmeDodaj?.tekst).toBe("Dodaj u korpu · 1.040 RSD");
    expect(dugmeDodaj?.iskljuceno).toBe(false);
    expect(html).not.toContain("<fieldset");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("aria-describedby");
    expect(tekst(html)).not.toContain("Izaberite");
  });

  test("a required add-on group with nothing chosen: the button is disabled, has no amount, and the hint says what is missing", () => {
    const html = dodaj(clanak({ addonGroups: [grupa()] }));
    const dugmeDodaj = dugme(html, "data-dodaj");
    expect(dugmeDodaj?.iskljuceno).toBe(true);
    expect(dugmeDodaj?.tekst).toBe("Dodaj u korpu");
    expect(dugmeDodaj?.tekst).not.toMatch(/\d/);
    expect(dugmeDodaj?.tekst).not.toContain("RSD");
    expect(tekst(html)).toContain("Izaberite: Obavezna grupa");
    // The button points at the hint, so a screen reader hears why it is off.
    const opisan = attr(dugmeDodaj?.tag ?? "", "aria-describedby");
    expect(opisan).toBeTruthy();
    expect(html).toContain(`id="${opisan}"`);
    // The group is offered with its rule.
    expect(html).toContain('data-grupa="ag_obavezna"');
    expect(html).toContain("obavezno");
    expect(count(html, 'type="radio"')).toBe(2);
    expect(html).not.toContain("checked");
  });

  test("the `Izaberite: …` hint sits inside the sticky add row, right with the button it explains", () => {
    const html = dodaj(clanak({ addonGroups: [grupa()] }));
    const podsetnik = html.indexOf("Izaberite: Obavezna grupa");
    const pocetakPodsetnika = html.lastIndexOf("<p", podsetnik);
    // After the last group, before the quantity and the button, in the same row as them.
    expect(pocetakPodsetnika).toBeGreaterThan(html.lastIndexOf("</fieldset>"));
    expect(pocetakPodsetnika).toBeLessThan(html.indexOf("data-dodaj"));
    expect(html.slice(0, pocetakPodsetnika)).toMatch(/<div\b[^>]*>$/);
    expect(html.endsWith("</button></div></section>")).toBe(true);
    // The row opened right before the hint is the one that holds the quantity and the button.
    const red = html.slice(html.lastIndexOf("<div", pocetakPodsetnika));
    expect(red).toContain(`aria-label="${t.dodaj.manje}"`);
    expect(red).toContain("data-dodaj");
    // Nothing missing: no hint at all.
    expect(tekst(dodaj(clanak({ addonGroups: [grupa({ required: false, minSelect: 0 })] })))).not.toContain("Izaberite:");
  });

  test("the rule of an add-on group is said once, in the detail's words", () => {
    const pravilo = (g: PublicAddonGroup) => {
      const html = dodaj(clanak({ addonGroups: [g] }));
      const legenda = /<legend>([\s\S]*?)<\/legend>/.exec(html)?.[1] ?? "";
      return /\(([^)]*)\)/.exec(tekst(legenda))?.[1];
    };
    const cetiri = [
      { key: "ao_1", name: "Opcija 1", priceDeltaRsd: 0 },
      { key: "ao_2", name: "Opcija 2", priceDeltaRsd: 0 },
      { key: "ao_3", name: "Opcija 3", priceDeltaRsd: 0 },
      { key: "ao_4", name: "Opcija 4", priceDeltaRsd: 0 },
    ];
    // Required, exactly two of four: "obavezno, tačno 2" — never "može više, …".
    const tacnoDva = pravilo(grupa({ selection: "multiple", required: true, minSelect: 2, maxSelect: 2, options: cetiri }));
    expect(tacnoDva).toBe("obavezno, tačno 2");
    expect(tacnoDva).not.toContain(j.detalj.biraSeVise);
    expect(tacnoDva).not.toContain("može više");
    // One required: "bira se jedno, obavezno".
    expect(pravilo(grupa())).toBe(`${j.detalj.biraSeJedno}, obavezno`);
    // Optional, up to two of four.
    expect(pravilo(grupa({ selection: "multiple", required: false, minSelect: 0, maxSelect: 2, options: cetiri }))).toBe(
      `${j.detalj.biraSeVise}, ${fmt(j.detalj.izborDo, { max: 2 })}`,
    );
    // Optional, any of the four: only "može više".
    expect(pravilo(grupa({ selection: "multiple", required: false, minSelect: 0, maxSelect: 4, options: cetiri }))).toBe(
      j.detalj.biraSeVise,
    );
    // Required, one to three of four.
    expect(pravilo(grupa({ selection: "multiple", required: true, minSelect: 1, maxSelect: 3, options: cetiri }))).toBe(
      `${j.detalj.biraSeVise}, obavezno, ${fmt(j.detalj.izborOdDo, { min: 1, max: 3 })}`,
    );
  });

  test("the add-on rule is the same words the detail's list uses", () => {
    const g = grupa({ selection: "multiple", required: true, minSelect: 2, maxSelect: 2 });
    const clanakSaGrupom = clanak({ addonGroups: [g] });
    const informativno = renderToStaticMarkup(
      <DetaljSadrzaj
        article={clanakSaGrupom}
        layout="flow"
        slike={{}}
        sadaMs={IZLOG_SADA}
        nedostupan={false}
        alergeniUkljuceni={false}
        naslovId="naslov-probe"
      />,
    );
    const iz = (html: string) => /\(([^)]*obavezno[^)]*)\)/.exec(tekst(html))?.[1];
    expect(iz(informativno)).toBe("obavezno, tačno 2");
    expect(iz(dodaj(clanakSaGrupom))).toBe("obavezno, tačno 2");
  });

  test("an optional add-on group does not block the button, and the add-on price is not counted until chosen", () => {
    const html = dodaj(clanak({ priceRsd: 800, addonGroups: [grupa({ required: false, minSelect: 0 })] }));
    expect(dugme(html, "data-dodaj")?.tekst).toBe("Dodaj u korpu · 800 RSD");
    expect(dugme(html, "data-dodaj")?.iskljuceno).toBe(false);
    // A single optional group starts on "Bez dodatka".
    expect(tekst(html)).toContain(t.dodaj.bezDodatka);
    expect(tekst(html)).toContain("+60RSD");
  });

  test("an article with variants starts on the first one and shows each price", () => {
    const html = dodaj(clanak({ priceRsd: null, variants: VARIJANTE }));
    expect(dugme(html, "data-dodaj")?.tekst).toBe("Dodaj u korpu · 500 RSD");
    expect(count(html, 'type="radio"')).toBe(2);
    expect(count(html, "checked")).toBe(1);
    expect(tekst(html)).toContain(`Izaberite (${t.dodaj.obavezno})`);
    expect(tekst(html)).toContain("Mala porcija500RSD");
    expect(tekst(html)).toContain("Velika porcija700RSD");
  });

  test("the guest's note appears only where the venue switched it on", () => {
    const sNapomenom = dodaj(clanak({ noteEnabled: true }));
    expect(sNapomenom).toContain("<textarea");
    expect(sNapomenom).toContain(`maxLength="${MENU_TEXT.cartLineNote}"`);
    expect(tekst(sNapomenom)).toContain(t.dodaj.napomena);
    expect(tekst(sNapomenom)).toContain(fmt(t.dodaj.napomenaBroj, { n: 0, max: MENU_TEXT.cartLineNote }));
    expect(dodaj(clanak({ noteEnabled: false }))).not.toContain("<textarea");
  });

  test("the quantity starts at one and the minus is off", () => {
    const html = dodaj(clanak());
    expect(html).toContain(`aria-label="${t.dodaj.manje}"`);
    expect(/<button\b[^>]*\sdisabled=""[^>]*aria-label="Manje"|<button\b[^>]*aria-label="Manje"[^>]*\sdisabled=""/.test(html)).toBe(true);
    expect(tekst(/<span\b[^>]*aria-live="polite"[^>]*>[\s\S]*?<\/span>/.exec(html)?.[0] ?? "")).toBe("1");
  });

  test("the price is the one the server charges: a promotion applies on the standard menu, never on Room service", () => {
    const sAkcijom = clanak({ priceRsd: 1040, promo: { active: true, mode: "price", priceRsd: 800 } });
    expect(dugme(dodaj(sAkcijom, { kanal: "standard" }), "data-dodaj")?.tekst).toBe("Dodaj u korpu · 800 RSD");
    expect(dugme(dodaj(sAkcijom, { kanal: "room_service", pageKey: null }), "data-dodaj")?.tekst).toBe("Dodaj u korpu · 1.040 RSD");
  });
});

// -----------------------------------------------------------------------------
// K. The izlog's in-memory venue (components/menu/izlog/gost-memorija.ts)
// -----------------------------------------------------------------------------

describe("izlogRadnje (the izlog's in-memory venue)", () => {
  /** The key of one send attempt (8–64 characters of letters, digits, `_` and `-`). */
  const KLJUC = "kljuc-slanja-0001";

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fresh venue (the module keeps its requests in a module variable); the 450 ms pauses run on a fake clock. */
  async function svezeRadnje(over: Partial<IzlogMemorija> = {}) {
    vi.resetModules();
    const { izlogRadnje } = await import("@/components/menu/izlog/gost-memorija");
    vi.useFakeTimers();
    return izlogRadnje({
      pocetni: [],
      mesto: "Sto 12",
      sadaMs: IZLOG_SADA,
      nadjiArtikal: (_pageKey, articleKey) => STO_ARTIKLI.get(articleKey) ?? null,
      nedostupni: new Set<string>(),
      dostavaRsd: null,
      ...over,
    });
  }

  /** Lets the venue's pause run out, then returns the answer. */
  async function ishod<T>(posao: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500);
    return await posao;
  }

  test("a call asked for twice is answered once: the second is deduped to the same request", async () => {
    const radnje = await svezeRadnje();
    const prvi = await ishod(radnje.pozovi());
    const drugi = await ishod(radnje.pozovi());
    expect(prvi).toMatchObject({ ok: true, status: "new", deduped: false, createdAt: IZLOG_SADA, totals: null });
    expect(drugi).toMatchObject({ ok: true, status: "new", deduped: true });
    expect(prvi.ok && drugi.ok && drugi.requestId === prvi.requestId).toBe(true);
    expect(prvi.ok && prvi.requestId).toBeTruthy();
  });

  test("a bill is deduped on its own, separately from a call", async () => {
    const radnje = await svezeRadnje();
    const poziv = await ishod(radnje.pozovi());
    const racun = await ishod(radnje.racun("card"));
    const racunOpet = await ishod(radnje.racun("cash"));
    expect(racun).toMatchObject({ ok: true, deduped: false });
    expect(racunOpet).toMatchObject({ ok: true, deduped: true });
    expect(poziv.ok && racun.ok && poziv.requestId !== racun.requestId).toBe(true);
  });

  test("the answer carries the way of paying the REQUEST has, not the one just asked for", async () => {
    const radnje = await svezeRadnje();
    const poziv = await ishod(radnje.pozovi());
    const prvi = await ishod(radnje.racun("cash"));
    const drugi = await ishod(radnje.racun("card"));
    expect(poziv).toMatchObject({ ok: true, paymentPreference: null });
    expect(prvi).toMatchObject({ ok: true, deduped: false, paymentPreference: "cash" });
    // The open bill stays a cash bill: the bar must not say "Kartica" for it.
    expect(drugi).toMatchObject({ ok: true, deduped: true, paymentPreference: "cash" });
  });

  test("an order with a stale article is refused with request/cart_stale and names the line", async () => {
    const zastarela = STO_LINIJE[1].articleKey;
    const radnje = await svezeRadnje({
      nadjiArtikal: (_pageKey, articleKey) => (articleKey === zastarela ? null : STO_ARTIKLI.get(articleKey) ?? null),
    });
    const odgovor = await ishod(
      radnje.posalji({ kanal: "standard", linije: orderLinesOf(STO_LINIJE), videnUkupnoRsd: STO_UKUPNO, kljuc: KLJUC }),
    );
    expect(odgovor).toEqual({ ok: false, code: "request/cart_stale", staleLines: [1] });
    expect(odgovor).toMatchObject({ code: REQUEST_ERROR.cartStale });
  });

  test("an order at today's prices is accepted as Novi, with the same totals the cart showed", async () => {
    const radnje = await svezeRadnje();
    const odgovor = await ishod(
      radnje.posalji({ kanal: "standard", linije: orderLinesOf(STO_LINIJE), videnUkupnoRsd: STO_UKUPNO, kljuc: KLJUC }),
    );
    expect(odgovor).toMatchObject({
      ok: true,
      status: "new",
      deduped: false,
      totals: { subtotalRsd: STO_UKUPNO, deliveryFeeRsd: 0, totalRsd: STO_UKUPNO },
    });
  });

  test("a total the guest did not see is request/cart_price_changed with today's prices", async () => {
    const radnje = await svezeRadnje();
    const odgovor = await ishod(
      radnje.posalji({ kanal: "standard", linije: orderLinesOf(STO_LINIJE), videnUkupnoRsd: STO_UKUPNO - 10, kljuc: KLJUC }),
    );
    expect(odgovor).toMatchObject({ ok: false, code: REQUEST_ERROR.cartPriceChanged, totals: { totalRsd: STO_UKUPNO } });
    expect(odgovor.ok ? [] : (odgovor.prices ?? [])).toHaveLength(STO_LINIJE.length);
  });

  test("an unavailable article is request/cart_unavailable and names it", async () => {
    const radnje = await svezeRadnje({ nedostupni: new Set([STO_LINIJE[0].articleKey]) });
    const odgovor = await ishod(
      radnje.posalji({ kanal: "standard", linije: orderLinesOf(STO_LINIJE), videnUkupnoRsd: STO_UKUPNO, kljuc: KLJUC }),
    );
    expect(odgovor).toEqual({ ok: false, code: "request/cart_unavailable", unavailableKeys: [STO_LINIJE[0].articleKey] });
  });

  test("a Room service order carries the delivery fee exactly once", async () => {
    const radnje = await svezeRadnje({
      nadjiArtikal: (_pageKey, articleKey) => RS_ARTIKLI.get(articleKey) ?? null,
      dostavaRsd: DOSTAVA,
      mesto: "Soba 204",
    });
    const odgovor = await ishod(
      radnje.posalji({ kanal: "room_service", linije: orderLinesOf(SOBA_LINIJE), videnUkupnoRsd: SOBA_STAVKE + DOSTAVA, kljuc: KLJUC }),
    );
    expect(odgovor).toMatchObject({
      ok: true,
      totals: { subtotalRsd: SOBA_STAVKE, deliveryFeeRsd: DOSTAVA, totalRsd: SOBA_STAVKE + DOSTAVA },
    });
  });

  test("the same send key again is the SAME order, not a second one", async () => {
    const radnje = await svezeRadnje();
    const porudzbina = { kanal: "standard", linije: orderLinesOf(STO_LINIJE), videnUkupnoRsd: STO_UKUPNO, kljuc: KLJUC } as const;
    const prvi = await ishod(radnje.posalji(porudzbina));
    const drugi = await ishod(radnje.posalji(porudzbina));
    expect(prvi).toMatchObject({ ok: true, status: "new", deduped: false });
    expect(drugi).toMatchObject({
      ok: true,
      status: "new",
      deduped: true,
      totals: { subtotalRsd: STO_UKUPNO, deliveryFeeRsd: 0, totalRsd: STO_UKUPNO },
    });
    expect(prvi.ok && prvi.requestId).toBeTruthy();
    expect(prvi.ok && drugi.ok && drugi.requestId === prvi.requestId).toBe(true);
    expect(prvi.ok && drugi.ok && drugi.createdAt === prvi.createdAt).toBe(true);
    // A third and a fourth time: still the one order.
    const treci = await ishod(radnje.posalji(porudzbina));
    expect(treci).toMatchObject({ ok: true, deduped: true });
    expect(prvi.ok && treci.ok && treci.requestId === prvi.requestId).toBe(true);
  });

  test("a NEW send key writes a new order", async () => {
    const radnje = await svezeRadnje();
    const osnova = { kanal: "standard", linije: orderLinesOf(STO_LINIJE), videnUkupnoRsd: STO_UKUPNO } as const;
    const prvi = await ishod(radnje.posalji({ ...osnova, kljuc: KLJUC }));
    const drugi = await ishod(radnje.posalji({ ...osnova, kljuc: "kljuc-slanja-0002" }));
    expect(prvi).toMatchObject({ ok: true, deduped: false });
    expect(drugi).toMatchObject({ ok: true, deduped: false });
    expect(prvi.ok && drugi.ok && drugi.requestId !== prvi.requestId).toBe(true);
    // And each key is remembered on its own.
    const prviOpet = await ishod(radnje.posalji({ ...osnova, kljuc: KLJUC }));
    expect(prviOpet).toMatchObject({ ok: true, deduped: true });
    expect(prvi.ok && prviOpet.ok && prviOpet.requestId === prvi.requestId).toBe(true);
  });

  test("a refused attempt writes nothing, so its key can be used once the cart is right", async () => {
    const radnje = await svezeRadnje();
    const osnova = { kanal: "standard", linije: orderLinesOf(STO_LINIJE), kljuc: KLJUC } as const;
    const odbijeno = await ishod(radnje.posalji({ ...osnova, videnUkupnoRsd: STO_UKUPNO - 10 }));
    expect(odbijeno).toMatchObject({ ok: false, code: REQUEST_ERROR.cartPriceChanged });
    const primljeno = await ishod(radnje.posalji({ ...osnova, videnUkupnoRsd: STO_UKUPNO }));
    expect(primljeno).toMatchObject({ ok: true, deduped: false });
  });

  test("a Novi request can be cancelled by the guest; an accepted one only by the staff", async () => {
    const radnje = await svezeRadnje({
      pocetni: [
        zahtev({ id: "rq_novi", status: "new" }),
        zahtev({ id: "rq_prihvacen", kind: "bill", status: "accepted", acceptedAt: IZLOG_SADA - 30_000 }),
        zahtev({ id: "rq_gotov", status: "done", doneAt: IZLOG_SADA - 30_000 }),
      ],
    });
    expect(await ishod(radnje.otkazi("rq_novi"))).toEqual({ ok: true });
    expect(await ishod(radnje.otkazi("rq_prihvacen"))).toEqual({ ok: false, code: "request/not_cancellable" });
    expect(await ishod(radnje.otkazi("rq_gotov"))).toEqual({ ok: false, code: "request/not_cancellable" });
    expect(await ishod(radnje.otkazi("rq_nepostojeci"))).toEqual({ ok: false, code: "request/not_found" });
    // Asking again for the one already cancelled is not an error.
    expect(await ishod(radnje.otkazi("rq_novi"))).toEqual({ ok: true });
  });

  test("a cancelled call is closed: the next call is a new request, not a dedupe", async () => {
    const radnje = await svezeRadnje();
    const prvi = await ishod(radnje.pozovi());
    if (!prvi.ok || !prvi.requestId) throw new Error("the first call should have been created");
    expect(await ishod(radnje.otkazi(prvi.requestId))).toEqual({ ok: true });
    const drugi = await ishod(radnje.pozovi());
    expect(drugi).toMatchObject({ ok: true, deduped: false });
    expect(drugi.ok && drugi.requestId !== prvi.requestId).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// L. The key of a send attempt (use-korpa.ts kljucSlanja / lib/menu/cart.ts)
// -----------------------------------------------------------------------------

describe("the send key of a cart", () => {
  const linije = orderLinesOf(STO_LINIJE);
  const otisak = orderFingerprint(linije);

  test("the fingerprint is the same for the same lines and another for a changed cart", () => {
    expect(otisak.length).toBeGreaterThan(0);
    expect(orderFingerprint(orderLinesOf(STO_LINIJE))).toBe(otisak);
    const vise = orderLinesOf(STO_LINIJE.map((linija, index) => (index === 0 ? { ...linija, quantity: linija.quantity + 1 } : linija)));
    expect(orderFingerprint(vise)).not.toBe(otisak);
    expect(orderFingerprint(linije.slice(1))).not.toBe(otisak);
  });

  test("a key has the shape the server accepts, and carries the cart's fingerprint", () => {
    const kljuc = kljucSlanja("kljuc-oblik", "standard", otisak, false);
    expect(isOrderAttemptKey(kljuc)).toBe(true);
    expect(kljuc.endsWith(`-${otisak}`)).toBe(true);
    zavrsiSlanje("kljuc-oblik", "standard", false);
  });

  test("the same cart keeps its key across retries; a changed cart gets a new one", () => {
    const prvi = kljucSlanja("kljuc-ponovo", "standard", otisak, false);
    expect(kljucSlanja("kljuc-ponovo", "standard", otisak, false)).toBe(prvi);
    expect(kljucSlanja("kljuc-ponovo", "standard", otisak, false)).toBe(prvi);

    const promenjen = kljucSlanja("kljuc-ponovo", "standard", orderFingerprint(linije.slice(1)), false);
    expect(promenjen).not.toBe(prvi);
    expect(isOrderAttemptKey(promenjen)).toBe(true);
    zavrsiSlanje("kljuc-ponovo", "standard", false);
  });

  test("a sent cart forgets its key: the next order starts a new attempt", () => {
    const prvi = kljucSlanja("kljuc-poslato", "standard", otisak, false);
    zavrsiSlanje("kljuc-poslato", "standard", false);
    const drugi = kljucSlanja("kljuc-poslato", "standard", otisak, false);
    expect(drugi).not.toBe(prvi);
    zavrsiSlanje("kljuc-poslato", "standard", false);
  });

  test("each venue and each channel has its own key", () => {
    const standard = kljucSlanja("kljuc-lokal-a", "standard", otisak, false);
    const roomService = kljucSlanja("kljuc-lokal-a", "room_service", otisak, false);
    const drugiLokal = kljucSlanja("kljuc-lokal-b", "standard", otisak, false);
    expect(new Set([standard, roomService, drugiLokal]).size).toBe(3);
    // Finishing one leaves the others.
    zavrsiSlanje("kljuc-lokal-a", "standard", false);
    expect(kljucSlanja("kljuc-lokal-a", "room_service", otisak, false)).toBe(roomService);
    expect(kljucSlanja("kljuc-lokal-b", "standard", otisak, false)).toBe(drugiLokal);
    zavrsiSlanje("kljuc-lokal-a", "room_service", false);
    zavrsiSlanje("kljuc-lokal-b", "standard", false);
  });

  test("the key is random, not derived from the cart alone: two attempts of one cart differ before the fingerprint", () => {
    const prvi = kljucSlanja("kljuc-nasumican", "standard", otisak, false);
    zavrsiSlanje("kljuc-nasumican", "standard", false);
    const drugi = kljucSlanja("kljuc-nasumican", "standard", otisak, false);
    zavrsiSlanje("kljuc-nasumican", "standard", false);
    const slucajniDeo = (kljuc: string) => kljuc.slice(0, kljuc.length - otisak.length - 1);
    expect(slucajniDeo(prvi).length).toBeGreaterThanOrEqual(8);
    expect(slucajniDeo(prvi)).not.toBe(slucajniDeo(drugi));
  });
});

describe("the izlog's starting cart is in the server render too", () => {
  test("korpa=1, greska=cena and greska=nedostupno render their lines, not an empty cart", () => {
    const korpa = renderToStaticMarkup(<JavniIzlog params={parsePublicPreview({ pozicija: "sto", layout: "tok", korpa: "1" })} />);
    expect(korpa).toContain("data-posalji");
    expect(korpa).not.toContain(menuGostSr.korpa.prazno);
    expect(korpa).toContain("Ćevapi");

    const cena = renderToStaticMarkup(<JavniIzlog params={parsePublicPreview({ pozicija: "sto", layout: "tok", greska: "cena" })} />);
    expect(cena).toContain(menuGostSr.korpa.posaljiNovo);

    const nedostupno = renderToStaticMarkup(
      <JavniIzlog params={parsePublicPreview({ pozicija: "sto", layout: "tok", greska: "nedostupno" })} />,
    );
    expect(nedostupno).toContain('data-problem="nedostupno"');

    const soba = renderToStaticMarkup(<JavniIzlog params={parsePublicPreview({ pozicija: "soba", korpa: "1" })} />);
    expect(soba).toContain("data-dostava");
    expect(soba).toContain("Club sendvič");
  });
});
