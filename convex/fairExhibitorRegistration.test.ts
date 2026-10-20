/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("AMF registration preserves package, vehicles and catalogue; retry stores one lead", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No real email or network in this test"); }));
  const t = convexTest(schema, modules);
  const selection = { source: "amf-2026-exhibitor-registration", eventSlug: "auto-moto-fest-2026", brand: "TEST Demo", package: "advanced", vehicles: "TEST Demo City\nTEST Demo Cross", catalogUrl: "https://example.invalid/catalog.pdf" };
  const args = {
    contactName: "TEST Izlagač", businessName: "TEST Firma", businessType: "Izlagač · Auto Moto Fest 2026",
    email: "izlagac@example.invalid", phone: "+381 60 000 0000", interest: "not_sure" as const,
    offerSelection: JSON.stringify(selection), message: "TEST Napomena",
    submissionId: "test-amf-registration-000001", formStartedAt: Date.now() - 2000, website: "",
  };
  expect(await t.mutation(api.leads.create, args)).toEqual({ status: "accepted" });
  expect(await t.mutation(api.leads.create, args)).toEqual({ status: "duplicate" });
  const rows = await t.run(ctx => ctx.db.query("leads").take(10));
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].offerSelection!)).toEqual(selection);
  expect(rows[0]).toMatchObject({ email: args.email, phone: args.phone, message: args.message, status: "new", emailStatus: "queued" });
  expect(fetch).not.toHaveBeenCalled();
});

test("invalid or honeypot registrations are rejected without storing contact data", async () => {
  const t = convexTest(schema, modules);
  const args = { contactName: "TEST Izlagač", businessName: "TEST Firma", businessType: "TEST Izlagač", email: "broken", interest: "not_sure" as const, submissionId: "test-amf-invalid-000001", formStartedAt: Date.now() - 2000, website: "" };
  await expect(t.mutation(api.leads.create, args)).rejects.toThrow();
  await expect(t.mutation(api.leads.create, { ...args, email: "test@example.invalid", website: "spam" })).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.query("leads").take(10))).toHaveLength(0);
});
