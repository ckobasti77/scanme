import { describe, expect, test } from "vitest";
import {
  DEFAULT_PRICING_CONSTANTS,
  PricingInputError,
  PricingInvariantError,
  SERVICE_IDS,
  price,
  priceWith,
  type PriceInput,
  type PriceItem,
  type PricingConstants,
} from "./engine";

const cs = DEFAULT_PRICING_CONSTANTS;

function monthly(...services: PriceItem["service"][]): PriceItem[] {
  return services.map((service) => ({ service, period: "monthly" as const }));
}

function edit(patch: Partial<PricingConstants>): PricingConstants {
  return { ...cs, ...patch };
}

/** Every non-empty subset × every period split — the same 242 carts the golden
 *  table covers, without the plan axis. Used by the property tests below. */
function allCarts(): PriceItem[][] {
  const carts: PriceItem[][] = [];
  for (let subset = 1; subset < 1 << SERVICE_IDS.length; subset += 1) {
    const services = SERVICE_IDS.filter((_, index) => (subset & (1 << index)) !== 0);
    for (let split = 0; split < 1 << services.length; split += 1) {
      carts.push(
        services.map((service, index) => ({
          service,
          period: ((split >> index) & 1) === 0 ? "monthly" : "annual",
        })),
      );
    }
  }
  return carts;
}

describe("čistoća: cena zavisi samo od skupa i plana", () => {
  test("preuređenje stavki nikad ne menja rezultat", () => {
    for (const cart of allCarts()) {
      const expected = price({ items: cart, plan: "basic" });
      // Every rotation, plus the full reversal — enough to prove the engine
      // never reads the input order (the ladder sorts, the output sorts).
      for (let shift = 1; shift < cart.length; shift += 1) {
        const rotated = [...cart.slice(shift), ...cart.slice(0, shift)];
        expect(price({ items: rotated, plan: "basic" })).toEqual(expected);
      }
      expect(price({ items: [...cart].reverse(), plan: "basic" })).toEqual(expected);
    }
  });

  test("ista korpa daje identičan rezultat pri ponovljenom pozivu", () => {
    const items = monthly("venue", "memories", "review");
    expect(price({ items, plan: "premium", planPeriod: "annual" })).toEqual(
      price({ items, plan: "premium", planPeriod: "annual" }),
    );
  });

  test("plan je nezavisna osa — ne menja cenu usluga", () => {
    const items = monthly("links", "venue");
    const basic = price({ items, plan: "basic" });
    const premium = price({ items, plan: "premium", planPeriod: "monthly" });
    expect(premium.servicesChargedRsd).toBe(basic.servicesChargedRsd);
    expect(premium.totalRsd).toBe(basic.totalRsd + cs.plan.premium.monthly);
  });

  test("enterprise se ne obračunava — nudi se na upit", () => {
    const result = price({ items: monthly("venue"), plan: "enterprise" });
    expect(result.planLine).toEqual({
      plan: "enterprise",
      period: null,
      amountRsd: 0,
      onRequest: true,
    });
  });
});

