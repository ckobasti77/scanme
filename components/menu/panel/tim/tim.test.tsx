// K28 render tests of the client-panel section Tim i pristupi. No DOM in the
// edge-runtime environment: the screen is checked as renderToStaticMarkup strings
// (the pattern of funkcionalnosti.test.tsx). `@/components/ui/dialog` is replaced
// by a stand-in that renders an open dialog inline (the Radix portal mounts only
// after effects), as the other Menu render tests do. Clicks, the save cycle and
// the one-time PIN need a browser and are not exercised here. Invented data only.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuActor } from "@/lib/menu/permissions";
import { aktivnostTekst } from "./aktivnost";
import type { SacuvajIshod } from "../cuvanje";
import type { TimAktivnost, TimModal, TimPodaci, TimProps, TimRadnje } from "./model";
import { Osoblje } from "./osoblje";
import { Tim } from "./tim";

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

const tim = menuPanelSr.tim;
const t = tim;

const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The visible text of some markup. */
const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

/** The part of the markup from `marker` to the next `sledeci` marker (or the end). */
function odsek(html: string, marker: string, sledeci: string): string {
  const pocetak = html.indexOf(marker);
  if (pocetak === -1) throw new Error(`no markup for ${marker}`);
  const kraj = html.indexOf(sledeci, pocetak + marker.length);
  // Starts and ends inside a tag, as a marker is an attribute: complete the first and drop the second.
  return "<x " + html.slice(pocetak, kraj === -1 ? undefined : kraj).replace(/<[^>]*$/, "");
}

const red = (html: string, id: string) => odsek(html, `data-clan="${id}"`, 'data-clan="');
const uloga = (html: string, kljuc: string) => odsek(html, `data-uloga-red="${kljuc}"`, 'data-uloga-red="');
const opcije = (html: string) => [...html.matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map((m) => unesc(m[1]));

const SADA = Date.UTC(2026, 9, 21, 10, 0, 0);
const DAN = 24 * 60 * 60 * 1000;

const OK = (): Promise<SacuvajIshod> => Promise.resolve({ ok: true });
const RADNJE: TimRadnje = {
  pozovi: () => Promise.resolve({ ok: true, url: "https://scanme.example/poziv/x", expiresAt: SADA + 7 * DAN }),
  promeniUlogu: OK,
  ukloni: OK,
  opozovi: OK,
  dodajOsobu: OK,
  preimenuj: OK,
  ulogaUPanelu: OK,
  deaktiviraj: OK,
  postaviPin: () => Promise.resolve({ ok: true, pin: "000", endedSessions: 0 }),
  resetujPin: OK,
  otkljucajPinove: () => Promise.resolve({ ok: true, unlocked: 0 }),
  postaviZonu: OK,
  napraviLink: OK,
  promeniLink: () => Promise.resolve({ ok: true, endedSessions: 0 }),
};

const PODACI: TimPodaci = {
  clanovi: {
    account: [
      { key: "a1", name: "Ana", email: "ana@example.com", role: "owner", isSelf: true },
      { key: "a2", name: null, email: "vlasnik2@example.com", role: "manager", isSelf: false },
    ],
    members: [
      { id: "m-vlasnik", email: "vlasnik@example.com", name: "Petar", role: "owner", status: "active", inviteExpiresAt: null, isSelf: false },
      { id: "m-marko", email: "marko@example.com", name: "Marko", role: "editor", status: "active", inviteExpiresAt: null, isSelf: false },
      { id: "m-ja", email: "ja@example.com", name: "Ja", role: "manager", status: "active", inviteExpiresAt: null, isSelf: true },
      { id: "m-pozvan", email: "pozvan@example.com", name: null, role: "editor", status: "invited", inviteExpiresAt: SADA + 3 * DAN, isSelf: false },
      { id: "m-istekao", email: "istekao@example.com", name: null, role: "editor", status: "invited", inviteExpiresAt: SADA - DAN, isSelf: false },
    ],
  },
  osoblje: [
    { id: "s-ana", displayName: "Ana", panelRole: "staff", active: true, hasPin: true, activeZoneId: "z-terasa" },
    { id: "s-marko", displayName: "Marko", panelRole: "manager", active: true, hasPin: false, activeZoneId: null },
    { id: "s-ivan", displayName: "Ivan", panelRole: "staff", active: false, hasPin: true, activeZoneId: null },
  ],
  zone: [
    { id: "z-terasa", name: "Terasa" },
    { id: "z-sala", name: "Sala" },
  ],
  link: { path: "/demo-restoran/konobar/abc", url: "https://scanme.example/demo-restoran/konobar/abc" },
  aktivnost: [],
};

function ekran(preko: Omit<Partial<TimProps>, "podaci"> & { podaci?: Partial<TimPodaci> } = {}): string {
  const { podaci, ...ostalo } = preko;
  return renderToStaticMarkup(
    <Tim actor="owner" lokal="Demo restoran" sada={SADA} podaci={{ ...PODACI, ...podaci }} radnje={RADNJE} {...ostalo} />,
  );
}

const sa = (actor: MenuActor, modal?: TimModal) => ekran({ actor, pocetniModal: modal ?? null });

describe("Tim: the screen", () => {
  const html = ekran();

  test("one h1 with the section's name and its sentence, the calm line below it", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(`>${esc(menuPanelSr.sekcije.tim)}</h1>`);
    expect(tekst(html)).toContain(t.opis);
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf(esc(t.vaziOdmah)));
  });

  test("the cards stand in order: members, staff, link, roles, activity", () => {
    const mesta = ["data-clanovi", "data-osoblje", "data-link-panela", "data-uloge", "data-aktivnost"].map((m) =>
      html.indexOf(m),
    );
    expect(mesta.every((mesto) => mesto > 0)).toBe(true);
    expect([...mesta].sort((a, b) => a - b)).toEqual(mesta);
  });

  test("the section never says the word sound, and every icon is hidden from assistive technology", () => {
    expect(tekst(html)).not.toMatch(/zvuk/i);
    for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) {
      expect(svg.includes('aria-hidden="true"') || svg.includes('role="img"')).toBe(true);
    }
  });

  test("the activity block is closed by default and offers to open", () => {
    expect(html).not.toContain("data-aktivnost-telo");
    expect(odsek(html, "data-aktivnost=", "</section>")).toContain('aria-expanded="false"');
    expect(tekst(odsek(html, "data-aktivnost=", "</section>"))).toContain(t.aktivnost.prikazi);
  });
});

