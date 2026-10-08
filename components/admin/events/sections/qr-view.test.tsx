import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { CatalogView, InventoryRowView, ModelView, QrDetailView, QrScanStatsView } from "@/components/admin/admin-events";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { eventDetailHref, eventSectionHref } from "@/lib/admin-v1/event-sections";
import { qrListQuery } from "@/lib/admin-v1/qr-filters";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { fmt } from "@/lib/i18n/format";
import { EventQrDetailView, EventQrView, QrBulkPanel, QrConfirmPanel, QrFlowForm, qrTargetHierarchy } from "./qr-view";

// Admin UX A4 — QR list (hierarchy + stanje + search, Tabela/Kartice, scan
// columns, „Upravljaj“), „Dodela u većem broju“ and the QR detail (where it
// leads, change of destination, remove link, test, stats, history) as SSR
// markup, like the other admin views. Interaction logic is in
// lib/admin-v1/qr-*.test.ts.

// The shared next/link stub drops every prop except href/className; the
// accessible names of the links are checked here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const list = adminEventsSr.qrList;
const detail = adminEventsSr.qrDetail;
const bulk = adminEventsSr.qrBulk;
const BASE = "/admin/dogadjaji/test-sajam";
const opening = Date.parse("2026-10-09T09:00:00+02:00");

function model(id: string, participationId: string, brandId: string, extra: Partial<ModelView> = {}): ModelView {
  return {
    id, externalKey: `test-em26-${id}`, displayName: `TEST ${id}`, slug: `test-${id}`, participationId, brandId, brandName: `TEST Brend ${brandId}`,
    exhibitorName: `TEST Izlagač ${participationId.toUpperCase()}`, standLabel: "TEST štand", tier: "starter", status: "published",
    priceText: "TEST cena", specCount: 2, highlightCount: 1, hasPhoto: false, photoUrl: null, passportEligible: true, packageActivatedAt: opening,
    qrCode: null, qrSmq: null, issues: [], ...extra,
  };
}

const catalog: CatalogView = {
  days: [],
  participations: [],
  stands: [],
  models: [
    model("m1", "a", "b1", { qrCode: "7KQ2M9XA", qrSmq: "SMQ-TEST-0001" }),
    model("m2", "a", "b2", { qrCode: "R4T8W2PQ", qrSmq: "SMQ-TEST-0002" }),
    model("m3", "b", "b3"),
  ],
  qrConfigured: true,
};

const rows: InventoryRowView[] = [
  { cardId: "c1", resolverCode: "7KQ2M9XA", smqCode: "SMQ-TEST-0001", state: "active", problemReason: null, assignment: { modelId: "m1", sameEvent: true } },
  { cardId: "c2", resolverCode: "R4T8W2PQ", smqCode: "SMQ-TEST-0002", state: "active", problemReason: null, assignment: { modelId: "m2", sameEvent: true } },
  { cardId: "c3", resolverCode: "TF000QRS", smqCode: "SMQ-TEST-0300", state: "problem", problemReason: "destination_missing", assignment: null },
  { cardId: "c4", resolverCode: "TD000QRS", smqCode: "SMQ-TEST-0500", state: "active", problemReason: null, assignment: { modelId: "amf-1", sameEvent: false } },
  { cardId: "c5", resolverCode: "TN000QRS", smqCode: "SMQ-TEST-0600", state: "inactive", problemReason: null, assignment: null },
];
const stats = new Map<string, QrScanStatsView>([
  ["c1", { total: 12, unique: 9, lastScanAt: opening + 3_600_000 }],
  ["c2", { total: 0, unique: 0, lastScanAt: null }],
]);

const ok = async () => ({ ok: true as const });
const resolveTest = async () => ({ ok: true as const, value: { outcome: "fair_model" as const, problem: null, path: "/sajam/test/model/test-m1" } });
const bulkActions = { dryRun: async () => ({ ok: true as const, value: { rows: [], summary: { ok: 0, unchanged: 0, errors: 0 } } }), commit: async () => ({ ok: true as const, value: { rows: [], summary: { applied: 0, unchanged: 0, errors: 0 } } }) };

