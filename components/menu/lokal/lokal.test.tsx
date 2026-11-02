// K20 tests of the screen "Lokal i QR": Lista, Kartice, the drawers and the
// print sheet. No DOM in the edge-runtime environment: the screen is checked as
// renderToStaticMarkup strings. `@/components/ui/dialog` and `/sheet` are
// replaced by stand-ins that render an open dialog inline (the Radix portal
// mounts only after effects), as the other Menu render tests do; the floor
// layout editor is a stub (it has its own tests). Invented data only.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type {
  LokalEkranProps,
  LokalIshod,
  LokalKartica,
  LokalPodaci,
  LokalPozicija,
  LokalRadnje,
  LokalZona,
} from "@/lib/menu/lokal/model";
import { positionsWithoutCard } from "@/lib/menu/qr-diagnostics";
import { qrMatrix } from "@/lib/qr/qrcodegen";
import { DodajPozicije } from "./dodaj-pozicije";
import { vremeSkena } from "./kartice/stanje-kartice";
import { LokalEkran, sazetakLokala } from "./lokal-ekran";
import { QrSlika, qrAdresa, qrSvgDokument } from "./qr-slika";
import { grupisiPozicije, porukaGreske } from "./zajednicko";
import { UpravljanjeZonama } from "./zone";

type DomProps = Record<string, unknown>;

// Only the data-* attributes of the real content reach the stand-in (handlers such as
// onOpenAutoFocus would be unknown DOM properties).
vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/dialog")>();
  const samoData = (props: DomProps): DomProps =>
    Object.fromEntries(Object.entries(props).filter(([kljuc]) => kljuc.startsWith("data-")));
  return {
    ...original,
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <>{children}</> : null),
    DialogContent: ({ children, ...props }: { children?: ReactNode } & DomProps) => (
      <div role="dialog" {...samoData(props)}>
        {children}
      </div>
    ),
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

vi.mock("@/components/ui/sheet", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/ui/sheet")>();
  const samoData = (props: DomProps): DomProps =>
    Object.fromEntries(Object.entries(props).filter(([kljuc]) => kljuc.startsWith("data-")));
  return {
    ...original,
    Sheet: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <>{children}</> : null),
    SheetContent: ({ children, ...props }: { children?: ReactNode } & DomProps) => (
      <div role="dialog" {...samoData(props)}>
        {children}
      </div>
    ),
    SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  };
});

// The floor layout editor has its own tests; here only what the screen hands it.
vi.mock("./raspored/raspored", () => ({
  Raspored: (props: { zones: unknown[]; positions: unknown[]; onOtvoriPoziciju: unknown; radnje: unknown }) => (
    <div
      data-raspored-proba=""
      data-zone={props.zones.length}
      data-mesta={props.positions.length}
      data-otvori={typeof props.onOtvoriPoziciju}
      data-radnje={typeof props.radnje}
    />
  ),
}));

const t = menuLokalSr;

// --- Data (Demo restoran) -----------------------------------------------------------

const ZONE: LokalZona[] = [
  { id: "z-sala", key: "zn-sala", name: "Glavna sala", order: 0 },
  { id: "z-terasa", key: "zn-terasa", name: "Terasa", order: 1 },
];

const mesto = (id: string, label: string, preko: Partial<LokalPozicija> = {}): LokalPozicija => ({
  id,
  key: id,
  kind: "table",
  label,
  seats: 4,
  zoneId: null,
  layout: null,
  order: 0,
  ...preko,
});

// Deliberately out of order: the list sorts "Sto 2" before "Sto 10".
const POZICIJE: LokalPozicija[] = [
  mesto("p-sto-10", "Sto 10", { zoneId: "z-sala", order: 3 }),
  mesto("p-sto-2", "Sto 2", { zoneId: "z-sala", order: 2, seats: 2 }),
  mesto("p-sto-1", "Sto 1", { zoneId: "z-sala", order: 1 }),
  mesto("p-sto-11", "Sto 11", { zoneId: "z-terasa", order: 4, seats: 1 }),
  mesto("p-sank", "Šank", { kind: "other", seats: null, order: 5 }),
  mesto("p-soba-101", "Soba 101", { kind: "room", seats: null, order: 6 }),
];

