import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { CatalogView, ModelView, QrDetailView } from "@/components/admin/admin-events";
import { AdminHierarchyPicker, AdminViewModeOverride } from "@/components/admin/admin-ui";
import { buildHierarchy } from "@/lib/admin-v1/hierarchy";
import { eventDetailHref, eventSectionHref, interactionExhibitorHref } from "@/lib/admin-v1/event-sections";
import { modelListQuery } from "@/lib/admin-v1/model-filters";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { EventModelDetailView, EventModelsView, ModelStickerForm, type ModelDetailSummary } from "./modeli-view";

// Admin UX A3 — Modeli list (hierarchy filter, search, facets, chips, groups,
// Tabela/Kartice, empty states) and the model detail (prethodni / sledeći in
// the filter, linked summaries). SSR markup, like the other admin views.

// The shared next/link stub drops every prop except href/className; the
// accessible names of the links are checked here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const list = adminEventsSr.modelList;
const detail = adminEventsSr.modelDetail;
const BASE = "/admin/dogadjaji/test-sajam";

function model(id: string, participationId: string, brandId: string, extra: Partial<ModelView> = {}): ModelView {
  return {
    id, externalKey: `test-em26-${id}`, displayName: `TEST ${id}`, slug: `test-${id}`, participationId, brandId, brandName: `TEST Brend ${brandId}`,
    exhibitorName: `TEST Izlagač ${participationId.toUpperCase()}`, standLabel: `TEST štand ${participationId.toUpperCase()}1`, tier: "starter", status: "published",
    priceText: "TEST cena", specCount: 2, highlightCount: 1, hasPhoto: false, photoUrl: null, passportEligible: true, packageActivatedAt: Date.parse("2026-10-09T09:00:00+02:00"),
    qrCode: null, qrSmq: null, issues: [], ...extra,
  };
}

const catalog: CatalogView = {
  days: [{ dateKey: "2026-10-09", label: "TEST dan 1" }],
  participations: [],
  stands: [],
  models: [
    model("m1", "a", "b1", { tier: "advanced", qrCode: "7KQ2M9XA", qrSmq: "SMQ-TEST-0001", hasPhoto: true }),
    model("m2", "a", "b1", { variant: "TEST Premium", issues: [{ severity: "warning", code: "FAIR_PHOTO_MISSING", path: "photoUrl" }] }),
    model("m3", "a", "b2", { status: "draft", issues: [{ severity: "error", code: "FAIR_SPECIFICATIONS_INVALID", path: "specifications" }] }),
    model("m4", "b", "b3", { tier: "included" }),
    model("m5", "b", "b3"),
    model("m6", "c", "b4", { tier: "advanced", status: "withdrawn" }),
  ],
  qrConfigured: true,
};

function listHtml(query: AdminQueryState, view?: "tabela" | "kartice", source: CatalogView = catalog) {
  const listQuery = modelListQuery(query);
  const element = (
    <EventModelsView
      catalog={source}
      query={query}
      onQueryChange={() => undefined}
      modelHref={(id) => eventDetailHref(BASE, "modeli", id, listQuery)}
      importHref={eventSectionHref(BASE, "import")}
    />
  );
  return renderToStaticMarkup(view ? <AdminViewModeOverride value={view}>{element}</AdminViewModeOverride> : element);
}

const selects = (html: string) => html.match(/<select[\s\S]*?<\/select>/g) ?? [];