function listHtml(query: AdminQueryState, view: "tabela" | "kartice" = "tabela", extra: Partial<Parameters<typeof EventQrView>[0]> = {}) {
  const listQuery = qrListQuery(query);
  return renderToStaticMarkup(
    <AdminViewModeOverride value={view}>
      <EventQrView
        catalog={catalog}
        inventory={{ rows, status: "ready", canLoadMore: false, loadingMore: false, onLoadMore: () => undefined }}
        stats={stats}
        query={query}
        onQueryChange={() => undefined}
        qrHref={(code) => eventDetailHref(BASE, "qr", code, listQuery)}
        modelHref={(id) => eventDetailHref(BASE, "modeli", id)}
        bulk={bulkActions}
        actions={{ resolveTest }}
        {...extra}
      />
    </AdminViewModeOverride>,
  );
}

const count = (html: string, text: string) => html.split(text).length - 1;

describe("A4 QR list", () => {
  test("filters: hierarchy, stanje with counts and search; every code has „Upravljaj“, nothing frees a code", () => {
    const html = listHtml({});
    for (const text of [list.hierarchyLabel, list.searchLabel, list.facetState, adminEventsSr.colExhibitor, `role="combobox"`]) expect(html).toContain(text);
    expect(html).toContain(`${list.states.slobodan} (1)`);
    expect(html).toContain(`${list.states.ovaj} (2)`);
    expect(html).toContain(`${list.states.drugi} (1)`);
    expect(html).toContain(`${list.states.neaktivan} (1)`);
    expect(html).toContain(fmt(list.count, { shown: 5, total: 5 }));
    expect(count(html, `>${list.manage}<`)).toBe(5);
    expect(html).toContain(`aria-label="${fmt(list.manageAria, { code: "SMQ-TEST-0001" })}"`);
    expect(html).toContain(`href="${BASE}/qr/7KQ2M9XA"`);
    expect(html).not.toMatch(/oslobodi/i);
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
  });

  test("Tabela: SMQ and code, state badge, izlagač · brend · model, scans total/unique and last scan", () => {
    const html = listHtml({});
    for (const header of [list.colCode, list.colState, list.colModel, list.colScans, list.colLastScan]) expect(html).toContain(header);
    expect(html).toContain("SMQ-TEST-0001");
    expect(html).toContain("7KQ2M9XA");
    expect(html).toContain(`href="${BASE}/modeli/m1"`);
    expect(html).toContain("TEST Izlagač A · TEST Brend b1");
    expect(html).toContain(fmt(list.scansTotal, { count: 12 }));
    expect(html).toContain(fmt(list.scansUnique, { count: 9 }));
    expect(html).toContain(list.modelOtherEvent);
    expect(html).toContain(list.modelNone);
    expect(html).toContain('data-view-mode="tabela"');
  });

  test("Kartice show the same fields and action", () => {
    const html = listHtml({}, "kartice");
    expect(html).toContain('data-view-mode="kartice"');
    expect(html).toContain('data-admin-primitive="data-card"');
    expect(count(html, `>${list.manage}<`)).toBe(5);
    expect(html).toContain(fmt(list.scansTotal, { count: 12 }));
  });

  test("a filter narrows the list, links keep it, chips remove it; no match offers Očisti", () => {
    const html = listHtml({ stanje: "ovaj", izlagac: "a" });
    expect(html).toContain(fmt(list.count, { shown: 2, total: 5 }));
    expect(html).toContain(`href="${BASE}/qr/7KQ2M9XA?izlagac=a&amp;stanje=ovaj"`);
    expect(html).toContain(`${list.facetState}: ${list.states.ovaj}`);
    const none = listHtml({ stanje: "slobodan", izlagac: "a" });
    expect(none).toContain(list.noMatchTitle);
    expect(none).toContain(fmt(list.count, { shown: 0, total: 5 }));
  });

  test("a whole typed code offers its detail; partial loads say so; an unconfigured inventory is explained", () => {
    expect(listHtml({ q: "smq-test-0999" })).toContain(fmt(list.openCode, { code: "SMQ-TEST-0999" }));
    expect(listHtml({ q: "volta" })).not.toContain(fmt(list.openCode, { code: "VOLTA" }));
    const partial = listHtml({}, "tabela", { inventory: { rows, status: "ready", canLoadMore: true, loadingMore: false, onLoadMore: () => undefined } });
    expect(partial).toContain(fmt(list.partial, { loaded: 5 }));
    expect(partial).toContain(adminEventsSr.loadMore);
    expect(listHtml({}, "tabela", { catalog: { ...catalog, qrConfigured: false } })).toContain(adminEventsSr.qrNotConfigured);
  });
});