const kartica = (id: string, preko: Partial<LokalKartica>): LokalKartica => ({
  id,
  cardCode: "AAAAAAAA",
  label: id,
  status: "active",
  managedByScanMe: false,
  opensMenu: true,
  link: { pageKey: "p-meni", positionId: null, active: true },
  totalScans: 0,
  lastScanAt: null,
  createdAt: 0,
  ...preko,
});

const KARTICE: LokalKartica[] = [
  kartica("c-sto-1", {
    cardCode: "K7M2Q9XA",
    label: "Sto 1",
    link: { pageKey: "p-meni", positionId: "p-sto-1", active: true },
    totalScans: 42,
    lastScanAt: Date.UTC(2026, 9, 17, 16, 20),
  }),
  kartica("c-sto-2", {
    cardCode: "H3T6R8BD",
    label: "Sto 2",
    status: "disabled",
    link: { pageKey: "p-meni", positionId: "p-sto-2", active: true },
  }),
  kartica("c-stara", { cardCode: "Q4W8N3ZB", label: "Stara kartica", opensMenu: false, link: null }),
  kartica("c-scanme", { cardCode: "SCAN0001", label: "Pult", managedByScanMe: true, link: null }),
  kartica("c-vino", {
    cardCode: "V9N2L5CE",
    label: "Vinska karta",
    link: { pageKey: "p-vino", positionId: null, active: true },
    totalScans: 3,
    lastScanAt: Date.UTC(2026, 9, 16, 19, 5),
  }),
  kartica("c-ukinuta", {
    cardCode: "P6D4F7MG",
    label: "Terasa bar",
    link: { pageKey: "p-meni", positionId: "p-sto-11", active: false },
  }),
  kartica("c-nestala", {
    cardCode: "R2J8X4TH",
    label: "Dezert karta",
    link: { pageKey: "p-obrisana", positionId: null, active: true },
  }),
];

const PODACI: LokalPodaci = {
  zones: ZONE,
  positions: POZICIJE,
  cards: KARTICE,
  pages: [
    { key: "p-meni", name: "Kompletan meni", slug: "meni", isDefault: true },
    { key: "p-vino", name: "Vinska karta", slug: "vinska-karta", isDefault: false },
  ],
  cardsTruncated: false,
};

const BEZ_ZONA: LokalPodaci = {
  ...PODACI,
  zones: [],
  positions: POZICIJE.map((pozicija) => ({ ...pozicija, zoneId: null })),
};

const PRAZNO: LokalPodaci = { zones: [], positions: [], cards: [], pages: PODACI.pages, cardsTruncated: false };

const ok = async (): Promise<LokalIshod> => ({ ok: true });
const RADNJE: LokalRadnje = {
  createPosition: ok,
  createPositions: ok,
  updatePosition: ok,
  archivePosition: ok,
  setLayout: ok,
  setLayouts: ok,
  createZone: ok,
  renameZone: ok,
  moveZone: ok,
  archiveZone: ok,
  mintForPositions: ok,
  mintForPage: ok,
  linkCard: ok,
  setCardActive: ok,
};

function ekran(preko: Partial<LokalEkranProps> = {}, podaci: LokalPodaci = PODACI): string {
  return renderToStaticMarkup(
    <LokalEkran
      podaci={podaci}
      radnje={RADNJE}
      pogled="lista"
      onPogled={() => {}}
      qrOrigin="https://scanme.example"
      meniHref="/demo-restoran/meni"
      {...preko}
    />,
  );
}

// --- Helpers over the markup --------------------------------------------------------

const brojPojavljivanja = (html: string, trag: string) => html.split(trag).length - 1;
const bezTagova = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const kolikoH1 = (html: string) => brojPojavljivanja(html, "<h1");
/** The markup of one card entry: from its marker to the marker of the next card (or the end). */
function redKartice(html: string, id: string): string {
  const pocetak = html.indexOf(`data-kartica-id="${id}"`);
  if (pocetak === -1) return "";
  const kraj = html.indexOf('data-kartica-id="', pocetak + 1);
  return html.slice(pocetak, kraj === -1 ? undefined : kraj);
}
const mesta = (html: string) =>
  Array.from(html.matchAll(/<li[^>]*data-pozicija="([^"]+)"/g)).map((poklapanje) => poklapanje[1]);

/** Buttons that have neither a visible text nor an aria-label. */
function dugmadBezImena(html: string): string[] {
  return Array.from(html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g))
    .map((poklapanje) => poklapanje[0])
    .filter((dugme) => !/aria-label="[^"]+"/.test(dugme) && bezTagova(dugme).trim() === "");
}

