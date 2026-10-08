import { describe, expect, test } from "vitest";
import {
  exhibitorCars,
  filterLinkExhibitors,
  isQrConflict,
  LINK_FLOW_START,
  linkExhibitors,
  linkFlowReducer,
  linkPlan,
  linkStickerArgs,
  nextStickerLabel,
  stickerCodeFromInput,
  stickerNumberOf,
  type LinkDone,
  type LinkFlow,
  type LinkModelSource,
  type LinkStickerFacts,
} from "./qr-link";

// Sajam 2026 N2 — „Poveži nalepnicu“: the typed number, exhibitors in stand
// order, the cars of one exhibitor, what a link would do and the save /
// confirm / undo steps. All names are TEST.

const car = (id: string, participationId: string, extra: Partial<LinkModelSource> = {}): LinkModelSource => ({
  id, participationId, displayName: `TEST ${id}`, brandName: "TEST Brend", standLabel: "TEST štand", status: "published", qrCode: null, ...extra,
});

describe("the sticker number", () => {
  test("a typed number becomes the label of the series; a whole SMQ or resolver code stays itself", () => {
    expect(stickerCodeFromInput("7")).toBe("SA26-007");
    expect(stickerCodeFromInput("sa26 7")).toBe("SA26-007");
    expect(stickerCodeFromInput("smq-test-0001")).toBe("SMQ-TEST-0001");
    expect(stickerCodeFromInput("7kq2m9xa")).toBe("7KQ2M9XA");
    for (const text of ["", "0", "101", "sedam"]) expect(stickerCodeFromInput(text)).toBeNull();
  });

  test("the field shows the number of a label of the series, padded", () => {
    expect(stickerNumberOf("SA26-007")).toBe("007");
    expect(stickerNumberOf("SA26-100")).toBe("100");
    expect(stickerNumberOf("PANEL-2026-EVENT")).toBeNull();
    expect(stickerNumberOf("TS26-007")).toBeNull();
    expect(stickerNumberOf(null)).toBeNull();
  });

  test("„Sledeća“ is the next label; none after the last one", () => {
    expect(nextStickerLabel("SA26-007")).toBe("SA26-008");
    expect(nextStickerLabel("SA26-099")).toBe("SA26-100");
    expect(nextStickerLabel("SA26-100")).toBeNull();
    expect(nextStickerLabel("PANEL-2026-EVENT")).toBeNull();
  });
});