describe("A4 Dodela u većem broju", () => {
  test("two pasted columns, a dry run first and nothing written before the confirmation", () => {
    const html = renderToStaticMarkup(<QrBulkPanel catalog={catalog} bulk={bulkActions} initialOpen />);
    for (const text of [bulk.title, bulk.textLabel, bulk.check, fmt(bulk.help, { max: 100 })]) expect(html).toContain(text);
    expect(html).toContain("<textarea");
    expect(html).toContain('aria-expanded="true"');
    // The commit button exists only after a successful check.
    expect(html).not.toContain(bulk.confirm);
    const closed = renderToStaticMarkup(<QrBulkPanel catalog={catalog} bulk={bulkActions} />);
    expect(closed).toContain('aria-expanded="false"');
  });
});

const assigned: QrDetailView = {
  cardId: "c1", accessChannelId: "ch1", resolverCode: "7KQ2M9XA", smqCode: "SMQ-TEST-0001", channelState: "active", problemReason: null, redirectEnabled: true,
  totalScansAllTime: 15,
  current: { assignmentId: "as1", sameEvent: true, eventTitle: "TEST Sajam", eventModelId: "m1", modelLabel: "TEST m1", modelStatus: "published", path: "/sajam/test-sajam/model/test-m1", assignedAt: opening, reason: "TEST dodela" },
  history: [
    { assignmentId: "as1", status: "assigned", sameEvent: true, eventModelId: "m1", modelLabel: "TEST m1", assignedAt: opening, releasedAt: null, reason: "TEST zamena nalepnice" },
    { assignmentId: "as0", status: "released", sameEvent: true, eventModelId: "m3", modelLabel: "TEST m3", assignedAt: opening - 86_400_000, releasedAt: opening, reason: "TEST zamena nalepnice" },
  ],
  historyCapped: false,
  stats: { total: 12, unique: 9 },
  lastScanAt: opening + 3_600_000,
};
const qrActions = { reassign: ok, assign: ok, release: ok, resolveTest };

function detailHtml(view: QrDetailView | null | undefined, extra: Partial<Parameters<typeof EventQrDetailView>[0]> = {}) {
  return renderToStaticMarkup(
    <EventQrDetailView
      catalog={catalog}
      code="7KQ2M9XA"
      detail={view}
      actions={qrActions}
      listHref={eventSectionHref(BASE, "qr", { stanje: "ovaj" })}
      modelHref={(id) => eventDetailHref(BASE, "modeli", id)}
      generalQrHref={(row) => `/admin/operativa/qr?code=${row.resolverCode}&channel=${row.accessChannelId}`}
      {...extra}
    />,
  );
}

