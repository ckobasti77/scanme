import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { FAIR_MAP_ROTATION_INTERVAL_MS } from "../fair-client/rotation-slot";
import type { FairAudienceResultView, FairSponsoredModelCard, FairSponsoredRotationView } from "../fair-contract";
import { fairMapSr as dict } from "../i18n/sr/fair-map";
import { fairMapRotationAt } from "./rotation";

// K2 (RF finding 2): the map/display rotation card follows the live B5
// projection — a new result or a new publish shows up without a reload, the
// server projection is the first state, and the slot still comes from
// rotation-slot.ts. `useQuery` is mocked; no mutation exists in the mock, so
// any write attempt would fail the render.

const live = vi.hoisted(() => ({ value: undefined as unknown, calls: [] as Array<{ name: string; args: unknown }> }));

vi.mock("convex/react", async () => {
  const { getFunctionName: name } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof name>[0], args: unknown) => {
      live.calls.push({ name: name(ref), args });
      return live.value;
    },
  };
});

const { useLiveFairMapRotation } = await import("../../components/fair/map/fair-map-live-rotation");
const { FairMapRotationCard } = await import("../../components/fair/map/fair-map-rotation");

const EVENT_SLUG = "test-elektromobilnost-2026";
const EPOCH = Date.parse("2026-10-09T09:00:00+02:00");
const NOW = EPOCH + 5 * FAIR_MAP_ROTATION_INTERVAL_MS + 3_000;

function card(id: string, order: number, result?: FairAudienceResultView): FairSponsoredModelCard {
  return {
    eventModelId: id,
    eventId: "e1",
    eventSlug: EVENT_SLUG,
    slug: id,
    brandId: "b1",
    brandName: "TEST Volta",
    displayName: `TEST ${id}`,
    priceText: "TEST cena",
    visual: "event_placeholder",
    standMapLocationId: "hala-12",
    order,
    ...(result
      ? {
          audienceResult: {
            questionId: `q-${id}`,
            prompt: `TEST pitanje ${id}`,
            options: [
              { id: "a", label: "TEST da", order: 0 },
              { id: "b", label: "TEST ne", order: 1 },
            ],
            result,
          },
        }
      : {}),
  };
}

function rotation(snapshotId: string, epochMs: number, items: FairSponsoredModelCard[]): FairSponsoredRotationView {
  return { surface: "map", eventId: "e1", snapshotId, version: 1, dayKey: "2026-10-09", seed: "fair-sponsored-v1:e1", epochMs, intervalMs: FAIR_MAP_ROTATION_INTERVAL_MS, items };
}

const waiting = (id: string): FairAudienceResultView => ({ questionId: `q-${id}`, state: "waiting_for_minimum" });
const publicResult = (id: string, a: number, b: number): FairAudienceResultView => ({
  questionId: `q-${id}`,
  state: "public",
  options: [
    { optionId: "a", percentage: a },
    { optionId: "b", percentage: b },
  ],
});

// Slot 5 of a 3-item snapshot published at EPOCH → index 2 (m3).
const initial = rotation("s1", EPOCH, [card("m1", 0, waiting("m1")), card("m2", 1, waiting("m2")), card("m3", 2, waiting("m3"))]);

/** A map/display at NOW: the live projection through the same card the page renders. */
function Display({ initialRotation }: { initialRotation: FairSponsoredRotationView | null }) {
  const current = useLiveFairMapRotation(EVENT_SLUG, initialRotation);
  return createElement(FairMapRotationCard, { state: fairMapRotationAt(current, NOW), locationText: "TEST 12", onShowStand: null, display: true });
}

const render = (initialRotation: FairSponsoredRotationView | null = initial) => renderToStaticMarkup(createElement(Display, { initialRotation }));

beforeEach(() => {
  live.value = undefined;
  live.calls = [];
});

describe("live map rotation (K2)", () => {
  test("reads only fairPublic.getSponsoredMapRotation for the event", () => {
    render();
    expect(live.calls).toEqual([{ name: "fairPublic:getSponsoredMapRotation", args: { eventSlug: EVENT_SLUG } }]);
  });

  test("until the subscription answers, the server projection is shown (no empty card)", () => {
    const html = render();
    expect(html).toContain('data-rotation-model="m3"');
    expect(html).toContain('data-rotation-slot="5"');
    expect(html).toContain(dict.rotationWaiting);
  });

  test("a new audience result replaces 'waiting' without a reload; same model, same slot", () => {
    live.value = rotation("s1", EPOCH, [card("m1", 0, waiting("m1")), card("m2", 1, waiting("m2")), card("m3", 2, publicResult("m3", 62, 38))]);
    const html = render();
    expect(html).toContain('data-rotation-model="m3"');
    expect(html).toContain('data-rotation-slot="5"');
    expect(html).not.toContain(dict.rotationWaiting);
    expect(html).toContain("62 %");
    expect(html).toContain("38 %");

    live.value = rotation("s1", EPOCH, [card("m1", 0, waiting("m1")), card("m2", 1, waiting("m2")), card("m3", 2, publicResult("m3", 55, 45))]);
    const next = render();
    expect(next).toContain("55 %");
    expect(next).not.toContain("62 %");
  });

  test("a new publish is followed live, and displays loaded before and after it agree", () => {
    const republished = rotation("s2", EPOCH + 2 * FAIR_MAP_ROTATION_INTERVAL_MS, [card("m4", 0), card("m5", 1)]);
    live.value = republished;
    // Loaded before the publish (server state s1) and after it (server state s2): both follow the live s2.
    const before = render(initial);
    const after = render(republished);
    expect(before).toBe(after);
    // NOW is slot 3 of the new epoch → index 1 of 2 (m5); the old snapshot's m3 is gone.
    expect(before).toContain('data-rotation-model="m5"');
    expect(before).toContain('data-rotation-slot="3"');
    expect(before).not.toContain('data-rotation-model="m3"');
  });

  test("a withdrawn model leaves the rotation; no published snapshot means no rotation card", () => {
    live.value = rotation("s1", EPOCH, [card("m1", 0, waiting("m1")), card("m2", 1, waiting("m2"))]);
    expect(render()).not.toContain('data-rotation-model="m3"');

    live.value = null;
    const html = render();
    expect(html).not.toContain("data-rotation-model");
    expect(html).toContain('data-rotation-pending="true"');
  });
});
