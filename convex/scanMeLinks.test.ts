/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_ACCENT, DEFAULT_ACCENT_TOKENS } from "../lib/scanme-links";
import { PRESET_DESIGNS } from "../lib/scanme-design";

const modules = import.meta.glob("./**/*.ts");

async function seedScanMeLinks() {
  process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: "admin@scanme.test",
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Mera Cafe",
      slug: "mera-cafe",
      status: "active",
      createdAt: now,
    });
    const serviceProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_links",
      slug: "mera-cafe",
      status: "inactive",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("scanMeLinksConfigs", {
      serviceProfileId,
      draftDisplayName: "Mera Cafe",
      draftTemplateKey: "option-two",
      draftBackgroundKey: "warm-ivory",
      draftPalette: [DEFAULT_ACCENT],
      draftAccent: DEFAULT_ACCENT,
      draftAccentTokens: DEFAULT_ACCENT_TOKENS,
      hasUnpublishedChanges: true,
      draftRevision: 1,
      publishedRevision: 0,
      updatedAt: now,
    });
    return { adminId, businessId, serviceProfileId };
  });
  return {
    t,
    ...seeded,
    asAdmin: t.withIdentity({
      subject: seeded.adminId,
      issuer: "https://test.local",
    }),
  };
}

async function addPublishedDestination(
  setup: Awaited<ReturnType<typeof seedScanMeLinks>>,
  kind: "instagram" | "website",
  url: string,
) {
  const added = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
    serviceProfileId: setup.serviceProfileId,
    kind,
  });
  await setup.asAdmin.mutation(api.scanMeLinks.updateDestination, {
    destinationId: added.destinationId,
    kind,
    label: kind === "instagram" ? "Instagram" : "Website",
    url,
    iconKey: kind === "instagram" ? "instagram" : "globe",
    state: "active",
  });
  const editor = await setup.asAdmin.query(api.scanMeLinks.editor, {
    businessId: setup.businessId,
  });
  await setup.asAdmin.mutation(api.scanMeLinks.publishDraft, {
    serviceProfileId: setup.serviceProfileId,
    expectedDraftRevision: editor!.config!.draftRevision,
  });
  return added.destinationId;
}

