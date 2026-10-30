import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { CatalogView, LinkStickerActions, ModelView, QrDetailView, RecentLinkView } from "@/components/admin/admin-events";
import type { LinkFlow } from "@/lib/admin-v1/qr-link";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { FAIR_QR_LABEL_DEFAULT_FORMAT } from "@/lib/fair-qr-label";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventLinkStickerView } from "./povezi-view";

// Sajam 2026 N2 — „Poveži nalepnicu“ as SSR markup: the field (series prefix,
// numeric keypad, 16 px+), the sticker states, exhibitors with their stand,
// the cars with status and sticker, the confirmation bar (summary with
// exhibitor and stand, warnings, locked while saving), the confirmation with
// „Poništi“ and „Sledeća“, panels without a link, the recent links. The flow
// logic is in lib/admin-v1/qr-link.test.ts. All data is TEST.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const t = adminEventsSr.linkSticker;
const opening = Date.parse("2026-10-09T09:00:00+02:00");

function model(id: string, participationId: string, extra: Partial<ModelView> = {}): ModelView {
  return {
    id, externalKey: `test-${id}`, displayName: `TEST ${id}`, slug: `test-${id}`, participationId, brandId: `b-${participationId}`, brandName: `TEST Brend ${participationId}`,
    exhibitorName: `TEST Izlagač ${participationId.toUpperCase()}`, standLabel: `TEST štand ${participationId.toUpperCase()}`, tier: "starter", status: "published",
    priceText: "TEST cena", specCount: 2, highlightCount: 1, hasPhoto: false, photoUrl: null, passportEligible: true, packageActivatedAt: opening,
    qrCode: null, qrSmq: null, qrLabel: null, issues: [], ...extra,
  };
}

const catalog: CatalogView = {
  days: [],
  participations: [
    { id: "a", externalKey: "test-a", accountId: "acc-a", exhibitorName: "TEST Izlagač A", codes: "", smkCode: null, smlCode: null, segment: "event_only", status: "active", logoUrl: null },
    { id: "b", externalKey: "test-b", accountId: "acc-b", exhibitorName: "TEST Izlagač B", codes: "", smkCode: null, smlCode: null, segment: "event_only", status: "active", logoUrl: null },
  ],
  stands: [
    { id: "s-b", participationId: "b", externalKey: "test-stand-b", code: "1A", displayName: "TEST štand B", mapLocationId: "hala-1a", exhibitorName: "TEST Izlagač B", status: "active" },
    { id: "s-a", participationId: "a", externalKey: "test-stand-a", code: "2", displayName: "TEST štand A", mapLocationId: "hala-2", exhibitorName: "TEST Izlagač A", status: "active" },
  ],
  models: [
    model("m1", "a", { qrCode: "7KQ2M9XA", qrSmq: "SMQ-TEST-0001", qrLabel: "SA26-001" }),
    model("m2", "a"),
    model("m3", "a", { status: "draft" }),
    model("m4", "a", { status: "withdrawn" }),
    model("m5", "b"),
  ],
  qrConfigured: true,
};

function sticker(extra: Partial<QrDetailView> = {}): QrDetailView {
  return {
    cardId: "c40", accessChannelId: "ch40", resolverCode: "TF000QRS", label: "SA26-040", kind: "sticker", smqCode: "SMQ-TEST-0300",
    channelState: "problem", problemReason: "destination_missing", redirectEnabled: true, totalScansAllTime: 0,
    current: null, history: [], historyCapped: false, stats: null, lastScanAt: null, ...extra,
  };
}

const linkedToM1 = sticker({
  resolverCode: "7KQ2M9XA", label: "SA26-001", channelState: "active", problemReason: null,
  current: { assignmentId: "as1", sameEvent: true, eventTitle: "TEST", eventModelId: "m1", modelLabel: "TEST m1", modelStatus: "published", path: "/sajam/test/model/test-m1", assignedAt: opening, reason: null },
});
const panel = sticker({ resolverCode: "TP000QRS", label: "PANEL-2026-EVENT", kind: "panel", channelState: "active", problemReason: null });