describe("Tim: loading", () => {
  test("a card with undefined data is a skeleton, the others still stand", () => {
    const html = ekran({ podaci: { clanovi: undefined, osoblje: undefined, link: undefined, aktivnost: undefined } });
    expect(count(html, 'data-stanje="ucitavanje"')).toBe(3);
    expect(html).not.toContain("data-clan=");
    expect(html).not.toContain("data-osoba=");
    expect(html).toContain("data-uloge");
    expect(count(html, "<h1")).toBe(1);
  });
});

describe("Tim: members", () => {
  const html = ekran();

  test("account members say \"iz naloga\" and have no action", () => {
    for (const kljuc of ["a1", "a2"]) {
      const polje = odsek(html, `data-nalog-clan="${kljuc}"`, "</li>");
      expect(tekst(polje)).toContain(t.clanovi.izNaloga);
      expect(polje).not.toContain("<button");
    }
    expect(tekst(html)).toContain(t.clanovi.izNalogaPomoc);
  });

  test("the own row says \"Vi\", has no destructive action and says why", () => {
    const moj = red(html, "m-ja");
    expect(tekst(moj)).toContain(t.clanovi.vi);
    expect(moj).not.toContain("<button");
    expect(tekst(moj)).toContain(t.clanovi.svojRed);
    expect(tekst(odsek(html, 'data-nalog-clan="a1"', "</li>"))).toContain(t.clanovi.vi);
  });

  test("an expired invitation says so and offers a new one and revoking", () => {
    const istekao = red(html, "m-istekao");
    expect(tekst(istekao)).toContain(t.clanovi.statusIstekao);
    expect(tekst(istekao)).toContain(t.clanovi.ponoviPoziv);
    expect(tekst(istekao)).toContain(t.clanovi.opozovi);
    expect(tekst(istekao)).not.toContain(t.clanovi.statusPozvan);
  });

  test("a pending invitation is \"Pozvan\" with its term, and only revoking", () => {
    const pozvan = red(html, "m-pozvan");
    expect(tekst(pozvan)).toContain(t.clanovi.statusPozvan);
    expect(tekst(pozvan)).toContain(t.clanovi.opozovi);
    expect(tekst(pozvan)).not.toContain(t.clanovi.ponoviPoziv);
    expect(tekst(pozvan)).not.toContain(t.clanovi.statusIstekao);
  });

  test("the term of an invitation ends with exactly one full stop (the date already carries it)", () => {
    const rok = tekst(red(html, "m-pozvan"));
    expect(rok).toContain("ističe 24. okt 2026.");
    expect(rok).not.toContain("..");
  });

  test("the destructive actions use the danger button, the others do not", () => {
    const marko = red(html, "m-marko");
    const dugmad = marko.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const opasno = dugmad.filter((d) => d.includes("--mp-opasnost"));
    expect(opasno).toHaveLength(1);
    expect(tekst(opasno[0])).toContain(t.clanovi.ukloni);
    const pozvan = (red(html, "m-pozvan").match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).filter((d) => d.includes("--mp-opasnost"));
    expect(pozvan.map(tekst)).toEqual([t.clanovi.opozovi]);
  });

  test("an active member can get another role or be removed", () => {
    const marko = red(html, "m-marko");
    expect(tekst(marko)).toContain(t.clanovi.statusAktivan);
    expect(tekst(marko)).toContain(t.clanovi.promeniUlogu);
    expect(tekst(marko)).toContain(t.clanovi.ukloni);
    expect(marko).not.toContain('disabled=""');
  });

  test("a Manager cannot touch the Owner role: the actions are off and the reason is written", () => {
    const menadzer = ekran({ actor: "manager" });
    const vlasnik = red(menadzer, "m-vlasnik");
    const dugmad = vlasnik.match(/<button\b[^>]*>/g) ?? [];
    expect(dugmad.length).toBeGreaterThan(0);
    for (const dugme of dugmad) expect(dugme).toContain('disabled=""');
    expect(tekst(vlasnik)).toContain(t.clanovi.samoVlasnik);
    // The rows below the Owner's stay usable for a Manager.
    expect(red(menadzer, "m-marko")).not.toContain('disabled=""');
  });

  test("an Owner can: nothing is off and no reason is written", () => {
    const vlasnik = red(html, "m-vlasnik");
    expect(vlasnik).not.toContain('disabled=""');
    expect(tekst(vlasnik)).not.toContain(t.clanovi.samoVlasnik);
    expect(tekst(html)).not.toContain(t.clanovi.samoVlasnik);
  });

  test("an expired Owner invitation cannot be renewed by a Manager", () => {
    const podaci = structuredClone(PODACI);
    podaci.clanovi!.members.push({
      id: "m-istekao-vlasnik",
      email: "stari@example.com",
      name: null,
      role: "owner",
      status: "invited",
      inviteExpiresAt: SADA - DAN,
      isSelf: false,
    });
    const menadzer = ekran({ actor: "manager", podaci });
    const polje = odsek(menadzer, 'data-clan="m-istekao-vlasnik"', "</li>");
    for (const dugme of polje.match(/<button\b[^>]*>/g) ?? []) expect(dugme).toContain('disabled=""');
    expect(tekst(polje)).toContain(t.clanovi.samoVlasnik);
  });

  test("no members yet: the empty line and the invite button", () => {
    const prazno = ekran({ podaci: { clanovi: { account: PODACI.clanovi!.account, members: [] } } });
    expect(prazno).toContain("data-clanovi-prazno");
    expect(tekst(prazno)).toContain(t.clanovi.prazno);
    expect(tekst(odsek(prazno, "data-clanovi=", "data-osoblje"))).toContain(t.clanovi.pozovi);
  });
});

