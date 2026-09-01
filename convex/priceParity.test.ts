/// <reference types="vite/client" />

// TASK-42, dokaz 1 (RFC-002 §2.1, rizik #2): CENA JE ISTA NA SVA TRI MESTA.
//
// Tri površine koje moraju da vrate identičan broj za isti skup:
//   1. marketing/tok — klijentska korpa na /kupovina (`priceSelection`,
//      components/purchase/step-services-model), ista funkcija koju čitaju
//      shell-ov split-total bar i step modeli;
//   2. server pri naplati — `convex/checkout.ts` (i `convex/orders.ts`
//      createOrder) zovu `price()` iz lib/pricing sami i NIKAD ne veruju
//      klijentskom broju;
//   3. faktura — `orders.priceSnapshot`, zamrznuti zapis-kako-je-prodato
//      (`buildPriceSnapshot`), iz kog `markOrderPaid` izvodi podrazumevani
//      iznos uplate.
//
// Prvi test tera svih 726 zlatnih slučajeva (31 neprazan podskup × svako
// cepanje po periodu × 3 varijante plana; golden.test.ts drži generated ≡
// committed, pa je i ovo vezano za upisanu tabelu) kroz sve tri putanje.
// Drugi test tera SVAKU prodajnu korpu (15 podskupova od 4 prodajne usluge ×
// svako cepanje perioda × 3 varijante plana = 240 korpi) kroz PRAVU checkout
// mutaciju i poredi upisani snapshot bajt-za-bajt sa motorom. Meni nije
// prodajan (PRICING_SERVICE_BY_SERVICE_TYPE ga nema — USKORO), pa kroz
// mutaciju idu podskupovi bez njega; njegovih 726−240 kombinacija pokriva
// čisti sloj. Razlika ovde nije bag nego pravni problem (§2.1).

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { generateGoldenTable } from "../lib/pricing/golden";
import { price } from "../lib/pricing/engine";
import type { BillingPeriod, PlanId, PriceItem } from "../lib/pricing/types";
import { priceSelection } from "../components/purchase/step-services-model";
import type { PurchaseSelection } from "../lib/offer-url";
import {
  buildPriceSnapshot,
  PRICING_SERVICE_BY_SERVICE_TYPE,
  type ServiceType,
} from "./lib/orderSnapshot";
import { physicalLineTotalRsd } from "./orders";
import {
  PHYSICAL_PRODUCTS,
  computeProductsOneTime,
  createDefaultProductSelection,
} from "../lib/scanme-pricing";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://test.local";

const golden = generateGoldenTable();

const SELLABLE_SERVICE_TYPES = Object.keys(
  PRICING_SERVICE_BY_SERVICE_TYPE,
) as ServiceType[];

const PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];

const PLAN_VARIANTS: ReadonlyArray<{ plan: PlanId; planPeriod?: BillingPeriod }> = [
  { plan: "basic" },
  { plan: "premium", planPeriod: "monthly" },
  { plan: "premium", planPeriod: "annual" },
];

describe("cena je ista na sva tri mesta (TASK-42, RFC-002 §2.1)", () => {
  test("svih 726 zlatnih slučajeva: klijentska korpa ≡ motor ≡ snapshot fakture", () => {
    expect(golden.caseCount).toBe(726);
    for (const entry of golden.cases) {
      // Površina 1 — klijentska korpa na /kupovina: isti PurchaseSelection
      // koji drži stranica, kroz isti helper koji čita i shell-ov bar.
      const selection: PurchaseSelection = {
        services: entry.items.map((item) => ({
          service: item.service,
          period: item.period,
        })),
        plan: entry.plan,
        ...(entry.planPeriod ? { planPeriod: entry.planPeriod } : {}),
        products: [],
        step: 1,
      };
      expect(priceSelection(selection), entry.key).toEqual(entry.breakdown);

      // Površina 2 — serverski račun: isti poziv koji checkout/createOrder
      // prave od svojih service linija.
      const serverBreakdown = price({
        items: entry.items,
        plan: entry.plan,
        ...(entry.planPeriod ? { planPeriod: entry.planPeriod } : {}),
      });

      // Površina 3 — faktura: zamrznuti snapshot je polje-za-polje motor,
      // recurringTotalRsd je totalRsd, i JSON put do baze ne pomera ni dinar.
      const snapshot = buildPriceSnapshot(serverBreakdown, 0);
      const { totalRsd, ...rest } = entry.breakdown;
      expect(snapshot, entry.key).toEqual({
        ...rest,
        recurringTotalRsd: totalRsd,
        oneTimeTotalRsd: 0,
      });
      expect(JSON.parse(JSON.stringify(snapshot)), entry.key).toEqual(snapshot);
    }
  });

  test("jednokratni fizički novac: server računa isti iznos kao klijentska korpa", () => {
    for (const product of PHYSICAL_PRODUCTS) {
      const single = createDefaultProductSelection(product.id);
      expect(physicalLineTotalRsd(single), product.id).toBe(
        computeProductsOneTime([single]),
      );
      // Količina 10 pogađa lestvicu popusta — i sa popustom mora isto.
      const bulk = { ...single, quantity: 10 };
      expect(physicalLineTotalRsd(bulk), `${product.id} ×10`).toBe(
        computeProductsOneTime([bulk]),
      );
    }
  });
});