describe("exhibitors and cars", () => {
  const participations = [
    { id: "p10b", exhibitorName: "TEST Deset B", status: "active" },
    { id: "p2", exhibitorName: "TEST Dva", logoUrl: "https://example.com/logo.svg", status: "active" },
    { id: "p1a", exhibitorName: "TEST Jedan A", status: "active" },
    { id: "pnone", exhibitorName: "TEST Bez štanda", status: "active" },
    { id: "pnocar", exhibitorName: "TEST Bez auta", status: "active" },
    { id: "pout", exhibitorName: "TEST Povučen", status: "withdrawn" },
  ];
  const stands = [
    { participationId: "p10b", code: "10B", status: "active" },
    { participationId: "p2", code: "2", status: "active" },
    { participationId: "p1a", code: "1A", status: "active" },
    { participationId: "pnocar", code: "3", status: "active" },
    { participationId: "pout", code: "4", status: "active" },
  ];
  const models = [car("a", "p10b"), car("b", "p2"), car("c", "p1a"), car("d", "pnone"), car("e", "pout"), car("f", "pnocar", { status: "withdrawn" })];

  test("in stand order (1A, 2, 10B), without a stand last; only active exhibitors with a car", () => {
    const rows = linkExhibitors(participations, stands, models);
    expect(rows.map((row) => [row.id, row.stands, row.cars])).toEqual([["p1a", ["1A"], 1], ["p2", ["2"], 1], ["p10b", ["10B"], 1], ["pnone", [], 1]]);
    expect(rows[1].logoUrl).toBe("https://example.com/logo.svg");
  });

  test("search by name or stand, every word, without case or diacritics", () => {
    const rows = linkExhibitors(participations, stands, models);
    expect(filterLinkExhibitors(rows, "deset").map((row) => row.id)).toEqual(["p10b"]);
    expect(filterLinkExhibitors(rows, "10b").map((row) => row.id)).toEqual(["p10b"]);
    expect(filterLinkExhibitors(rows, "standa").map((row) => row.id)).toEqual(["pnone"]);
    expect(filterLinkExhibitors(rows, "  ")).toHaveLength(4);
  });

  test("P2: each exhibitor shows the brands of its cars and is found by brand; two exhibitors may share a stand", () => {
    const shared = linkExhibitors(
      [{ id: "gm", exhibitorName: "TEST Grand", status: "active" }, { id: "mig", exhibitorName: "TEST Mig", status: "active" }, { id: "cubi", exhibitorName: "TEST Cubi", status: "active" }],
      [{ participationId: "gm", code: "6", status: "active" }, { participationId: "mig", code: "6", status: "active" }, { participationId: "cubi", code: "9", status: "active" }],
      [
        car("m1", "gm", { brandName: "TEST Chery" }), car("m2", "gm", { brandName: "TEST Mazda" }), car("m3", "gm", { brandName: "TEST Chery" }),
        car("f1", "mig", { brandName: "TEST Foton" }), car("j1", "cubi", { brandName: "TEST Jmev" }), car("j2", "cubi", { brandName: "TEST Jmev Povučen", status: "withdrawn" }),
      ],
    );
    expect(shared.map((row) => [row.name, row.stands, row.brands, row.cars])).toEqual([
      ["TEST Grand", ["6"], ["TEST Chery", "TEST Mazda"], 3],
      ["TEST Mig", ["6"], ["TEST Foton"], 1],
      ["TEST Cubi", ["9"], ["TEST Jmev"], 1],
    ]);
    expect(filterLinkExhibitors(shared, "jmev").map((row) => row.id)).toEqual(["cubi"]);
    expect(filterLinkExhibitors(shared, "mazda").map((row) => row.id)).toEqual(["gm"]);
    expect(filterLinkExhibitors(shared, "6").map((row) => row.id)).toEqual(["gm", "mig"]);
  });

  test("the cars of one exhibitor by name, withdrawn last", () => {
    const own = [car("x2", "p1", { displayName: "TEST Volta X2" }), car("x1", "p1", { displayName: "TEST Volta X1", status: "withdrawn" }), car("a1", "p1", { displayName: "TEST Amper" }), car("o", "p2")];
    expect(exhibitorCars(own, "p1").map((row) => row.id)).toEqual(["a1", "x2", "x1"]);
  });
});