describe("ScanMe Links javni tok", () => {
  test("jedna destinacija direktno preusmerava i dupli request ne uvećava metriku", async () => {
    const setup = await seedScanMeLinks();
    await addPublishedDestination(
      setup,
      "instagram",
      "https://instagram.com/mera.cafe",
    );
    await setup.asAdmin.mutation(api.scanMeLinks.setServiceActive, {
      serviceProfileId: setup.serviceProfileId,
      active: true,
    });
    const requestId = "9c0b9c20-e778-4c38-8af1-74cc5d5d4b95";
    const first = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
      slug: "mera-cafe",
      requestId,
      deviceCategory: "mobile",
    });
    const duplicate = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
      slug: "mera-cafe",
      requestId,
      deviceCategory: "mobile",
    });
    expect(first).toMatchObject({
      status: "direct",
      destinationUrl: "https://instagram.com/mera.cafe",
    });
    expect(duplicate).toMatchObject({ status: "direct" });
    const profile = await setup.t.run((ctx) => ctx.db.get(setup.serviceProfileId));
    expect(profile).toMatchObject({ totalScans: 1, totalPageViews: 0 });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("dve destinacije prikazuju stranicu, a dupli clickId broji samo jednom", async () => {
    const setup = await seedScanMeLinks();
    const instagramId = await addPublishedDestination(
      setup,
      "instagram",
      "https://instagram.com/mera.cafe",
    );
    await addPublishedDestination(setup, "website", "https://mera.example.com");
    await setup.asAdmin.mutation(api.scanMeLinks.setServiceActive, {
      serviceProfileId: setup.serviceProfileId,
      active: true,
    });
    const requestId = "10a97f36-b43d-445d-b0c9-96dcfa54b2b9";
    const scan = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
      slug: "mera-cafe",
      requestId,
      deviceCategory: "mobile",
    });
    expect(scan).toMatchObject({ status: "links" });
    const clickId = "85b28bad-6a4c-4868-9285-f00dc1f9b728";
    await setup.t.mutation(api.scanMeLinks.recordClick, {
      requestId,
      destinationId: instagramId,
      clickId,
    });
    await setup.t.mutation(api.scanMeLinks.recordClick, {
      requestId,
      destinationId: instagramId,
      clickId: "51c33b0f-3327-443e-9550-3d8d5c6eb04a",
    });
    await setup.t.mutation(api.scanMeLinks.recordClick, {
      requestId,
      destinationId: instagramId,
      clickId,
    });
    const state = await setup.t.run(async (ctx) => ({
      profile: await ctx.db.get(setup.serviceProfileId),
      destination: await ctx.db.get(instagramId),
    }));
    expect(state.profile).toMatchObject({
      totalScans: 1,
      totalPageViews: 1,
      totalConvertedSessions: 1,
    });
    expect(state.destination?.totalClicks).toBe(2);
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("neobjavljena destinacija ne menja javni tok", async () => {
    const setup = await seedScanMeLinks();
    await addPublishedDestination(
      setup,
      "instagram",
      "https://instagram.com/mera.cafe",
    );
    await setup.asAdmin.mutation(api.scanMeLinks.setServiceActive, {
      serviceProfileId: setup.serviceProfileId,
      active: true,
    });
    const draft = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
      serviceProfileId: setup.serviceProfileId,
      kind: "website",
    });
    await setup.asAdmin.mutation(api.scanMeLinks.updateDestination, {
      destinationId: draft.destinationId,
      kind: "website",
      label: "Website",
      url: "https://mera.example.com",
      iconKey: "globe",
      state: "active",
    });

    const scan = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
      slug: "mera-cafe",
      requestId: "071f33bf-af64-47cd-a104-719c430b2102",
      deviceCategory: "mobile",
    });
    expect(scan).toMatchObject({
      status: "direct",
      destinationUrl: "https://instagram.com/mera.cafe",
    });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("podržava 10 aktivnih destinacija i odbija jedanaestu", async () => {
    const setup = await seedScanMeLinks();
    for (let index = 0; index < 10; index += 1) {
      const added = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
        serviceProfileId: setup.serviceProfileId,
        kind: "custom",
      });
      await setup.asAdmin.mutation(api.scanMeLinks.updateDestination, {
        destinationId: added.destinationId,
        kind: "custom",
        label: `Link ${index + 1}`,
        url: `https://example.com/${index + 1}`,
        iconKey: "link",
        state: "active",
      });
    }
    const eleventh = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
      serviceProfileId: setup.serviceProfileId,
      kind: "custom",
    });
    await expect(
      setup.asAdmin.mutation(api.scanMeLinks.updateDestination, {
        destinationId: eleventh.destinationId,
        kind: "custom",
        label: "Link 11",
        url: "https://example.com/11",
        iconKey: "link",
        state: "active",
      }),
    ).rejects.toThrow("najviše 10 aktivnih destinacija");
    delete process.env.SCANME_ADMIN_EMAILS;
  });
});