/** Icons that are neither hidden from assistive technology nor a labelled picture. */
const ikoniceBezSkrivanja = (html: string) =>
  (html.match(/<svg\b[^>]*>/g) ?? []).filter((oznaka) => !oznaka.includes('aria-hidden="true"') && !oznaka.includes('role="img"'));

// --- Header, tabs, summary ----------------------------------------------------------

describe("header, tabs and summary", () => {
  test("one h1 with the purpose sentence and the public menu link in a new tab", () => {
    for (const pogled of ["lista", "kartice"] as const) {
      const html = ekran({ pogled });
      expect(kolikoH1(html)).toBe(1);
      expect(html).toContain(">Lokal i QR</h1>");
      expect(bezTagova(html)).toContain(t.ekran.opis);
    }
    const html = ekran();
    const veza = /<a [^>]*>/.exec(html.slice(html.indexOf("</h1>")))?.[0] ?? "";
    expect(veza).toContain('href="/demo-restoran/meni"');
    expect(veza).toContain('target="_blank"');
    expect(veza).toContain('rel="noopener noreferrer"');
    expect(bezTagova(html)).toContain("Otvori javni meni");
  });

  test("tabs: Lista, Raspored, Kartice as a tablist, the open one is selected", () => {
    const html = ekran({ pogled: "kartice" });
    expect(html).toContain('role="tablist"');
    expect(brojPojavljivanja(html, 'role="tab"')).toBe(3);
    expect(brojPojavljivanja(html, 'aria-selected="true"')).toBe(1);
    expect(html).toMatch(/id="lokal-tab-kartice"[^>]*aria-selected="true"/);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="lokal-tab-kartice"');
    for (const naziv of ["Lista", "Raspored", "Kartice"]) expect(html).toContain(`>${naziv}</button>`);
  });

  test("summary: places, zones only when there are zones, QR cards", () => {
    expect(sazetakLokala(PODACI)).toBe("6 mesta · 2 zone · 7 QR kartica");
    expect(sazetakLokala(BEZ_ZONA)).toBe("6 mesta · 7 QR kartica");
    expect(sazetakLokala(PRAZNO)).toBe(t.ekran.sazetak.nista);
    expect(bezTagova(ekran())).toContain("6 mesta · 2 zone · 7 QR kartica");
  });

  test("the floor layout editor gets the zones, the positions and the actions, and a way to open a position", () => {
    const html = ekran({ pogled: "raspored" });
    expect(html).toContain('data-raspored-proba=""');
    expect(html).toContain('data-zone="2"');
    expect(html).toContain('data-mesta="6"');
    expect(html).toContain('data-otvori="function"');
    expect(html).toContain('data-radnje="object"');
    expect(html).not.toContain("data-grupa-zone");
  });
});

// --- Lista --------------------------------------------------------------------------

