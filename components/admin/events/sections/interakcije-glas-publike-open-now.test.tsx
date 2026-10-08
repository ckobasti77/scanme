import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { InteractionsActions, InteractionsView } from "@/components/admin/admin-events-interactions";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { audienceCanOpenNow, EventAudienceView } from "./interakcije-glas-publike-view";

// Sajam 2026 P1 (Aleksa, 8. 10. 2026) — „Otvori sada“: a published Glas
// publike question whose day is still ahead can be opened for votes now (SSR).

const a = adminEventsSr.audience;
const H = 3_600_000;
const D1 = Date.parse("2026-10-09T00:00:00+02:00");
const NOW = Date.parse("2026-10-08T12:00:00+02:00");
const options = [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }];
const windowOf = (dayStart: number) => ({ startsAt: dayStart, endsAt: dayStart + 24 * H });

const view: InteractionsView = {
  models: [{ id: "m1", name: "TEST Volta X1", brandId: "b1", brandName: "TEST Volta", exhibitorId: "p1", exhibitorName: "TEST Izlagač A", externalKey: "test-m1", tier: "advanced", packageActivatedAt: NOW - H, status: "published" }],
  days: [
    { id: "d1", dateKey: "2026-10-09", label: "TEST dan 1", startsAt: D1, endsAt: D1 + 24 * H },
    { id: "d2", dateKey: "2026-10-10", label: "TEST dan 2", startsAt: D1 + 24 * H, endsAt: D1 + 48 * H },
  ],
  questions: [
    { id: "q1", modelId: "m1", dayId: "d1", prompt: "TEST pitanje za sutra", options, status: "published", sortOrder: 1, showOnSponsoredRotation: false, ...windowOf(D1) },
    { id: "q2", modelId: "m1", dayId: "d2", prompt: "TEST pitanje u nacrtu", options, status: "draft", sortOrder: 1, showOnSponsoredRotation: false, ...windowOf(D1 + 24 * H) },
  ],
  surveys: [],
};
const ok = async () => ({ ok: true as const });
const actions: InteractionsActions = { saveQuestion: ok, publishQuestion: ok, closeQuestion: ok, setSponsoredResult: ok, saveSurveyDraft: ok, publishSurvey: ok, retireSurvey: ok };
const render = (withOpen: boolean, query: Record<string, string> = {}) =>
  renderToStaticMarkup(<EventAudienceView view={view} actions={withOpen ? { ...actions, openQuestionNow: ok } : actions} now={NOW} query={query} onQueryChange={() => undefined} />);

describe("P1 Glas publike — „Otvori sada“", () => {
  test("offered for a published question whose window starts later, never for a draft, a closed or an open one", () => {
    expect(audienceCanOpenNow({ status: "published", startsAt: D1, endsAt: D1 + 24 * H }, NOW)).toBe(true);
    expect(audienceCanOpenNow({ status: "published", startsAt: D1 }, NOW)).toBe(true);
    expect(audienceCanOpenNow({ status: "published", startsAt: NOW, endsAt: D1 }, NOW)).toBe(false);
    expect(audienceCanOpenNow({ status: "published", startsAt: NOW - H, endsAt: D1 }, NOW)).toBe(false);
    expect(audienceCanOpenNow({ status: "draft", startsAt: D1 }, NOW)).toBe(false);
    expect(audienceCanOpenNow({ status: "closed", startsAt: D1 }, NOW)).toBe(false);
    expect(audienceCanOpenNow({ status: "published", startsAt: D1, endsAt: NOW }, NOW)).toBe(false);
    // A question without a known window (older admin data) is not offered.
    expect(audienceCanOpenNow({ status: "published" }, NOW)).toBe(false);
  });

  test("the list shows the button with a labelled action for the published question only", () => {
    const html = render(true);
    // The list renders each row as a table row and as a card, so one question can show the button twice.
    const buttons = html.split(`>${a.openNow}</button>`).length - 1;
    expect(buttons).toBeGreaterThan(0);
    expect(html.split(`aria-label="${a.openNowAria.replace("{prompt}", "TEST pitanje za sutra")}"`).length - 1).toBe(buttons);
    expect(html).toContain("TEST pitanje u nacrtu");
    expect(html).not.toContain(a.openNowAria.replace("{prompt}", "TEST pitanje u nacrtu"));
    // Without the action (e.g. a read-only preview) there is no button.
    expect(render(false)).not.toContain(`>${a.openNow}</button>`);
  });
});