describe("A3 Modeli list", () => {
  test("filter bar: hierarchy (izlagač and brend with counts, a model combobox), search, facets and the N od M counter", () => {
    const html = listHtml({});
    expect(html).toContain(`aria-label="${list.hierarchyLabel}"`);
    expect(html).toContain(list.searchLabel);
    expect(html).toContain(`placeholder="${list.searchPlaceholder}"`);
    for (const label of [adminUiSr.hierarchy.exhibitor, adminUiSr.hierarchy.brand, adminUiSr.hierarchy.model, ...Object.values(list.facets)]) expect(html).toContain(label);
    expect(html).toContain(">TEST Izlagač A (3)</option>");
    expect(html).toContain(">TEST Brend b3 (2)</option>");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain(">Starter (3)</option>");
    expect(html).toContain(">Ima greške (1)</option>");
    expect(html).toContain("6 od 6 modela");
  });

  test("there is no drop-down list of models: models are found in the combobox, not in a <select>", () => {
    const html = listHtml({});
    expect(selects(html).length).toBeGreaterThan(0);
    for (const select of selects(html)) {
      for (const row of catalog.models) expect(select).not.toContain(row.displayName);
    }
    // The combobox offers every model of the current exhibitor/brand by typing.
    expect(html).toMatch(/role="option"[^>]*>.*TEST m1/);
  });

  test("an exhibitor narrows brands and models; chips and Očisti appear; links keep the filters", () => {
    const html = listHtml({ izlagac: "a", paket: "starter" });
    expect(html).toContain("2 od 6 modela");
    expect(html).not.toContain(">TEST Brend b3");
    expect(html).toContain(">TEST Brend b1 (1)</option>");
    expect(html).toContain(`${adminEventsSr.colExhibitor}: TEST Izlagač A`);
    expect(html).toContain(`${list.facets.paket}: Starter`);
    expect(html).toContain(`>${adminUiSr.filters.clear}</button>`);
    expect(html).toContain(`aria-label="${adminUiSr.filters.removeChip.replace("{label}", `${list.facets.paket}: Starter`)}"`);
    expect(html).not.toContain("TEST m4");
    expect(html).toContain(`href="${BASE}/modeli/m2?izlagac=a&amp;paket=starter"`);
  });

  test("search narrows the list; no match shows a next step", () => {
    expect(listHtml({ q: "premium" })).toContain("1 od 6 modela");
    expect(listHtml({ q: "SMQ-TEST-0001" })).toContain("1 od 6 modela");
    const none = listHtml({ q: "nepostojeci" });
    expect(none).toContain(list.noMatchTitle);
    expect(none).toContain(`>${adminUiSr.filters.clear}</button>`);
    expect(none).toContain(list.searchChip.replace("{q}", "nepostojeci"));
  });

  test("Tabela is grouped by izlagač · brend with the A3 columns (SMQ and code, nema, problems, photo)", () => {
    const html = listHtml({}, "tabela");
    expect(html).not.toContain('data-admin-primitive="data-card"');
    expect(html.match(/scope="rowgroup"/g)).toHaveLength(4);
    expect(html).toContain("TEST Izlagač A · TEST Brend b1");
    expect(html).toContain(list.groupCount.replace("{count}", "2"));
    for (const header of [adminEventsSr.colModel, adminEventsSr.colBrand, list.colExhibitor, list.colStand, adminEventsSr.colPackage, adminEventsSr.colStatus, adminEventsSr.colQr, list.colProblems, list.colPhoto]) {
      expect(html).toContain(header);
    }
    expect(html).toContain("SMQ-TEST-0001");
    expect(html).toContain("7KQ2M9XA");
    expect(html).toContain(`>${list.qrNone}<`);
    expect(html).toContain(list.problemsCount.replace("{errors}", "1").replace("{warnings}", "0"));
    expect(html).toContain(`aria-label="${list.openAria.replace("{model}", "TEST m1")}"`);
    // One brand selected → one group → no group heading.
    expect(listHtml({ brend: "b3" }, "tabela")).not.toContain('scope="rowgroup"');
  });

  test("Kartice show a photo fallback, the same badges and the open action", () => {
    const html = listHtml({ izlagac: "a" }, "kartice");
    expect(html).not.toContain("<table");
    expect(html).toContain(list.photoStored);
    expect(html).toContain(list.photoFallback);
    expect(html).toContain(adminEventsSr.tiers.advanced);
    expect(html).toContain(`aria-label="${list.openAria.replace("{model}", "TEST m2 TEST Premium")}"`);
  });

  test("an event without models offers the catalog import", () => {
    const html = listHtml({}, undefined, { ...catalog, models: [] });
    expect(html).toContain(list.emptyTitle);
    expect(html).toContain(`href="${BASE}/import"`);
    expect(html).toContain(list.emptyAction);
  });
});

const ok = async () => ({ ok: true as const });
const actions = { publish: ok, withdraw: ok, upgrade: ok, assignQr: ok, resolveTest: async () => ({ ok: true as const, value: { outcome: "fair_model" as const, problem: null, path: "/x" } }) };