describe("Lista", () => {
  test("groups by zone in the zone order, then Bez zone, each sorted naturally", () => {
    const html = ekran();
    const naslovi = Array.from(html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)).map((m) => bezTagova(m[1]).trim());
    expect(naslovi).toEqual(["Glavna sala 3 mesta", "Terasa 1 mesto", "Bez zone 2 mesta"]);
    // Labels sort naturally (Sto 2 before Sto 10) and by Serbian collation (Soba before Šank).
    expect(mesta(html)).toEqual(["p-sto-1", "p-sto-2", "p-sto-10", "p-sto-11", "p-soba-101", "p-sank"]);
  });

  test("a row says what the position is, its seats and the state of its QR card", () => {
    const html = ekran();
    const tekst = bezTagova(html);
    expect(tekst).toContain("Sto · 4 sedišta");
    expect(tekst).toContain("Sto · 2 sedišta");
    expect(tekst).toContain("Sto · 1 sedište");
    expect(tekst).toContain("Soba");
    expect(tekst).toContain("Ostalo");
    expect(tekst).toContain("QR: 1 kartica");
    expect(tekst).toContain("Nema QR kartice");
    // Sto 2 has only a disabled card, Sto 11 only a card whose link is off: neither works.
    expect(brojPojavljivanja(tekst, "QR kartica ne radi")).toBe(2);
  });

  test("every row has an Uredi button that names the position, and no icon is read out", () => {
    const html = ekran();
    expect(brojPojavljivanja(html, ">Uredi</button>")).toBe(6);
    expect(html).toContain('aria-label="Uredi Sto 10"');
    expect(dugmadBezImena(html)).toEqual([]);
    expect(ikoniceBezSkrivanja(html)).toEqual([]);
  });

  test("the toolbar offers Dodaj mesta and Zone; without zones it offers to split into zones", () => {
    expect(bezTagova(ekran())).toMatch(/Zone\s*Dodaj mesta|Zone .*Dodaj mesta/);
    const bez = bezTagova(ekran({}, BEZ_ZONA));
    expect(bez).toContain("Podeli na zone");
    expect(bez).toContain("Dodaj mesta");
  });

  test("without zones: one flat list, no zone heading and no zone group", () => {
    const html = ekran({}, BEZ_ZONA);
    expect(html).not.toContain("data-grupa-zone");
    expect(html).not.toContain("<h3");
    expect(html).not.toContain("Glavna sala");
    expect(html).not.toContain("Bez zone");
    expect(brojPojavljivanja(html, "<ul")).toBe(1);
    expect(mesta(html)).toEqual(["p-soba-101", "p-sto-1", "p-sto-2", "p-sto-10", "p-sto-11", "p-sank"]);
  });

  test("a zone without positions says so; Bez zone is left out when empty", () => {
    const podaci: LokalPodaci = { ...PODACI, positions: POZICIJE.filter((pozicija) => pozicija.zoneId === "z-sala") };
    const tekst = bezTagova(ekran({}, podaci));
    expect(tekst).toContain("U ovoj zoni još nema mesta.");
    expect(tekst).not.toContain("Bez zone");
  });

  test("empty venue: an honest empty state that says the menu works without tables", () => {
    const html = ekran({}, PRAZNO);
    const tekst = bezTagova(html);
    expect(tekst).toContain("Još nema mesta");
    expect(tekst).toContain("Meni radi i bez njih");
    expect(tekst).toContain("Dodaj prvo mesto");
    expect(html).not.toContain("data-pozicija=");
    expect(kolikoH1(html)).toBe(1);
  });

  test("grupisiPozicije: zone order, natural label order, Bez zone last and only when used", () => {
    const grupe = grupisiPozicije(ZONE, POZICIJE);
    expect(grupe.map((g) => g.zona?.name ?? null)).toEqual(["Glavna sala", "Terasa", null]);
    expect(grupe[0].pozicije.map((p) => p.label)).toEqual(["Sto 1", "Sto 2", "Sto 10"]);
    expect(grupisiPozicije(ZONE, [])).toHaveLength(2);
    expect(grupisiPozicije([], POZICIJE)).toHaveLength(1);
    // A position in a zone that no longer exists is shown under Bez zone.
    const sirota = grupisiPozicije(ZONE, [mesto("p-x", "Sto 7", { zoneId: "z-nema" })]);
    expect(sirota.at(-1)?.zona).toBeNull();
    expect(sirota.at(-1)?.pozicije).toHaveLength(1);
  });
});

// --- The drawer of a position -------------------------------------------------------

