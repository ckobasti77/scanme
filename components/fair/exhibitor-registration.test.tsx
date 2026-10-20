/// <reference types="vite/client" />
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import schema from "@/convex/schema";
import { getDict } from "@/lib/i18n";
import { ExhibitorRegistration } from "./exhibitor-registration";
import { emptyExhibitorVehicle, exhibitorRegistrationSelection } from "./exhibitor-registration-model";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("initial form has one model and its own unselected package, no bulk entry or catalogue", () => {
  const html = renderToStaticMarkup(createElement(ExhibitorRegistration, { dict: getDict("fair-exhibitor-registration") }));
  expect(html.match(/name="vehicle-model-/g)).toHaveLength(1);
  expect(html).toContain('name="vehicle-package-0"');
  expect(html).not.toContain("checked");
  expect(html).not.toContain("<textarea");
  expect(html).not.toMatch(/Dodaj još|Paket za navedena|name="catalog"|name="brand"|name="note"/);
  expect(html).toContain('name="email"');
  expect(html).toContain("noValidate");
  expect(html).not.toContain("Audi A4");
  expect(html.indexOf("Vaš kontakt")).toBeLessThan(html.indexOf("Vozila za ScanMe"));
  expect(html).toContain("Unesite telefon ili email");
});

test("each vehicle keeps its own package; trailing or cleared empty rows are omitted", () => {
  const vehicles = [
    { id: 0, model: "  TEST Model A  ", package: "advanced" as const },
    emptyExhibitorVehicle(1),
    { id: 2, model: "TEST Model B", package: "starter" as const },
    emptyExhibitorVehicle(3),
  ];
  const selection = exhibitorRegistrationSelection(vehicles);
  expect(selection).toEqual({
    source: "amf-2026-exhibitor-registration", eventSlug: "auto-moto-fest-2026",
    vehicles: [{ model: "TEST Model A", package: "advanced" }, { model: "TEST Model B", package: "starter" }],
  });
  expect(selection).not.toHaveProperty("package");
  expect(selection).not.toHaveProperty("catalogUrl");
  expect(vehicles[0].model).toBe("  TEST Model A  ");
});

test("existing lead endpoint stores mixed packages and accepts retry without duplicating the inquiry", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No external email in this test"); }));
  const t = convexTest(schema, modules);
  const selection = exhibitorRegistrationSelection([
    { id: 0, model: "TEST Model A", package: "advanced" },
    { id: 1, model: "TEST Model B", package: "starter" },
    emptyExhibitorVehicle(2),
  ]);
  const args = {
    contactName: "TEST Izlagač", businessName: "TEST Firma", businessType: "Izlagač · Auto Moto Fest 2026",
    email: "", phone: "+381 60 000 0000", interest: "not_sure" as const,
    offerSelection: JSON.stringify(selection), submissionId: "test-amf-mixed-packages-000001",
    formStartedAt: Date.now() - 2000, website: "",
  };
  expect(await t.mutation(api.leads.create, args)).toEqual({ status: "accepted" });
  expect(await t.mutation(api.leads.create, args)).toEqual({ status: "duplicate" });
  const rows = await t.run(ctx => ctx.db.query("leads").take(10));
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].offerSelection!)).toEqual(selection);
  expect(rows[0]).toMatchObject({ phone: args.phone, status: "new", emailStatus: "queued" });
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  { email: "test@example.invalid", phone: "" },
  { email: "", phone: "+381 60 000 0000" },
  { email: "test@example.invalid", phone: "+381 60 000 0000" },
])("existing endpoint accepts the chosen contact channel: $email $phone", async (contact) => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No external email in this test"); }));
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.leads.create, {
    contactName: "TEST Izlagač", businessName: "TEST Firma", businessType: "TEST AMF",
    ...contact, interest: "not_sure", submissionId: "test-amf-contact-choice-000001",
    formStartedAt: Date.now() - 2000, website: "",
  })).resolves.toEqual({ status: "accepted" });
  expect(await t.run(ctx => ctx.db.query("leads").take(10))).toHaveLength(1);
});
