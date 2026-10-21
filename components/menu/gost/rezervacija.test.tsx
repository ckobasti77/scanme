// K25 render tests: the guest's side of Menu reservations
// (components/menu/gost/rezervacija/*) — the form for each contact mode, the
// terms inside the working hours, the confirmation, the cancel-link page, the
// entry in the menu, the "Rezervacije" section of Moji zahtevi and every izlog
// state. Server markup only (renderToStaticMarkup, no DOM): effects do not run
// and useSyncExternalStore answers with its server snapshot. Texts come from
// the dictionaries; the Serbian literals are the sentences the owner's brief
// names (kept literal on purpose, so a dictionary edit that changes a promised
// sentence fails loudly). Invented data only.

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ReservationLinkView } from "@/convex/menuReservations";
import { IZLOG_SADA } from "@/components/menu/fixtures";
import { fixtureRadnoVreme, IZLOG_EKSTERNI_LINK, IZLOG_TOKEN_OTKAZIVANJA } from "@/components/menu/fixtures/rezervacije";
import { javniIzlog } from "@/components/menu/fixtures/javni";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { JavniMeni } from "@/components/menu/javni/javni-meni";
import { JavniOkvir } from "@/components/menu/javni/okvir";
import { JavniRazdelnik } from "@/components/menu/javni/razdelnik";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { clockTime } from "@/lib/menu/elapsed-time";
import { RESERVATION_ERROR } from "@/lib/menu/errors/reservations";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { MENU_DEFAULT_PRESENTATION } from "@/lib/menu/presentation";
import type { ReservationContactMode } from "@/lib/menu/reservation-form";
import { belgradeDateKey, emptyWorkingHours, slotsFor } from "@/lib/menu/working-hours";
import { RezervacijaEksterni } from "./rezervacija/eksterni";
import { RezervacijaForma, type RezervacijaFormaProps } from "./rezervacija/forma";
import { IZLOG_TERMIN_REZERVACIJE, izlogRezervacije } from "./rezervacija/izlog-podaci";
import { LinkOtkazivanja, type LinkOtkazivanjaProps } from "./rezervacija/link-otkazivanja";
import {
  gostiTekst,
  noviKljuc,
  opcijeDatuma,
  opcijeVremena,
  POCETNE_VREDNOSTI,
  pokusajZa,
  sastaviUnos,
  terminTekst,
  vidljiveRezervacije,
  type MojaRezervacija,
  type RezervacijaAkcije,
} from "./rezervacija/model";
import { RezervacijaPoslato } from "./rezervacija/poslato";
import { UlazRezervacije } from "./rezervacija/ulaz";
import { MojiZahtevi } from "./moji-zahtevi";

// The global stubs (harness/vitest-stubs) keep only src/alt/size/className of an
// image and only href/className of a link. The tests need the other attributes
// (`data-*`, `rel`), so these mocks pass them through (and drop Next's `prefetch`).
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
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { prefetch?: boolean }) =>
    createElement("a", { href, ...Object.fromEntries(Object.entries(rest).filter(([ime]) => ime !== "prefetch")) }, children),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => null }));

const t = menuGostSr.rezervacija;
const d = menuDomenSr;
const SLUG = "demo-restoran";
const MENI = "/demo-restoran/meni";
const ZAHTEVI = "/demo-restoran/meni/zahtevi";
const RADNO = fixtureRadnoVreme();
/** Saturday 17 October 2026 (the izlog's day) as Belgrade reads it. */
const DANAS = belgradeDateKey(IZLOG_SADA);

