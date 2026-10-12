import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { PREVIEW_HUD, previewDashboard } from "@/components/admin/events/preview-dashboard-fixtures";
import { hudData, type HudData } from "@/lib/admin-v2/hud";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { AdminToaster } from "../admin-ui/admin-toast";
import { AdminHud, AdminHudView } from "./admin-hud";

// ADMIN v2 X4 — the HUD „Danas“ of the sidebar (ZADATAK §5.2): the fair day as
// a progress bar, the time to the end of the day, the live mark only while the
// day is open and the key number of the day; nothing outside a fair.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useConvex: () => ({}) }));

const d = adminUiSr.hud;
const HREF = "/admin/dogadjaji/test-sajam/pregled";
const view = (hud: HudData) => renderToStaticMarkup(<AdminHudView hud={hud} href={hud.href} />);
const fromPreview = (faza: string) => {
  const dashboard = previewDashboard(faza);
  return hudData({ title: "TEST Sajam", href: HREF }, dashboard, dashboard.at);
};

describe("the HUD „Danas“", () => {
  test("an open fair day: Dan 3 / 3, the time left, the progress bar, the live mark and the scans of the day", () => {
    const hud = fromPreview("dan3");
    expect(hud?.state.kind).toBe("live");
    const html = view(hud!);
    expect(html).toContain('data-admin-hud="live"');
    expect(html).toContain(`aria-label="${d.title}"`);
    expect(html).toContain("Dan 3 / 3");
    expect(html).toContain("do kraja dana 1 h 22 min");
    expect(html).toContain(`role="progressbar" aria-label="${d.progressLabel}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="94"`);
    expect(html).toContain('aria-valuetext="Prošlo je 94 % dana, do kraja 1 h 22 min"');
    expect(html).toMatch(new RegExp(`data-hud-live=""[^>]*>.*?${d.live}</p>`));
    expect(html).toContain(d.scansToday);
    expect(html).toMatch(/data-admin-odometer=""[^>]*>179</);
    // The event is the link to its Pregled.
    expect(html).toContain(`href="${HREF}" aria-label="Otvori pregled događaja: TEST Sajam"`);
    // No emoji, no points: text and one bar.
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test("a read that is too old does not say „Uživo“: it says from when the number is", () => {
    const hud = fromPreview("dan3")!;
    const html = view({ ...hud, stale: true });
    expect(html).not.toContain("data-hud-live");
    expect(html).toMatch(/data-hud-stale=""[^>]*>Podatak od 22:38</);
    // The day and its number are still shown.
    expect(html).toContain("Dan 3 / 3");
    expect(html).toMatch(/data-admin-odometer=""[^>]*>179</);
    expect(view(hud)).not.toContain("data-hud-stale");
  });

  test("a partial scan count reads 179+", () => {
    const hud = fromPreview("dan3")!;
    const html = view({ ...hud, state: { ...hud.state, scansCapped: true } as HudData["state"] });
    expect(html).toMatch(/data-admin-odometer=""[^>]*>179\+</);
  });

  test("between two fair days: the next day and when it opens, no live mark and no bar", () => {
    const dashboard = previewDashboard("sajam");
    const next = dashboard.days[2];
    const hud = hudData(
      { title: "TEST Sajam", href: HREF },
      { ...dashboard, phase: { kind: "sajam", dayOpen: false, dayIndex: 3, dayCount: 3, nextDeadline: { kind: "day_start", at: next.startsAt } } },
      next.startsAt - 9 * 3_600_000,
    );
    const html = view(hud!);
    expect(html).toContain('data-admin-hud="between"');
    expect(html).toContain("Dan 3 / 3 počinje za 9 h 0 min");
    expect(html).not.toContain("data-hud-live");
    expect(html).not.toContain('role="progressbar"');
  });

  test("before and after the fair there is no HUD", () => {
    expect(fromPreview("pre")).toBeNull();
    expect(fromPreview("posle")).toBeNull();
  });

  test("the dev previews outside Događaji show the TEST HUD of the last fair day", () => {
    expect(PREVIEW_HUD?.state).toMatchObject({ kind: "live", dayIndex: 3, dayCount: 3, scansToday: 179 });
    expect(PREVIEW_HUD?.eventTitle).toMatch(/^TEST /);
  });

  test("without a frame and without a fair nothing is drawn", () => {
    expect(renderToStaticMarkup(<AdminHud />)).toBe("");
  });
});

describe("the toasts of the frame", () => {
  test("the region is always there and empty until a toast arrives", () => {
    const html = renderToStaticMarkup(<AdminToaster />);
    // A status region, not a landmark: an empty landmark on every page would only be noise.
    expect(html).toContain(`role="status" aria-label="${adminUiSr.toast.region}" aria-live="polite"`);
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain("data-admin-toast=");
  });
});
