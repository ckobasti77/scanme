/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_ACCENT, DEFAULT_ACCENT_TOKENS } from "../lib/scanme-links";
import { createDefaultScanMeLinksDesignV2 } from "../lib/scanme-links-design";

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
  test("objavljena stranica može biti aktivna bez ijedne destinacije", async () => {
    const setup = await seedScanMeLinks();
    const editor = await setup.asAdmin.query(api.scanMeLinks.editor, {
      businessId: setup.businessId,
    });
    await setup.asAdmin.mutation(api.scanMeLinks.publishDraft, {
      serviceProfileId: setup.serviceProfileId,
      expectedDraftRevision: editor!.config!.draftRevision,
    });
    await expect(
      setup.asAdmin.mutation(api.scanMeLinks.setServiceActive, {
        serviceProfileId: setup.serviceProfileId,
        active: true,
      }),
    ).resolves.toEqual({ active: true });

    const scan = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
      slug: "mera-cafe",
      requestId: "80f1177b-6cc8-4ac0-a8b8-9fab63fd0dad",
      deviceCategory: "mobile",
    });
    expect(scan).toMatchObject({
      status: "links",
      view: { destinations: [] },
    });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("aktivan link bez URL-a se vidi u nacrtu, ali ne i javno", async () => {
    const setup = await seedScanMeLinks();
    const added = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
      serviceProfileId: setup.serviceProfileId,
      kind: "instagram",
    });
    const initialDraft = await setup.asAdmin.query(api.scanMeLinks.editor, {
      businessId: setup.businessId,
    });
    expect(initialDraft?.draftView?.destinations).toContainEqual(
      expect.objectContaining({
        id: added.destinationId,
        state: "active",
        url: "",
      }),
    );
    await setup.asAdmin.mutation(api.scanMeLinks.updateDestination, {
      destinationId: added.destinationId,
      kind: "instagram",
      label: "Instagram",
      url: "",
      iconKey: "instagram",
      state: "active",
    });
    const editor = await setup.asAdmin.query(api.scanMeLinks.editor, {
      businessId: setup.businessId,
    });
    await setup.asAdmin.mutation(api.scanMeLinks.publishDraft, {
      serviceProfileId: setup.serviceProfileId,
      expectedDraftRevision: editor!.config!.draftRevision,
    });
    await setup.asAdmin.mutation(api.scanMeLinks.setServiceActive, {
      serviceProfileId: setup.serviceProfileId,
      active: true,
    });

    const requestId = "dfd8a675-d82f-43b4-ac50-32b3972a5d20";
    const scan = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
      slug: "mera-cafe",
      requestId,
      deviceCategory: "mobile",
    });
    expect(scan).toMatchObject({
      status: "links",
      view: {
        destinations: [],
      },
    });
    await expect(
      setup.t.mutation(api.scanMeLinks.recordClick, {
        requestId,
        destinationId: added.destinationId,
        clickId: "d5e70765-86d2-48ce-9fde-b2c6c2d5e75e",
      }),
    ).rejects.toThrow("Destinacija nije dostupna.");
    const destination = await setup.t.run((ctx) =>
      ctx.db.get(added.destinationId),
    );
    expect(destination?.totalClicks).toBe(0);
    delete process.env.SCANME_ADMIN_EMAILS;
  });

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
    await expect(
      setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
        serviceProfileId: setup.serviceProfileId,
        kind: "custom",
      }),
    ).rejects.toThrow("10 aktivnih destinacija");
    delete process.env.SCANME_ADMIN_EMAILS;
  });
});