describe("cena kroz PRAVU checkout mutaciju (TASK-42, RFC-002 §2.5)", () => {
  beforeEach(() => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
  });

  async function seedBuyer(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("users", {
        email: "parity-buyer@scanme.test",
        emailVerificationTime: now,
      });
    });
  }

  async function seedBusiness(
    t: ReturnType<typeof convexTest>,
    userId: Id<"users">,
    slug: string,
  ) {
    return t.run(async (ctx) => {
      const now = Date.now();
      const businessId = await ctx.db.insert("businesses", {
        name: `Lokal ${slug}`,
        slug,
        status: "active",
        createdAt: now,
      });
      await ctx.db.insert("businessMemberships", {
        userId,
        businessId,
        accessRole: "viewer",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      return businessId;
    });
  }

  test("svaka prodajna korpa (15 podskupova × cepanja perioda × 3 plana = 240): snapshot ≡ motor", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedBuyer(t);
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });

    let caseIndex = 0;
    for (let subset = 1; subset < 1 << SELLABLE_SERVICE_TYPES.length; subset += 1) {
      const serviceTypes = SELLABLE_SERVICE_TYPES.filter(
        (_, index) => (subset & (1 << index)) !== 0,
      );
      for (let split = 0; split < 1 << serviceTypes.length; split += 1) {
        const periods = serviceTypes.map(
          (_, index) => PERIODS[(split >> index) & 1],
        );
        for (const variant of PLAN_VARIANTS) {
          caseIndex += 1;
          const businessId = await seedBusiness(t, userId, `parity-${caseIndex}`);
          const result = await asBuyer.mutation(api.checkout.checkout, {
            accountName: `Parity ${caseIndex}`,
            plan: variant.plan,
            ...(variant.planPeriod ? { planPeriod: variant.planPeriod } : {}),
            serviceLines: serviceTypes.map((service, index) => ({
              businessId,
              service,
              period: periods[index],
            })),
          });

          const items: PriceItem[] = serviceTypes.map((service, index) => ({
            service: PRICING_SERVICE_BY_SERVICE_TYPE[service],
            period: periods[index],
          }));
          const expected = buildPriceSnapshot(
            price({
              items,
              plan: variant.plan,
              ...(variant.planPeriod ? { planPeriod: variant.planPeriod } : {}),
            }),
            0,
          );
          const label = `${items
            .map((item) => `${item.service}:${item.period}`)
            .join("+")}|${variant.plan}${variant.planPeriod ? `:${variant.planPeriod}` : ""}`;

          // Ono što je server upisao (i vratio) mora biti bajt-za-bajt motor.
          expect(result.priceSnapshot, label).toEqual(expected);
          const stored = await t.run(async (ctx) => {
            const order = await ctx.db.get(result.orderId);
            const orderItems = await ctx.db
              .query("orderItems")
              .withIndex("by_orderId", (q) => q.eq("orderId", result.orderId))
              .collect();
            return { snapshot: order?.priceSnapshot, orderItems };
          });
          expect(stored.snapshot, label).toEqual(expected);

          // Linije fakture (orderItems za usluge) zbirom daju tačno
          // servicesChargedRsd — faktura se slaže sama sa sobom.
          const serviceLineSum = stored.orderItems
            .filter((item) => item.kind === "service")
            .reduce((sum, item) => sum + item.lineTotalRsd, 0);
          expect(serviceLineSum, label).toBe(expected.servicesChargedRsd);
        }
      }
    }
    expect(caseIndex).toBe(240);
  }, 120_000);

  test("fizička stavka kroz mutaciju: oneTimeTotalRsd ≡ klijentski iznos, odvojen od pretplate", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedBuyer(t);
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });
    const businessId = await seedBusiness(t, userId, "parity-physical");

    const selection = createDefaultProductSelection("two-piece-stand");
    const result = await asBuyer.mutation(api.checkout.checkout, {
      accountName: "Parity fizika",
      plan: "basic",
      serviceLines: [
        { businessId, service: "scanme_venue", period: "monthly" },
      ],
      physicalLines: [
        { businessId, boundServices: ["scanme_venue"], selection },
      ],
    });

    const expectedOneTime = computeProductsOneTime([selection]);
    expect(result.priceSnapshot.oneTimeTotalRsd).toBe(expectedOneTime);
    expect(result.priceSnapshot.recurringTotalRsd).toBe(
      price({ items: [{ service: "venue", period: "monthly" }], plan: "basic" })
        .totalRsd,
    );
  });
});
