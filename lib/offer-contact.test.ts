import { describe, expect, test } from "vitest";
import {
  ENTERPRISE_CONTACT_HREF,
  ENTERPRISE_OFFER_MESSAGE,
  buildOfferMessage,
  buildSelectionContactHref,
  readContactMessage,
  readContactSelection,
} from "./offer-contact";
import { createDefaultProductSelection, type OrderSelection } from "./scanme-pricing";

const selection: OrderSelection = {
  service: "review",
  tier: "premium",
  period: "annual",
  products: [
    { ...createDefaultProductSelection("stickers"), quantity: 3 },
    {
      ...createDefaultProductSelection("compact-stand"),
      background: "black",
    },
    {
      ...createDefaultProductSelection("two-piece-stand"),
      orientation: "landscape",
      dimension: "a4",
      design: { kind: "custom", brief: "Veći naziv lokala i tamna pozadina." },
    },
  ],
  logoUploadId: "logo-upload-id",
};

function queryOf(href: string): string {
  return href.slice(href.indexOf("?") + 1, href.indexOf("#"));
}

describe("buildOfferMessage", () => {
  test("prenosi istu strukturiranu konfiguraciju", () => {
    const message = buildOfferMessage(selection);
    expect(message).toContain("Usluga: ScanMe Review");
    expect(message).toContain("Nalepnice i stikeri, 3 kom, Kvadrat, Srednja, Šablon 1");
    expect(message).toContain("Kompaktni stalci, 1 kom, Plastični, Crna, A5, Šablon 1");
    expect(message).not.toContain("Crna pozadina zahteva posebnu izradu");
    expect(message).toContain("Dvodelni stalci, 1 kom, Landscape, A4, Custom dizajn");
    expect(message).toContain("Opis: Veći naziv lokala i tamna pozadina.");
    expect(message).toContain("Logo: Dodat za celu ponudu");
    expect(message).toContain("Subtotal bez custom dizajna:");
  });
});

describe("kontakt round-trip", () => {
  test("href vraća isti izbor i poruku", () => {
    const params = new URLSearchParams(queryOf(buildSelectionContactHref(selection)));
    expect(readContactSelection(params)).toEqual(selection);
    expect(readContactMessage(params)).toBe(buildOfferMessage(selection));
  });

  test("enterprise upit vraća postojeću poruku", () => {
    expect(readContactMessage(new URLSearchParams(queryOf(ENTERPRISE_CONTACT_HREF)))).toBe(
      ENTERPRISE_OFFER_MESSAGE,
    );
  });

  test("nevalidan ili prazan kontekst vraća null", () => {
    expect(readContactMessage(new URLSearchParams(""))).toBeNull();
    expect(readContactMessage(new URLSearchParams("ponuda=service%3Dfoo"))).toBeNull();
  });
});
