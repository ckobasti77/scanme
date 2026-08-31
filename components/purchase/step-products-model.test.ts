import { describe, expect, test } from "vitest";
import type { PurchaseSelection } from "@/lib/offer-url";
import {
  createDefaultProductSelection,
  type ProductSelection,
  type TemplateId,
} from "@/lib/scanme-pricing";
import {
  SERVICE_CARD_TEMPLATES,
  availableTemplates,
  boundServicesOf,
  defaultTemplate,
  designAllowed,
  isSingleService,
  leadsToSplitter,
  newProductLine,
  purchasedServiceOrder,
  rebindProduct,
  toggleBoundService,
} from "./step-products-model";

function withProducts(
  services: PurchaseSelection["services"],
  products: ProductSelection[],
  bindings?: PurchaseSelection["bindings"],
): PurchaseSelection {
  return { services, plan: "basic", products, ...(bindings ? { bindings } : {}), step: 3 };
}

const A = (templateId: TemplateId): ProductSelection => ({
  ...createDefaultProductSelection("stickers"),
  design: { kind: "template", templateId },
});

describe("step-products-model", () => {
  describe("single-service order binds silently", () => {
    test("one bought service → control hidden, line bound to it", () => {
      const sel = withProducts([{ service: "review", period: "annual" }], [A("basic")]);
      expect(isSingleService(sel)).toBe(true);
      expect(boundServicesOf(sel, "stickers")).toEqual(["review"]);
    });

    test("many bought services → control shown", () => {
      const sel = withProducts(
        [
          { service: "links", period: "annual" },
          { service: "review", period: "annual" },
        ],
        [A("template-1")],
      );
      expect(isSingleService(sel)).toBe(false);
    });
  });

  describe("bound services reconcile against what was actually bought", () => {
    const sel = withProducts(
      [
        { service: "links", period: "annual" },
        { service: "memories", period: "annual" },
      ],
      [A("template-3")],
      { stickers: ["memories", "venue"] }, // venue was never bought
    );

    test("a stored service the buyer never bought is dropped", () => {
      expect(boundServicesOf(sel, "stickers")).toEqual(["memories"]);
    });

    test("no stored binding falls back to the first purchased service", () => {
      const bare = withProducts(
        [
          { service: "links", period: "annual" },
          { service: "memories", period: "annual" },
        ],
        [A("template-1")],
      );
      // canonical order puts links before memories
      expect(purchasedServiceOrder(bare)).toEqual(["links", "memories"]);
      expect(boundServicesOf(bare, "stickers")).toEqual(["links"]);
    });
  });

  describe("a service decides which templates are available", () => {
    test("review offers the plain 'basic' card; links does not", () => {
      expect(availableTemplates("stickers", ["review"])).toContain("basic");
      expect(availableTemplates("stickers", ["links"])).not.toContain("basic");
    });

    test("a splitter (2+ services) card is not tied to one service's set", () => {
      // The product's full set (basic + template-1..5 = 6), so an empty
      // intersection across bound services can never happen.
      expect(availableTemplates("stickers", ["links", "memories"]).length).toBe(6);
    });

    test("every single service has at least one available template", () => {
      for (const service of Object.keys(SERVICE_CARD_TEMPLATES) as Array<
        keyof typeof SERVICE_CARD_TEMPLATES
      >) {
        expect(availableTemplates("stickers", [service]).length).toBeGreaterThan(0);
      }
    });
  });

  describe("rebinding to an incompatible service resets the design AND reports it", () => {
    test("review 'basic' → links resets to the links default, with a reason", () => {
      const sel = withProducts(
        [
          { service: "links", period: "annual" },
          { service: "review", period: "annual" },
        ],
        [A("basic")],
        { stickers: ["review"] },
      );
      const { selection, reset } = rebindProduct(sel, "stickers", ["links"]);
      expect(reset).not.toBeNull();
      expect(reset).toEqual({ from: "basic", to: defaultTemplate("stickers", ["links"]) });
      const line = selection.products.find((p) => p.productId === "stickers")!;
      expect(line.design).toEqual({ kind: "template", templateId: "template-1" });
    });

    test("a design compatible with the new service is kept, no reset", () => {
      const sel = withProducts(
        [
          { service: "links", period: "annual" },
          { service: "venue", period: "annual" },
        ],
        [A("template-3")], // template-3 is in both links and venue
        { stickers: ["links"] },
      );
      const { selection, reset } = rebindProduct(sel, "stickers", ["venue"]);
      expect(reset).toBeNull();
      const line = selection.products.find((p) => p.productId === "stickers")!;
      expect(line.design).toEqual({ kind: "template", templateId: "template-3" });
    });

    test("a custom design is never reset by a rebind", () => {
      const custom: ProductSelection = {
        ...createDefaultProductSelection("stickers"),
        design: { kind: "custom", brief: "logo u zlatnoj boji" },
      };
      const sel = withProducts(
        [
          { service: "links", period: "annual" },
          { service: "review", period: "annual" },
        ],
        [custom],
        { stickers: ["review"] },
      );
      const { selection, reset } = rebindProduct(sel, "stickers", ["links"]);
      expect(reset).toBeNull();
      expect(selection.products[0].design).toEqual({ kind: "custom", brief: "logo u zlatnoj boji" });
    });
  });

  describe("binding to more than one service marks a splitter and never empties", () => {
    const sel = withProducts(
      [
        { service: "links", period: "annual" },
        { service: "memories", period: "annual" },
      ],
      [A("template-3")],
    );

    test("adding a second service flips leadsToSplitter", () => {
      const { selection } = toggleBoundService(sel, "stickers", "memories");
      const bound = boundServicesOf(selection, "stickers");
      expect(bound).toEqual(["links", "memories"]);
      expect(leadsToSplitter(bound)).toBe(true);
    });

    test("removing the last remaining service is refused — never bound to nothing", () => {
      // stickers defaults to [links]; removing links must not leave it empty
      const { selection } = toggleBoundService(sel, "stickers", "links");
      expect(boundServicesOf(selection, "stickers").length).toBeGreaterThan(0);
    });
  });

  describe("a freshly added line is born with a valid design for its binding", () => {
    test("single-service memories order → default is a memories template", () => {
      const sel = withProducts([{ service: "memories", period: "annual" }], []);
      const line = newProductLine(sel, "stickers");
      expect(line.design.kind).toBe("template");
      expect(designAllowed(line.design, "stickers", ["memories"])).toBe(true);
    });
  });
});