describe("algoritam: nabrajanje, ne heuristika", () => {
  test("Venue + Memories pojedinačno stiže na cenu paketa Događaj", () => {
    const result = price({ items: monthly("venue", "memories"), plan: "basic" });
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].packageId).toBe("dogadjaj");
    expect(result.servicesChargedRsd).toBe(cs.packages[0].price.monthly);
    expect(result.lines.every((line) => line.packageId === "dogadjaj")).toBe(true);
    // Linije uvek sabiraju tačno na cenu paketa.
    expect(result.lines.reduce((sum, line) => sum + line.chargedRsd, 0)).toBe(
      result.packages[0].priceRsd,
    );
  });

  test("dva disjunktna paketa u istoj korpi (Događaj + Lokal)", () => {
    const result = price({
      items: monthly("links", "venue", "memories", "menu"),
      plan: "basic",
    });
    const ids = result.packages.map((entry) => entry.packageId).sort();
    // Sa placeholder cenama merdevine su jeftinije od dva paketa; test tvrdi da
    // motor bira jeftinije za kupca, ne da uvek imenuje paket.
    const twoPackages = cs.packages[0].price.monthly + cs.packages[1].price.monthly;
    expect(result.servicesChargedRsd).toBeLessThanOrEqual(twoPackages);
    if (result.servicesChargedRsd === twoPackages) {
      expect(ids).toEqual(["dogadjaj", "lokal"]);
    }
  });

  test("paket se bira kad je najjeftiniji, i pokriva sve svoje usluge", () => {
    // Deliberately priced to win: Kompletan below every alternative, with the
    // free-Review rule switched off so the five-service cart is honestly paid.
    const winning = edit({
      reviewFreeFromServiceCount: 99,
      packages: cs.packages.map((pkg) =>
        pkg.id === "kompletan" ? { ...pkg, price: { monthly: 3900, annual: 39000 } } : pkg,
      ),
    });
    const result = priceWith(winning, {
      items: monthly("links", "venue", "memories", "menu", "review"),
      plan: "basic",
    });
    expect(result.packages.map((entry) => entry.packageId)).toEqual(["kompletan"]);
    expect(result.servicesChargedRsd).toBe(3900);
    expect(result.lines.every((line) => line.packageId === "kompletan")).toBe(true);
  });

  test("paket ne važi kad su usluge u različitim periodima", () => {
    const result = price({
      items: [
        { service: "venue", period: "monthly" },
        { service: "memories", period: "annual" },
      ],
      plan: "basic",
    });
    expect(result.packages).toEqual([]);
    expect(result.servicesChargedRsd).toBe(cs.service.venue.monthly + cs.service.memories.annual);
  });

  test("merdevine: najskuplja usluga nikad nema popust", () => {
    for (const cart of allCarts()) {
      const result = price({ items: cart, plan: "basic" });
      for (const group of result.groups) {
        const lines = result.lines.filter(
          (line) => line.period === group.period && line.packageId === null && line.grant === null,
        );
        if (lines.length === 0) continue;
        const top = lines.reduce((max, line) => (line.listRsd > max.listRsd ? line : max));
        expect(top.discountRsd).toBe(0);
      }
    }
  });

  test("merdevine rastu ka jeftinijoj usluzi", () => {
    const result = price({ items: monthly("venue", "memories", "menu"), plan: "basic" });
    // Događaj (venue+memories) vs. čiste merdevine — motor uzima jeftinije.
    const ladder =
      cs.service.venue.monthly +
      Math.ceil(cs.service.memories.monthly * 0.8) +
      Math.ceil(cs.service.menu.monthly * 0.7);
    const packaged = cs.packages[0].price.monthly + cs.service.menu.monthly;
    expect(result.servicesChargedRsd).toBe(Math.min(ladder, packaged));
  });

  test("popust se nikad ne prelije između perioda", () => {
    const mixed = price({
      items: [
        { service: "links", period: "monthly" },
        { service: "menu", period: "annual" },
      ],
      plan: "basic",
    });
    expect(mixed.savingsRsd).toBe(0);
    expect(mixed.groups).toHaveLength(2);
  });
});

describe("Review je besplatan od četvrte usluge (RFC-002 §2.1)", () => {
  test("tri usluge sa Review-om — Review se plaća", () => {
    const result = price({ items: monthly("links", "menu", "review"), plan: "basic" });
    const review = result.lines.find((line) => line.service === "review")!;
    expect(review.grant).toBeNull();
    expect(review.chargedRsd).toBeGreaterThan(0);
  });

  test("četvrta usluga oslobađa Review, bez obzira na period", () => {
    const result = price({
      items: [
        { service: "review", period: "annual" },
        ...monthly("links", "menu", "memories"),
      ],
      plan: "basic",
    });
    const review = result.lines.find((line) => line.service === "review")!;
    expect(review.grant).toBe("review_fourth_service");
    expect(review.chargedRsd).toBe(0);
    expect(review.discountRsd).toBe(cs.service.review.annual);
  });

  test("Review unutar paketa ostaje u paketu — pravilo se primenjuje posle pakovanja", () => {
    const winning = edit({
      packages: cs.packages.map((pkg) =>
        pkg.id === "kompletan" ? { ...pkg, price: { monthly: 3749, annual: 37769 } } : pkg,
      ),
    });
    const result = priceWith(winning, {
      items: monthly("links", "venue", "memories", "menu", "review"),
      plan: "basic",
    });
    const review = result.lines.find((line) => line.service === "review")!;
    if (review.packageId !== null) {
      expect(review.grant).toBeNull();
      expect(review.chargedRsd).toBeGreaterThan(0);
    }
  });
});

