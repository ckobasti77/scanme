import { getFunctionName, type FunctionReference } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { QrActions, QrBulkActions } from "@/components/admin/admin-events";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminEventProvider, type AdminEventContextValue } from "@/components/admin/events/event-context";

// Admin UX A4 — the QR detail and the bulk panel call the A4 backend:
// „Promeni odredište“ → fairAdminQr.reassignQr (one atomic mutation), „Dodeli
// model“ → fairAdmin.assignQr, „Ukloni vezu“ → fairAdmin.releaseQr, the bulk
// dry run is a one-shot query and only the confirmation runs the commit.

const calls: [string, unknown][] = [];
vi.mock("convex/react", () => ({
  useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
    calls.push([getFunctionName(ref), args]);
    return { rows: [], summary: { applied: 0, unchanged: 0, errors: 0 } };
  },
  useConvex: () => ({
    query: async (ref: FunctionReference<"query">, args: unknown) => {
      calls.push([getFunctionName(ref), args]);
      return { rows: [], summary: { ok: 0, unchanged: 0, errors: 0 } };
    },
  }),
}));

const { useBulkActions, useQrActions } = await import("./qr-section");

const EVENT_ID = "test-event-id" as Id<"fairEvents">;
const context = { eventId: EVENT_ID, base: "/admin/dogadjaji/test-sajam", catalog: {}, directory: {} } as unknown as AdminEventContextValue;

describe("A4 QR containers", () => {
  test("detail actions and the bulk panel call the A4 functions with the event", async () => {
    let actions: QrActions | null = null;
    let bulk: QrBulkActions | null = null;
    function Probe() {
      actions = useQrActions();
      bulk = useBulkActions();
      return null;
    }
    renderToStaticMarkup(<AdminEventProvider value={context}><Probe /></AdminEventProvider>);
    const qr = actions!;
    const rows = [{ code: "SMQ-TEST-0001", model: "test-em26-volta-x1" }];
    expect(await qr.reassign("7KQ2M9XA", "m2", "TEST nalepnica je na pogrešnom autu")).toEqual({ ok: true, warnings: undefined });
    await qr.assign("m3", "TF000QRS", "TEST prva dodela");
    await qr.assign("m3", "TF000QRS");
    await qr.release("m2", "TEST model povučen");
    expect(await bulk!.dryRun(rows)).toMatchObject({ ok: true });
    await bulk!.commit(rows);
    expect(calls).toEqual([
      ["fairAdminQr:reassignQr", { eventId: EVENT_ID, code: "7KQ2M9XA", toEventModelId: "m2", reason: "TEST nalepnica je na pogrešnom autu" }],
      ["fairAdmin:assignQr", { eventModelId: "m3", resolverCode: "TF000QRS", reason: "TEST prva dodela" }],
      ["fairAdmin:assignQr", { eventModelId: "m3", resolverCode: "TF000QRS" }],
      ["fairAdmin:releaseQr", { eventModelId: "m2", reason: "TEST model povučen" }],
      ["fairAdminQr:bulkAssignQrDryRun", { eventId: EVENT_ID, rows }],
      ["fairAdminQr:bulkAssignQrCommit", { eventId: EVENT_ID, rows }],
    ]);
  });
});
