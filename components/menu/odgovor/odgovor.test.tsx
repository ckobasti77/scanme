// K26 render tests: the reply to a guest about a reservation — the sheet "Obavesti gosta"
// (waiter panel), the venue's mailbox "Pošta lokala" and the reply templates "Šabloni
// odgovora" (Podešavanja). No DOM in the edge-runtime environment: the components are checked as
// renderToStaticMarkup strings. Texts are read from the menu-odgovor dictionary; the only Serbian
// literals are the ones the acceptance criteria name. Invented data only.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuOdgovorSr } from "@/lib/i18n/sr/menu-odgovor";
import { REPLY_KINDS, REPLY_PLACEHOLDERS, TEMPLATE_KINDS } from "@/lib/menu/reply-templates";
import { PoslovnaPosta, type PoslovnaPostaProps } from "../panel/podesavanja/posta";
import { SabloniOdgovora, type SabloniOdgovoraProps } from "../panel/podesavanja/sabloni";
import type { OdgovorKontekst, OdgovorRed, OdgovorRezervacija, PostaStanje, SabloniPodaci } from "./model";
import { ObavestiGosta, type ObavestiGostaProps } from "./obavesti-gosta";

const o = menuOdgovorSr;
const ob = o.obavesti;
const po = o.posta;
const sa = o.sabloni;

// --- Helpers (markup is read back with small regexes) -------------------------------------

const unesc = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

/** What a person could read: no tags, no styles, one line (sr-only text included). */
const tekst = (html: string) =>
  unesc(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const count = (html: string, needle: string) => html.split(needle).length - 1;

function attr(otvor: string, ime: string): string | undefined {
  const value = new RegExp(`\\s${ime}="([^"]*)"`).exec(otvor)?.[1];
  return value === undefined ? undefined : unesc(value);
}

type Dugme = { otvor: string; tekst: string };

function dugmad(html: string): Dugme[] {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ otvor: m[1], tekst: tekst(m[2]) }));
}

function dugme(html: string, pocinje: string): Dugme | undefined {
  return dugmad(html).find((d) => d.tekst.startsWith(pocinje));
}

