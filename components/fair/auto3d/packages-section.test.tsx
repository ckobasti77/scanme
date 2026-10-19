// SSR markup sekcije paketa (A11, PLAN §7): četiri nivoa sa tačnim cenama i stavkama, istaknut 3D
// Rendgen, tri koraka sa demo linkovima, kontakt kao običan tekst i bez forme koja nigde ne šalje.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PARTS } from "@/lib/auto3d/catalog";
import { parseUrlState } from "@/lib/auto3d/url-state";
import { fairAuto3dSr } from "@/lib/i18n/sr/fair-auto3d";
import { PackagesSection } from "./packages-section";

const t = fairAuto3dSr.packages;
const html = renderToStaticMarkup(<PackagesSection />);
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

function decode(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
}

/** Kartice nivoa po redosledu u DOM-u (`<li>` sa karticom do sledećeg nivoa). */
function tierCards(markup: string): string[] {
  return [...markup.matchAll(/<li class="[^"]*tier[^"]*"[^>]*>[\s\S]*?<\/div><\/div><\/li>/g)].map((m) => m[0]);
}

describe("sekcija paketa (SSR)", () => {
  test("naslov i četiri nivoa po redosledu, sa tačnim cenama", () => {
    expect(html).toContain(`<h2 id="paketi-naslov">${t.title}</h2>`);
    expect(t.title).toBe("Paketi za izlagače, AMF 2026");
    const cards = tierCards(html);
    expect(cards).toHaveLength(4);
    const expected = [
      ["Za sve izlagače", "Uključeno"],
      ["Starter", "3.000 RSD"],
      ["Napredni", "5.000 RSD"],
      ["3D Rendgen", "8.000 RSD"],
    ];
    expected.forEach(([name, price], i) => {
      expect(cards[i], name).toMatch(new RegExp(`<h3[^>]*>${name}</h3>`));
      expect(cards[i], name).toContain(`<strong>${price}</strong>`);
    });
    // Nivo „Za sve izlagače“ se ne prikazuje kao 0 RSD (BACKEND-KONTEKST-V2 §3).
    expect(cards[0]).not.toMatch(/0 RSD/);
    // Doplata je po modelu na svim plaćenim nivoima.
    for (const card of cards.slice(1)) expect(card).toContain("<span>po modelu</span>");
  });

  test("stavke svakog nivoa su u kartici, bez viška", () => {
    const cards = tierCards(html);
    const tiers = [t.tiers.included, t.tiers.starter, t.tiers.napredni, t.tiers.rendgen];
    tiers.forEach((tier, i) => {
      expect(count(cards[i], /<li>/g), tier.name).toBe(tier.items.length);
      for (const item of tier.items) expect(decode(cards[i]), item).toContain(item);
    });
    expect(tiers.map((x) => x.items.length)).toEqual([4, 7, 8, 4]);
  });

  test("3D Rendgen je istaknut: jedini data-featured, tamna kartica, sa značkom i napomenom o replici", () => {
    expect(count(html, /data-featured="true"/g)).toBe(1);
    const cards = tierCards(html);
    expect(cards[3]).toContain('data-featured="true"');
    expect(cards[3]).toContain('data-tier="rendgen"');
    expect(cards[3]).toContain(t.rendgenBadge);
    expect(cards[3]).toContain(t.rendgenNote);
    expect(cards[3]).toContain(t.tiers.rendgen.inherits);
    for (const card of cards.slice(0, 3)) {
      expect(card).not.toContain("data-featured");
      expect(card).not.toContain(t.rendgenBadge);
    }
  });

  test("napomena o primeru vrednosti stoji ispod nivoa", () => {
    expect(html).toContain(fairAuto3dSr.exampleNote);
  });

  test("ne obećava ono čega nema u P4 (analitika po delovima, prilagođena replika)", () => {
    const rendgen = decode(tierCards(html)[3]);
    expect(rendgen).not.toMatch(/analitik|statistik|brojanj|skeniranj/i);
    expect(rendgen).toContain("Tačna replika po meri je posebna, dogovorena usluga.");
  });

  test("Kako izgleda na štandu: tri koraka, svaki sa demo linkom", () => {
    expect(html).toContain(`<h3>${t.standTitle}</h3>`);
    const steps = html.match(/<ol[\s\S]*?<\/ol>/)?.[0] ?? "";
    expect(count(steps, /<li /g)).toBe(3);
    const hrefs = [...steps.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/sajam/3d?tura=1", "/sajam/3d?kiosk=1", "/sajam/3d?deo=turbopunjac"]);
    t.steps.forEach((step) => expect(steps).toContain(`<h4>${step.title}</h4>`));
    expect(steps).toContain("Primer: Turbopunjač");
  });

  test("demo linkovi se razrešavaju: tura, kiosk i postojeći deo", () => {
    const hrefs = [...html.matchAll(/href="(\/sajam\/3d\?[^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toHaveLength(3);
    const [tura, kiosk, deo] = hrefs.map((h) => parseUrlState(Object.fromEntries(new URL(h, "https://x").searchParams)));
    expect(tura.tura).toBe(true);
    expect(kiosk.kiosk).toBe(true);
    expect(deo.deo).toBe("turbopunjac");
    expect(PARTS.some((p) => p.id === "turbopunjac")).toBe(true);
  });

  test("kontakt je običan tekst koji može da se izabere, uz tel: i mailto: dugmad", () => {
    expect(html).toContain(`>${t.contactPhone}</span>`);
    expect(html).toContain(`>${t.contactEmail}</span>`);
    expect(html).toContain(`href="${t.contactPhoneHref}"`);
    expect(html).toContain(`href="${t.contactEmailHref}"`);
    expect(html).toContain(`aria-label="Pozovite ${t.contactPhone}"`);
    expect(t.contactPhone).toBe("065/86-444-88");
    expect(t.contactEmail).toBe("office@scanme.rs");
  });

  test("nema forme ni polja za unos koji nigde ne šalju", () => {
    expect(html).not.toMatch(/<form|<input|<textarea|<select|<button/);
  });
});