describe("drawer of a position", () => {
  test("opens at the given position with its fields and its cards", () => {
    const html = ekran({ pocetnaPozicija: "p-sto-1" });
    expect(html).toContain('role="dialog"');
    expect(html).toMatch(/<h2>Sto 1<\/h2>/);
    expect(html).toMatch(/<input[^>]*value="Sto 1"/);
    expect(html).toMatch(/<input[^>]*value="4"/);
    const tekst = bezTagova(html);
    for (const polje of ["Naziv ili broj", "Vrsta", "Broj sedišta", "(nije obavezno)", "Zona", "Sačuvaj"]) {
      expect(tekst).toContain(polje);
    }
    expect(tekst).toContain("QR kartice ovog mesta");
    expect(tekst).toContain("K7M2Q9XA");
    expect(tekst).toContain("Aktivna");
    expect(tekst).toContain("Napravi QR karticu za ovo mesto");
    expect(tekst).toContain("Arhiviraj mesto");
    // The kind is a radio group with the three kinds.
    expect(brojPojavljivanja(html, 'type="radio"')).toBeGreaterThanOrEqual(3);
    expect(tekst).toContain("Sto");
    expect(tekst).toContain("Soba");
    expect(tekst).toContain("Ostalo");
  });

  test("zone choice with Bez zone only when the venue has zones", () => {
    const sa = ekran({ pocetnaPozicija: "p-sto-1" });
    expect(sa).toMatch(/<select[^>]*>\s*<option value="">Bez zone<\/option><option value="z-sala" selected="">Glavna sala/);
    const bez = ekran({ pocetnaPozicija: "p-sto-1" }, BEZ_ZONA);
    expect(bez).toContain('role="dialog"');
    expect(bez).not.toMatch(/<label[^>]*>Zona/);
    expect(bez).not.toContain("<select");
    expect(bez).not.toContain("Bez zone");
  });

  test("a position without a card says so and still offers to make one", () => {
    const tekst = bezTagova(ekran({ pocetnaPozicija: "p-sank" }));
    expect(tekst).toContain("Ovo mesto još nema QR karticu.");
    expect(tekst).toContain("Napravi QR karticu za ovo mesto");
  });

  test("an empty seat count shows an empty field", () => {
    expect(ekran({ pocetnaPozicija: "p-sank" })).toMatch(/<input[^>]*inputMode="numeric"[^>]*value=""/);
  });

  test("an unknown position opens nothing", () => {
    expect(ekran({ pocetnaPozicija: "p-nema" })).not.toContain('role="dialog"');
    expect(ekran()).not.toContain('role="dialog"');
  });
});

// --- Adding and zones ---------------------------------------------------------------

function dodaj(podaci: LokalPodaci): string {
  return renderToStaticMarkup(
    <DodajPozicije otvoreno podaci={podaci} radnje={RADNJE} onZatvori={() => {}} onJavi={() => {}} />,
  );
}

describe("Dodaj mesta", () => {
  test("an empty venue starts with many at once: Sto from 1, ten of them, a live preview", () => {
    const html = dodaj(PRAZNO);
    const tekst = bezTagova(html);
    expect(tekst).toContain("Jedno mesto");
    expect(tekst).toContain("Više odjednom");
    expect(tekst).toContain("Početak naziva");
    expect(html).toMatch(/<input[^>]*value="Sto"/);
    expect(tekst).toContain("Biće dodato: Sto 1 – Sto 10");
    expect(tekst).toContain("Dodaj 10 mesta");
    expect(tekst).toContain("Najviše 100 mesta odjednom.");
    expect(brojPojavljivanja(html, 'type="radio"')).toBe(5);
    // No zones: no zone choice.
    expect(html).not.toContain("<select");
  });

  test("a venue with positions starts with one position", () => {
    const html = dodaj(BEZ_ZONA);
    const tekst = bezTagova(html);
    expect(tekst).toContain("Naziv ili broj");
    expect(tekst).toContain("Dodaj mesto");
    expect(tekst).not.toContain("Početak naziva");
  });

  test("a venue with zones offers the zone choice with Bez zone first", () => {
    const html = dodaj(PODACI);
    expect(html).toMatch(
      /<select[^>]*>\s*<option value=""( selected="")?>Bez zone<\/option><option value="z-sala">Glavna sala<\/option><option value="z-terasa">Terasa/,
    );
  });
});

function zone(zones: LokalZona[]): string {
  return renderToStaticMarkup(
    <UpravljanjeZonama otvoreno zones={zones} positions={POZICIJE} radnje={RADNJE} onZatvori={() => {}} />,
  );
}

describe("Zone", () => {
  test("says zones are optional, lists them with named icon buttons, edges disabled", () => {
    const html = zone(ZONE);
    const tekst = bezTagova(html);
    expect(tekst).toContain("Zone su opcione. Uključite ih samo ako je lokal zaista podeljen (npr. sala, terasa).");
    expect(tekst).toContain("Glavna sala 3 mesta");
    expect(html).toContain('aria-label="Preimenuj zonu Glavna sala"');
    expect(html).toContain('aria-label="Pomeri zonu Terasa gore"');
    expect(html).toContain('aria-label="Pomeri zonu Glavna sala dole"');
    expect(html).toContain('aria-label="Arhiviraj zonu Terasa"');
    // The first zone cannot go up, the last cannot go down.
    expect(html).toMatch(/<button[^>]*aria-label="Pomeri zonu Glavna sala gore"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*aria-label="Pomeri zonu Terasa dole"[^>]*disabled=""/);
    expect(dugmadBezImena(html)).toEqual([]);
    expect(ikoniceBezSkrivanja(html)).toEqual([]);
    expect(tekst).toContain("Naziv nove zone");
    expect(tekst).toContain("Dodaj zonu");
  });

  test("no zones yet: the hint, a way to add the first one, nothing to move", () => {
    const html = zone([]);
    const tekst = bezTagova(html);
    expect(tekst).toContain("Još nema zona.");
    expect(tekst).toContain("Dodaj zonu");
    expect(html).not.toContain("Pomeri zonu");
  });
});