const recent: RecentLinkView[] = [
  { assignmentId: "as1", label: "SA26-001", modelId: "m1", modelName: "TEST m1", exhibitorName: "TEST Izlagač A", standCode: "2", linkedAt: opening, linkedByName: "TEST admin", canUndo: true },
  { assignmentId: "as0", label: "SA26-002", modelId: "m5", modelName: "TEST m5", exhibitorName: "TEST Izlagač B", standCode: "1A", linkedAt: opening - 3_600_000, linkedByName: "TEST admin", canUndo: false },
];

const actions: LinkStickerActions = {
  link: async () => ({ ok: false, code: "ACTION_FAILED" }),
  undo: async () => ({ ok: true, value: { restoredToModelId: null, restoredReplacedLabel: null } }),
};

function html(query: AdminQueryState, detail: QrDetailView | null | undefined, initialFlow?: LinkFlow) {
  return renderToStaticMarkup(
    <EventLinkStickerView
      catalog={catalog}
      labelFormat={FAIR_QR_LABEL_DEFAULT_FORMAT}
      query={query}
      onQueryChange={() => undefined}
      sticker={detail}
      recent={recent}
      actions={actions}
      qrHref={(code) => `/admin/dogadjaji/test/qr/${code}`}
      initialFlow={initialFlow}
    />,
  );
}

/** The markup of the sticky confirmation bar. */
function bar(markup: string) {
  const start = markup.indexOf("data-link-bar");
  return markup.slice(start, markup.indexOf("</section>", start));
}