describe("linkPlan — what a link would do", () => {
  const free: LinkStickerFacts = { resolverCode: "TF000QRS", label: "SA26-040", kind: "sticker", holder: null, outOfService: false };

  test("a free sticker on a published car without a sticker: nothing to warn", () => {
    expect(linkPlan(free, car("m1", "p1"))).toEqual({ block: null, warnings: [], expectedHolderModelId: null, replaceModelSticker: false, holderModelId: null, replacedCode: null });
  });

  test("draft, move from another car and replacement of the car's sticker are warned, with the linkSticker arguments", () => {
    const held = { ...free, holder: { modelId: "m9", sameEvent: true } };
    expect(linkPlan(held, car("m1", "p1", { status: "draft", qrCode: "OLD00QRS", qrLabel: "SA26-001" }))).toEqual({
      block: null, warnings: ["draft", "move", "replace"], expectedHolderModelId: "m9", replaceModelSticker: true, holderModelId: "m9", replacedCode: "OLD00QRS",
    });
    expect(linkPlan({ ...free, outOfService: true }, car("m1", "p1")).warnings).toEqual(["out_of_service"]);
  });

  test("P2 (RN N3): the screen sends what the admin saw — the holder and the car's other sticker (null = none)", () => {
    const held = { ...free, holder: { modelId: "m9", sameEvent: true } };
    expect(linkStickerArgs("TF000QRS", "m1", linkPlan(held, car("m1", "p1", { qrCode: "OLD00QRS" })))).toEqual({
      code: "TF000QRS", modelId: "m1", expectedHolderModelId: "m9", replaceModelSticker: true, expectedModelStickerCode: "OLD00QRS",
    });
    expect(linkStickerArgs("TF000QRS", "m1", linkPlan(free, car("m1", "p1")))).toEqual({
      code: "TF000QRS", modelId: "m1", expectedHolderModelId: null, replaceModelSticker: false, expectedModelStickerCode: null,
    });
  });

  test("blocks: no sticker, a panel, a car of the other event, no car, a withdrawn car, already here", () => {
    expect(linkPlan(null, car("m1", "p1")).block).toBe("no_sticker");
    expect(linkPlan({ ...free, kind: "panel" }, car("m1", "p1")).block).toBe("panel");
    expect(linkPlan({ ...free, holder: { modelId: "amf", sameEvent: false } }, car("m1", "p1")).block).toBe("other_event");
    expect(linkPlan(free, null).block).toBe("no_model");
    expect(linkPlan(free, car("m1", "p1", { status: "withdrawn" })).block).toBe("withdrawn");
    expect(linkPlan({ ...free, holder: { modelId: "m1", sameEvent: true } }, car("m1", "p1", { qrCode: "TF000QRS" })).block).toBe("same");
  });

  test("conflicts that make the screen read the sticker again", () => {
    for (const code of ["FAIR_QR_HOLDER_CHANGED", "FAIR_QR_ALREADY_ASSIGNED", "FAIR_MODEL_ALREADY_ASSIGNED", "FAIR_QR_UNDO_SUPERSEDED"]) expect(isQrConflict(code)).toBe(true);
    for (const code of ["FAIR_MODEL_WITHDRAWN", "FAIR_QR_UNDO_EXPIRED", "ACTION_FAILED"]) expect(isQrConflict(code)).toBe(false);
  });
});

describe("save → confirmation → undo", () => {
  const done: LinkDone = { assignmentId: "as1", label: "SA26-040", modelId: "m1", modelStatus: "published", created: true };
  const run = (...events: Parameters<typeof linkFlowReducer>[1][]) => events.reduce<LinkFlow>(linkFlowReducer, LINK_FLOW_START);

  test("one save at a time: a second submit while saving changes nothing; success shows the confirmation", () => {
    expect(run({ type: "submit" })).toEqual({ step: "saving" });
    expect(run({ type: "submit" }, { type: "submit" })).toEqual({ step: "saving" });
    expect(run({ type: "submit" }, { type: "reset" })).toEqual({ step: "saving" });
    expect(run({ type: "submit" }, { type: "success", done })).toEqual({ step: "done", done, undo: "idle", error: null });
  });

  test("a failure returns to the pick step with its code", () => {
    expect(run({ type: "submit" }, { type: "failure", code: "FAIR_QR_HOLDER_CHANGED" })).toEqual({ step: "pick", error: "FAIR_QR_HOLDER_CHANGED" });
    expect(run({ type: "success", done })).toEqual(LINK_FLOW_START);
  });

  test("undo once: saving, then undone; a failed undo can be tried again; „Sledeća“ resets", () => {
    const saved = run({ type: "submit" }, { type: "success", done });
    expect(linkFlowReducer(saved, { type: "undo" })).toMatchObject({ step: "done", undo: "saving" });
    expect(linkFlowReducer(linkFlowReducer(saved, { type: "undo" }), { type: "undo" })).toMatchObject({ undo: "saving" });
    expect(linkFlowReducer(linkFlowReducer(saved, { type: "undo" }), { type: "undone" })).toMatchObject({ undo: "undone" });
    expect(linkFlowReducer(linkFlowReducer(saved, { type: "undo" }), { type: "undo_failed", code: "FAIR_QR_UNDO_EXPIRED" })).toMatchObject({ undo: "idle", error: "FAIR_QR_UNDO_EXPIRED" });
    expect(linkFlowReducer(saved, { type: "reset" })).toEqual(LINK_FLOW_START);
  });
});