// --- Kartice ------------------------------------------------------------------------

describe("Kartice", () => {
  const html = ekran({ pogled: "kartice" });
  const tekst = bezTagova(html);

  test("one entry per card, in the given order, with label and code", () => {
    expect(Array.from(html.matchAll(/data-kartica-id="([^"]+)"/g)).map((m) => m[1])).toEqual(
      KARTICE.map((k) => k.id),
    );
    for (const k of KARTICE) {
      expect(redKartice(html, k.id)).toContain(k.cardCode);
      expect(bezTagova(redKartice(html, k.id))).toContain(k.label);
    }
    expect(redKartice(html, "c-sto-1")).toMatch(/<p class="font-mono[^"]*">/);
  });

  test("states in words: active, disabled, opens something else", () => {
    expect(bezTagova(redKartice(html, "c-sto-1"))).toContain("Aktivna");
    expect(bezTagova(redKartice(html, "c-sto-2"))).toContain("Isključena");
    const stara = bezTagova(redKartice(html, "c-stara"));
    expect(stara).toContain("Otvara nešto drugo");
    expect(stara).toContain("Ova kartica trenutno ne otvara meni");
  });

  test("where a scan leads: the default page is Meni, the entry, no position", () => {
    expect(bezTagova(redKartice(html, "c-sto-1"))).toContain("Otvara: Meni · Sto 1");
    expect(bezTagova(redKartice(html, "c-vino"))).toContain("Otvara: Vinska karta · bez mesta");
    // A disabled card opens nothing.
    expect(bezTagova(redKartice(html, "c-sto-2"))).not.toContain("Otvara:");
  });

  test("last scan in Belgrade time and the total, or that it was never scanned", () => {
    const sto1 = bezTagova(redKartice(html, "c-sto-1"));
    expect(sto1).toMatch(/Poslednji sken: 17\. ?10\.? u 18:20/);
    expect(sto1).toContain("Skenova ukupno: 42");
    expect(vremeSkena(Date.UTC(2026, 9, 17, 16, 20))).toMatch(/^17\. ?10\.? u 18:20$/);
    // Winter time is one hour behind summer time.
    expect(vremeSkena(Date.UTC(2026, 11, 5, 8, 7))).toMatch(/^5\. ?12\.? u 0?9:07$/);
    expect(bezTagova(redKartice(html, "c-sto-2"))).toContain("Još nije skenirana");
    expect(bezTagova(redKartice(html, "c-sto-2"))).not.toContain("Skenova ukupno");
  });

  test("problems are warning lines with text, not colour alone", () => {
    const ukinuta = redKartice(html, "c-ukinuta");
    expect(bezTagova(ukinuta)).toContain("Upozorenje:");
    expect(bezTagova(ukinuta)).toContain(t.kartice.problemi.vezaIskljucena);
    expect(bezTagova(redKartice(html, "c-nestala"))).toContain(t.kartice.problemi.stranicaNedostupna);
    expect(redKartice(html, "c-sto-1")).not.toContain("data-problemi");
    expect(ikoniceBezSkrivanja(html)).toEqual([]);
  });

  test("a card of ScanMe is read-only: the note, no Poveži and no Isključi", () => {
    const scanMe = redKartice(html, "c-scanme");
    expect(bezTagova(scanMe)).toContain("Ovom karticom upravlja ScanMe.");
    expect(scanMe).not.toContain(">Poveži<");
    expect(scanMe).not.toContain(">Isključi<");
    expect(scanMe).not.toContain(">Uključi<");
    // Still downloadable and printable.
    expect(scanMe).toContain(">Preuzmi SVG<");
    expect(scanMe).toContain('type="checkbox"');
  });

  test("actions per card: Poveži, Isključi / Uključi, Preuzmi SVG, a print checkbox with the label in its name", () => {
    const sto1 = redKartice(html, "c-sto-1");
    expect(sto1).toContain(">Poveži<");
    expect(sto1).toContain('aria-label="Poveži karticu Sto 1"');
    expect(sto1).toContain(">Isključi<");
    expect(sto1).toContain('aria-label="Isključi karticu Sto 1"');
    expect(sto1).toContain('aria-label="Preuzmi SVG za karticu Sto 1"');
    expect(bezTagova(sto1)).toContain("Za štampu Sto 1");
    const ugasena = redKartice(html, "c-sto-2");
    expect(ugasena).toContain(">Uključi<");
    expect(ugasena).not.toContain(">Isključi<");
    // A card that opens something else cannot be connected to a page or a position.
    expect(redKartice(html, "c-stara")).not.toContain(">Poveži<");
    // K34: nor switched on or off from the Menu (menuQr.setCardActive is for Menu cards only).
    expect(redKartice(html, "c-stara")).not.toContain(">Isključi<");
    expect(redKartice(html, "c-stara")).not.toContain(">Uključi<");
  });

  test("toolbar: make cards for positions without one, a card for a page, print chosen and all", () => {
    const bez = positionsWithoutCard(POZICIJE, KARTICE).length;
    expect(bez).toBeGreaterThan(0);
    expect(tekst).toContain(`Napravi kartice za mesta bez kartice (${bez})`);
    expect(tekst).toContain("Nova kartica za stranicu");
    expect(tekst).toContain("Štampaj izabrane (0)");
    expect(tekst).toContain("Štampaj sve");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Štampaj izabrane \(0\)/);
    expect(html).toContain('role="group" aria-label="Radnje nad karticama"');
  });

  test("says once that more cards for different pages cost nothing extra", () => {
    expect(brojPojavljivanja(tekst, "Više kartica za različite stranice ne košta ništa dodatno.")).toBe(1);
  });

  test("one h1, every button has a name", () => {
    expect(kolikoH1(html)).toBe(1);
    expect(dugmadBezImena(html)).toEqual([]);
  });

  test("a truncated list says that it is, and that missing cards still work", () => {
    const skraceno = bezTagova(ekran({ pogled: "kartice" }, { ...PODACI, cardsTruncated: true }));
    expect(skraceno).toContain("Ovde se vidi prvih 7 kartica.");
    expect(skraceno).toContain("i dalje rade");
    expect(tekst).not.toContain("Ovde se vidi prvih");
  });

  test("no cards yet: the empty state offers the ways to make some, no print buttons", () => {
    const prazno = bezTagova(ekran({ pogled: "kartice" }, { ...PRAZNO, positions: POZICIJE }));
    expect(prazno).toContain("Još nema QR kartica");
    expect(prazno).toContain("Napravi kartice za mesta bez kartice (6)");
    expect(prazno).toContain("Nova kartica za stranicu");
    expect(prazno).not.toContain("Štampaj");
  });
});