// -----------------------------------------------------------------------------
// Helpers (markup is read back with small regexes, as in gost.test.tsx)
// -----------------------------------------------------------------------------

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;
/** What a guest could read: no tags, no styles, one line. */
const tekst = (html: string) =>
  unesc(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** Every input, select and textarea of the markup. */
function kontrole(html: string): string[] {
  return [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((red) => red[0]);
}

const nazivi = (html: string) => kontrole(html).map((tag) => attr(tag, "name"));

/** The markup of the <tag> with this id (an element that holds no element of the same tag). */
function odeljakSaId(html: string, tag: string, id: string): string {
  const izmeni = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nadjen = new RegExp(`<${tag}\\b[^>]*\\sid="${izmeni}"[^>]*>[\\s\\S]*?</${tag}>`).exec(html)?.[0];
  if (nadjen === undefined) throw new Error(`no <${tag} id="${id}"> in the markup`);
  return nadjen;
}

/** The options of a <select name="…">: value and label. */
function opcije(html: string, naziv: string) {
  const izbor = new RegExp(`<select\\b[^>]*\\sname="${naziv}"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1];
  if (izbor === undefined) throw new Error(`no <select name="${naziv}"> in the markup`);
  return [...izbor.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((red) => ({
    vrednost: attr(red[1], "value") ?? "",
    oznaka: tekst(red[2]),
  }));
}

const akcije: RezervacijaAkcije = { posalji: async () => ({ ok: false, code: "network" }) };

function forma(kontakt: ReservationContactMode, over: Partial<RezervacijaFormaProps> = {}): string {
  return renderToStaticMarkup(
    <RezervacijaForma
      slug={SLUG}
      kontakt={kontakt}
      radnoVreme={RADNO}
      sadaMs={IZLOG_SADA}
      akcije={akcije}
      meniHref={MENI}
      mojiZahteviHref={ZAHTEVI}
      {...over}
    />,
  );
}

const izlog = (over: Record<string, string>) => renderToStaticMarkup(<JavniIzlog params={parsePublicPreview(over)} />);

// -----------------------------------------------------------------------------
// The form
// -----------------------------------------------------------------------------

describe("the reservation form", () => {
  test.each([
    ["email", ["ime", "datum", "vreme", "email", "napomena"]],
    ["phone", ["ime", "datum", "vreme", "telefon", "napomena"]],
    ["both", ["ime", "datum", "vreme", "email", "telefon", "napomena"]],
  ] as const)("contact %s asks for exactly its own contact fields", (kontakt, ocekivano) => {
    const html = forma(kontakt);
    expect(nazivi(html)).toEqual([...ocekivano]);
    expect(tekst(html)).toContain(t.kontaktOpis[kontakt]);
    const tipovi = kontrole(html).map((tag) => attr(tag, "type"));
    expect(tipovi.includes("email")).toBe(kontakt !== "phone");
    expect(tipovi.includes("tel")).toBe(kontakt !== "email");
  });

  test("the contact inputs have the right keyboard, autofill and length", () => {
    const html = forma("both");
    const email = kontrole(html).find((tag) => attr(tag, "name") === "email") ?? "";
    const telefon = kontrole(html).find((tag) => attr(tag, "name") === "telefon") ?? "";
    const ime = kontrole(html).find((tag) => attr(tag, "name") === "ime") ?? "";
    expect(email).toMatch(/type="email"/);
    expect(email).toMatch(/autocomplete="email"/i);
    expect(email).toMatch(/inputmode="email"/i);
    expect(telefon).toMatch(/type="tel"/);
    expect(telefon).toMatch(/autocomplete="tel"/i);
    expect(ime).toMatch(/autocomplete="name"/i);
    expect(ime).toMatch(/maxlength="80"/i);
  });

  test("the guest never chooses a table: no table or position field anywhere", () => {
    for (const kontakt of ["email", "phone", "both"] as const) {
      const html = forma(kontakt);
      for (const naziv of nazivi(html)) expect(naziv, kontakt).not.toMatch(/sto|table|position|pozicij/i);
      expect(html, kontakt).not.toMatch(/positionId|position_id|pozicija|name="sto"/i);
    }
    // It says so instead.
    expect(tekst(forma("both"))).toContain(t.bezStola);
  });

  test("every shown field is required except the note, which says so", () => {
    const html = forma("both");
    for (const tag of kontrole(html)) {
      const naziv = attr(tag, "name");
      if (naziv === "napomena") expect(tag, naziv).not.toContain("aria-required");
      else expect(attr(tag, "aria-required"), naziv).toBe("true");
    }
    const oznake = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map((red) => tekst(red[1]));
    expect(oznake.filter((oznaka) => oznaka.includes(t.opciono))).toEqual([`${t.napomena} ${t.opciono}`]);
    expect(count(tekst(html), t.opciono)).toBe(1);
  });

  test("every control has a label bound to it", () => {
    const html = forma("both");
    for (const tag of kontrole(html)) {
      const id = attr(tag, "id");
      expect(id, attr(tag, "name")).toBeTruthy();
      expect(html).toContain(`for="${id}"`);
    }
  });

  test("the terms are only inside the working hours, on the 15-minute grid (Saturday 18:27)", () => {
    const html = forma("both");
    const termini = opcije(html, "vreme").filter((opcija) => opcija.vrednost !== "");
    // Saturday 12:00–01:00: from 18:30 on, to 00:45 — never 01:00, never a time already gone.
    expect(termini.map((opcija) => opcija.vrednost)).toEqual(slotsFor(DANAS, RADNO, IZLOG_SADA).map(String));
    expect(termini).toHaveLength(26);
    expect(termini[0].oznaka).toBe("18:30");
    const oznake = termini.map((opcija) => opcija.oznaka);
    expect(oznake).toContain("19:15");
    expect(oznake.at(-1)).toContain("00:45");
    expect(oznake.some((oznaka) => oznaka.includes("01:00"))).toBe(false);
    expect(oznake).not.toContain("18:15");
    expect(oznake).not.toContain("18:00");
    // A term after midnight carries its own date, so it is not read as the morning that has passed.
    expect(termini.at(-1)?.oznaka).toBe(terminTekst(Number(termini.at(-1)?.vrednost), IZLOG_SADA));
    expect(termini.at(-1)?.oznaka).not.toBe("00:45");
    // The placeholder asks for a choice.
    expect(opcije(html, "vreme")[0]).toEqual({ vrednost: "", oznaka: t.izaberiVreme });
  });

  test("the days are the opening days, from today, at most 60 days ahead", () => {
    const dani = opcije(forma("both"), "datum");
    expect(dani[0]).toEqual({ vrednost: DANAS, oznaka: d.relativeDays.today });
    expect(dani[1].oznaka).toBe(d.relativeDays.tomorrow);
    expect(dani.length).toBeGreaterThan(55);
    expect(dani.length).toBeLessThanOrEqual(61);
    expect(opcijeDatuma(RADNO, IZLOG_SADA).map((opcija) => opcija.vrednost)).toEqual(dani.map((opcija) => opcija.vrednost));
  });

  test("a split Sunday offers both service windows and nothing between them", () => {
    // Sunday 18 October: 12:00–16:00 and 18:00–22:00.
    const nedelja = opcijeVremena("2026-10-18", RADNO, IZLOG_SADA).map((opcija) => opcija.oznaka);
    expect(nedelja[0]).toBe("12:00");
    expect(nedelja).toContain("15:45");
    expect(nedelja).not.toContain("16:00");
    expect(nedelja).not.toContain("17:45");
    expect(nedelja).toContain("18:00");
    expect(nedelja.at(-1)).toBe("21:45");
  });

  test("the number of guests starts at two, with buttons of 44 px or more and a polite live value", () => {
    const html = forma("both");
    expect(html).toContain(`>${gostiTekst(2)}</output>`);
    expect(html).toMatch(/<output\b[^>]*aria-live="polite"/);
    expect(html).toContain(`aria-label="${t.manje}"`);
    expect(html).toContain(`aria-label="${t.vise}"`);
  });

  test("the note has a counter, a hint and a limit", () => {
    const html = forma("both");
    expect(tekst(html)).toContain(fmt(t.napomenaBroj, { n: 0, max: 500 }));
    expect(tekst(html)).toContain(t.napomenaOpis);
    expect(html).toMatch(/<textarea\b[^>]*maxlength="500"/i);
  });

  test("it starts clean: no error summary, a submit button, a method that never puts the data in the address", () => {
    const html = forma("both");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("aria-invalid");
    expect(html).toMatch(/<form\b[^>]*method="post"/);
    expect(tekst(html)).toContain(t.posalji);
    expect(tekst(html)).toContain(t.uvod);
  });

  test("a refused send shows an error summary and the server's field errors, tied to the field", () => {
    const html = forma("both", {
      pocetno: {
        odbijeno: { ok: false, code: RESERVATION_ERROR.outsideHours, fieldErrors: { requestedAt: "outside_hours" } },
      },
    });
    const sazetak = /<div\b[^>]*role="alert"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    expect(sazetak).not.toBe("");
    expect(tekst(sazetak)).toContain(t.greskaForme);
    expect(tekst(sazetak)).toContain(t.vreme);
    expect(tekst(sazetak)).toContain(t.greskePolja.outside_hours);
    const vreme = kontrole(html).find((tag) => attr(tag, "name") === "vreme") ?? "";
    expect(attr(vreme, "aria-invalid")).toBe("true");
    const opisano = attr(vreme, "aria-describedby")?.split(" ") ?? [];
    expect(opisano).toHaveLength(2);
    // The last description is the error paragraph, and it says the sentence.
    expect(tekst(odeljakSaId(html, "p", opisano[1]))).toBe(t.greskePolja.outside_hours);
    // The link in the summary points at the field's id.
    expect(sazetak).toContain(`href="#${attr(vreme, "id")}"`);
  });

  test("a lost answer is told in the dictionary's words, without a field error", () => {
    const html = forma("both", { pocetno: { odbijeno: { ok: false, code: "network" } } });
    expect(tekst(html)).toContain(t.greska.mreza);
    expect(html).not.toContain("aria-invalid");
  });

  test("a venue with no term in the next 60 days says so instead of showing a form", () => {
    const html = forma("both", { radnoVreme: emptyWorkingHours() });
    expect(tekst(html)).toContain(t.nemaTermina);
    expect(html).not.toContain("<form");
  });
});

describe("the form's rules (the same function the server uses)", () => {
  const termin = slotsFor(DANAS, RADNO, IZLOG_SADA)[2];
  const puno = { ...POCETNE_VREDNOSTI, ime: "Mila Test", datum: DANAS, vreme: String(termin), gosti: 3, email: "MILA@Example.com", telefon: "060 123 456" };

  test("an e-mail venue sends the e-mail and drops the phone; the note only when filled; never a table", () => {
    const rezultat = sastaviUnos(puno, "email", RADNO, IZLOG_SADA);
    expect(rezultat).toEqual({
      ok: true,
      unos: { guestName: "Mila Test", partySize: 3, requestedAt: termin, contactEmail: "mila@example.com" },
    });
    const oba = sastaviUnos({ ...puno, napomena: "  rođendan " }, "both", RADNO, IZLOG_SADA);
    expect(oba.ok && Object.keys(oba.unos).sort()).toEqual(["contactEmail", "contactPhone", "guestName", "note", "partySize", "requestedAt"]);
  });

  test("an empty form names every required field; a past or closed term names the term", () => {
    const prazno = sastaviUnos({ ...POCETNE_VREDNOSTI, datum: DANAS }, "both", RADNO, IZLOG_SADA);
    expect(prazno.ok).toBe(false);
    expect(!prazno.ok && prazno.fieldErrors).toEqual({
      guestName: "required",
      requestedAt: "required",
      contactEmail: "required",
      contactPhone: "required",
    });
    const proslo = sastaviUnos({ ...puno, vreme: String(IZLOG_SADA - 60_000) }, "email", RADNO, IZLOG_SADA);
    expect(!proslo.ok && proslo.code).toBe(RESERVATION_ERROR.inPast);
    const zatvoreno = sastaviUnos({ ...puno, vreme: String(Date.UTC(2026, 9, 18, 0, 0)) }, "email", RADNO, IZLOG_SADA);
    expect(!zatvoreno.ok && zatvoreno.code).toBe(RESERVATION_ERROR.outsideHours);
    const loseEmail = sastaviUnos({ ...puno, email: "nije-email" }, "email", RADNO, IZLOG_SADA);
    expect(!loseEmail.ok && loseEmail.fieldErrors).toEqual({ contactEmail: "invalid" });
  });

  test("the key of a send attempt: 22 url-safe characters; the same request keeps it, a changed one gets a new one", () => {
    const kljuc = noviKljuc();
    expect(kljuc).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(noviKljuc()).not.toBe(kljuc);
    const unos = { guestName: "Mila Test", partySize: 3, requestedAt: termin };
    let broj = 0;
    const napravi = () => `kljuc-${(broj += 1)}`;
    const prvi = pokusajZa(null, unos, napravi);
    expect(pokusajZa(prvi, unos, napravi)).toBe(prvi);
    expect(pokusajZa(prvi, { ...unos, partySize: 4 }, napravi).kljuc).toBe("kljuc-2");
    expect(broj).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// The confirmation
// -----------------------------------------------------------------------------

describe("the confirmation after sending", () => {
  const poslato = {
    ok: true as const,
    cancelToken: IZLOG_TOKEN_OTKAZIVANJA,
    reservationId: "rez1",
    requestedAt: IZLOG_TERMIN_REZERVACIJE,
    partySize: 4,
    deduped: false,
  };
  const prikaz = (over: Partial<Parameters<typeof RezervacijaPoslato>[0]> = {}) =>
    renderToStaticMarkup(
      <RezervacijaPoslato slug={SLUG} poslato={poslato} sadaMs={IZLOG_SADA} meniHref={MENI} mojiZahteviHref={ZAHTEVI} {...over} />,
    );

  test("says the request was SENT and is not a confirmation; never a promise of a table", () => {
    const html = prikaz();
    expect(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1]).toBe(t.poslato.naslov);
    expect(tekst(html)).toContain("Ovo još nije potvrda rezervacije.");
    expect(tekst(html)).toContain(t.poslato.nijePotvrda);
    expect(tekst(html)).toContain(t.poslato.opis);
    const bezIzjave = tekst(html).replace(t.poslato.nijePotvrda, "");
    expect(bezIzjave).not.toMatch(/potvrđen|garant|rezervisan|slobodan sto|sto je Vaš/i);
  });

  test("shows the term and the guests", () => {
    const html = tekst(prikaz());
    expect(html).toContain(`${d.relativeDays.today} · 20:00`);
    expect(html).toContain(gostiTekst(4));
  });

  test("shows the one-time cancel link as text (copyable by hand), with a copy button and a live region", () => {
    const html = prikaz();
    const polje = kontrole(html).find((tag) => tag.includes("data-link-otkazivanja")) ?? "";
    expect(attr(polje, "value")).toBe(`/${SLUG}/meni/rezervacija/${IZLOG_TOKEN_OTKAZIVANJA}`);
    expect(polje).toMatch(/readonly/i);
    expect(attr(polje, "aria-labelledby")).toBeTruthy();
    expect(tekst(html)).toContain(t.poslato.linkOpis);
    expect(tekst(html)).toContain("Kopiraj link");
    expect(html).toMatch(/<button\b[^>]*type="button"[^>]*>[\s\S]*?Kopiraj link<\/button>/);
    // Nothing is announced until the guest copies.
    expect(html).toMatch(/<p\b[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/p>/);
  });

  test("an override path (the izlog's own page) is shown instead of the real link", () => {
    const html = prikaz({ putanjaLinka: "/dev/menu-public-preview?rezervacija=otkazivanje" });
    const polje = kontrole(html).find((tag) => tag.includes("data-link-otkazivanja")) ?? "";
    expect(attr(polje, "value")).toBe("/dev/menu-public-preview?rezervacija=otkazivanje");
  });

  test("links to Moji zahtevi and back to the menu", () => {
    const html = prikaz();
    expect(html).toMatch(new RegExp(`<a\\b[^>]*href="${ZAHTEVI}"[^>]*>${t.poslato.mojiZahtevi}</a>`));
    expect(html).toMatch(new RegExp(`<a\\b[^>]*href="${MENI}"[^>]*>${t.poslato.nazadNaMeni}</a>`));
  });

  test("a repeated send says so; a fresh one does not", () => {
    expect(tekst(prikaz())).not.toContain(t.poslato.ponovljeno);
    expect(tekst(prikaz({ poslato: { ...poslato, deduped: true } }))).toContain(t.poslato.ponovljeno);
  });
});

// -----------------------------------------------------------------------------
// The cancel-link page
// -----------------------------------------------------------------------------

describe("the cancel-link page", () => {
  const pogled = (over: Partial<ReservationLinkView> = {}): ReservationLinkView => ({
    businessName: "Demo restoran",
    status: "accepted",
    requestedAt: IZLOG_TERMIN_REZERVACIJE,
    partySize: 4,
    proposedAt: null,
    proposalNote: null,
    canCancel: true,
    ...over,
  });
  const link = (over: Partial<LinkOtkazivanjaProps> = {}) =>
    renderToStaticMarkup(
      <LinkOtkazivanja
        pogled={pogled()}
        sadaMs={IZLOG_SADA}
        potvrda={false}
        otkazano={false}
        neuspelo={null}
        potvrdaHref="/demo-restoran/meni/rezervacija/TOKEN?potvrda=1"
        linkHref="/demo-restoran/meni/rezervacija/TOKEN"
        meniHref={MENI}
        {...over}
      />,
    );

  test("a valid link shows the term, the guests and the status in the guest's words, and a way to cancel", () => {
    const html = link();
    expect(html).toContain('data-rezervacija-link="accepted"');
    const sadrzaj = tekst(html);
    expect(sadrzaj).toContain(t.link.naslov);
    expect(sadrzaj).toContain(`${d.relativeDays.today} · 20:00`);
    expect(sadrzaj).toContain(gostiTekst(4));
    expect(sadrzaj).toContain(t.statusi.accepted);
    expect(html).toMatch(/<a\b[^>]*data-otkazi=""[^>]*>Otkaži rezervaciju<\/a>/);
    // The first step only asks: no form, nothing is cancelled by opening the page.
    expect(html).not.toContain("<form");
    // No name, contact, note or table of the guest is on the page.
    expect(sadrzaj).not.toMatch(/@|\+381|Sto \d/);
  });

  test("the confirmation step is a plain form (works without JavaScript) with a way back", () => {
    const html = link({ potvrda: true, otkazi: async () => undefined });
    expect(html).toMatch(/<form\b/);
    expect(tekst(html)).toContain(t.link.otkaziPitanje);
    expect(tekst(html)).toContain(t.link.otkaziOpis);
    expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*data-otkazi-potvrda=""[^>]*>Da, otkaži<\/button>/);
    expect(html).toMatch(/<a\b[^>]*href="\/demo-restoran\/meni\/rezervacija\/TOKEN"[^>]*>Ne, zadrži rezervaciju<\/a>/);
    expect(html).not.toContain("data-otkazi=");
  });

  test("a proposal from the venue is shown with its message and what to do", () => {
    const predlog = Date.UTC(2026, 9, 18, 18, 30);
    const html = link({
      pogled: pogled({ status: "change_proposed", proposedAt: predlog, proposalNote: "Za 20:00 nemamo veliki sto." }),
    });
    const sadrzaj = tekst(html);
    expect(html).toContain("data-predlog");
    expect(sadrzaj).toContain(fmt(t.link.predlog, { termin: terminTekst(predlog, IZLOG_SADA) }));
    expect(sadrzaj).toContain(fmt(t.link.predlogPoruka, { poruka: "Za 20:00 nemamo veliki sto." }));
    expect(sadrzaj).toContain(t.link.predlogUputstvo);
    expect(sadrzaj).toContain(t.statusi.change_proposed);
    expect(html).toContain('data-otkazi=""');
  });

  test("an invalid link shows nothing about any reservation", () => {
    const html = link({ pogled: null });
    const sadrzaj = tekst(html);
    expect(html).toContain('data-rezervacija-link="nevazeci"');
    expect(sadrzaj).toContain(t.link.nevazeciNaslov);
    expect(sadrzaj).toContain(t.link.nevazeciOpis);
    for (const rec of [t.link.termin, t.link.gosti, t.link.status, t.link.otkazi, "20:00", "osobe", t.statusi.accepted]) {
      expect(sadrzaj, rec).not.toContain(rec);
    }
    expect(html).not.toContain("data-otkazi");
    expect(html).not.toContain("<dl");
    expect(html).toContain(`href="${MENI}"`);
  });

  test("after cancelling it says so, once; a reservation the venue cancelled does not claim the guest did", () => {
    const otkazana = pogled({ status: "cancelled", canCancel: false });
    const html = link({ pogled: otkazana, otkazano: true });
    expect(tekst(html)).toContain(t.link.otkazano);
    expect(tekst(html)).toContain(t.statusi.cancelled);
    expect(html).not.toContain("data-otkazi");
    expect(tekst(html)).not.toContain(t.link.nemozeOtkazati);
    // Opened later without the sign of a cancel just now: only the status.
    expect(tekst(link({ pogled: otkazana }))).not.toContain(t.link.otkazano);
    // A forged `otkazano` on a reservation that is still open says nothing.
    expect(tekst(link({ otkazano: true }))).not.toContain(t.link.otkazano);
  });

  test("a realized or declined reservation can no longer be cancelled, and says so", () => {
    for (const status of ["arrived", "declined"] as const) {
      const html = link({ pogled: pogled({ status, canCancel: false }) });
      expect(tekst(html), status).toContain(t.link.nemozeOtkazati);
      expect(html, status).not.toContain("data-otkazi");
    }
  });

  test("a cancel that did not go through is told in an alert", () => {
    const html = link({ neuspelo: "network" });
    expect(html).toMatch(/<p\b[^>]*role="alert"[^>]*data-neuspelo=""[^>]*>/);
    expect(tekst(html)).toContain(t.greska.mreza);
    const odbijeno = link({ neuspelo: RESERVATION_ERROR.notCancellable });
    expect(tekst(odbijeno)).toContain(d.errors[RESERVATION_ERROR.notCancellable]);
  });
});

// -----------------------------------------------------------------------------
// The entry in the menu and the venue's own system
// -----------------------------------------------------------------------------

describe("the entry in the public menu", () => {
  const ulaz = (entry: ComponentProps<typeof UlazRezervacije>["ulaz"]) =>
    renderToStaticMarkup(<UlazRezervacije ulaz={entry} lokal="Demo restoran" href="/demo-restoran/meni/rezervacija" />);

  test("the ScanMe form is a plain link to the form page, no client code", () => {
    const html = ulaz({ mode: "form", contact: "both", workingHours: RADNO });
    expect(html).toContain('data-rezervacija-ulaz="form"');
    expect(html).toMatch(/<a\b[^>]*href="\/demo-restoran\/meni\/rezervacija"/);
    expect(tekst(html)).toBe(`${t.ulaz} ${t.ulazOpis}`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<button|<script|<form/);
  });

  test("the venue's own system is a link in the same tab, with the reader's name and rel noopener", () => {
    const html = ulaz({ mode: "external", url: IZLOG_EKSTERNI_LINK });
    const veza = /<a\b[^>]*>/.exec(html)?.[0] ?? "";
    expect(attr(veza, "href")).toBe(IZLOG_EKSTERNI_LINK);
    expect(attr(veza, "rel")).toBe("noopener noreferrer");
    expect(attr(veza, "aria-label")).toBe(t.ulazEksterniCitac);
    expect(veza).not.toContain("target=");
    expect(attr(veza, "aria-label")?.startsWith(t.ulaz)).toBe(true);
    expect(tekst(html)).toContain(fmt(t.eksterni.opis, { lokal: "Demo restoran" }));
  });

  test("no reservations, or an address that is not a plain https one, shows nothing", () => {
    expect(ulaz({ mode: "off" })).toBe("");
    for (const url of ["javascript:alert(1)", "http://rezervacije.example.com", "https://user:pass@rezervacije.example.com/x", "nije adresa"]) {
      expect(ulaz({ mode: "external", url }), url).toBe("");
    }
  });

  test("the venue's own system page links to it and back to the menu", () => {
    const html = renderToStaticMarkup(<RezervacijaEksterni lokal="Demo restoran" url={IZLOG_EKSTERNI_LINK} meniHref={MENI} />);
    expect(html).toMatch(new RegExp(`<a\\b[^>]*href="${IZLOG_EKSTERNI_LINK}"[^>]*rel="noopener noreferrer"[^>]*>`));
    expect(tekst(html)).toContain(t.eksterni.naslov);
    expect(tekst(html)).toContain(t.eksterni.dugme);
    expect(html).toContain(`href="${MENI}"`);
    expect(html).not.toContain("target=");
    expect(renderToStaticMarkup(<RezervacijaEksterni lokal="Demo restoran" url="http://nije-https.example.com" meniHref={MENI} />)).not.toContain(
      "nije-https",
    );
  });
});

// -----------------------------------------------------------------------------
// Moji zahtevi
// -----------------------------------------------------------------------------

describe("Moji zahtevi: the Rezervacije section", () => {
  const rezervacije: MojaRezervacija[] = izlogRezervacije();
  const stranica = (over: Partial<ComponentProps<typeof MojiZahtevi>> = {}) =>
    renderToStaticMarkup(
      <MojiZahtevi
        zahtevi={[]}
        sadaMs={IZLOG_SADA}
        online
        meniHref={MENI}
        onOtkazi={async () => ({ ok: true })}
        rezervacije={rezervacije}
        onOtkaziRezervaciju={async () => ({ ok: true })}
        {...over}
      />,
    );
  const html = stranica();
  const pocetci = [...html.matchAll(/<li\b[^>]*\sdata-rezervacija-moja="(\w+)"[^>]*>/g)];
  const odeljci = pocetci.map((pocetak, index) => html.slice(pocetak.index ?? 0, pocetci[index + 1]?.index ?? html.length));

  test("one section above the requests, with one card per reservation: open ones first, nearest term first", () => {
    expect(count(html, "data-moje-rezervacije")).toBe(1);
    expect(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(html)?.[1]).toBe(t.moji.naslov);
    expect(pocetci.map((pocetak) => pocetak[1])).toEqual(["accepted", "change_proposed", "new", "cancelled", "declined", "arrived"]);
    expect(html.indexOf("data-moje-rezervacije")).toBeLessThan(html.indexOf("Otvori meni"));
  });

  test("each card says its status in icon + word, the term, the guests and when it was sent", () => {
    const poStatusu = new Map(pocetci.map((pocetak, index) => [pocetak[1], odeljci[index]]));
    for (const status of ["new", "accepted", "declined", "change_proposed", "arrived", "cancelled"] as const) {
      const odeljak = poStatusu.get(status) ?? "";
      expect(odeljak, status).toContain(`data-status="${status}"`);
      expect(odeljak, status).toContain("<svg");
      expect(tekst(odeljak), status).toContain(t.statusi[status]);
      expect(tekst(odeljak), status).toContain(t.moji.vrsta);
    }
    const nova = rezervacije.find((red) => red.status === "new") as MojaRezervacija;
    const tekstNove = tekst(poStatusu.get("new") ?? "");
    expect(tekstNove).toContain(terminTekst(nova.requestedAt, IZLOG_SADA));
    expect(tekstNove).toContain(gostiTekst(nova.partySize));
    expect(tekstNove).toContain(fmt(t.moji.poslato, { vreme: clockTime(nova.createdAt) }));
  });

  test("a cancelled reservation says who cancelled and when; a proposal shows its term and message", () => {
    const otkazana = rezervacije.find((red) => red.status === "cancelled") as MojaRezervacija;
    expect(tekst(odeljci[3])).toContain(fmt(t.moji.otkazaliSte, { vreme: clockTime(otkazana.cancelledAt as number) }));
    const predlozena = rezervacije.find((red) => red.status === "change_proposed") as MojaRezervacija;
    expect(odeljci[1]).toContain("data-predlog");
    expect(tekst(odeljci[1])).toContain(fmt(t.link.predlog, { termin: terminTekst(predlozena.proposedAt as number, IZLOG_SADA) }));
    expect(tekst(odeljci[1])).toContain(fmt(t.link.predlogPoruka, { poruka: predlozena.proposalNote as string }));
    const posebno = stranica({ rezervacije: [{ ...otkazana, cancelledBy: "staff" }] });
    expect(tekst(posebno)).toContain(fmt(t.moji.otkazaoLokal, { vreme: clockTime(otkazana.cancelledAt as number) }));
  });

  test("`Otkaži` is on the open reservations only (new, change_proposed, accepted), after a question", () => {
    expect(count(html, ' data-otkazi-rezervaciju=""')).toBe(3);
    for (const index of [0, 1, 2]) expect(odeljci[index], String(index)).toContain(' data-otkazi-rezervaciju=""');
    for (const index of [3, 4, 5]) expect(odeljci[index], String(index)).not.toContain("data-otkazi-rezervaciju");
    expect(tekst(odeljci[0])).toContain(menuGostSr.zahtevi.otkazi);
    // The question comes first: no confirmation is on the page yet.
    expect(html).not.toContain("data-otkazi-rezervaciju-potvrda");
    // Offline: nothing can be cancelled.
    expect(stranica({ online: false })).toMatch(/<button\b[^>]*disabled=""[^>]*data-otkazi-rezervaciju=""/);
  });

  test("each card has a live region for the answer of a cancel, empty until there is one", () => {
    for (const odeljak of odeljci) expect(count(odeljak, 'role="status"')).toBe(1);
    expect(html).not.toContain(t.link.otkazano);
  });

  test("the sentences about requests do not contradict the reservations above them", () => {
    expect(tekst(html)).not.toContain(menuGostSr.zahtevi.prazno);
    expect(tekst(html)).toContain(menuGostSr.zahtevi.otvoriMeni);
  });

  test("nothing is shown when the phone has no reservation here, or no way to cancel", () => {
    for (const over of [{ rezervacije: [] }, { rezervacije: null }, { rezervacije: undefined }, { onOtkaziRezervaciju: undefined }]) {
      const bez = stranica(over);
      expect(bez).not.toContain("data-moje-rezervacije");
      expect(tekst(bez)).toContain(menuGostSr.zahtevi.prazno);
    }
    // The page without the K25 props is exactly what it was.
    const staro = renderToStaticMarkup(
      <MojiZahtevi zahtevi={[]} sadaMs={IZLOG_SADA} online meniHref={MENI} onOtkazi={async () => ({ ok: true })} />,
    );
    expect(staro).not.toContain("data-moje-rezervacije");
  });

  test("a reservation whose term and last change are more than 12 hours behind fades out", () => {
    const stara: MojaRezervacija = { ...rezervacije[0], id: "stara", status: "arrived", requestedAt: IZLOG_SADA - 20 * 3_600_000, createdAt: IZLOG_SADA - 30 * 3_600_000, arrivedAt: IZLOG_SADA - 19 * 3_600_000 };
    expect(vidljiveRezervacije([stara], IZLOG_SADA)).toEqual([]);
    expect(vidljiveRezervacije([{ ...stara, status: "new", requestedAt: IZLOG_SADA + 3_600_000 }], IZLOG_SADA)).toHaveLength(1);
    expect(vidljiveRezervacije(rezervacije, IZLOG_SADA)).toHaveLength(rezervacije.length);
  });
});

// -----------------------------------------------------------------------------
// The slot in the public menu's frame
// -----------------------------------------------------------------------------

describe("the reservation slot of the menu frame", () => {
  const izgled = javniIzgled(MENU_DEFAULT_PRESENTATION);
  const lokal = { naziv: "Demo restoran", slug: SLUG, logoUrl: null };
  const okvir = (ugradjen: boolean) =>
    renderToStaticMarkup(
      <JavniOkvir izgled={izgled} lokal={lokal} naslovStranice={null} jezik="sr" ugradjen={ugradjen} rezervacija={<p data-slot="rez">ulaz</p>}>
        <p data-slot="sadrzaj">sadržaj</p>
      </JavniOkvir>,
    );

  test("it comes after the content and right before the footer, inside the main region", () => {
    const html = okvir(false);
    expect(html.indexOf('data-slot="sadrzaj"')).toBeLessThan(html.indexOf('data-slot="rez"'));
    expect(html.indexOf('data-slot="rez"')).toBeLessThan(html.indexOf("</main>"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
  });

  test("the editor preview never shows it", () => {
    const html = okvir(true);
    expect(html).toContain('data-slot="sadrzaj"');
    expect(html).not.toContain('data-slot="rez"');
  });

  test("the menu page and the splitter pass it on; a frame without it is as it was", () => {
    const izlogPrikaz = javniIzlog(parsePublicPreview({}));
    if (izlogPrikaz.vrsta !== "stranica") throw new Error("expected a menu page");
    const sa = renderToStaticMarkup(
      <JavniMeni
        view={izlogPrikaz.view}
        izgled={javniIzgled(izlogPrikaz.presentation)}
        slike={izlogPrikaz.slike}
        sadaMs={izlogPrikaz.sadaMs}
        nedostupni={izlogPrikaz.nedostupni}
        cuvaj={false}
        rezervacija={<p data-slot="rez">ulaz</p>}
      />,
    );
    expect(sa).toContain('data-slot="rez"');
    const razdelnik = javniIzlog(parsePublicPreview({ stanje: "razdelnik" }));
    if (razdelnik.vrsta !== "razdelnik") throw new Error("expected a splitter");
    const razdelnikSa = renderToStaticMarkup(
      <JavniRazdelnik view={razdelnik.view} izgled={javniIzgled(razdelnik.presentation)} rezervacija={<p data-slot="rez">ulaz</p>} />,
    );
    expect(razdelnikSa).toContain('data-slot="rez"');
    expect(razdelnikSa.indexOf('data-slot="rez"')).toBeLessThan(razdelnikSa.indexOf("<footer"));
    const bez = renderToStaticMarkup(<JavniRazdelnik view={razdelnik.view} izgled={javniIzgled(razdelnik.presentation)} />);
    expect(bez).not.toContain("data-slot");
  });
});

// -----------------------------------------------------------------------------
// The izlog
// -----------------------------------------------------------------------------

describe("the izlog (/dev/menu-public-preview)", () => {
  test("the menu carries the form entry by default, right before the footer, and keeps the venue's palette", () => {
    const html = izlog({});
    expect(html).toContain('data-rezervacija-ulaz="form"');
    expect(html.indexOf("data-rezervacija-ulaz")).toBeLessThan(html.indexOf("<footer"));
    expect(html.indexOf("data-rezervacija-ulaz")).toBeGreaterThan(html.indexOf("<main"));
    const veza = /<a\b[^>]*href="([^"]*)"[^>]*>\s*(?:<svg[\s\S]*?<\/svg>)?\s*<span[^>]*>\s*<span[^>]*>Rezerviši sto/.exec(html);
    expect(unesc(veza?.[1] ?? "")).toContain("rezervacija=forma");
    expect(html).toContain("data-javni-meni");
  });

  test("the splitter of the izlog lists only its pages, unless the address asks for a reservation variant", () => {
    expect(izlog({ stanje: "razdelnik" })).not.toContain("data-rezervacija-ulaz");
    expect(izlog({ stanje: "razdelnik", kontakt: "email" })).toContain('data-rezervacija-ulaz="form"');
    expect(izlog({ stanje: "razdelnik", rezervacije: "eksterni" })).toContain('data-rezervacija-ulaz="external"');
  });

  test("rezervacije=eksterni links to the venue's own system; iskljuceno shows no entry", () => {
    const eksterni = izlog({ rezervacije: "eksterni" });
    expect(eksterni).toContain('data-rezervacija-ulaz="external"');
    expect(eksterni).toContain(`href="${IZLOG_EKSTERNI_LINK}"`);
    expect(eksterni).toContain('rel="noopener noreferrer"');
    expect(izlog({ rezervacije: "iskljuceno" })).not.toContain("data-rezervacija-ulaz");
  });

  test("an unknown value is the default state, and the menu without the parameter is unchanged otherwise", () => {
    expect(parsePublicPreview({ rezervacija: "nesto", kontakt: "x", rezervacije: "y" })).toMatchObject({
      rezervacija: null,
      kontakt: null,
      rezervacije: null,
    });
    expect(izlog({ rezervacija: "nesto" })).toBe(izlog({}));
  });

  test("rezervacija=forma: the form for both contacts by default; kontakt narrows it", () => {
    const html = izlog({ rezervacija: "forma" });
    expect(html).toContain("data-rezervacija");
    expect(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(html)?.[1]).toBe(t.naslov);
    expect(nazivi(html)).toEqual(["ime", "datum", "vreme", "email", "telefon", "napomena"]);
    // The venue's frame: its name is the one h1, the entry card is not on a reservation page.
    expect(html).toContain("<h1");
    expect(html).not.toContain("data-rezervacija-ulaz");
    expect(nazivi(izlog({ rezervacija: "forma", kontakt: "email" }))).toEqual(["ime", "datum", "vreme", "email", "napomena"]);
    expect(nazivi(izlog({ rezervacija: "forma", kontakt: "telefon" }))).toEqual(["ime", "datum", "vreme", "telefon", "napomena"]);
    // Terms at the izlog's instant: Saturday 18:30 first.
    expect(opcije(html, "vreme")[1].oznaka).toBe("18:30");
  });

  test("rezervacija=greska: the form after the server refused the term, with the summary", () => {
    const html = izlog({ rezervacija: "greska" });
    expect(html).toMatch(/role="alert"/);
    expect(tekst(html)).toContain(t.greskaForme);
    expect(tekst(html)).toContain(t.greskePolja.outside_hours);
    const vreme = kontrole(html).find((tag) => attr(tag, "name") === "vreme") ?? "";
    expect(attr(vreme, "aria-invalid")).toBe("true");
    const ime = kontrole(html).find((tag) => attr(tag, "name") === "ime") ?? "";
    expect(attr(ime, "value")).not.toBe("");
  });

  test("rezervacija=poslato: the confirmation, with the cancel link pointing at the izlog's own page", () => {
    const html = izlog({ rezervacija: "poslato" });
    expect(tekst(html)).toContain(t.poslato.nijePotvrda);
    const polje = kontrole(html).find((tag) => tag.includes("data-link-otkazivanja")) ?? "";
    expect(attr(polje, "value")).toContain("rezervacija=otkazivanje");
  });

  test("rezervacija=otkazivanje | otkazano | nevazece: the three states of the cancel-link page", () => {
    const otkazivanje = izlog({ rezervacija: "otkazivanje" });
    expect(otkazivanje).toContain('data-rezervacija-link="accepted"');
    expect(tekst(otkazivanje)).toContain(t.statusi.accepted);
    expect(otkazivanje).toContain('data-otkazi=""');
    const veza = /<a\b[^>]*href="([^"]*)"[^>]*data-otkazi=""/.exec(otkazivanje);
    expect(unesc(veza?.[1] ?? "")).toContain("rezervacija=otkazano");

    const otkazano = izlog({ rezervacija: "otkazano" });
    expect(otkazano).toContain('data-rezervacija-link="cancelled"');
    expect(tekst(otkazano)).toContain(t.link.otkazano);
    expect(otkazano).not.toContain("data-otkazi=");

    const nevazece = izlog({ rezervacija: "nevazece" });
    expect(nevazece).toContain('data-rezervacija-link="nevazeci"');
    expect(tekst(nevazece)).toContain(t.link.nevazeciNaslov);
    expect(tekst(nevazece)).not.toContain(t.link.termin);
  });

  test("the izlog keeps the venue it was asked for on every reservation page", () => {
    const prestizni = izlog({ rezervacija: "forma", primer: "prestizni" });
    const restoran = izlog({ rezervacija: "forma" });
    expect(attr(/<div\b[^>]*data-javni-meni[^>]*>/.exec(prestizni)?.[0] ?? "", "data-layout")).toBe("compact");
    expect(attr(/<div\b[^>]*data-javni-meni[^>]*>/.exec(restoran)?.[0] ?? "", "data-layout")).not.toBe("compact");
  });

  test("Moji zahtevi in the izlog gets the Rezervacije section only when the reservation parameter is there", () => {
    const sa = izlog({ pozicija: "sto", "moji-zahtevi": "1", rezervacija: "forma" });
    expect(count(sa, "data-moje-rezervacije")).toBe(1);
    const bez = izlog({ pozicija: "sto", "moji-zahtevi": "1" });
    expect(bez).not.toContain("data-moje-rezervacije");
  });

  test("the menu of a guest at a table carries the entry card as well", () => {
    expect(izlog({ pozicija: "sto" })).toContain('data-rezervacija-ulaz="form"');
  });
});
