import { describe, expect, test } from "vitest";
import { QR_FLOW_IDLE, qrFlowProblem, qrFlowReducer, type QrFlow, type QrFlowEvent } from "./qr-flow";

// Admin UX A4 — the confirmation flow of the QR detail: a change of
// destination, an assignment and a removal always pass through an explicit
// confirmation step; nothing can be confirmed without a target model (where
// one is needed) and a reason of 3–300 characters.

const play = (events: QrFlowEvent[], from: QrFlow = QR_FLOW_IDLE) => events.reduce(qrFlowReducer, from);

describe("Promeni odredište (reassign)", () => {
  test("edit → confirm only with another model and a reason; back keeps the draft; reset returns to idle", () => {
    const started = play([{ type: "start", action: "reassign" }]);
    expect(started).toEqual({ step: "edit", action: "reassign", reason: "" });
    expect(qrFlowProblem(started, "m1")).toBe("target_missing");
    // Review without a model or reason stays in edit.
    expect(play([{ type: "review", currentModelId: "m1" }], started)).toBe(started);

    const same = play([{ type: "target", modelId: "m1" }, { type: "reason", text: "TEST razlog" }], started);
    expect(qrFlowProblem(same, "m1")).toBe("target_same");
    expect(play([{ type: "review", currentModelId: "m1" }], same).step).toBe("edit");

    const short = play([{ type: "target", modelId: "m2" }, { type: "reason", text: " ab " }], started);
    expect(qrFlowProblem(short, "m1")).toBe("reason_short");
    const long = play([{ type: "reason", text: "x".repeat(301) }], short);
    expect(qrFlowProblem(long, "m1")).toBe("reason_long");

    const ready = play([{ type: "reason", text: "  TEST nalepnica je na pogrešnom autu  " }], short);
    expect(qrFlowProblem(ready, "m1")).toBeNull();
    const confirming = play([{ type: "review", currentModelId: "m1" }], ready);
    expect(confirming).toEqual({ step: "confirm", action: "reassign", targetModelId: "m2", reason: "TEST nalepnica je na pogrešnom autu" });
    // While confirming, the draft cannot change underneath the summary.
    expect(play([{ type: "target", modelId: "m3" }, { type: "reason", text: "drugo" }], confirming)).toBe(confirming);
    expect(play([{ type: "back" }], confirming)).toEqual({ ...confirming, step: "edit" });
    expect(play([{ type: "reset" }], confirming)).toBe(QR_FLOW_IDLE);
  });
});

describe("Dodeli model (free code) and Ukloni vezu (release)", () => {
  test("assigning needs a model, the reason is optional but not too short", () => {
    const started = play([{ type: "start", action: "assign" }]);
    expect(qrFlowProblem(started, null)).toBe("target_missing");
    const picked = play([{ type: "target", modelId: "m2" }], started);
    expect(qrFlowProblem(picked, null)).toBeNull();
    expect(qrFlowProblem(play([{ type: "reason", text: "ab" }], picked), null)).toBe("reason_short");
    expect(play([{ type: "review", currentModelId: null }], picked)).toMatchObject({ step: "confirm", action: "assign", targetModelId: "m2", reason: "" });
  });

  test("removing the link has no model choice and needs a reason", () => {
    const started = play([{ type: "start", action: "release" }]);
    expect(play([{ type: "target", modelId: "m2" }], started)).toBe(started);
    expect(qrFlowProblem(started, "m1")).toBe("reason_short");
    const confirming = play([{ type: "reason", text: "TEST model je povučen sa štanda" }, { type: "review", currentModelId: "m1" }], started);
    expect(confirming).toEqual({ step: "confirm", action: "release", reason: "TEST model je povučen sa štanda" });
  });

  test("idle ignores everything except start", () => {
    for (const event of [{ type: "target", modelId: "m1" }, { type: "reason", text: "x" }, { type: "review", currentModelId: null }, { type: "back" }] as QrFlowEvent[]) {
      expect(qrFlowReducer(QR_FLOW_IDLE, event)).toBe(QR_FLOW_IDLE);
    }
    expect(qrFlowProblem(QR_FLOW_IDLE, null)).toBeNull();
  });
});