// --- Print sheet --------------------------------------------------------------------

describe("print sheet", () => {
  const html = ekran({ pocetnaStampa: true });

  test("opens at once with a card per chosen card: code, label, where it leads, card code", () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-stampa-okvir=""');
    expect(brojPojavljivanja(html, "data-stampa-kartica=")).toBe(KARTICE.length);
    expect(html).toContain('data-stampa-list=""');
    expect(brojPojavljivanja(html, 'role="img"')).toBe(KARTICE.length);
    expect(html).toContain('aria-label="QR kod za karticu Sto 1"');
    expect(html).toContain('width="4cm"');
    const tekst = bezTagova(html);
    expect(tekst).toContain("Štampa QR kartica");
    expect(tekst).toContain("Kartica za štampu: 7");
    expect(tekst).toContain("K7M2Q9XA");
    expect(tekst).toContain("Meni · Sto 1");
    expect(tekst).toContain("Vinska karta · bez mesta");
  });

  test("buttons Štampaj and Zatvori, and the 100 % advice", () => {
    const tekst = bezTagova(html);
    expect(tekst).toContain("Štampaj");
    expect(tekst).toContain("Zatvori");
    expect(tekst).toContain("100 %");
    expect(dugmadBezImena(html)).toEqual([]);
  });

  test("print rules: only the sheet prints, black on white, a card is never split across pages", () => {
    const stil = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    expect(stil).toContain("@media print");
    expect(stil).toContain("@page");
    expect(stil).toContain("body>*:not([data-stampa-okvir])");
    expect(stil).toContain("break-inside:avoid");
    expect(stil).toContain("color:#000!important");
    expect(stil).toContain("position:static!important");
    expect(html).toContain("print:grid-cols-3");
    expect(html).toContain("break-inside-avoid");
  });

  test("the sheet is closed without pocetnaStampa", () => {
    expect(ekran()).not.toContain("data-stampa-okvir");
  });
});