describe("Tim: the invitation dialog", () => {
  test("a Manager is not offered the Owner role", () => {
    const dijalog = odsek(sa("manager", "pozivnica"), 'role="dialog"', "</form>");
    expect(opcije(dijalog)).toEqual([t.uloge.manager.naziv, t.uloge.editor.naziv]);
    expect(opcije(dijalog)).not.toContain(t.uloge.owner.naziv);
  });

  test("an Owner is offered all three, strongest first", () => {
    const dijalog = odsek(sa("owner", "pozivnica"), 'role="dialog"', "</form>");
    expect(opcije(dijalog)).toEqual([t.uloge.owner.naziv, t.uloge.manager.naziv, t.uloge.editor.naziv]);
  });

  test("it asks for an e-mail and the role, and has the submit button", () => {
    const html = sa("owner", "pozivnica");
    const dijalog = html.slice(html.indexOf('role="dialog"'));
    expect(dijalog).toContain('type="email"');
    expect(dijalog).toContain(`>${esc(t.pozivnica.email)}</label>`);
    expect(tekst(dijalog)).toContain(t.pozivnica.posalji);
  });

  test("an Urednik has no invite button and no dialog", () => {
    const html = sa("editor", "pozivnica");
    expect(html).not.toContain('role="dialog"');
    expect(tekst(odsek(html, "data-clanovi=", "data-osoblje"))).not.toContain(t.clanovi.pozovi);
  });

  test("without pocetniModal there is no dialog", () => {
    expect(ekran()).not.toContain('role="dialog"');
  });
});

