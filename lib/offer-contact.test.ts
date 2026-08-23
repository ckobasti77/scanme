import { describe, expect, test } from "vitest";
import {
  ENTERPRISE_CONTACT_HREF,
  ENTERPRISE_OFFER_MESSAGE,
  buildOfferMessage,
  buildSelectionContactHref,
  readContactMessage,
} from "./offer-contact";
import type { OrderSelection } from "./scanme-pricing";

const selection: OrderSelection = {
  service: "review",
  tier: "premium",
  period: "annual",
  products: [
    { productId: "nalepnica", materialId: "pvc", quantity: 3 },
    { productId: "stalak", materialId: "metal", quantity: 1 },
  ],
  design: { kind: "custom", addOwnLogo: true },
};

function queryOf(href: string): string {
  return href.slice(href.indexOf("?") + 1, href.indexOf("#"));
}

describe("buildOfferMessage", () => {
  test("nosi uslugu, paket, period, stavke, dizajn i iznose", () => {
    const msg = buildOfferMessage(selection);
    expect(msg).toContain("Usluga: ScanMe Review");
    expect(msg).toContain("Paket: Premium");
    expect(msg).toContain("Naplata: Godišnje");
    expect(msg).toContain("Nalepnica · PVC × 3");
    expect(msg).toContain("Stalak · Metal × 1");
    expect(msg).toContain("Dizajn: Custom dizajn + sopstveni logo");
    expect(msg).toContain("Za plaćanje sada:");
    expect(msg).toContain("Obnova:");
    expect(msg).toContain("/god");
  });

  test("template + bez logoa ne izmišlja naziv šablona", () => {
    const msg = buildOfferMessage({
      ...selection,
      design: { kind: "template", templateId: "editorial-1", addOwnLogo: false },
    });
    expect(msg).toContain("Dizajn: Gotov dizajn (ScanMe šablon)");
    expect(msg).not.toContain("editorial-1");
    expect(msg).not.toContain("sopstveni logo");
  });
});

describe("readContactMessage", () => {
  test("round-trip iz kontakt href-a daje istu poruku", () => {
    const parsed = readContactMessage(
      new URLSearchParams(queryOf(buildSelectionContactHref(selection))),
    );
    expect(parsed).toBe(buildOfferMessage(selection));
  });

  test("enterprise upit vraća Enterprise poruku", () => {
    expect(readContactMessage(new URLSearchParams(queryOf(ENTERPRISE_CONTACT_HREF)))).toBe(
      ENTERPRISE_OFFER_MESSAGE,
    );
  });

  test("bez konteksta vraća null", () => {
    expect(readContactMessage(new URLSearchParams(""))).toBeNull();
  });

  test("nevalidan ponuda query vraća null", () => {
    expect(readContactMessage(new URLSearchParams("ponuda=service%3Dfoo"))).toBeNull();
  });
});