function detailHtml(modelId: string, query: AdminQueryState, summary?: ModelDetailSummary) {
  const listQuery = modelListQuery(query);
  return renderToStaticMarkup(
    <EventModelDetailView
      catalog={catalog}
      modelId={modelId}
      actions={actions}
      query={query}
      listHref={eventSectionHref(BASE, "modeli", listQuery)}
      modelHref={(id) => eventDetailHref(BASE, "modeli", id, listQuery)}
      qrHref={(code) => eventDetailHref(BASE, "qr", code)}
      sectionHref={(path, extra) => eventSectionHref(BASE, path, extra)}
      interactionHref={(participationId, part, extra) => interactionExhibitorHref(BASE, participationId, extra, part)}
      summary={summary}
    />,
  );
}

describe("A3 model detail", () => {
  test("prethodni / sledeći move inside the list filter and keep it; back returns to the filtered list", () => {
    const html = detailHtml("m2", { izlagac: "a" });
    expect(html).toContain(detail.position.replace("{index}", "2").replace("{total}", "3"));
    expect(html).toContain(`href="${BASE}/modeli/m1?izlagac=a" aria-label="${detail.previousAria.replace("{model}", "TEST m1")}"`);
    expect(html).toContain(`href="${BASE}/modeli/m3?izlagac=a" aria-label="${detail.nextAria.replace("{model}", "TEST m3")}"`);
    expect(html).toContain(`href="${BASE}/modeli?izlagac=a"`);
    expect(detailHtml("m6", { izlagac: "a" })).toContain(detail.notInFilter);
  });

  test("keeps every model action: publish, withdraw, upgrade with confirmation, QR, resolve test", () => {
    const html = detailHtml("m1", {});
    for (const text of [adminEventsSr.publish, adminEventsSr.withdraw, adminEventsSr.upgradeTitle, adminEventsSr.upgradeNone, detail.qrOpen, adminEventsSr.resolveSubmit, "SMQ-TEST-0001"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(`href="${BASE}/qr/7KQ2M9XA"`);
    // Without a QR the existing assignment form is on the detail.
    const noQr = detailHtml("m2", {});
    expect(noQr).toContain(adminEventsSr.upgradeStart);
    expect(noQr).toMatch(new RegExp(`<option[^>]*value="advanced"[^>]*>${adminEventsSr.tiers.advanced}</option>`));
    expect(noQr).toContain(detail.qrNone);
    expect(noQr).toContain(adminEventsSr.assignSubmit);
    // Problems are explained.
    const broken = detailHtml("m3", {});
    expect(broken).toContain(detail.validationExplain);
    expect(broken).toContain(adminEventsSr.issues.FAIR_SPECIFICATIONS_INVALID);
    expect(broken).not.toMatch(/FAIR_[A-Z_]+/);
  });

  test("linked summaries: loading until the queries answer, then numbers with links to the sections", () => {
    expect(detailHtml("m1", {}).split(adminEventsSr.loading).length - 1).toBe(6);
    const html = detailHtml("m1", {}, {
      questions: [{ dayLabel: "TEST dan 1", published: 1, draft: 1, closed: 0 }],
      survey: { version: 2, status: "published" },
      passport: { status: "published", member: true },
      forms: { interest: true, testDrive: false },
      leads: { interest: 3, testDrive: 1, undelivered: 2, capped: false },
      sponsored: { state: "active", order: 2 },
    });
    expect(html).not.toContain(adminEventsSr.loading);
    expect(html).toContain("TEST dan 1: 1 objavljeno · 1 nacrt · 0 zatvoreno");
    expect(html).toContain(detail.surveyVersion.replace("{version}", "2").replace("{status}", adminEventsSr.surveyStatus.published));
    expect(html).toContain(detail.passportMember.replace("{status}", adminEventsSr.passportStatus.published));
    expect(html).toContain(detail.leadsValue.replace("{interest}", "3").replace("{testDrive}", "1").replace("{undelivered}", "2"));
    expect(html).toContain(detail.sponsoredActive.replace("{order}", "2"));
    // Izlagači 2026: the four interaction rows open the exhibitor's Interakcije page at their part.
    for (const href of ["interakcije/a?model=m1#glas-publike", "interakcije/a?anketa=m1#ankete", "interakcije/a?brend=b1#pasos", "interakcije/a?forma=m1#forme", "leadovi?izlagac=a", "sponzorisano"]) {
      expect(html).toContain(`href="${BASE}/${href}"`);
    }
    // Package rules: a Starter model has no survey and no test drive.
    const starter = detailHtml("m2", {}, { forms: { interest: true, testDrive: false } });
    expect(starter).toContain(detail.advancedOnly);
    expect(starter).toContain(`${detail.formTestDrive}: ${detail.formNotInPackage}`);
  });
});

describe("A3 AdminHierarchyPicker select mode", () => {
  test("a combobox over all models, disabled options with the reason", () => {
    const data = buildHierarchy([
      { id: "m1", label: "TEST m1", exhibitorId: "a", exhibitorLabel: "TEST Izlagač A", brandId: "b1", brandLabel: "TEST Brend b1" },
      { id: "m2", label: "TEST m2", exhibitorId: "a", exhibitorLabel: "TEST Izlagač A", brandId: "b1", brandLabel: "TEST Brend b1", disabledReason: "TEST samo Napredni" },
    ]);
    const html = renderToStaticMarkup(<AdminHierarchyPicker mode="select" data={data} value={{}} onChange={() => undefined} label="TEST model" required />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-required="true"');
    expect(html).not.toContain("<select");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("TEST samo Napredni");
  });
});

describe("N2 model detail: the printed sticker", () => {
  const confirmProps = {
    model: model("m2", "a", "b1", { status: "draft" }),
    actions,
    pending: false,
    onAssign: async () => undefined,
    linkHref: (kod: string) => `${BASE}/povezi?kod=${kod}`,
  };
  const found = (current: QrDetailView["current"], extra: Partial<QrDetailView> = {}): QrDetailView => ({
    cardId: "c1", accessChannelId: "ch1", resolverCode: "TF000QRS", label: "SA26-040", kind: "sticker", smqCode: "SMQ-TEST-0300", channelState: "problem",
    problemReason: "destination_missing", redirectEnabled: true, totalScansAllTime: 0, current, history: [], historyCapped: false, stats: null, lastScanAt: null, ...extra,
  });

  test("a car with a sticker shows its SA26 label, SMQ and resolver code", () => {
    const html = detailHtml("m1", {});
    expect(html).toContain(detail.qrLabel);
    expect(html).toContain(detail.qrResolver);
  });

  test("the field takes a label, SMQ or code (16 px on the phone); the confirmation names sticker, car, exhibitor and stand", () => {
    const form = renderToStaticMarkup(<ModelStickerForm {...confirmProps} />);
    expect(form).toContain(detail.qrCodeHelp);
    expect(form).toMatch(/<input[^>]*class="[^"]*max-sm:text-base/);
    const html = renderToStaticMarkup(<ModelStickerForm {...confirmProps} initialStep={{ kind: "confirm", code: "40", sticker: found(null) }} />);
    expect(html).toContain(detail.qrConfirmTitle);
    expect(html).toContain(detail.qrConfirmBody.replace("{sticker}", "SA26-040").replace("{model}", "TEST m2").replace("{exhibitor}", "TEST Izlagač A").replace("{stand}", "TEST štand A1"));
    expect(html).toContain(detail.qrConfirmDraft);
    expect(html).toContain(`>${detail.qrConfirm}</button>`);
  });

  test("a sticker on another car, of the other event or a panel is not assigned here", () => {
    const taken = renderToStaticMarkup(<ModelStickerForm {...confirmProps} initialStep={{ kind: "confirm", code: "1", sticker: found({ assignmentId: "as1", sameEvent: true, eventTitle: "TEST", eventModelId: "m1", modelLabel: "TEST m1", modelStatus: "published", path: null, assignedAt: 0, reason: null }) }} />);
    expect(taken).toContain(detail.qrTaken.replace("{model}", "TEST m1"));
    expect(taken).toContain(`href="${BASE}/povezi?kod=TF000QRS"`);
    expect(taken).not.toContain(`>${detail.qrConfirm}</button>`);
    const panel = renderToStaticMarkup(<ModelStickerForm {...confirmProps} initialStep={{ kind: "confirm", code: "panel", sticker: found(null, { kind: "panel", label: "PANEL-2026-EVENT" }) }} />);
    expect(panel).toContain(detail.qrPanel);
    expect(panel).not.toContain(`>${detail.qrConfirm}</button>`);
  });
});
