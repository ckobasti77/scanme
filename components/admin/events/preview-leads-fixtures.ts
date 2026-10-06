import type { CatalogView, ModelView } from "@/components/admin/admin-events";
import type { LeadsConsent } from "@/components/admin/admin-events-leads";
import { modelName } from "@/components/admin/events/event-ui";
import type { ExhibitorFollowUp, FollowUpEstimate, FollowUpPreviewSource } from "@/components/admin/events/sections/leadovi-follow-up-view";
import type { InboxLead, LeadDetail } from "@/components/admin/events/sections/leadovi-view";
import { fairFollowUpSampleValues, fairFollowUpValues } from "@/convex/lib/fairFollowUp";
import type { FairPackageTier } from "@/lib/fair-contract";

// Admin UX A8 — TEST fixtures of `leadovi`, `leadovi/follow-up` and
// `leadovi/podesavanja` for /dev/admin-events-preview (no Convex, no real
// person). Leads are placed on the TEST catalog's published models by
// exhibitor and package, so the inbox, the drawer and the follow-up preview
// show the same rules as the admin (an included model has no leads, test
// drives only on Napredni). Every name, address and number is TEST data.

const HOUR = 3_600_000;

function pick(catalog: CatalogView, participationId: string, tier: FairPackageTier, index = 0): ModelView {
  const found = catalog.models.filter((model) => model.participationId === participationId && model.tier === tier && model.status === "published")[index];
  if (!found) throw new Error(`no TEST ${tier} model of ${participationId}`);
  return found;
}

export type PreviewLeadsFixture = {
  leads: InboxLead[];
  details: Map<string, LeadDetail>;
  followUps: ExhibitorFollowUp[];
  estimate: FollowUpEstimate;
  consents: LeadsConsent[];
  previewFor: (participationId: string, leadId: string | undefined) => FollowUpPreviewSource;
};

