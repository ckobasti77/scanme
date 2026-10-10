// Public routes must honor both states of the map switch. The production
// checklist keeps it off until all exhibitor data is ready; enabling it must
// still restore the map, navigation and model stand deep links together.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

const mapState = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/fair-contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/fair-contract")>(),
  get FAIR_PUBLIC_MAP_ENABLED() { return mapState.enabled; },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => navigation);
// No event in the backend: an enabled map answers 404; a disabled one forwards.
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn(async () => null), fetchMutation: vi.fn() }));
vi.mock("@/lib/fair-server/garage-page", () => ({ loadFairActiveEventSlug: vi.fn(async () => "elektromobilnost-2026") }));

const { GET } = await import("@/app/sajam/route");
const { default: FairEventMapPage } = await import("@/app/sajam/[eventSlug]/page");
const { FairEventShell } = await import("./event-shell");
const { fairModelStand } = await import("@/lib/fair-server/model-page");

describe.each([true, false])("javna mapa: enabled=%s", (enabled) => {
  beforeEach(() => {
    mapState.enabled = enabled;
  });

  test("/sajam otvara javno odredište prema prekidaču", async () => {
    const response = await GET();
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(`/sajam/elektromobilnost-2026${enabled ? "" : "/garaza"}`);
  });

  test("adresa mape i QR sa ulaznog panoa poštuju prekidač", async () => {
    navigation.redirect.mockClear();
    await expect(
      FairEventMapPage({
        params: Promise.resolve({ eventSlug: "elektromobilnost-2026" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(enabled ? "NOT_FOUND" : "REDIRECT /sajam/elektromobilnost-2026/garaza");
    if (enabled) expect(navigation.redirect).not.toHaveBeenCalled();
    else expect(navigation.redirect).toHaveBeenCalledWith("/sajam/elektromobilnost-2026/garaza");
  });

  test("meni prikazuje Mapu samo kada je uključena", () => {
    const html = renderToStaticMarkup(
      <FairEventShell eventId="e1" eventSlug="elektromobilnost-2026" eventTitle="Sajam automobila" eventName="Sajam elektromobilnosti 2026" dict={fairModelSr} current="garage" />,
    );
    if (enabled) {
      expect(html).toContain(`href="/sajam/elektromobilnost-2026"`);
      expect(html).toContain(fairModelSr.mapNav);
    } else {
      expect(html).not.toContain(`href="/sajam/elektromobilnost-2026"`);
      expect(html).not.toContain(fairModelSr.mapNav);
    }
  });

  test("trenutna stavka Mapa postoji samo kada je uključena", () => {
    const html = renderToStaticMarkup(
      <FairEventShell eventId="e1" eventSlug="elektromobilnost-2026" eventTitle="Sajam automobila" eventName="Sajam elektromobilnosti 2026" dict={fairModelSr} current="map" />,
    );
    if (enabled) expect(html).toMatch(new RegExp(`aria-current="page"><svg[^]*?<span>${fairModelSr.mapNav}</span>`));
    else expect(html).not.toContain(fairModelSr.mapNav);
  });

  test("stranica modela daje link štanda samo kada je mapa uključena", () => {
    expect(fairModelStand({ code: "elektromobilnost-2026" }, { standMapLocationId: "hala-9" }, "elektromobilnost-2026")).toEqual(enabled ? {
      text: expect.stringContaining("9"),
      href: "/sajam/elektromobilnost-2026?stand=hala-9",
    } : null);
    expect(fairModelStand({ code: "elektromobilnost-2026" }, { standMapLocationId: "nema-na-mapi" }, "elektromobilnost-2026")).toBeNull();
  });
});
