import { getFunctionName, type FunctionReference } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { InteractionsActions } from "@/components/admin/admin-events-interactions";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminEventProvider, type AdminEventContextValue } from "@/components/admin/events/event-context";

// Admin UX A6 — the Glas publike and Ankete actions call the existing B3
// mutations (convex/fairInteractionsAdmin.ts) with the right arguments; the
// saved id comes back so "Sačuvaj i objavi" can publish it.

const calls: [string, unknown][] = [];
vi.mock("convex/react", () => ({
  useMutation: (ref: FunctionReference<"mutation">) => async (args: unknown) => {
    const name = getFunctionName(ref);
    calls.push([name, args]);
    if (name.endsWith("upsertAudienceQuestion")) return { questionId: "q-new", result: "created" };
    if (name.endsWith("upsertSurveyDraft")) return { surveyId: "s-new", version: 3, result: "created" };
    return {};
  },
}));

const { useInteractionsActions } = await import("./interakcije-section");

const EVENT_ID = "test-event-id" as Id<"fairEvents">;
const context = { eventId: EVENT_ID, base: "/admin/dogadjaji/test-sajam", catalog: {}, directory: {} } as unknown as AdminEventContextValue;

describe("A6 Interakcije container", () => {
  test("question and survey actions → fairInteractionsAdmin mutations", async () => {
    let actions: InteractionsActions | null = null;
    function Probe() {
      actions = useInteractionsActions();
      return null;
    }
    renderToStaticMarkup(<AdminEventProvider value={context}><Probe /></AdminEventProvider>);
    const run = actions!;
    const options = [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }];
    expect(await run.saveQuestion({ modelId: "m1", dayId: "d1", prompt: "TEST pitanje", options, sortOrder: 3 })).toEqual({ ok: true, problem: null, id: "q-new" });
    await run.saveQuestion({ questionId: "q7", modelId: "m1", dayId: "d2", prompt: "TEST izmena", options, sortOrder: 2 });
    await run.publishQuestion("q-new");
    await run.closeQuestion("q1");
    await run.setSponsoredResult("m1", "q2");
    await run.setSponsoredResult("m1", null);
    const questions = [{ id: "q1", prompt: "TEST?", kind: "yes_no" as const, options: [], required: false, order: 1 }];
    expect(await run.saveSurveyDraft("m1", questions)).toEqual({ ok: true, problem: null, id: "s-new", version: 3 });
    await run.publishSurvey("s-new");
    await run.retireSurvey("s1");
    expect(calls).toEqual([
      ["fairInteractionsAdmin:upsertAudienceQuestion", { eventModelId: "m1", eventDayId: "d1", prompt: "TEST pitanje", options, sortOrder: 3 }],
      ["fairInteractionsAdmin:upsertAudienceQuestion", { questionId: "q7", eventModelId: "m1", eventDayId: "d2", prompt: "TEST izmena", options, sortOrder: 2 }],
      ["fairInteractionsAdmin:publishAudienceQuestion", { questionId: "q-new" }],
      ["fairInteractionsAdmin:closeAudienceQuestion", { questionId: "q1" }],
      ["fairInteractionsAdmin:setSponsoredResultQuestion", { eventModelId: "m1", questionId: "q2" }],
      ["fairInteractionsAdmin:setSponsoredResultQuestion", { eventModelId: "m1", questionId: null }],
      ["fairInteractionsAdmin:upsertSurveyDraft", { eventModelId: "m1", questions }],
      ["fairInteractionsAdmin:publishSurvey", { surveyId: "s-new" }],
      ["fairInteractionsAdmin:retireSurvey", { surveyId: "s1" }],
    ]);
  });
});