describe("A4 QR detail", () => {
  test("an assigned code: where it leads, Promeni odredište, Ukloni vezu, test, stats, history and the links", () => {
    const html = detailHtml(assigned);
    for (const text of [
      detail.whereTitle, "/sajam/test-sajam/model/test-m1", detail.changeTitle, detail.removeTitle, detail.removeHelp, adminEventsSr.resolveTitle,
      detail.statsTitle, detail.statsTotal, ">12<", ">9<", detail.statsAllTime, ">15<", detail.historyTitle, detail.historyActive, detail.historyReleased,
      fmt(detail.reasonSummary, { reason: "TEST zamena nalepnice" }), detail.generalAdmin, adminEventsSr.backToList, detail.openModel,
    ]) expect(html).toContain(text);
    expect(html).toContain(`href="${BASE}/qr?stanje=ovaj"`);
    expect(html).toContain(`href="${BASE}/modeli/m1"`);
    expect(html).toContain(`href="${BASE}/modeli/m3"`);
    expect(html).toContain('href="/admin/operativa/qr?code=7KQ2M9XA&amp;channel=ch1"');
    // The resolve test starts with this code.
    expect(html).toContain('value="7KQ2M9XA"');
    // No change happens on one click: both actions only start the flow.
    expect(html).not.toContain(detail.confirmChange);
    expect(html).not.toContain(detail.confirmRemove);
    expect(html).not.toMatch(/oslobodi/i);
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
  });

  test("a free code offers Dodeli model and explains the neutral page; no Ukloni vezu", () => {
    const html = detailHtml({ ...assigned, current: null, history: [], stats: null, lastScanAt: null, channelState: "problem", problemReason: "destination_missing" });
    expect(html).toContain(detail.whereFree);
    expect(html).toContain(detail.assignTitle);
    expect(html).toContain(detail.statsNone);
    expect(html).toContain(detail.statsNever);
    expect(html).toContain(detail.historyEmpty);
    expect(html).not.toContain(detail.removeTitle);
    expect(html).not.toContain(detail.changeTitle);
  });

  test("N2: a panel has its own state, the right text and no assignment (no Dodeli model, no Ukloni vezu)", () => {
    const html = detailHtml({ ...assigned, kind: "panel", label: "PANEL-2026-EVENT", current: null, history: [], stats: null, lastScanAt: null });
    expect(html).toContain(`>${list.states.panel}<`);
    expect(html).toContain(detail.wherePanel);
    expect(html).toContain(detail.panelNote);
    expect(html).not.toContain(detail.whereFree);
    expect(html).not.toContain(detail.assignTitle);
    expect(html).not.toContain(detail.changeTitle);
    expect(html).not.toContain(detail.removeTitle);
  });

  test("a code of the other event cannot be changed here; unknown and loading states", () => {
    const other = detailHtml({ ...assigned, current: { ...assigned.current!, sameEvent: false, eventTitle: "TEST AMF", eventModelId: "amf-1" }, stats: null });
    expect(other).toContain(fmt(detail.whereOtherEvent, { event: "TEST AMF" }));
    expect(other).not.toContain(detail.changeTitle);
    expect(other).not.toContain(detail.removeTitle);
    expect(detailHtml(null)).toContain(fmt(detail.notFoundBody, { code: "7KQ2M9XA" }));
    expect(detailHtml(undefined)).toContain(detail.loading);
    expect(detailHtml(undefined, { failed: true })).toContain(detail.errorTitle);
  });
});

describe("A4 confirmation flow (markup of each step)", () => {
  test("the edit step: model picker (current target and models with a QR not selectable), reason and Nastavi only when complete", () => {
    const data = qrTargetHierarchy(catalog.models, { modelId: "m1", resolverCode: "7KQ2M9XA" });
    expect(data.models.find((row) => row.id === "m1")?.disabledReason).toBe(detail.pickCurrent);
    expect(data.models.find((row) => row.id === "m2")?.disabledReason).toBe(fmt(detail.pickHasQr, { code: "SMQ-TEST-0002" }));
    expect(data.models.find((row) => row.id === "m3")?.disabledReason).toBeUndefined();
    const form = (flow: Parameters<typeof QrFlowForm>[0]["flow"]) => renderToStaticMarkup(
      <QrFlowForm flow={flow} pickData={flow.action === "release" ? null : data} currentModelId="m1" onTarget={() => undefined} onReason={() => undefined} onReview={() => undefined} onCancel={() => undefined} />,
    );
    const empty = form({ step: "edit", action: "reassign", reason: "" });
    expect(empty).toContain(detail.pickLabel);
    expect(empty).toContain('role="combobox"');
    expect(empty).toContain(detail.reasonLabel);
    expect(empty).toContain(detail.problems.target_missing);
    expect(empty).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Nastavi<\/button>/);
    const ready = form({ step: "edit", action: "reassign", targetModelId: "m3", reason: "TEST nalepnica je na pogrešnom autu" });
    expect(ready).toMatch(/<button type="submit"[^>]*>Nastavi<\/button>/);
    expect(ready).not.toMatch(/<button type="submit"[^>]*disabled=""/);
    const release = form({ step: "edit", action: "release", reason: "" });
    expect(release).not.toContain('role="combobox"');
    expect(release).toContain(fmt(detail.problems.reason_short, { min: 3 }));
  });

  test("the confirm step names the code, the old and new model and the reason; danger tone for a removal", () => {
    const panel = renderToStaticMarkup(
      <QrConfirmPanel
        title={detail.confirmChangeTitle}
        body={fmt(detail.confirmChangeBody, { code: "SMQ-TEST-0001", from: "TEST m1", to: "TEST m3" })}
        reason="TEST nalepnica je na pogrešnom autu"
        confirmLabel={detail.confirmChange}
        pending={false}
        onConfirm={() => undefined}
        onBack={() => undefined}
      />,
    );
    for (const text of [detail.confirmChangeTitle, "SMQ-TEST-0001", "TEST m1", "TEST m3", fmt(detail.reasonSummary, { reason: "TEST nalepnica je na pogrešnom autu" }), detail.confirmChange, detail.back]) {
      expect(panel).toContain(text);
    }
    expect(panel).toContain('role="group"');
    expect(panel).toContain('data-qr-confirm="default"');
    const danger = renderToStaticMarkup(<QrConfirmPanel title={detail.confirmRemoveTitle} body="x" confirmLabel={detail.confirmRemove} tone="danger" pending onConfirm={() => undefined} onBack={() => undefined} />);
    expect(danger).toContain('data-qr-confirm="danger"');
    expect(danger).toMatch(/disabled=""[^>]*>Potvrdi uklanjanje/);
  });
});