test("odbacivanje vraća poslednju objavljenu verziju", async () => {
  const setup = await seedScanMeLinks();
  const destinationId = await addPublishedDestination(
    setup,
    "instagram",
    "https://instagram.com/mera.cafe",
  );
  await setup.asAdmin.mutation(api.scanMeLinks.updateDestination, {
    destinationId,
    kind: "instagram",
    label: "Novi naziv",
    url: "https://instagram.com/mera.cafe/novo",
    iconKey: "instagram",
    state: "active",
  });
  await setup.asAdmin.mutation(api.scanMeLinks.discardDraft, {
    serviceProfileId: setup.serviceProfileId,
  });
  const editor = await setup.asAdmin.query(api.scanMeLinks.editor, {
    businessId: setup.businessId,
  });
  expect(editor?.destinations[0]).toMatchObject({
    label: "Instagram",
    url: "https://instagram.com/mera.cafe",
    state: "active",
  });
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("novi lokal se inicijalizuje jednim presetom i prvom draft revizijom", async () => {
  const setup = await seedScanMeLinks();
  await setup.t.run(async (ctx) => {
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique();
    if (!config) throw new Error("Test konfiguracija nije pronađena.");
    await ctx.db.patch(config._id, {
      draftDesignState: "uninitialized",
      draftDesign: undefined,
      draftDescription: undefined,
      draftPaletteAnalysis: undefined,
      hasUnpublishedChanges: false,
      draftRevision: 0,
    });
  });

  const before = await setup.asAdmin.query(api.scanMeLinks.editor, {
    businessId: setup.businessId,
  });
  expect(before?.config).toMatchObject({
    designState: "uninitialized",
    design: null,
    draftRevision: 0,
  });

  const initialized = await setup.asAdmin.mutation(
    api.scanMeLinks.initializeDraftDesign,
    {
      serviceProfileId: setup.serviceProfileId,
      expectedDraftRevision: 0,
      source: { kind: "preset", presetKey: "lux" },
      description: "Kafa i doručak u centru grada.",
    },
  );
  expect(initialized).toMatchObject({
    draftRevision: 1,
    corrections: [],
    design: { version: 1, presetKey: "lux" },
  });

  const after = await setup.asAdmin.query(api.scanMeLinks.editor, {
    businessId: setup.businessId,
  });
  expect(after?.config).toMatchObject({
    designState: "ready",
    description: "Kafa i doručak u centru grada.",
    draftRevision: 1,
    hasUnpublishedChanges: true,
    design: { presetKey: "lux" },
  });
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("nepristupačan dizajn se atomski odbija bez promene revizije", async () => {
  const setup = await seedScanMeLinks();
  const inaccessible = structuredClone(PRESET_DESIGNS.gentle);
  inaccessible.autoContrast = false;
  inaccessible.presetKey = "custom";
  inaccessible.colors.page = "#FFFFFF";
  inaccessible.colors.title = "#FFFFFF";

  await expect(
    setup.asAdmin.mutation(api.scanMeLinks.saveDraftDesign, {
      serviceProfileId: setup.serviceProfileId,
      expectedDraftRevision: 1,
      design: inaccessible,
      description: "",
    }),
  ).rejects.toThrow("Kontrast");

  const config = await setup.t.run(async (ctx) =>
    ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique(),
  );
  expect(config?.draftRevision).toBe(1);
  expect(config?.draftDesign).toBeUndefined();
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("publish i discard kopiraju ceo V1 dizajn i presentation bez gubitka metrika", async () => {
  const setup = await seedScanMeLinks();
  const saved = await setup.asAdmin.mutation(api.scanMeLinks.saveDraftDesign, {
    serviceProfileId: setup.serviceProfileId,
    expectedDraftRevision: 1,
    design: PRESET_DESIGNS.lux,
    description: "Objavljena verzija.",
    paletteAnalysis: {
      original: ["#C79A3B"],
      adjusted: ["#C79A3B"],
      correctedRoles: [],
    },
  });
  const added = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
    serviceProfileId: setup.serviceProfileId,
    kind: "instagram",
    presentation: "social",
  });
  const updated = await setup.asAdmin.mutation(
    api.scanMeLinks.updateDestination,
    {
      destinationId: added.destinationId,
      kind: "instagram",
      label: "Instagram",
      url: "https://instagram.com/mera.cafe",
      iconKey: "instagram",
      state: "active",
      presentation: "social",
    },
  );
  expect(saved.draftRevision).toBe(2);
  expect(updated.draftRevision).toBe(4);
  await setup.asAdmin.mutation(api.scanMeLinks.publishDraft, {
    serviceProfileId: setup.serviceProfileId,
    expectedDraftRevision: updated.draftRevision,
  });

  const changed = await setup.asAdmin.mutation(api.scanMeLinks.saveDraftDesign, {
    serviceProfileId: setup.serviceProfileId,
    expectedDraftRevision: updated.draftRevision,
    design: PRESET_DESIGNS.ios,
    description: "Privremena verzija.",
  });
  await setup.asAdmin.mutation(api.scanMeLinks.updateDestination, {
    destinationId: added.destinationId,
    kind: "instagram",
    label: "Privremeni Instagram",
    url: "https://instagram.com/mera.cafe/privremeno",
    iconKey: "instagram",
    state: "active",
    presentation: "button",
  });
  const discarded = await setup.asAdmin.mutation(
    api.scanMeLinks.discardDraft,
    { serviceProfileId: setup.serviceProfileId },
  );
  expect(discarded.draftRevision).toBe(changed.draftRevision + 2);

  const state = await setup.t.run(async (ctx) => ({
    config: await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique(),
    destination: await ctx.db.get(added.destinationId),
  }));
  expect(state.config).toMatchObject({
    draftDesign: { presetKey: "lux" },
    publishedDesign: { presetKey: "lux" },
    draftDescription: "Objavljena verzija.",
    publishedDescription: "Objavljena verzija.",
    hasUnpublishedChanges: false,
  });
  expect(state.destination).toMatchObject({
    draftPresentation: "social",
    publishedPresentation: "social",
    totalClicks: 0,
    totalDirectVisits: 0,
  });
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("publish prihvata eksplicitni Nature asset bez storage slike i bez oslanjanja na presetKey", async () => {
  const setup = await seedScanMeLinks();
  const natureDesign = structuredClone(PRESET_DESIGNS.nature);
  natureDesign.presetKey = "custom";

  const saved = await setup.asAdmin.mutation(api.scanMeLinks.saveDraftDesign, {
    serviceProfileId: setup.serviceProfileId,
    expectedDraftRevision: 1,
    design: natureDesign,
    description: "Prirodna pozadina.",
  });

  await expect(
    setup.asAdmin.mutation(api.scanMeLinks.publishDraft, {
      serviceProfileId: setup.serviceProfileId,
      expectedDraftRevision: saved.draftRevision,
    }),
  ).resolves.toMatchObject({
    publishedRevision: saved.draftRevision,
  });

  const config = await setup.t.run(async (ctx) =>
    ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique(),
  );
  expect(config?.publishedDesign?.background).toMatchObject({
    kind: "image",
    builtInAsset: "nature",
  });
  expect(config?.publishedBackgroundImageStorageId).toBeUndefined();
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("V1 migracija ima dry-run i idempotentno čuva revizije i metrike", async () => {
  const setup = await seedScanMeLinks();
  const destinationId = await setup.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("serviceDestinations", {
      serviceProfileId: setup.serviceProfileId,
      kind: "website",
      totalClicks: 17,
      totalDirectVisits: 4,
      draftLabel: "Website",
      draftUrl: "https://mera.example.com",
      draftIconKey: "globe",
      draftOrder: 0,
      draftState: "active",
      publishedLabel: "Website",
      publishedUrl: "https://mera.example.com",
      publishedIconKey: "globe",
      publishedOrder: 0,
      publishedState: "active",
      createdAt: now,
      updatedAt: now,
    });
  });

  const dryRun = await setup.t.mutation(
    internal.migrations.migrateScanMeDesignV1,
    { dryRun: true, limit: 100 },
  );
  expect(dryRun).toMatchObject({
    dryRun: true,
    configsChanged: 1,
    destinationsChanged: 1,
  });
  const before = await setup.t.run(async (ctx) => ({
    config: await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique(),
    destination: await ctx.db.get(destinationId),
  }));
  expect(before.config?.draftDesign).toBeUndefined();
  expect(before.destination?.draftPresentation).toBeUndefined();

  const migrated = await setup.t.mutation(
    internal.migrations.migrateScanMeDesignV1,
    { limit: 100 },
  );
  const repeated = await setup.t.mutation(
    internal.migrations.migrateScanMeDesignV1,
    { limit: 100 },
  );
  const verified = await setup.t.query(
    internal.migrations.verifyScanMeDesignV1,
    { limit: 100 },
  );
  expect(migrated).toMatchObject({
    configsChanged: 1,
    destinationsChanged: 1,
  });
  expect(repeated).toMatchObject({
    configsChanged: 0,
    destinationsChanged: 0,
  });
  expect(verified).toMatchObject({ ok: true });

  const after = await setup.t.run(async (ctx) => ({
    config: await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique(),
    destination: await ctx.db.get(destinationId),
  }));
  expect(after.config).toMatchObject({
    draftDesignState: "ready",
    draftRevision: 1,
    publishedRevision: 0,
  });
  expect(after.destination).toMatchObject({
    draftPresentation: "button",
    publishedPresentation: "button",
    totalClicks: 17,
    totalDirectVisits: 4,
  });
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("editor ruta prihvata kanonski slug, alias i legacy business ID", async () => {
  const setup = await seedScanMeLinks();
  await setup.t.run(async (ctx) => {
    await ctx.db.insert("serviceSlugAliases", {
      slug: "stara-mera",
      serviceProfileId: setup.serviceProfileId,
      createdAt: Date.now(),
    });
  });

  for (const routeKey of [
    "mera-cafe",
    "stara-mera",
    setup.businessId,
  ]) {
    const editor = await setup.asAdmin.query(
      api.scanMeLinks.editorByRouteKey,
      { routeKey },
    );
    expect(editor).toMatchObject({
      id: setup.businessId,
      name: "Mera Cafe",
      clientPanelSlug: "mera-cafe",
    });
  }
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("kanonski naziv lokala nadjačava legacy draft i published nazive", async () => {
  const setup = await seedScanMeLinks();
  await addPublishedDestination(
    setup,
    "instagram",
    "https://instagram.com/mera.cafe",
  );
  await addPublishedDestination(setup, "website", "https://mera.example.com");
  await setup.asAdmin.mutation(api.scanMeLinks.setServiceActive, {
    serviceProfileId: setup.serviceProfileId,
    active: true,
  });
  await setup.t.run(async (ctx) => {
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique();
    if (!config) throw new Error("Test konfiguracija nije pronađena.");
    await ctx.db.patch(setup.businessId, { name: "Nova Mera" });
    await ctx.db.patch(config._id, {
      draftDisplayName: "Stari draft naziv",
      publishedDisplayName: "Stari objavljeni naziv",
    });
  });

  const editor = await setup.asAdmin.query(api.scanMeLinks.editor, {
    businessId: setup.businessId,
  });
  expect(editor?.draftView?.displayName).toBe("Nova Mera");
  expect(editor?.publishedView?.displayName).toBe("Nova Mera");

  const scan = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
    slug: "mera-cafe",
    requestId: "2632c7f4-e671-4dc2-9549-80ba9a640e97",
    deviceCategory: "mobile",
  });
  expect(scan).toMatchObject({
    status: "links",
    view: { displayName: "Nova Mera" },
  });
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("backend odbija pozadinu koja ne pripada template-u", async () => {
  const setup = await seedScanMeLinks();
  await expect(
    setup.asAdmin.mutation(api.scanMeLinks.saveDraftAppearance, {
      serviceProfileId: setup.serviceProfileId,
      displayName: "Mera Cafe",
      templateKey: "option-two",
      backgroundKey: "nepoznata-pozadina",
      palette: [DEFAULT_ACCENT],
      accent: DEFAULT_ACCENT,
      accentTokens: DEFAULT_ACCENT_TOKENS,
    }),
  ).rejects.toThrow("Pozadina ne pripada");
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("klijentski editor je zatvoren po defaultu i radi tek posle admin dozvole", async () => {
  const setup = await seedScanMeLinks();
  const clientId = await setup.t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: "editor-client@scanme.test",
      emailVerificationTime: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId,
      businessId: setup.businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
  const client = setup.t.withIdentity({
    subject: clientId,
    issuer: "https://test.local",
  });

  await expect(
    client.query(api.scanMeLinks.editor, {
      businessId: setup.businessId,
    }),
  ).rejects.toThrow("nije omogućeno za klijenta");

  await setup.asAdmin.mutation(api.scanMeLinks.setClientEditingEnabled, {
    serviceProfileId: setup.serviceProfileId,
    enabled: true,
  });

  const editor = await client.query(api.scanMeLinks.editor, {
    businessId: setup.businessId,
  });
  expect(editor?.editorRole).toBe("client");
  await expect(
    client.mutation(api.scanMeLinks.addDestination, {
      serviceProfileId: setup.serviceProfileId,
      kind: "instagram",
    }),
  ).resolves.toHaveProperty("destinationId");
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("klijent može imati samo jedan otvoren upit po servisu", async () => {
  const setup = await seedScanMeLinks();
  const now = Date.now();
  const clientId = await setup.t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "client@scanme.test",
      emailVerificationTime: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId,
      businessId: setup.businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("businessContacts", {
      businessId: setup.businessId,
      firstName: "Mira",
      lastName: "Petrović",
      normalizedEmail: "client@scanme.test",
      phone: "0601234567",
      positionTitle: "Vlasnik",
      status: "active",
      authUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
  const client = setup.t.withIdentity({
    subject: clientId,
    issuer: "https://test.local",
  });
  const first = await client.mutation(api.activationRequests.create, {
    businessId: setup.businessId,
    requestedService: "scanme_links",
  });
  const duplicate = await client.mutation(api.activationRequests.create, {
    businessId: setup.businessId,
    requestedService: "scanme_links",
  });
  expect(first.status).toBe("created");
  expect(duplicate).toEqual({
    status: "duplicate",
    requestId: first.requestId,
  });
  const requests = await setup.t.run((ctx) =>
    ctx.db.query("serviceActivationRequests").collect(),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    businessId: setup.businessId,
    requestedService: "scanme_links",
    status: "new",
    emailStatus: "queued",
  });
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("editor access guard i analitika poštuju klijentsku dozvolu", async () => {
  const setup = await seedScanMeLinks();
  const clientId = await setup.t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: "metrics-client@scanme.test",
      emailVerificationTime: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId,
      businessId: setup.businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  });
  const client = setup.t.withIdentity({
    subject: clientId,
    issuer: "https://test.local",
  });

  await expect(
    setup.t.query(api.scanMeLinks.editorAccessByRouteKey, {
      routeKey: "mera-cafe",
    }),
  ).resolves.toEqual({
    status: "unauthenticated",
    canonicalSlug: "mera-cafe",
  });
  await expect(
    client.query(api.scanMeLinks.editorAccessByRouteKey, {
      routeKey: "mera-cafe",
    }),
  ).resolves.toEqual({
    status: "forbidden",
    canonicalSlug: "mera-cafe",
    reason: "editing_disabled",
  });

  await setup.asAdmin.mutation(api.scanMeLinks.setClientEditingEnabled, {
    serviceProfileId: setup.serviceProfileId,
    enabled: true,
  });
  await expect(
    client.query(api.scanMeLinks.editorAccessByRouteKey, {
      routeKey: "mera-cafe",
    }),
  ).resolves.toMatchObject({
    status: "available",
    canonicalSlug: "mera-cafe",
    businessName: "Mera Cafe",
    role: "client",
    clientEditingEnabled: true,
  });
  await expect(
    client.query(api.scanMeLinks.metrics, {
      businessId: setup.businessId,
      range: "7d",
    }),
  ).resolves.toMatchObject({ totalScans: 0, range: "7d" });
  delete process.env.SCANME_ADMIN_EMAILS;
});