describe("Tim: staff and PINs", () => {
  const osoblje = (stranica: string) => odsek(stranica, "data-osoblje=", "data-link-panela");

  test("a row says only whether a PIN exists, never digits", () => {
    const polje = osoblje(ekran());
    const sadrzaj = tekst(polje);
    expect(sadrzaj).toContain(t.osoblje.pinPostavljen);
    expect(sadrzaj).toContain(t.osoblje.pinNije);
    expect(sadrzaj).toContain(t.osoblje.pinNikadVidljiv);
    expect(sadrzaj).not.toMatch(/\d{3}/);
    expect(sadrzaj).not.toMatch(/\d/);
    // A person who has a PIN is offered a new one; one without gets the first.
    expect(sadrzaj).toContain(t.osoblje.promeniPin);
    expect(sadrzaj).toContain(t.osoblje.postaviPin);
  });

  test("the hint that a PIN is never shown stays even with nobody on the list", () => {
    const prazno = osoblje(ekran({ podaci: { osoblje: [] } }));
    expect(tekst(prazno)).toContain(t.osoblje.pinNikadVidljiv);
    expect(tekst(prazno)).toContain(t.osoblje.prazno);
  });

  test("an inactive person is listed apart, with no action", () => {
    const polje = odsek(ekran(), 'data-osoba-neaktivna="s-ivan"', "</li>");
    expect(tekst(polje)).toContain("Ivan");
    expect(tekst(polje)).toContain(t.osoblje.neaktivan);
    expect(polje).not.toContain("<button");
  });

  test("zone controls exist only when the venue has zones", () => {
    const bez = osoblje(ekran({ podaci: { zone: [] } }));
    expect(bez).not.toContain("<select");
    expect(tekst(bez)).not.toContain(t.osoblje.sveZone);
    expect(tekst(bez)).not.toContain(t.osoblje.zonaPomoc);
    // K28 review: without zones the card says why there is no zone control, once.
    expect(count(tekst(bez), t.osoblje.bezZona)).toBe(1);

    const sZonama = osoblje(ekran());
    expect(tekst(sZonama)).not.toContain(t.osoblje.bezZona);
    // One select per active person.
    expect(count(sZonama, "<select")).toBe(2);
    expect(opcije(sZonama)).toContain("Terasa");
    expect(opcije(sZonama)).toContain("Sala");
    expect(opcije(sZonama)).toContain(t.osoblje.sveZone);
    expect(tekst(sZonama)).toContain(t.osoblje.zonaPomoc);
    // The person's zone is the selected one.
    expect(sZonama).toMatch(/<option value="z-terasa" selected="">Terasa<\/option>/);
  });

  test("the PIN dialog opens for the first active person with the choice, and shows no PIN yet", () => {
    const html = sa("owner", "pin");
    const dijalog = html.slice(html.indexOf('role="dialog"'));
    expect(tekst(dijalog)).toContain(t.osoblje.pinNaslov);
    expect(tekst(dijalog)).toContain(t.osoblje.pinSistem);
    expect(tekst(dijalog)).toContain(t.osoblje.pinSvoj);
    expect(dijalog).not.toContain("data-pin-rezultat");
    expect(tekst(dijalog)).not.toContain(t.osoblje.pinJednomNaslov);
  });

  test("a role without the staff right sees the screen switched off, with the reason", () => {
    const polje = osoblje(ekran({ actor: "editor" }));
    expect(tekst(polje)).toContain(t.osoblje.resetSamoVlasnik);
    const dugmad = polje.match(/<button\b[^>]*>/g) ?? [];
    expect(dugmad.length).toBeGreaterThan(0);
    // The "⋯" toggle stays reachable; every action is off.
    for (const dugme of dugmad.filter((d) => !d.includes("aria-expanded"))) expect(dugme).toContain('disabled=""');
  });

  test("Osoblje alone: the person's row never carries digits either", () => {
    const html = renderToStaticMarkup(
      <Osoblje actor="manager" osoblje={PODACI.osoblje} zone={PODACI.zone} radnje={RADNJE} />,
    );
    expect(tekst(html)).not.toMatch(/\d/);
    expect(count(html, "data-osoba=")).toBe(2);
  });
});