describe("No „Oslobodi“ anywhere in the admin", () => {
  test("no admin dictionary has a button or text „Oslobodi“", () => {
    const dictionaries = import.meta.glob("../../../../lib/i18n/sr/admin*.ts", { eager: true });
    expect(Object.keys(dictionaries).length).toBeGreaterThan(5);
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(dictionaries);
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.filter((text) => /\boslobodi\b/i.test(text))).toEqual([]);
  });
});

describe("sticker labels and the real QR (Izlagači 2026)", () => {
  // TS26 = a TEST print series (the printed one is SA26); SSR draws the production address.
  const labelled: InventoryRowView[] = [
    { ...rows[2], cardId: "s2", label: "TS26-002" },
    { ...rows[0], label: "TS26-001" },
  ];
  const labelledHtml = (view: "tabela" | "kartice") => renderToStaticMarkup(
    <AdminViewModeOverride value={view}>
      <EventQrView
        catalog={catalog}
        inventory={{ rows: labelled, status: "ready", canLoadMore: false, loadingMore: false, onLoadMore: () => undefined }}
        stats={stats}
        query={{}}
        onQueryChange={() => undefined}
        qrHref={(code) => eventDetailHref(BASE, "qr", code)}
        modelHref={(id) => eventDetailHref(BASE, "modeli", id)}
        bulk={bulkActions}
        actions={{ resolveTest }}
      />
    </AdminViewModeOverride>,
  );

  test("a card shows the sticker label with the codes under it and a scannable QR of the code instead of the icon", () => {
    const html = labelledHtml("kartice");
    expect(html.indexOf(">TS26-001<")).toBeGreaterThan(-1);
    expect(html.indexOf(">TS26-001<")).toBeLessThan(html.indexOf(">TS26-002<"));
    expect(html).toContain(">SMQ-TEST-0001 · 7KQ2M9XA<");
    expect(html).toContain('data-qr-url="https://scanme.rs/r/7KQ2M9XA"');
    expect(html).toContain('data-qr-url="https://scanme.rs/r/TF000QRS"');
    expect(html).toContain(`aria-label="${fmt(list.qrAria, { code: "TS26-001" })}"`);
    expect(html).toMatch(/<svg viewBox="0 0 \d+ \d+" role="img"/);
    expect(html).toContain(`aria-label="${fmt(list.manageAria, { code: "TS26-001" })}"`);
  });

  test("Tabela: the label above SMQ and code; a code without a label keeps the SMQ as its name", () => {
    const html = labelledHtml("tabela");
    expect(html).toMatch(/<strong[^>]*>TS26-001<\/strong>/);
    expect(listHtml({})).toMatch(/<span class="text-sm font-semibold">SMQ-TEST-0001<\/span>/);
  });

  test("the detail: the label as the title, the big QR with its address, copy and open", () => {
    const html = detailHtml({ ...assigned, label: "TS26-001" });
    expect(html).toMatch(/<h2[^>]*>TS26-001<\/h2>/);
    expect(html).toContain(detail.factLabel);
    expect(html).toContain('data-qr-url="https://scanme.rs/r/7KQ2M9XA"');
    expect(html).toContain(">https://scanme.rs/r/7KQ2M9XA<");
    expect(html).toContain(detail.copyAddress);
    expect(html).toMatch(/<a href="https:\/\/scanme\.rs\/r\/7KQ2M9XA" target="_blank" rel="noopener noreferrer"/);
    // A card whose label is its resolver code has no sticker label.
    const plain = detailHtml({ ...assigned, label: "7KQ2M9XA" });
    expect(plain).toMatch(/<h2[^>]*>SMQ-TEST-0001<\/h2>/);
  });
});