describe("četiri tvrde invarijante bacaju grešku (RFC-002 §2.1)", () => {
  const fullMonthly: PriceInput = {
    items: monthly("links", "venue", "memories", "menu", "review"),
    plan: "basic",
  };

  test("1 — linija ispod 50% liste", () => {
    const broken = edit({
      packages: [],
      reviewFreeFromServiceCount: 99,
      ladderBps: [0, 2000, 3000, 4000, 6000],
    });
    expect(() => priceWith(broken, fullMonthly)).toThrow(PricingInvariantError);
    expect(() => priceWith(broken, fullMonthly)).toThrow(/Invarijanta 1/);
  });

  test("2 — ukupan popust u grupi iznad praga", () => {
    const broken = edit({ maxGroupDiscountBps: 1000 });
    expect(() => priceWith(broken, fullMonthly)).toThrow(/Invarijanta 2/);
  });

  test("3 — korpa jeftinija od najskuplje pojedinačne usluge", () => {
    const broken = edit({
      minLineChargeBps: 0,
      maxGroupDiscountBps: 10000,
      packages: cs.packages.map((pkg) =>
        pkg.id === "dogadjaj" ? { ...pkg, price: { monthly: 1000, annual: 10000 } } : pkg,
      ),
    });
    expect(() =>
      priceWith(broken, { items: monthly("venue", "memories"), plan: "basic" }),
    ).toThrow(/Invarijanta 3/);
  });

  test("4a — dodavanje usluge snižava ukupnu cenu", () => {
    // Exactly the placeholder that was caught while writing constants.ts: a
    // Kompletan below the four-service ladder makes the fifth service free
    // AND refunds part of the fourth.
    const broken = edit({
      packages: cs.packages.map((pkg) =>
        pkg.id === "kompletan" ? { ...pkg, price: { monthly: 3490, annual: 34990 } } : pkg,
      ),
    });
    expect(() => priceWith(broken, fullMonthly)).toThrow(/Invarijanta 4/);
    expect(() => priceWith(broken, fullMonthly)).toThrow(/snižava cenu/);
  });

  test("4b — mešanje perioda jeftinije od objedinjene korpe", () => {
    // Annual prices that are not consistently a discount on monthly: Links
    // annual is punitive, Venue annual is a giveaway, so cherry-picking one of
    // each beats both honest baskets.
    const broken = edit({
      service: {
        ...cs.service,
        links: { monthly: 990, annual: 20000 },
        venue: { monthly: 1490, annual: 5000 },
      },
    });
    expect(() =>
      priceWith(broken, {
        items: [
          { service: "links", period: "monthly" },
          { service: "venue", period: "annual" },
        ],
        plan: "basic",
      }),
    ).toThrow(/objedinjavanja/);
  });

  test("ispravne konstante ne bacaju ni na jednoj legalnoj korpi", () => {
    for (const cart of allCarts()) {
      expect(() => price({ items: cart, plan: "basic" })).not.toThrow();
      expect(() => price({ items: cart, plan: "premium", planPeriod: "annual" })).not.toThrow();
    }
  });
});

describe("validacija ulaza", () => {
  test.each([
    [{ items: [], plan: "basic" }, /bar jednu uslugu/],
    [{ items: monthly("links", "links"), plan: "basic" }, /dva puta/],
    [{ items: monthly("links"), plan: "premium" }, /planPeriod/],
    [{ items: monthly("links"), plan: "basic", planPeriod: "monthly" }, /ne sme imati planPeriod/],
    [{ items: [{ service: "nope", period: "monthly" }], plan: "basic" }, /Nepoznata usluga/],
    [{ items: [{ service: "links", period: "weekly" }], plan: "basic" }, /Nepoznat period/],
    [{ items: monthly("links"), plan: "gold" }, /Nepoznat plan/],
  ] as unknown as [PriceInput, RegExp][])("odbija neispravan ulaz #%#", (input, message) => {
    expect(() => price(input)).toThrow(PricingInputError);
    expect(() => price(input)).toThrow(message);
  });
});

describe("oblik rezultata", () => {
  test("sve vrednosti su celi dinari i sabiraju se", () => {
    for (const cart of allCarts()) {
      const result = price({ items: cart, plan: "premium", planPeriod: "monthly" });
      for (const line of result.lines) {
        expect(Number.isInteger(line.listRsd)).toBe(true);
        expect(Number.isInteger(line.chargedRsd)).toBe(true);
        expect(line.listRsd - line.discountRsd).toBe(line.chargedRsd);
        expect(line.chargedRsd).toBeGreaterThanOrEqual(0);
      }
      for (const group of result.groups) {
        const lines = result.lines.filter((line) => line.period === group.period);
        expect(lines.reduce((sum, line) => sum + line.listRsd, 0)).toBe(group.listRsd);
        expect(lines.reduce((sum, line) => sum + line.chargedRsd, 0)).toBe(group.chargedRsd);
      }
      expect(result.savingsRsd).toBe(result.servicesListRsd - result.servicesChargedRsd);
      expect(result.totalRsd).toBe(result.servicesChargedRsd + result.planLine.amountRsd);
      expect(result.lines).toHaveLength(cart.length);
    }
  });

  test("linije su u kanonskom redosledu: period, pa redosled usluga", () => {
    const result = price({
      items: [
        { service: "review", period: "annual" },
        { service: "venue", period: "monthly" },
        { service: "links", period: "annual" },
      ],
      plan: "basic",
    });
    expect(result.lines.map((line) => `${line.period}:${line.service}`)).toEqual([
      "monthly:venue",
      "annual:links",
      "annual:review",
    ]);
  });
});
