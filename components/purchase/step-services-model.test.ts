import { describe, expect, test } from "vitest";
import { DEFAULT_PRICING_CONSTANTS, type BillingPeriod } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import { PURCHASE_COMBOS } from "./service-catalog";
import {
  bestNudge,
  commonPeriod,
  priceSelection,
  priceServices,
  withPackage,
  withPeriodMode,
  withService,
} from "./step-services-model";

const EMPTY: PurchaseSelection = { services: [], plan: "basic", products: [], step: 1 };

describe("step-services-model", () => {
  // The central promise of RFC-002 §2.1: a combo is marketing, not a SKU. There
  // must be NO way to pay more (or less) by arriving at the same service set
  // through the combo card versus adding the members one by one.
  describe("a combo prices identically to its individual services", () => {
    for (const combo of PURCHASE_COMBOS) {
      for (const period of ["monthly", "annual"] as BillingPeriod[]) {
        test(`${combo.id} @ ${period}`, () => {
          // Door A: the combo card (adds every member at once).
          const viaCombo = withPackage(EMPTY, combo.services, period);
          // Door B: the same services, clicked individually, in reverse order.
          const viaIndividual = [...combo.services]
            .reverse()
            .reduce((sel, service) => withService(sel, service, period), EMPTY);

          const priceA = priceSelection(viaCombo);
          const priceB = priceSelection(viaIndividual);

          expect(priceA).not.toBeNull();
          // Byte-identical breakdowns: same set → same price, whichever door.
          expect(priceA).toEqual(priceB);

          // And that price IS the package price — the decomposition named the
          // combo (otherwise the marketing bundle would be a dead name).
          const definition = DEFAULT_PRICING_CONSTANTS.packages.find(
            (pkg) => pkg.id === combo.id,
          )!;
          expect(priceA!.servicesChargedRsd).toBe(definition.price[period]);
        });
      }
    }
  });

  test("the cart total equals what the engine returns", () => {
    const selection = withService(withService(EMPTY, "venue", "annual"), "memories", "annual");
    const breakdown = priceSelection(selection)!;
    // Nothing is recomputed: the breakdown's own total is the source of truth.
    expect(breakdown.totalRsd).toBe(
      breakdown.servicesChargedRsd + breakdown.planLine.amountRsd,
    );
  });

  test("the top toggle re-periods the whole cart", () => {
    const mixed: PurchaseSelection = {
      ...EMPTY,
      services: [
        { service: "venue", period: "monthly" },
        { service: "memories", period: "annual" },
      ],
    };
    const unified = withPeriodMode(mixed, "annual");
    expect(commonPeriod(unified)).toBe("annual");
    expect(unified.services.every((entry) => entry.period === "annual")).toBe(true);
  });

  test("the nudge is a true, engine-derived saving on the next service", () => {
    // One service alone earns no discount, so adding the second is where the
    // saving appears — and the nudge must quote exactly that delta.
    const oneService = withService(EMPTY, "venue", "annual");
    const nudge = bestNudge(oneService, "annual");
    expect(nudge).not.toBeNull();

    const before = priceServices(["venue"], "annual").savingsRsd;
    const after = priceServices(["venue", nudge!.service], "annual").savingsRsd;
    expect(nudge!.additionalSavingsRsd).toBe(after - before);
    expect(nudge!.additionalSavingsRsd).toBeGreaterThan(0);
  });

  test("the nudge never points at an unsellable service", () => {
    const links = withService(EMPTY, "links", "annual");
    const nudge = bestNudge(links, "annual", { exclude: new Set(["menu"]) });
    // Whatever it suggests, it is never Menu (which cannot be added yet).
    expect(nudge?.service).not.toBe("menu");
  });
});