function radiji(html: string): { vrednost: string | undefined; izabran: boolean }[] {
  return [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((m) => ({
    vrednost: attr(m[0], "value"),
    izabran: /\schecked=""/.test(m[0]),
  }));
}

const predmet = (html: string): string => {
  const polje = [...html.matchAll(/<input\b[^>]*type="text"[^>]*>/g)][0]?.[0];
  if (!polje) throw new Error("no subject field");
  return attr(polje, "value") ?? "";
};

const telo = (html: string): string => {
  const sadrzaj = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(html)?.[1];
  if (sadrzaj === undefined) throw new Error("no textarea");
  return unesc(sadrzaj);
};

const linkovi = (html: string): string[] => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

/** Nothing secret ever reaches the markup. */
function bezTajni(html: string) {
  expect(html).not.toMatch(/ciphertext/i);
  expect(html).not.toMatch(/token/i);
}

// --- Fixtures --------------------------------------------------------------------------------

/** Saturday 2026-10-24 19:00 in Belgrade (UTC+2). */
const SUBOTA_19 = Date.UTC(2026, 9, 24, 17, 0);
const SUBOTA_2030 = Date.UTC(2026, 9, 24, 18, 30);

const REZ: OdgovorRezervacija = {
  status: "accepted",
  guestName: "Marija Gost",
  partySize: 4,
  requestedAt: SUBOTA_19,
  proposedAt: null,
  proposalNote: null,
  contactEmail: "gost@example.com",
  contactPhone: "+381 60 000 0000",
};

const VEZA = { provider: "gmail", emailAddress: "rezervacije@demo.example", status: "active" } as const;

const KONTEKST: OdgovorKontekst = {
  venueName: "Demo restoran",
  signature: null,
  templates: {},
  mailbox: { available: true, connection: VEZA },
  replies: [],
};

const NISTA = () => {};

function sheet(preko: Partial<ObavestiGostaProps> = {}): string {
  return renderToStaticMarkup(<ObavestiGosta rezervacija={REZ} kontekst={KONTEKST} slanje={{ stanje: "miruje" }} onPosalji={NISTA} {...preko} />);
}

const sKontekstom = (preko: Partial<OdgovorKontekst>): OdgovorKontekst => ({ ...KONTEKST, ...preko });

// --- ObavestiGosta ---------------------------------------------------------------------------

describe("ObavestiGosta: the message", () => {
  test("the four kinds start from their own subject", () => {
    const ocekivano: Record<(typeof REPLY_KINDS)[number], string> = {
      accept: "Rezervacija je potvrđena — Demo restoran",
      decline: fmt(o.podrazumevano.decline.subject, { lokal: "Demo restoran" }),
      propose: fmt(o.podrazumevano.propose.subject, { lokal: "Demo restoran" }),
      other: fmt(o.podrazumevano.other.subject, { lokal: "Demo restoran" }),
    };
    for (const vrsta of REPLY_KINDS) {
      expect(predmet(sheet({ pocetnaVrsta: vrsta }))).toBe(ocekivano[vrsta]);
    }
    expect(ocekivano.decline).toBe("Vaša rezervacija — Demo restoran");
    expect(ocekivano.propose).toBe("Predlog drugog termina — Demo restoran");
  });

  test("the kind is a radio group of four labelled choices, starting with the one of the status", () => {
    const html = sheet();
    expect(radiji(html).map((r) => r.vrednost)).toEqual([...REPLY_KINDS]);
    expect(radiji(html).filter((r) => r.izabran).map((r) => r.vrednost)).toEqual(["accept"]);
    for (const vrsta of REPLY_KINDS) expect(tekst(html)).toContain(o.vrste[vrsta]);
    expect(radiji(sheet({ rezervacija: { ...REZ, status: "declined" } })).find((r) => r.izabran)?.vrednost).toBe("decline");
    expect(radiji(sheet({ rezervacija: { ...REZ, status: "new" } })).find((r) => r.izabran)?.vrednost).toBe("other");
    expect(radiji(sheet({ rezervacija: { ...REZ, status: "change_proposed" } })).find((r) => r.izabran)?.vrednost).toBe("propose");
    expect(radiji(sheet({ pocetnaVrsta: "propose" })).find((r) => r.izabran)?.vrednost).toBe("propose");
  });

  test("the accept text is filled with the guest, the Saturday, the party size and the signature", () => {
    const html = sheet();
    const body = telo(html);
    expect(body).toContain("Dobar dan, Marija Gost,");
    expect(body).toContain("subota");
    expect(body).toContain("24. 10. 2026.");
    expect(body).toContain("u 19:00");
    expect(body).toContain("4 osobe");
    expect(body).toContain("Srdačno,\nDemo restoran");
    expect(body).not.toMatch(/\{\w+\}/);
    expect(html).toMatch(/<textarea\b[^>]*\srows="10"/);
    expect(html).toMatch(/<textarea\b[^>]*\smaxLength="4000"/i);
    expect(html).toMatch(/<input\b[^>]*type="text"[^>]*\smaxLength="150"/i);
  });

  test("the proposal text carries the proposed term and the note", () => {
    const html = sheet({
      rezervacija: { ...REZ, status: "change_proposed", proposedAt: SUBOTA_2030, proposalNote: "Imamo sto u bašti." },
    });
    const body = telo(html);
    expect(body).toContain("za 4 osobe");
    expect(body).toContain("subota, 24. 10. 2026. u 20:30");
    expect(body).toContain("Imamo sto u bašti.");
  });

  test("the venue's own template and signature win over the defaults", () => {
    const html = sheet({
      kontekst: sKontekstom({
        signature: "Vaš tim iz Demo restorana",
        templates: { accept: { subject: "Vaš sto je rezervisan — {lokal}", body: "Zdravo {ime},\n\n{potpis}" } },
      }),
    });
    expect(predmet(html)).toBe("Vaš sto je rezervisan — Demo restoran");
    expect(telo(html)).toBe("Zdravo Marija Gost,\n\nVaš tim iz Demo restorana");
  });

  test("the roots carry the attributes the snapshots scroll to", () => {
    expect(sheet()).toContain("data-obavesti-gosta");
    expect(posta(DOSTUPNO)).toContain("data-posta-lokala");
    expect(sabloni(PODACI)).toContain("data-sabloni-odgovora");
  });

  test("the sheet sits under an existing h2: its own heading is an h3", () => {
    const html = sheet();
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
    expect(html).toMatch(/<h3\b[^>]*>Obavesti gosta<\/h3>/);
  });

  test("an empty subject or text shows the reason and turns the send off", () => {
    const html = sheet({ kontekst: sKontekstom({ templates: { accept: { subject: "Potvrda", body: "{poruka}" } } }) });
    expect(telo(html)).toBe("");
    expect(tekst(html)).toContain(ob.prazno);
    expect(dugme(html, ob.posalji)?.otvor).toMatch(/\sdisabled=""/);
    expect(tekst(sheet())).not.toContain(ob.prazno);
  });
});

describe("ObavestiGosta: the ways out", () => {
  test("the mailto link carries the guest's address and percent-encoded Serbian letters and CRLF", () => {
    const html = sheet();
    const veza = linkovi(html).find((a) => /\shref="mailto:/.test(a));
    expect(veza).toBeDefined();
    const href = attr(veza as string, "href") as string;
    expect(href.startsWith("mailto:gost@example.com?subject=")).toBe(true);
    expect(href).toContain("%C4%8D");
    expect(href).toContain("%0D%0A");
    expect(href).not.toMatch(/[ \r\n]/);
    expect(href.split("?")[0]).toBe("mailto:gost@example.com");
    expect(href).not.toMatch(/[?&](cc|bcc|to)=/i);
    expect(attr(veza as string, "aria-label")).toBe(fmt(ob.otvoriCitac, { email: "gost@example.com" }));
    expect(tekst(html)).toContain(ob.otvori);
    expect(tekst(html)).not.toContain(ob.skraceno);
  });

  test("a hostile address cannot add a recipient or a header", () => {
    const html = sheet({ rezervacija: { ...REZ, contactEmail: "a@b.example,c@d.example?cc=x@y.example" } });
    const href = attr(linkovi(html).find((a) => /\shref="mailto:/.test(a)) as string, "href") as string;
    expect(href.split("?")[0]).toBe("mailto:a@b.example%2Cc@d.example%3Fcc%3Dx@y.example");
    expect(href.split("?")).toHaveLength(2);
    expect(href).not.toMatch(/[?&]cc=/i);
  });

  test("a long text opens shortened in the mail program and says so", () => {
    const html = sheet({ kontekst: sKontekstom({ templates: { accept: { subject: "Potvrda", body: "Čuvamo sto. ".repeat(300) } } }) });
    expect(tekst(html)).toContain(ob.skraceno);
    const href = attr(linkovi(html).find((a) => /\shref="mailto:/.test(a)) as string, "href") as string;
    expect(href.length).toBeLessThanOrEqual(1800);
  });

  test("the phone is a tel: link", () => {
    const html = sheet();
    const veza = linkovi(html).find((a) => /\shref="tel:/.test(a));
    expect(veza).toBeDefined();
    expect(attr(veza as string, "href")).toBe("tel:+381600000000");
    expect(attr(veza as string, "aria-label")).toBe(fmt(ob.pozoviCitac, { telefon: "+381 60 000 0000" }));
    expect(tekst(html)).toContain(ob.pozovi);
    expect(sheet({ rezervacija: { ...REZ, contactPhone: null } })).not.toContain("tel:");
    expect(sheet({ rezervacija: { ...REZ, contactPhone: "12" } })).not.toContain("tel:");
  });

  test("the targets are at least 48 px", () => {
    const html = sheet();
    for (const veza of linkovi(html)) expect(veza).toContain("min-h-12");
    for (const d of dugmad(html)) expect(d.otvor).toMatch(/min-h-1[2-4]/);
  });
});

describe("ObavestiGosta: the venue's mailbox", () => {
  test("the send button is there only with an active connection and a guest address, and names the sender", () => {
    const html = sheet();
    expect(dugme(html, ob.posalji)).toBeDefined();
    expect(dugme(html, ob.posalji)?.otvor).toContain('type="submit"');
    expect(dugme(html, ob.posalji)?.otvor).not.toMatch(/\sdisabled=""/);
    expect(tekst(html)).toContain(fmt(ob.saljeSa, { adresa: "rezervacije@demo.example" }));

    for (const bez of [
      sheet({ kontekst: sKontekstom({ mailbox: { available: true, connection: { ...VEZA, status: "error" } } }) }),
      sheet({ kontekst: sKontekstom({ mailbox: { available: true, connection: null } }) }),
      sheet({ kontekst: sKontekstom({ mailbox: { available: false, connection: null } }) }),
      sheet({ rezervacija: { ...REZ, contactEmail: null } }),
    ]) {
      expect(dugme(bez, ob.posalji)).toBeUndefined();
      expect(tekst(bez)).not.toContain(fmt(ob.saljeSa, { adresa: "rezervacije@demo.example" }));
    }
  });

  test("the three mailbox notes say exactly what is wrong", () => {
    const nedostupna = sheet({ kontekst: sKontekstom({ mailbox: { available: false, connection: null } }) });
    expect(tekst(nedostupna)).toContain(ob.postaNedostupna);
    expect(tekst(nedostupna)).not.toContain(ob.postaNijePovezana);

    const nijePovezana = sheet({ kontekst: sKontekstom({ mailbox: { available: true, connection: null } }) });
    expect(tekst(nijePovezana)).toContain(ob.postaNijePovezana);
    expect(tekst(nijePovezana)).not.toContain(ob.postaNedostupna);

    const greska = sheet({ kontekst: sKontekstom({ mailbox: { available: true, connection: { ...VEZA, status: "error" } } }) });
    expect(tekst(greska)).toContain(ob.postaGreska);
    expect(greska).toMatch(/<div role="status"[^>]*>[\s\S]*?Veza sa poštom je istekla/);
    // the other ways out stay
    expect(linkovi(greska).some((a) => /\shref="mailto:/.test(a))).toBe(true);

    expect(tekst(sheet())).not.toContain(ob.postaGreska);
    expect(tekst(sheet())).not.toContain(ob.postaNijePovezana);
    expect(tekst(sheet())).not.toContain(ob.postaNedostupna);
  });

  test("offline: the send button is disabled", () => {
    expect(dugme(sheet({ radnjeIskljucene: true }), ob.posalji)?.otvor).toMatch(/\sdisabled=""/);
  });
});

describe("ObavestiGosta: the guest left no e-mail", () => {
  test("a phone only: bezEmaila, no mailto link, no form, the call stays", () => {
    const html = sheet({ rezervacija: { ...REZ, contactEmail: null } });
    expect(tekst(html)).toContain(ob.bezEmaila);
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("<textarea");
    expect(tekst(html)).not.toContain(ob.otvori);
    expect(linkovi(html).some((a) => /\shref="tel:/.test(a))).toBe(true);
  });

  test("nothing at all: bezKontakta and no way out", () => {
    const html = sheet({ rezervacija: { ...REZ, contactEmail: null, contactPhone: null } });
    expect(tekst(html)).toContain(ob.bezKontakta);
    expect(tekst(html)).not.toContain(ob.bezEmaila);
    expect(linkovi(html)).toHaveLength(0);
  });

  test("with an address: 'Kome' names it", () => {
    expect(tekst(sheet())).toContain(`${ob.kome}: gost@example.com`);
  });
});

describe("ObavestiGosta: the state of the send", () => {
  test("sending: the button is busy and says so", () => {
    const d = dugme(sheet({ slanje: { stanje: "salje" } }), ob.salje);
    expect(d).toBeDefined();
    expect(d?.otvor).toContain('aria-busy="true"');
    expect(dugme(sheet({ slanje: { stanje: "salje" } }), ob.posalji)).toBeUndefined();
  });

  test("sent: a status line with the address", () => {
    const html = sheet({ slanje: { stanje: "poslato", adresa: "rezervacije@demo.example" } });
    expect(html).toMatch(/<div role="status"[^>]*>[\s\S]*?Poruka je poslata sa rezervacije@demo\.example\./);
    expect(tekst(html)).toContain(fmt(ob.poslato, { adresa: "rezervacije@demo.example" }));
  });

  test("failed: an alert with the text of the code, or the general one for an unknown code", () => {
    const poznata = sheet({ slanje: { stanje: "greska", code: "mail/rate_limited" } });
    expect(poznata).toMatch(/role="alert"/);
    expect(tekst(poznata)).toContain(o.greske["mail/rate_limited"]);
    const nepoznata = sheet({ slanje: { stanje: "greska", code: "neka/nepoznata" } });
    expect(tekst(nepoznata)).toContain(o.greske["mail/send_failed"]);
    expect(tekst(sheet())).not.toContain(o.greske["mail/send_failed"]);
    expect(sheet()).not.toContain('role="alert"');
  });
});

describe("ObavestiGosta: the call outcome", () => {
  test("open: the text and three buttons that report the outcome", () => {
    const html = sheet({ onZabeleziPoziv: NISTA, pocetnoIshodOtvoren: true });
    expect(html).toMatch(/<details\b[^>]*\sopen=""/);
    expect(html).toContain("<summary");
    expect(tekst(html)).toContain(o.ishod.naslov);
    expect(tekst(html)).toContain(o.ishod.opis);
    for (const ishod of ["reached", "no_answer", "left_message"] as const) {
      expect(dugme(html, o.ishod[ishod])).toBeDefined();
    }
    expect(tekst(html)).not.toContain(o.ishod.zabelezeno);
  });

  test("closed by default, and 'Zabeleženo.' after it was logged", () => {
    expect(sheet({ onZabeleziPoziv: NISTA })).not.toMatch(/<details\b[^>]*\sopen=""/);
    const html = sheet({ onZabeleziPoziv: NISTA, pocetnoIshodOtvoren: true, pozivZabelezen: true });
    expect(tekst(html)).toContain(o.ishod.zabelezeno);
  });

  test("only with a phone and a callback", () => {
    expect(sheet()).not.toContain("<details");
    expect(sheet({ onZabeleziPoziv: NISTA, rezervacija: { ...REZ, contactPhone: null } })).not.toContain("<details");
  });
});

describe("ObavestiGosta: history and loading", () => {
  const REDOVI: OdgovorRed[] = [
    { id: "r1", channel: "mailbox", kind: "accept", status: "sent", phoneOutcome: null, errorCode: null, createdAt: SUBOTA_19, byName: "Ana Konobar" },
    { id: "r2", channel: "phone", kind: null, status: "logged", phoneOutcome: "no_answer", errorCode: null, createdAt: SUBOTA_2030, byName: null },
    { id: "r3", channel: "mailto", kind: "other", status: "failed", phoneOutcome: null, errorCode: "mail/send_failed", createdAt: SUBOTA_2030, byName: null },
  ];

  test("each earlier reply is a row: time in Belgrade, channel, kind, status, outcome and who", () => {
    const html = sheet({ kontekst: sKontekstom({ replies: REDOVI }) });
    expect(tekst(html)).toContain(o.istorija.naslov);
    expect(count(html, "data-odgovor-red=")).toBe(3);
    expect(tekst(html)).toContain("19:00 · Iz pošte lokala · Prihvatanje");
    expect(tekst(html)).toContain("Poslato · Ana Konobar");
    expect(tekst(html)).toContain("20:30 · Telefonom");
    expect(tekst(html)).not.toContain("20:30 · Telefonom ·");
    expect(tekst(html)).toContain(`${o.istorija.status.logged} · ${o.ishod.no_answer}`);
    expect(tekst(html)).toContain(`20:30 · ${o.istorija.kanal.mailto} · ${o.vrste.other}`);
    expect(tekst(html)).toContain(o.istorija.status.failed);
  });

  test("no history, no heading for it", () => {
    expect(tekst(sheet())).not.toContain(o.istorija.naslov);
  });

  test("no context: nothing (not available); still loading: a skeleton", () => {
    expect(renderToStaticMarkup(<ObavestiGosta rezervacija={REZ} kontekst={null} slanje={{ stanje: "miruje" }} onPosalji={NISTA} />)).toBe("");
    const html = renderToStaticMarkup(<ObavestiGosta rezervacija={REZ} kontekst={undefined} slanje={{ stanje: "miruje" }} onPosalji={NISTA} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("mailto:");
  });

  test("no markup carries a secret", () => {
    bezTajni(sheet({ onZabeleziPoziv: NISTA, pocetnoIshodOtvoren: true, kontekst: sKontekstom({ replies: REDOVI }) }));
    bezTajni(sheet({ slanje: { stanje: "greska", code: "mail/reconnect_required" } }));
    bezTajni(sheet({ kontekst: sKontekstom({ mailbox: { available: true, connection: { ...VEZA, status: "error" } } }) }));
  });
});

// --- PoslovnaPosta ---------------------------------------------------------------------------

const DOSTUPNO: PostaStanje = { available: true, providers: ["gmail", "microsoft"], reason: null, connection: null };
const POVEZANO: PostaStanje = {
  available: true,
  providers: ["gmail", "microsoft"],
  reason: null,
  connection: {
    provider: "gmail",
    emailAddress: "rezervacije@demo.example",
    status: "active",
    connectedAt: Date.UTC(2026, 9, 20, 10, 0),
    lastErrorCode: null,
  },
};

function posta(stanje: PostaStanje | undefined, preko: Partial<PoslovnaPostaProps> = {}): string {
  return renderToStaticMarkup(<PoslovnaPosta stanje={stanje} onPovezi={NISTA} onPrekini={NISTA} {...preko} />);
}

describe("PoslovnaPosta", () => {
  test("bez env ključeva povezivanje je isključeno i UI to jasno kaže", () => {
    const html = posta({ available: false, providers: [], reason: "not_configured", connection: null });
    expect(tekst(html)).toContain(po.nedostupno);
    expect(count(tekst(html), po.nedostupno)).toBe(1);
    expect(dugmad(html)).toHaveLength(0);
    expect(tekst(html)).not.toContain(po.poveziGmail);
    expect(tekst(html)).not.toContain(po.poveziMicrosoft);
    // the rest of the block still explains itself
    expect(tekst(html)).toContain(po.naslov);
    expect(tekst(html)).toContain(po.opis);
    expect(tekst(html)).toContain(po.bezLozinke);
    bezTajni(html);
  });

  test("available and not connected: one connect button per provider", () => {
    const oba = posta(DOSTUPNO);
    expect(dugmad(oba).map((d) => d.tekst)).toEqual([po.poveziGmail, po.poveziMicrosoft]);
    expect(tekst(oba)).not.toContain(po.nedostupno);
    expect(tekst(oba)).toContain(po.bezLozinke);

    const samoGmail = posta({ ...DOSTUPNO, providers: ["gmail"] });
    expect(dugmad(samoGmail).map((d) => d.tekst)).toEqual([po.poveziGmail]);
    expect(tekst(samoGmail)).not.toContain(po.poveziMicrosoft);
  });

  test("while a provider's sign-in opens, its button is busy and the other waits", () => {
    const html = posta(DOSTUPNO, { radi: "microsoft" });
    const busy = dugme(html, po.povezujem);
    expect(busy?.otvor).toContain('aria-busy="true"');
    expect(dugme(html, po.poveziGmail)?.otvor).toMatch(/\sdisabled=""/);
  });

  test("connected: the address, the provider and the day, and 'Prekini vezu' without connect buttons", () => {
    const html = posta(POVEZANO);
    expect(tekst(html)).toContain(fmt(po.povezana, { adresa: "rezervacije@demo.example" }));
    expect(tekst(html)).toContain(fmt(po.povezanaOd, { provajder: po.provajder.gmail, datum: "20. 10. 2026." }));
    expect(dugmad(html).map((d) => d.tekst)).toEqual([po.prekini]);
    expect(html).not.toContain("data-potvrda");
    bezTajni(html);
  });

  test("the disconnect question names the address and answers both ways", () => {
    const html = posta(POVEZANO, { pocetnoPotvrda: true });
    expect(html).toContain("data-potvrda");
    expect(tekst(html)).toContain(fmt(po.prekiniPotvrda, { adresa: "rezervacije@demo.example" }));
    expect(dugme(html, po.prekiniDa)).toBeDefined();
    expect(dugme(html, po.odustani)).toBeDefined();
    expect(dugme(html, po.prekini)).toBeUndefined();
    expect(dugme(posta(POVEZANO, { pocetnoPotvrda: true, radi: "prekid" }), po.prekiniDa)?.otvor).toContain('aria-busy="true"');
  });

  test("a connection that expired warns and offers to connect again", () => {
    const stanje: PostaStanje = {
      ...POVEZANO,
      connection: { ...(POVEZANO.connection as NonNullable<PostaStanje["connection"]>), status: "error", lastErrorCode: "mail/reconnect_required" },
    };
    const html = posta(stanje);
    expect(tekst(html)).toContain(po.greska);
    expect(html).toMatch(/<p role="status"[^>]*>[\s\S]*?Veza sa poštom je istekla/);
    expect(dugmad(html).map((d) => d.tekst)).toEqual([po.poveziGmail, po.poveziMicrosoft, po.prekini]);
    expect(tekst(html)).not.toContain("reconnect_required");
  });

  test("after the callback: success is a status, a failure an alert with the reason", () => {
    const uspeh = posta(POVEZANO, { povratak: { ishod: "povezano" } });
    expect(uspeh).toMatch(/<div role="status"[^>]*>[\s\S]*?Pošta je povezana\./);
    expect(uspeh).not.toContain('role="alert"');

    const neuspeh = posta(DOSTUPNO, { povratak: { ishod: "greska", code: "mail/state_invalid" } });
    expect(neuspeh).toContain('role="alert"');
    expect(tekst(neuspeh)).toContain(fmt(po.neuspeh, { razlog: o.greske["mail/state_invalid"] }));

    const nepoznat = posta(DOSTUPNO, { povratak: { ishod: "greska", code: "nesto/drugo" } });
    expect(tekst(nepoznat)).toContain(fmt(po.neuspeh, { razlog: o.greske["mail/provider_unavailable"] }));
    expect(tekst(nepoznat)).not.toContain("nesto/drugo");
  });

  test("the error of the last action is an alert", () => {
    const html = posta(DOSTUPNO, { greska: "Nešto nije uspelo." });
    expect(html).toMatch(/role="alert"/);
    expect(tekst(html)).toContain("Nešto nije uspelo.");
    expect(posta(DOSTUPNO)).not.toContain('role="alert"');
  });

  test("loading: the title stays, a skeleton stands in for the state", () => {
    const html = posta(undefined);
    expect(tekst(html)).toContain(po.naslov);
    expect(html).toContain('data-stanje="ucitavanje"');
    expect(dugmad(html)).toHaveLength(0);
    expect(tekst(html)).not.toContain(po.nedostupno);
  });
});

// --- SabloniOdgovora -------------------------------------------------------------------------

const PODACI: SabloniPodaci = { venueName: "Demo restoran", signature: null, templates: {} };

function sabloni(podaci: SabloniPodaci | undefined, preko: Partial<SabloniOdgovoraProps> = {}): string {
  return renderToStaticMarkup(<SabloniOdgovora podaci={podaci} onSacuvaj={NISTA} onVrati={NISTA} onPotpis={NISTA} {...preko} />);
}

const pregledPredmet = (html: string) => unesc(/data-sablon-pregled-predmet=""[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");
const pregledTekst = (html: string) => unesc(/data-sablon-pregled-tekst=""[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");
const formaSablona = (html: string) => /<form\b[^>]*data-sablon-forma[^>]*>([\s\S]*?)<\/form>/.exec(html)?.[1] ?? "";

describe("SabloniOdgovora", () => {
  test("three kinds as a radio choice, each with a badge: all default at first", () => {
    const html = sabloni(PODACI);
    expect(radiji(html).map((r) => r.vrednost)).toEqual([...TEMPLATE_KINDS]);
    expect(radiji(html).filter((r) => r.izabran).map((r) => r.vrednost)).toEqual(["accept"]);
    expect(count(tekst(html), sa.podrazumevani)).toBe(3);
    expect(tekst(html)).not.toContain(sa.prilagodjen);
    expect(tekst(html)).not.toContain(sa.vrati);
    expect(tekst(html)).toContain(sa.naslov);
    expect(tekst(html)).toContain(sa.opis);
    expect(radiji(sabloni(PODACI, { pocetno: "propose" })).find((r) => r.izabran)?.vrednost).toBe("propose");
    bezTajni(html);
  });

  test("a custom template gets the badge and, when open, 'Vrati podrazumevani'", () => {
    const podaci: SabloniPodaci = { ...PODACI, templates: { decline: { subject: "Žao nam je — {lokal}", body: "Zdravo {ime}.\n\n{potpis}" } } };
    const naAccept = sabloni(podaci);
    expect(count(tekst(naAccept), sa.prilagodjen)).toBe(1);
    expect(count(tekst(naAccept), sa.podrazumevani)).toBe(2);
    expect(tekst(naAccept)).not.toContain(sa.vrati);

    const naDecline = sabloni(podaci, { pocetno: "decline" });
    expect(tekst(naDecline)).toContain(sa.vrati);
    const forma = formaSablona(naDecline);
    expect(forma).toContain("Žao nam je — {lokal}");
    expect(telo(forma)).toBe("Zdravo {ime}.\n\n{potpis}");
  });

  test("the fields hold the default text and keep their limits", () => {
    const html = sabloni(PODACI);
    const forma = formaSablona(html);
    expect(predmet(forma)).toBe(o.podrazumevano.accept.subject);
    expect(telo(forma)).toBe(o.podrazumevano.accept.body);
    expect(forma).toMatch(/<input\b[^>]*\smaxLength="150"/i);
    expect(forma).toMatch(/<textarea\b[^>]*\smaxLength="4000"/i);
    expect(tekst(forma)).toContain(sa.predmet);
    expect(tekst(forma)).toContain(sa.tekst);
    expect(dugme(forma, sa.sacuvaj)?.otvor).not.toMatch(/\sdisabled=""/);
  });

  test("every placeholder is listed as literal text with its description", () => {
    const html = sabloni(PODACI);
    expect(tekst(html)).toContain(sa.zamene);
    for (const ime of REPLY_PLACEHOLDERS) {
      expect(html).toContain(`>{${ime}}</code>`);
      expect(tekst(html)).toContain(sa.zameneOpis[ime]);
    }
    expect(count(html, "<code")).toBe(REPLY_PLACEHOLDERS.length);
  });

  test("the preview fills the template for an invented guest and the venue signature", () => {
    const html = sabloni(PODACI);
    expect(tekst(html)).toContain(sa.pregled);
    expect(tekst(html)).toContain(sa.pregledOpis);
    expect(pregledPredmet(html)).toBe("Rezervacija je potvrđena — Demo restoran");
    const tekstPregleda = pregledTekst(html);
    expect(tekstPregleda).toContain("Dobar dan, Marija,");
    expect(tekstPregleda).toContain("subota, 24. 10. 2026. u 19:00, 4 osobe");
    expect(tekstPregleda).toContain("Srdačno,\nDemo restoran");
    expect(tekstPregleda).not.toMatch(/\{\w+\}/);
    expect(html).toMatch(/data-sablon-pregled-tekst=""/);
    expect(html).toContain("whitespace-pre-line");

    const predlog = pregledTekst(sabloni(PODACI, { pocetno: "propose" }));
    expect(predlog).toContain("subota, 24. 10. 2026. u 20:30");
    expect(predlog).toContain(sa.primer.predlog);
  });

  test("the preview uses the venue's own signature", () => {
    const html = sabloni({ ...PODACI, signature: "Vaš tim iz Demo restorana" });
    expect(pregledTekst(html)).toContain("Vaš tim iz Demo restorana");
    expect(pregledTekst(html)).not.toContain("Srdačno,");
  });

  test("the signature form: the default shows as a placeholder, a stored one as the value", () => {
    const bez = sabloni(PODACI);
    const potpisBlok = /<form\b[^>]*data-sablon-potpis[^>]*>([\s\S]*?)<\/form>/.exec(bez)?.[1] ?? "";
    expect(tekst(potpisBlok)).toContain(sa.potpis);
    expect(tekst(potpisBlok)).toContain(sa.potpisOpis);
    expect(telo(potpisBlok)).toBe("");
    expect(potpisBlok).toMatch(/<textarea\b[^>]*\smaxLength="500"/i);
    expect(attr(/<textarea\b[^>]*>/.exec(potpisBlok)?.[0] ?? "", "placeholder")).toBe("Srdačno,\nDemo restoran");
    expect(dugme(potpisBlok, sa.sacuvaj)).toBeDefined();

    const sa_ = sabloni({ ...PODACI, signature: "Vaš tim" });
    const blok = /<form\b[^>]*data-sablon-potpis[^>]*>([\s\S]*?)<\/form>/.exec(sa_)?.[1] ?? "";
    expect(telo(blok)).toBe("Vaš tim");
  });

  test("saving: busy button and 'Čuvam…'; saved: 'Sačuvano.' as a status", () => {
    const radi = sabloni(PODACI, { cuva: "accept" });
    expect(dugme(formaSablona(radi), sa.sacuvaj)?.otvor).toContain('aria-busy="true"');
    expect(tekst(radi)).toContain(sa.cuva);
    expect(tekst(sabloni(PODACI))).not.toContain(sa.cuva);

    const gotovo = sabloni(PODACI, { sacuvano: "accept" });
    expect(gotovo).toMatch(/role="status"[^>]*data-cuvanje="sacuvano"/);
    expect(tekst(gotovo)).toContain(sa.sacuvano);
    // a save of the signature is not the template's save
    const potpisGotov = sabloni(PODACI, { sacuvano: "potpis" });
    expect(tekst(formaSablona(potpisGotov))).not.toContain(sa.sacuvano);
    expect(tekst(potpisGotov)).toContain(sa.sacuvano);
  });

  test("an error stands under the form it belongs to", () => {
    const html = sabloni(PODACI, { greska: { cilj: "accept", tekst: "Nije sačuvano, pokušajte ponovo." } });
    expect(html).toContain('role="alert"');
    expect(tekst(formaSablona(html))).toContain("Nije sačuvano, pokušajte ponovo.");
    const drugi = sabloni(PODACI, { greska: { cilj: "decline", tekst: "Nije sačuvano, pokušajte ponovo." } });
    expect(drugi).not.toContain("Nije sačuvano, pokušajte ponovo.");
    const potpis = sabloni(PODACI, { greska: { cilj: "potpis", tekst: "Potpis nije sačuvan." } });
    expect(potpis).toContain("Potpis nije sačuvan.");
    expect(formaSablona(potpis)).not.toContain("Potpis nije sačuvan.");
  });

  test("too long: the limit is written and the save is off", () => {
    const predug: SabloniPodaci = { ...PODACI, templates: { accept: { subject: "x".repeat(151), body: "Dobar dan." } } };
    const html = sabloni(predug);
    expect(tekst(html)).toContain(fmt(sa.predugo, { n: 150 }));
    expect(dugme(formaSablona(html), sa.sacuvaj)?.otvor).toMatch(/\sdisabled=""/);

    const dugPotpis = sabloni({ ...PODACI, signature: "p".repeat(501) });
    expect(tekst(dugPotpis)).toContain(fmt(sa.predugo, { n: 500 }));
  });

  test("an empty template cannot be saved", () => {
    const html = sabloni({ ...PODACI, templates: { accept: { subject: "Potvrda", body: "   " } } });
    expect(dugme(formaSablona(html), sa.sacuvaj)?.otvor).toMatch(/\sdisabled=""/);
    expect(tekst(html)).toContain(ob.prazno);
  });

  test("loading: the title and a skeleton, no form", () => {
    const html = sabloni(undefined);
    expect(tekst(html)).toContain(sa.naslov);
    expect(html).toContain('data-stanje="ucitavanje"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
  });
});
