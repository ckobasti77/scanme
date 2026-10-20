import { expect, test } from "vitest";
import { FAIR_DEMO_MODELS, FAIR_DEMO_PASSPORTS, FAIR_DEMO_PROGRESS, FAIR_DEMO_STUCK, FAIR_DEMO_ROTATION } from "./fair-demo";
import { passportTicketView } from "./fair-client/passport-tickets";
import { getFairRotationItem } from "./fair-client/rotation-slot";

test("the three passports start at 0/3, 2/3 and completed 3/3 with all scans available", () => {
  const views = FAIR_DEMO_PASSPORTS.map((passport, index) => {
    const row = FAIR_DEMO_PROGRESS[index];
    const unseen = row.stampedModelIds.filter(id => !FAIR_DEMO_STUCK[passport.passportId].includes(id));
    return passportTicketView(passport, row, unseen);
  });
  expect(views.map(view => view.got)).toEqual([0, 2, 3]);
  expect(views.map(view => view.fresh)).toEqual([3, 1, 0]);
  expect(views.map(view => view.complete)).toEqual([false, false, true]);
});

test("demo rotates before the actual fair and uses three distinct paint colors", () => {
  expect(new Set(FAIR_DEMO_ROTATION.items.map(item => item.photoUrl)).size).toBe(3);
  const time = Date.parse("2026-10-19T12:00:00Z");
  const ids = [0, 1, 2].map(n => getFairRotationItem(FAIR_DEMO_ROTATION.items, { epochMs: FAIR_DEMO_ROTATION.epochMs, nowMs: time + n * 12000, intervalMs: 12000 })!.item.eventModelId);
  expect(new Set(ids).size).toBe(3);
  expect(FAIR_DEMO_MODELS.every(model => model.id.startsWith("demo-model-"))).toBe(true);
});