export function previewLeadsFixture(catalog: CatalogView, opening: number, eventTitle: string): PreviewLeadsFixture {
  const aAdvanced = pick(catalog, "p-a", "advanced");
  const aAdvanced2 = pick(catalog, "p-a", "advanced", 1);
  const aStarter = pick(catalog, "p-a", "starter");
  const bAdvanced = pick(catalog, "p-b", "advanced");
  const bStarter = pick(catalog, "p-b", "starter");
  const cAdvanced = pick(catalog, "p-c", "advanced");
  const cStarter = pick(catalog, "p-c", "starter");
  const dStarter = pick(catalog, "p-d", "starter");
  const followUpAt = Date.parse("2026-10-13T10:00:00+02:00");
  const sent = (at: number) => ({ id: `d-${at}`, status: "sent" as const, scheduledFor: at });
  const planned = (key: string) => ({ id: `f-${key}`, status: "queued" as const, scheduledFor: followUpAt });
  const lead = (id: string, model: ModelView, kind: InboxLead["kind"], hours: number, contact: { name: string; email?: string; phone?: string }, extra: Partial<InboxLead> = {}): InboxLead => ({
    id, createdAt: opening + hours * HOUR, kind, modelId: model.id, participationId: model.participationId, contactName: contact.name,
    ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { phone: contact.phone } : {}),
    delivered: false, followUpSuppressed: false, confirmation: contact.email ? sent(opening + hours * HOUR) : null,
    followUp: contact.email && model.tier === "advanced" ? planned(id) : null, ...extra,
  });
  const goran = { name: "TEST Goran Petrović", email: "test.goran@example.invalid", phone: "+381 60 000 0101" };
  const leads: InboxLead[] = [
    lead("lead-1", aAdvanced, "test_drive", 5.5, goran),
    lead("lead-2", aAdvanced2, "interest", 5.2, goran),
    lead("lead-3", aStarter, "interest", 4.8, { name: "TEST Jelena Marković", email: "test.jelena@example.invalid" }, { delivered: true, deliveredAt: opening + 30 * HOUR }),
    lead("lead-4", aAdvanced, "test_drive", 4.1, { name: "TEST Posetilac Sa Veoma Dugim Imenom i Prezimenom", email: "test.posetilac.sa.veoma.dugom.adresom@example.invalid", phone: "+381 60 000 0104" }, {
      confirmation: { id: "d-failed", status: "failed", scheduledFor: opening + 4.1 * HOUR, lastError: "PROVIDER_UNAVAILABLE:503" },
    }),
    lead("lead-5", bAdvanced, "interest", 3.6, { name: "TEST Marko Jovanović", email: "test.marko@example.invalid" }, { followUpSuppressed: true }),
    lead("lead-6", bStarter, "interest", 3.1, { name: "TEST Ana Bez Emaila", phone: "+381 60 000 0106" }),
    lead("lead-7", cAdvanced, "test_drive", 2.4, { name: "TEST Nikola Ilić", email: "test.nikola@example.invalid", phone: "+381 60 000 0107" }),
    lead("lead-8", cStarter, "interest", 1.9, { name: "TEST Milica Đorđević", email: "test.milica@example.invalid" }, { delivered: true, deliveredAt: opening + 30 * HOUR }),
    lead("lead-9", dStarter, "interest", 1.2, { name: "TEST Stefan Kostić", email: "test.stefan@example.invalid" }),
    lead("lead-10", aStarter, "interest", 0.6, { name: "TEST Ivana Lukić", email: "test.ivana@example.invalid" }),
  ].sort((a, b) => b.createdAt - a.createdAt);

  const at = opening + 2 * HOUR;
  const brandA = aAdvanced.brandId;
  const details = new Map<string, LeadDetail>();
  const base = (row: InboxLead) => ({ ...row, consentVersion: 1, consentTextSnapshot: `TEST saglasnost: ScanMe prima kontakt i prosleđuje ga izlagaču ${catalog.participations.find((p) => p.id === row.participationId)?.exhibitorName ?? "TEST"}.`, consentedAt: row.createdAt });
  for (const row of leads) {
    const model = catalog.models.find((entry) => entry.id === row.modelId)!;
    const advancedExhibitor = catalog.models.some((entry) => entry.participationId === row.participationId && entry.tier === "advanced");
    const shared = model.tier === "advanced";
    const goranLead = row.contactName === goran.name;
    details.set(row.id, {
      lead: { ...base(row), ...(row.followUpSuppressed ? { suppressedAt: row.createdAt + HOUR } : {}) },
      activity: {
        tierAtLead: model.tier,
        scans: { shared: true, capped: false, items: goranLead
          ? [{ eventModelId: aAdvanced.id, firstAt: at, lastAt: at + 2 * HOUR, count: 3 }, { eventModelId: aAdvanced2.id, firstAt: at + HOUR, lastAt: at + HOUR, count: 1 }, { eventModelId: aStarter.id, firstAt: at + 1.5 * HOUR, lastAt: at + 1.5 * HOUR, count: 1 }]
          : [{ eventModelId: row.modelId, firstAt: row.createdAt - HOUR, lastAt: row.createdAt - HOUR, count: 1 }] },
        ratings: { shared: true, capped: false, items: goranLead ? [{ eventModelId: aAdvanced.id, at, appearance: 5, specifications: 4, price: 3 }] : [] },
        audienceVotes: { shared: true, capped: false, items: goranLead ? [{ eventModelId: aAdvanced.id, at, prompt: "TEST koja boja vam se najviše dopada?", answer: "TEST plava" }] : [] },
        ...(advancedExhibitor ? {
          surveyAnswers: { shared, capped: false, items: goranLead ? [{ eventModelId: aAdvanced.id, at, answers: [{ prompt: "TEST da li planirate kupovinu u narednih 6 meseci?", kind: "yes_no" as const, answer: "yes" }, { prompt: "TEST kako planirate da platite?", kind: "single_choice" as const, answer: "TEST lizing" }] }] : [] },
        } : {}),
        passport: { shared: false, capped: false, items: goranLead ? [{ brandId: brandA, required: 3, stamps: [{ eventModelId: aAdvanced.id, at }, { eventModelId: aAdvanced2.id, at: at + HOUR }], favoriteModelId: aAdvanced.id }] : [] },
        ...(advancedExhibitor ? { sponsoredActions: { shared, capped: false, items: goranLead ? [{ eventModelId: aAdvanced2.id, kind: "garage_add" as const, at: at + 3 * HOUR }] : [] } } : {}),
      },
    });
  }

  const advancedCount = (participationId: string) => catalog.models.filter((model) => model.participationId === participationId && model.tier === "advanced" && model.status !== "withdrawn").length;
  const text = (id: string, status: "active" | "draft", version: number, subject: string, plainText: string) => ({ templateId: id, subject, plainText, status, version, updatedAt: opening - 24 * HOUR });
  const followUps: ExhibitorFollowUp[] = [
    {
      participationId: "p-a",
      active: text("t-a1", "active", 1, "TEST {ime}, hvala što ste posetili {izlagac}", "Dragi {ime},\n\nhvala na interesovanju za {modeli} na događaju {dogadjaj}.\n\nZa probnu vožnju modela {modeli_probna_voznja} javiće vam se naš prodavac.\n\nTEST tim izlagača A"),
      draft: null, advancedModels: advancedCount("p-a"), modelTexts: 0,
    },
    {
      participationId: "p-b",
      active: null,
      draft: text("t-b1", "draft", 1, "TEST ponuda posle sajma", "Poštovani {ime},\n\nvideli smo da vas zanima {modeli}. TEST tekst izlagača B u nacrtu."),
      advancedModels: advancedCount("p-b"), modelTexts: 0,
    },
    { participationId: "p-c", active: null, draft: null, advancedModels: advancedCount("p-c"), modelTexts: 0 },
    { participationId: "p-d", active: null, draft: null, advancedModels: advancedCount("p-d"), modelTexts: 0 },
  ];
  const estimate: FollowUpEstimate = {
    byParticipation: [
      { participationId: "p-a", pairs: 2, sent: 0, suppressed: 0 },
      { participationId: "p-b", pairs: 0, sent: 0, suppressed: 1 },
      { participationId: "p-c", pairs: 1, sent: 0, suppressed: 0 },
    ],
    capped: false,
  };
  const consents: LeadsConsent[] = [
    { id: "consent-2", kind: "interest", version: 2, status: "draft", text: "TEST nacrt saglasnosti v2 — ScanMe prosleđuje kontakt i aktivnost na modelima izlagaču {izlagac}." },
    {
      id: "consent-1", kind: "interest", version: 1, status: "active", text: "TEST saglasnost — ScanMe prosleđuje kontakt izlagaču {izlagac}.", activatedAt: opening - 48 * HOUR,
      legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T00:00:00+02:00"),
    },
  ];

  const exhibitorName = (participationId: string) => catalog.participations.find((row) => row.id === participationId)?.exhibitorName ?? "TEST";
  function previewFor(participationId: string, leadId: string | undefined): FollowUpPreviewSource {
    const own = leads.filter((row) => row.participationId === participationId && row.email);
    const chosen = own.find((row) => row.id === leadId);
    const choices = own.map((row) => ({ leadId: row.id, contactName: row.contactName, kind: row.kind, createdAt: row.createdAt }));
    const name = (id: string) => modelName(catalog.models.find((model) => model.id === id)!);
    if (chosen) {
      const pair = own.filter((row) => row.email?.toLowerCase() === chosen.email?.toLowerCase()).sort((a, b) => a.createdAt - b.createdAt);
      const rated = details.get(chosen.id)?.activity.ratings?.items.map((item) => name(item.eventModelId)) ?? [];
      return {
        source: "lead",
        values: fairFollowUpValues({ leads: pair.map((row) => ({ kind: row.kind, modelName: name(row.modelId) })), contactName: pair[pair.length - 1].contactName, exhibitorName: exhibitorName(participationId), eventTitle, ratedModelNames: rated }),
        leads: choices,
      };
    }
    const models = catalog.models.filter((model) => model.participationId === participationId && model.status === "published").sort((a, b) => Number(b.tier === "advanced") - Number(a.tier === "advanced"));
    return { source: "sample", values: fairFollowUpSampleValues({ exhibitorName: exhibitorName(participationId), eventTitle, modelNames: models.slice(0, 2).map(modelName) }), leads: choices };
  }
  return { leads, details, followUps, estimate, consents, previewFor };
}