// --- QR drawing ---------------------------------------------------------------------

describe("QR code", () => {
  test("QrSlika: a labelled picture with a quiet zone of 4 modules, black on white", () => {
    const url = qrAdresa("https://scanme.example", "K7M2Q9XA");
    expect(url).toBe("https://scanme.example/r/K7M2Q9XA");
    const html = renderToStaticMarkup(<QrSlika url={url} naslov="QR kod za karticu Sto 1" velicina={160} />);
    const dim = qrMatrix(url, "MEDIUM").length + 8;
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QR kod za karticu Sto 1"');
    expect(html).toContain(`viewBox="0 0 ${dim} ${dim}"`);
    expect(html).toContain('fill="#ffffff"');
    expect(html).toContain('fill="#000000"');
    expect(html).toContain('width="160"');
    expect(html).toMatch(/<path d="M\d+,\d+h\d+v1h-\d+z/);
  });

  test("qrSvgDokument: a standalone SVG with the code and the escaped label", () => {
    const dokument = qrSvgDokument({
      url: "https://scanme.example/r/K7M2Q9XA",
      naslov: `Sto <1> & "Bar" 'x'`,
      podnaslov: "K7M2Q9XA",
    });
    expect(dokument.startsWith("<svg")).toBe(true);
    expect(dokument.endsWith("</svg>")).toBe(true);
    expect(dokument).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(dokument).toContain("<path d=\"M");
    expect(dokument).toContain("Sto &lt;1&gt; &amp; &quot;Bar&quot; &apos;x&apos;");
    expect(dokument).not.toContain("<1>");
    expect(dokument).toContain(">K7M2Q9XA</text>");
    expect(dokument).toContain('fill="#ffffff"');
    expect(dokument).toContain('width="60mm"');
    // The viewBox grows by the text under the code.
    const [, sirina, visina] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(dokument) ?? [];
    expect(Number(visina)).toBeGreaterThan(Number(sirina));
  });

  test("qrSvgDokument without a second line is shorter, and a long label is shrunk to fit", () => {
    const visina = (dokument: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(dokument)?.[1]);
    const url = "https://scanme.example/r/K7M2Q9XA";
    expect(visina(qrSvgDokument({ url, naslov: "Sto 1" }))).toBeLessThan(
      visina(qrSvgDokument({ url, naslov: "Sto 1", podnaslov: "K7M2Q9XA" })),
    );
    const velicina = (dokument: string) => Number(/font-size="([\d.]+)"/.exec(dokument)?.[1]);
    expect(velicina(qrSvgDokument({ url, naslov: "Sto 1 na terasi pored fontane" }))).toBeLessThan(
      velicina(qrSvgDokument({ url, naslov: "Sto 1" })),
    );
  });
});

// --- Messages -----------------------------------------------------------------------

describe("error messages", () => {
  test("a known code gets the sentence of the domain, an unknown one a generic retryable one", () => {
    expect(porukaGreske("floor/position_has_qr")).toBe(menuDomenSr.errors["floor/position_has_qr"]);
    expect(porukaGreske("floor/position_label_taken")).toBe(menuDomenSr.errors["floor/position_label_taken"]);
    expect(porukaGreske("mreza")).toBe(t.zajednicko.greskaOpsta);
    expect(porukaGreske("")).toBe(t.zajednicko.greskaOpsta);
    expect(t.zajednicko.greskaOpsta).toMatch(/pokušajte ponovo/i);
  });

  test("the route texts the lead's route reads exist", () => {
    expect(t.ruta.ucitavanje).toBe("Učitavaju se mesta i QR kartice…");
    expect(t.ruta.greskaNaslov).toBe("Lokal i QR trenutno ne može da se otvori");
    expect(t.ruta.greskaOpis).toContain("Vlasnika ili Menadžera");
  });
});