describe("Tim: the link of the waiter panel", () => {
  test("the link, its QR code, the copy button and the change button", () => {
    const polje = odsek(ekran(), "data-link-panela=", "data-uloge");
    expect(polje).toContain(esc(PODACI.link!.url));
    expect(polje).toContain(`aria-label="${esc(t.linkPanela.qrOznaka)}"`);
    expect(tekst(polje)).toContain(t.linkPanela.kopiraj);
    expect(tekst(polje)).toContain(t.linkPanela.promeni);
    expect(tekst(polje)).not.toContain(t.linkPanela.promeniOpis);
  });

  test("the change-link dialog opened from the start warns that every device is signed out", () => {
    const polje = odsek(sa("owner", "link-panela"), "data-link-panela=", "data-uloge");
    expect(polje).toContain("data-potvrda");
    expect(tekst(polje)).toContain(t.linkPanela.promeniOpis);
    expect(tekst(polje)).toContain(t.linkPanela.promeniPotvrdi);
    expect(tekst(polje)).toContain(t.linkPanela.odustani);
  });

  test("before the link exists the card says so and offers to make it", () => {
    const polje = odsek(ekran({ podaci: { link: null } }), "data-link-panela=", "data-uloge");
    expect(tekst(polje)).toContain(t.linkPanela.nemaLinka);
    expect(tekst(polje)).toContain(t.linkPanela.napravi);
    expect(polje).not.toContain("<svg role=\"img\"");
    expect(tekst(polje)).not.toContain(t.linkPanela.promeni);
  });
});