describe("N2 Poveži nalepnicu — the phone screen", () => {
  test("empty: the field has the series prefix, a numeric keypad and 16 px+ text; exhibitors in stand order with their stand", () => {
    const markup = html({}, undefined);
    expect(markup).toContain(">SA26-</span>");
    expect(markup).toMatch(/<input[^>]*inputMode="numeric"[^>]*class="[^"]*text-2xl/);
    expect(markup).toContain(t.stickerEmpty);
    // 1A (TEST Izlagač B) before 2 (TEST Izlagač A); search field 16 px on the phone.
    expect(markup.indexOf("TEST Izlagač B")).toBeLessThan(markup.indexOf("TEST Izlagač A"));
    expect(markup).toContain(fmt(t.exhibitorStand, { stands: "1A" }));
    expect(markup).toMatch(/type="search"[^>]*class="[^"]*max-sm:text-base/);
    // P2: each exhibitor names the brands of its cars (what the sticker team sees on the car).
    expect(markup).toContain("data-exhibitor-brands=\"true\">TEST Brend a</span>");
    expect(markup).toContain("data-exhibitor-brands=\"true\">TEST Brend b</span>");
    expect(markup).toContain(t.pickExhibitorFirst);
    expect(bar(markup)).toContain(t.barPick);
    expect(bar(markup)).toMatch(/<button[^>]*disabled=""[^>]*>Poveži<\/button>/);
    // Recent links: undo only where it is still allowed.
    expect(markup).toContain(fmt(t.recentUndoAria, { label: "SA26-001" }));
    expect(markup).not.toContain(fmt(t.recentUndoAria, { label: "SA26-002" }));
  });

  test("a free sticker, the chosen exhibitor and its cars with status and sticker", () => {
    const markup = html({ kod: "SA26-040", izlagac: "a" }, sticker());
    expect(markup).toContain('value="040"');
    expect(markup).toContain(`>${t.stateFree}<`);
    expect(markup).toContain(t.freeBody);
    expect(markup).toContain("data-exhibitor-chosen");
    expect(markup).toContain(fmt(t.carHasSticker, { label: "SA26-001" }));
    expect(markup).toContain(`>${adminEventsSr.modelStatus.draft}<`);
    expect(markup).toContain(t.carWithdrawn);
    expect(markup).toMatch(/role="radio" aria-checked="false" disabled=""/);
  });

  test("the confirmation bar names sticker, car, brand, stand and exhibitor; a draft is warned", () => {
    const markup = bar(html({ kod: "SA26-040", izlagac: "a", model: "m3" }, sticker()));
    expect(markup).toContain(fmt(t.barSummary, { label: "SA26-040", model: "TEST m3", brand: "TEST Brend a", stand: "TEST štand A" }));
    expect(markup).toContain("TEST Izlagač A");
    expect(markup).toContain(t.warnDraft);
    expect(markup).toMatch(/<button[^>]*>Poveži<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Poveži<\/button>/);
  });

  test("moving from another car and replacing the car's sticker are warned before the one main button", () => {
    const move = bar(html({ kod: "SA26-001", izlagac: "a", model: "m2" }, linkedToM1));
    expect(move).toContain(fmt(t.warnMove, { model: "TEST m1" }));
    expect(move).toContain(`>${t.confirmMove}</button>`);
    const replace = bar(html({ kod: "SA26-040", izlagac: "a", model: "m1" }, sticker()));
    expect(replace).toContain(fmt(t.warnReplace, { label: "SA26-001" }));
    expect(replace).toContain(`>${t.confirmReplace}</button>`);
    const same = bar(html({ kod: "SA26-001", izlagac: "a", model: "m1" }, linkedToM1));
    expect(same).toContain(t.blockSame);
  });

  test("while saving every action is locked (no double send)", () => {
    const markup = html({ kod: "SA26-040", izlagac: "a", model: "m2" }, sticker(), { step: "saving" });
    expect(bar(markup)).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>Čuvam…<\/button>/);
    expect(markup).toMatch(/<input[^>]*inputMode="numeric"[^>]*disabled=""/);
    expect(markup).toMatch(/role="radio" aria-checked="true" disabled=""/);
  });

  test("after the save: a green summary with exhibitor and stand, „Poništi“ and „Sledeća: SA26-041“", () => {
    const flow: LinkFlow = { step: "done", done: { assignmentId: "as9", label: "SA26-040", modelId: "m2", modelStatus: "published", created: true }, undo: "idle", error: null };
    const markup = bar(html({ kod: "SA26-040", izlagac: "a", model: "m2" }, sticker(), flow));
    expect(markup).toContain("data-link-done");
    expect(markup).toContain(fmt(t.doneBody, { label: "SA26-040", model: "TEST m2", exhibitor: "TEST Izlagač A", stand: "TEST štand A" }));
    expect(markup).toContain(t.undo);
    expect(markup).toContain(fmt(t.next, { label: "SA26-041" }));
    expect(markup).toContain('aria-live="polite"');
    const undone = bar(html({ kod: "SA26-040", izlagac: "a", model: "m2" }, sticker(), { ...flow, undo: "undone" }));
    expect(undone).toContain(t.undone);
    expect(undone).toMatch(/<button[^>]*disabled=""[^>]*>.*Poništi<\/button>/);
  });

  test("a panel is shown as a panel and cannot be linked to a car", () => {
    const markup = html({ kod: "PANEL-2026-EVENT", izlagac: "a", model: "m2" }, panel);
    expect(markup).toContain(`>${t.statePanel}<`);
    expect(markup).toContain(t.panelBody);
    expect(bar(markup)).toContain(t.blockPanel);
    expect(bar(markup)).toMatch(/<button[^>]*disabled=""[^>]*>Poveži<\/button>/);
  });

  test("an unknown code, a loading sticker and a conflict error are explained in Serbian", () => {
    expect(html({ kod: "SA26-099" }, null)).toContain(fmt(t.stickerNotFound, { code: "SA26-099" }));
    expect(html({ kod: "SA26-040" }, undefined)).toContain(t.stickerLoading);
    const conflict = html({ kod: "SA26-040", izlagac: "a", model: "m2" }, sticker(), { step: "pick", error: "FAIR_QR_HOLDER_CHANGED" });
    expect(conflict).toContain(adminEventsSr.issues.FAIR_QR_HOLDER_CHANGED);
    expect(conflict).not.toMatch(/FAIR_[A-Z_]+/);
  });
});