test("brisanje ostavlja tombstone i kompletnu analitiku", async () => {
  const setup = await seedScanMeLinks();
  const instagramId = await addPublishedDestination(
    setup,
    "instagram",
    "https://instagram.com/mera.cafe",
  );
  await addPublishedDestination(
    setup,
    "website",
    "https://mera.example.com",
  );
  await setup.asAdmin.mutation(api.scanMeLinks.setServiceActive, {
    serviceProfileId: setup.serviceProfileId,
    active: true,
  });
  const requestId = "d986d93a-8eec-4e8a-aaf8-3ce23044ca9c";
  await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
    slug: "mera-cafe",
    requestId,
    deviceCategory: "mobile",
  });
  await setup.t.mutation(api.scanMeLinks.recordClick, {
    requestId,
    destinationId: instagramId,
    clickId: "1d1111d8-b594-458b-9027-f9020321528a",
  });

  await setup.asAdmin.mutation(api.scanMeLinks.markDestinationDeleted, {
    destinationId: instagramId,
  });
  const draft = await setup.asAdmin.query(api.scanMeLinks.editor, {
    businessId: setup.businessId,
  });
  await setup.asAdmin.mutation(api.scanMeLinks.publishDraft, {
    serviceProfileId: setup.serviceProfileId,
    expectedDraftRevision: draft!.config!.draftRevision,
  });

  const state = await setup.t.run(async (ctx) => ({
    destination: await ctx.db.get(instagramId),
    visits: await ctx.db
      .query("destinationVisitEvents")
      .withIndex("by_destinationId_and_occurredAt", (q) =>
        q.eq("destinationId", instagramId),
      )
      .take(10),
    daily: await ctx.db
      .query("dailyDestinationMetrics")
      .withIndex("by_destinationId_and_dateKey", (q) =>
        q.eq("destinationId", instagramId),
      )
      .take(10),
  }));
  expect(state.destination).toMatchObject({
    publishedState: "deleted",
    totalClicks: 1,
  });
  expect(state.visits).toHaveLength(1);
  expect(state.daily).toHaveLength(1);

  const metrics = await setup.asAdmin.query(api.scanMeLinks.metrics, {
    businessId: setup.businessId,
    range: "7d",
  });
  expect(metrics?.destinations).toContainEqual(
    expect.objectContaining({
      id: instagramId,
      state: "deleted",
      totalClicks: 1,
    }),
  );
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("novi editor validira tekst i normalizuje opcije koje stil ne podržava", async () => {
  const setup = await seedScanMeLinks();
  const added = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
    serviceProfileId: setup.serviceProfileId,
    kind: "instagram",
  });
  const gentle = createDefaultScanMeLinksDesignV2("gentle");
  const incompatibleDesign = {
    ...gentle,
    buttons: {
      ...gentle.buttons,
      variant: "glass" as const,
    },
  };
  const baseArgs = {
    serviceProfileId: setup.serviceProfileId,
    displayName: "Mera Cafe",
    description: "Mali gradski kafe",
    logoStorageId: null,
    palette: ["#F7F1EA", "#D98B79"],
    paletteAnalysis: null,
    design: incompatibleDesign,
    backgroundImageStorageId: null,
    backgroundVideoStorageId: null,
    destinations: [
      {
        id: added.destinationId,
        kind: "website" as const,
        label: "Moj sajt",
        url: "",
        order: 0,
        state: "active" as const,
      },
    ],
  };

  await expect(
    setup.asAdmin.mutation(api.scanMeLinks.saveEditorDraft, {
      ...baseArgs,
      displayName: "x".repeat(51),
    }),
  ).rejects.toThrow("50 karaktera");
  await expect(
    setup.asAdmin.mutation(api.scanMeLinks.saveEditorDraft, {
      ...baseArgs,
      description: "x".repeat(51),
    }),
  ).rejects.toThrow("50 karaktera");

  const saved = await setup.asAdmin.mutation(
    api.scanMeLinks.saveEditorDraft,
    baseArgs,
  );
  expect(saved).toMatchObject({
    saved: true,
    design: {
      presetKey: "gentle",
      buttons: { variant: "solid" },
      iconStyle: "soft-line",
    },
  });
  const editor = await setup.asAdmin.query(api.scanMeLinks.editorBySlug, {
    slug: "mera-cafe",
  });
  expect(editor?.config).toMatchObject({
    displayName: "Mera Cafe",
    description: "Mali gradski kafe",
    draftRevision: saved.draftRevision,
    design: {
      presetKey: "gentle",
      buttons: { variant: "solid" },
    },
  });
  expect(editor?.destinations).toContainEqual(
    expect.objectContaining({
      id: added.destinationId,
      kind: "website",
      label: "Moj sajt",
      iconKey: "globe",
      state: "active",
    }),
  );
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("editor po slugu prati stari servisni alias i vraća null bez pristupa", async () => {
  const setup = await seedScanMeLinks();
  await setup.t.run(async (ctx) => {
    await ctx.db.insert("serviceSlugAliases", {
      slug: "stari-mera-cafe",
      serviceProfileId: setup.serviceProfileId,
      createdAt: Date.now(),
    });
  });
  const editor = await setup.asAdmin.query(api.scanMeLinks.editorBySlug, {
    slug: "stari-mera-cafe",
  });
  expect(editor).toMatchObject({
    id: setup.businessId,
    clientPanelSlug: "mera-cafe",
    profile: { id: setup.serviceProfileId },
    editorRole: "admin",
  });
  await expect(
    setup.t.query(api.scanMeLinks.editorBySlug, {
      slug: "mera-cafe",
    }),
  ).resolves.toBeNull();
  delete process.env.SCANME_ADMIN_EMAILS;
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

test("legacy objava zadržava stare accent tokene dok nema v2 dizajn", async () => {
  const setup = await seedScanMeLinks();
  const legacyTokens = {
    accent: "#A23B72",
    strong: "#5B163C",
    soft: "#F4DDEA",
    border: "#C987AA",
    focus: "#7A2352",
    onAccent: "#FFFFFF",
  };
  await setup.t.run(async (ctx) => {
    const config = await ctx.db
      .query("scanMeLinksConfigs")
      .withIndex("by_serviceProfileId", (q) =>
        q.eq("serviceProfileId", setup.serviceProfileId),
      )
      .unique();
    if (!config) throw new Error("Missing config.");
    await ctx.db.patch(config._id, {
      publishedDisplayName: "Mera Cafe",
      publishedTemplateKey: "option-two",
      publishedBackgroundKey: "warm-ivory",
      publishedAccent: legacyTokens.accent,
      publishedAccentTokens: legacyTokens,
      publishedRevision: 1,
      publishedAt: Date.now(),
    });
    await ctx.db.patch(setup.serviceProfileId, {
      status: "active",
      updatedAt: Date.now(),
    });
  });

  const result = await setup.t.mutation(api.scanMeLinks.resolveAndRecord, {
    slug: "mera-cafe",
    requestId: "9bc157b8-7ddc-4e90-9e36-dae443840da9",
  });
  expect(result).toMatchObject({
    status: "links",
    view: {
      design: null,
      accent: legacyTokens.accent,
      accentTokens: legacyTokens,
    },
  });
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("editor čuva nasleđeni legacy logo kada se sačuva drugo polje", async () => {
  const setup = await seedScanMeLinks();
  const logoUrl = "https://cdn.example.com/legacy-logo.svg";
  await setup.t.run(async (ctx) => {
    await ctx.db.patch(setup.businessId, { logoUrl });
  });
  const before = await setup.asAdmin.query(api.scanMeLinks.editorBySlug, {
    slug: "mera-cafe",
  });
  expect(before?.config?.logoStorageId).toBeNull();
  expect(before?.config?.inheritsBusinessLogo).toBe(true);
  expect(before?.config?.logoUrl).toBe(logoUrl);

  await setup.asAdmin.mutation(api.scanMeLinks.saveEditorDraft, {
    serviceProfileId: setup.serviceProfileId,
    displayName: "Mera Cafe Novi",
    description: null,
    palette: [DEFAULT_ACCENT],
    paletteAnalysis: null,
    design: createDefaultScanMeLinksDesignV2("gentle"),
    backgroundImageStorageId: null,
    backgroundVideoStorageId: null,
    destinations: [],
  });

  const after = await setup.asAdmin.query(api.scanMeLinks.editorBySlug, {
    slug: "mera-cafe",
  });
  expect(after?.config?.logoStorageId).toBeNull();
  expect(after?.config?.inheritsBusinessLogo).toBe(true);
  expect(after?.config?.logoUrl).toBe(logoUrl);
  delete process.env.SCANME_ADMIN_EMAILS;
});

test("trajni tombstone redovi ne blokiraju novi link niti nestaju iz analitike", async () => {
  const setup = await seedScanMeLinks();
  await setup.t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < 205; index += 1) {
      await ctx.db.insert("serviceDestinations", {
        serviceProfileId: setup.serviceProfileId,
        kind: "custom",
        totalClicks: index,
        totalDirectVisits: 0,
        draftLabel: `Obrisan ${index}`,
        draftUrl: "",
        draftIconKey: "link",
        draftOrder: index,
        draftState: "deleted",
        publishedLabel: `Obrisan ${index}`,
        publishedUrl: "",
        publishedIconKey: "link",
        publishedOrder: index,
        publishedState: "deleted",
        createdAt: now + index,
        updatedAt: now + index,
      });
    }
  });

  const added = await setup.asAdmin.mutation(api.scanMeLinks.addDestination, {
    serviceProfileId: setup.serviceProfileId,
    kind: "instagram",
  });
  const saved = await setup.asAdmin.mutation(api.scanMeLinks.saveEditorDraft, {
    serviceProfileId: setup.serviceProfileId,
    displayName: "Mera Cafe",
    description: null,
    logoStorageId: null,
    palette: [DEFAULT_ACCENT],
    paletteAnalysis: null,
    design: createDefaultScanMeLinksDesignV2("gentle"),
    backgroundImageStorageId: null,
    backgroundVideoStorageId: null,
    destinations: [
      {
        id: added.destinationId,
        kind: "instagram",
        label: "Instagram",
        url: "",
        order: 0,
        state: "active",
      },
    ],
  });
  await setup.asAdmin.mutation(api.scanMeLinks.publishDraft, {
    serviceProfileId: setup.serviceProfileId,
    expectedDraftRevision: saved.draftRevision,
  });
  const metrics = await setup.asAdmin.query(api.scanMeLinks.metrics, {
    businessId: setup.businessId,
    range: "all",
  });
  expect(metrics?.destinations).toHaveLength(206);
  expect(metrics?.destinations.filter((row) => row.state === "deleted")).toHaveLength(
    205,
  );
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
