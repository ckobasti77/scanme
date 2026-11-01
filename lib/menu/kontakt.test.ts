// ScanMe Menu V1 (K17) — the ScanMe team's public contact and the prepared
// mailto: link the editor opens in the person's own mail program. Nothing is
// sent from the app, so the whole contract is the shape of the link: the
// subject and the body must stay inside their own parameters, whatever the
// venue name or the text contains.

import { describe, expect, test } from "vitest";
import { mailtoLink, SCANME_KONTAKT_EMAIL } from "./kontakt";

/** Reads a mailto: link the way a mail program does: the address, then the query parameters in order, decoded. */
function procitaj(link: string): { adresa: string; parametri: [string, string][] } {
  const bezSeme = link.replace(/^mailto:/, "");
  const upitnik = bezSeme.indexOf("?");
  return {
    adresa: bezSeme.slice(0, upitnik),
    parametri: bezSeme
      .slice(upitnik + 1)
      .split("&")
      .map((deo): [string, string] => {
        const jednako = deo.indexOf("=");
        return [deo.slice(0, jednako), decodeURIComponent(deo.slice(jednako + 1))];
      }),
  };
}

/** Printable ASCII without a space: what a link may consist of. */
const SAMO_ASCII = /^[\x21-\x7e]+$/;

describe("SCANME_KONTAKT_EMAIL", () => {
  test("is the public ScanMe address", () => {
    expect(SCANME_KONTAKT_EMAIL).toBe("office@scanme.rs");
  });

  test("is a bare address that can follow mailto: directly: no name part, no spaces, nothing that opens a query", () => {
    expect(SCANME_KONTAKT_EMAIL).toMatch(/^[^\s@<>?&=,;:]+@[^\s@<>?&=,;:]+\.[a-z]{2,}$/i);
  });
});

describe("mailtoLink", () => {
  test("format: mailto:<address>?subject=<subject>&body=<body>, the address as given", () => {
    expect(mailtoLink(SCANME_KONTAKT_EMAIL, "Tema", "Telo")).toBe(`mailto:${SCANME_KONTAKT_EMAIL}?subject=Tema&body=Telo`);
    expect(mailtoLink("ime@primer.rs", "t", "b")).toBe("mailto:ime@primer.rs?subject=t&body=b");
    // Both parameters are always there, in this order, also for empty texts.
    expect(mailtoLink(SCANME_KONTAKT_EMAIL, "", "")).toBe(`mailto:${SCANME_KONTAKT_EMAIL}?subject=&body=`);
  });

  test("Serbian letters are percent-encoded as UTF-8, so the whole link is plain ASCII", () => {
    const link = mailtoLink(SCANME_KONTAKT_EMAIL, "čćžšđ ČĆŽŠĐ", "Đurđevak");
    expect(link).toBe(
      `mailto:${SCANME_KONTAKT_EMAIL}?subject=%C4%8D%C4%87%C5%BE%C5%A1%C4%91%20%C4%8C%C4%86%C5%BD%C5%A0%C4%90&body=%C4%90ur%C4%91evak`,
    );
    expect(link).toMatch(SAMO_ASCII);
  });

  test("space, + and % are encoded: a mail program reads + literally and decodes every %xx", () => {
    const link = mailtoLink(SCANME_KONTAKT_EMAIL, "dva reči + 50%", "%41 i %0A");
    expect(link).toBe(`mailto:${SCANME_KONTAKT_EMAIL}?subject=dva%20re%C4%8Di%20%2B%2050%25&body=%2541%20i%20%250A`);
    expect(procitaj(link).parametri).toEqual([
      ["subject", "dva reči + 50%"],
      ["body", "%41 i %0A"],
    ]);
  });

  test("& ? = # cannot break out of their parameter, so no text can add a header such as cc", () => {
    const tema = "Čarda & Ribe #1? a=b&cc=a@primer.rs";
    const telo = "x=y&z=w?q#r&bcc=c@primer.rs,d@primer.rs";
    const link = mailtoLink(SCANME_KONTAKT_EMAIL, tema, telo);
    // Only the separators the function writes itself are left: one ?, one &, two =.
    expect(link.split("?")).toHaveLength(2);
    expect(link.split("&")).toHaveLength(2);
    expect(link.split("=")).toHaveLength(3);
    expect(link).not.toContain("#");
    expect(procitaj(link)).toEqual({
      adresa: SCANME_KONTAKT_EMAIL,
      parametri: [
        ["subject", tema],
        ["body", telo],
      ],
    });
  });

  test("line breaks are encoded: the link stays on one line and the lines come back in the mail", () => {
    const telo = "Zdravo,\n\nželimo promenu.\r\nHvala.";
    const link = mailtoLink(SCANME_KONTAKT_EMAIL, "Tema", telo);
    expect(link).not.toMatch(/[\r\n]/);
    expect(link).toContain("body=Zdravo%2C%0A%0A%C5%BEelimo%20promenu.%0D%0AHvala.");
    expect(procitaj(link).parametri[1][1]).toBe(telo);
  });

  test("any text comes back unchanged and the link stays plain ASCII", () => {
    const tekstovi = [
      "",
      "Restoran „Šumadija“ (Beograd)",
      "ćevapi, đuveč; šljivovica: žestoko/fino",
      "  razmaci na krajevima  ",
      "tab\tizmedju",
      "emoji 🍕 i 北京",
      "mailto:neko@primer.rs?cc=drugi@primer.rs",
    ];
    for (const tekst of tekstovi) {
      const link = mailtoLink(SCANME_KONTAKT_EMAIL, tekst, tekst);
      expect(link, tekst).toMatch(SAMO_ASCII);
      expect(procitaj(link), tekst).toEqual({
        adresa: SCANME_KONTAKT_EMAIL,
        parametri: [
          ["subject", tekst],
          ["body", tekst],
        ],
      });
    }
  });
});
