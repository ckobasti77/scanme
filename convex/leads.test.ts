/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

test("prihvata prijavu zainteresovanu za Loyalty", async () => {
  const t = convexTest(schema, modules);
  const submissionId = "loyalty-lead-0001";

  await expect(
    t.mutation(api.leads.create, {
      contactName: "Ana Jovanovic",
      businessName: "Zeleni salon",
      businessType: "Salon ili studio",
      phone: "+381601234567",
      interest: "loyalty",
      submissionId,
      formStartedAt: Date.now() - 1_000,
      website: "",
    }),
  ).resolves.toEqual({ status: "accepted" });

  const lead = await t.run(async (ctx) =>
    await ctx.db
      .query("leads")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .unique(),
  );
  expect(lead).toMatchObject({ interest: "loyalty", status: "new" });
});

test("legacy Page dokument ostaje validan", async () => {
  const t = convexTest(schema, modules);

  const leadId = await t.run(async (ctx) =>
    await ctx.db.insert("leads", {
      contactName: "Marko Markovic",
      businessName: "Stari lokal",
      businessType: "Kafic ili restoran",
      phone: "+38160111222",
      interest: "page",
      submissionId: "legacy-page-lead-0001",
      status: "new",
      createdAt: Date.now(),
    }),
  );

  const lead = await t.run(async (ctx) => await ctx.db.get(leadId));
  expect(lead).toMatchObject({ interest: "page", status: "new" });
});