describe("Tim: what every role may do", () => {
  const html = ekran();
  const sme = (kljuc: string) => tekst(odsek(uloga(html, kljuc), "data-sme", "</ul>"));

  test("one block per role, strongest first, each with its name and sentence", () => {
    const mesta = (["owner", "manager", "editor", "staff"] as const).map((u) => html.indexOf(`data-uloga-red="${u}"`));
    expect(mesta.every((mesto) => mesto > 0)).toBe(true);
    expect([...mesta].sort((a, b) => a - b)).toEqual(mesta);
    for (const u of ["owner", "manager", "editor", "staff"] as const) {
      expect(tekst(uloga(html, u))).toContain(t.uloge[u].naziv);
      expect(tekst(uloga(html, u))).toContain(t.uloge[u].opis);
    }
  });

  test("an Urednik edits and publishes the menu, and nothing about staff, team or settings", () => {
    const urednik = sme("editor");
    expect(urednik).toContain(t.prava.meni);
    expect(urednik).not.toContain(t.prava.osoblje);
    expect(urednik).not.toContain(t.prava.tim);
    expect(urednik).not.toContain(t.prava.podesavanja);
    expect(urednik).not.toContain(t.prava.vlasnistvo);
  });

  test("only the Vlasnik gives the Owner role", () => {
    expect(sme("owner")).toContain(t.prava.vlasnistvo);
    expect(sme("manager")).not.toContain(t.prava.vlasnistvo);
    expect(sme("manager")).toContain(t.prava.tim);
    expect(sme("editor")).not.toContain(t.prava.vlasnistvo);
  });

  test("Osoblje works in the waiter panel only", () => {
    expect(sme("staff")).toBe(t.prava.konobar);
  });

  // K28 review: each card also says what the role cannot do.
  const nesme = (kljuc: string) => tekst(odsek(uloga(html, kljuc), "data-nesme", "</ul>"));

  test("an Urednik card lists what it cannot do, under the label \"Ne može\"", () => {
    const kartica = tekst(uloga(html, "editor"));
    expect(kartica).toContain(t.sme);
    expect(kartica).toContain(t.nesme);
    expect(nesme("editor")).toContain(t.prava.osoblje);
    expect(nesme("editor")).toContain(t.prava.tim);
    expect(nesme("editor")).toContain(t.prava.vlasnistvo);
    expect(nesme("editor")).not.toContain(t.prava.meni);
  });

  test("the Vlasnik card has no \"Ne može\" list", () => {
    const kartica = uloga(html, "owner");
    expect(tekst(kartica)).not.toContain(t.nesme);
    expect(kartica).not.toContain("data-nesme");
  });

  test("only the Vlasnik card carries the \"Samo vlasnik\" chip, on the ownership line", () => {
    expect(tekst(uloga(html, "owner"))).toContain(t.samoVlasnik);
    expect(sme("owner")).toContain(`${t.prava.vlasnistvo} ${t.samoVlasnik}`);
    for (const u of ["manager", "editor", "staff"] as const) expect(tekst(uloga(html, u))).not.toContain(t.samoVlasnik);
  });

  test("the labels are plain words, not upper-cased", () => {
    expect(uloga(html, "editor")).not.toContain("uppercase");
  });
});

describe("Tim: the activity in words", () => {
  const red = (preko: Partial<TimAktivnost>): TimAktivnost => ({
    id: "r1",
    action: "team.invited",
    createdAt: SADA,
    actor: { kind: "user", name: "Ana" },
    subject: null,
    ...preko,
  });

  test("who did what, with the subject appended", () => {
    expect(aktivnostTekst(red({}))).toBe(`Ana je ${t.aktivnost.akcije["team.invited"]}`);
    expect(aktivnostTekst(red({ subject: "marko@example.com" }))).toBe(
      `Ana je ${t.aktivnost.akcije["team.invited"]}: marko@example.com`,
    );
  });

  test("an actor without a name gets the neutral word of the kind", () => {
    expect(aktivnostTekst(red({ actor: { kind: "user", name: null } }))).toContain(t.aktivnost.akter.clan);
    expect(aktivnostTekst(red({ actor: { kind: "staff", name: null } }))).toContain(t.aktivnost.akter.osoblje);
    expect(aktivnostTekst(red({ actor: { kind: "scanme" } }))).toContain(t.aktivnost.akter.scanme);
    expect(aktivnostTekst(red({ actor: { kind: "guest" } }))).toContain(t.aktivnost.akter.gost);
    expect(aktivnostTekst(red({ actor: { kind: "system" } }))).toContain(t.aktivnost.akter.sistem);
  });

  test("an action the screen has no words for is skipped", () => {
    expect(aktivnostTekst(red({ action: "something.unknown" }))).toBeNull();
  });
});
