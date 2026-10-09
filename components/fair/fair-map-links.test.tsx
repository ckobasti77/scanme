// SAJAM SUPER Korak 1 — the public map is visible again (Jovan, 9. 10. 13:45).
// Every way to the map works: the map URL renders the map (no forward to the
// garage), `/sajam` opens the active fair's map, the entrance panel QR
// (PANEL-2026-EVENT → https://scanme.rs/sajam/elektromobilnost-2026) lands on
// that same map URL, the header has Mapa, and the model page has the stand
// chip with its map deep link. The garage and passport links read the same
// flag; they are checked in the browser (client-only empty and detail states).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { FAIR_PUBLIC_MAP_ENABLED } from "@/lib/fair-contract";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => navigation);
// No event in the backend: the map page goes past the (former) garage forward and answers 404.
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn(async () => null), fetchMutation: vi.fn() }));
vi.mock("@/lib/fair-server/garage-page", () => ({ loadFairActiveEventSlug: vi.fn(async () => "elektromobilnost-2026") }));

const { GET } = await import("@/app/sajam/route");
const { default: FairEventMapPage } = await import("@/app/sajam/[eventSlug]/page");
const { FairEventShell } = await import("./event-shell");
const { fairModelStand } = await import("@/lib/fair-server/model-page");

describe("javna mapa je ponovo vidljiva", () => {
  test("prekidač je uključen", () => {
    expect(FAIR_PUBLIC_MAP_ENABLED).toBe(true);
  });

  test("/sajam otvara mapu aktivnog sajma, ne garažu", async () => {
    const response = await GET();
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/sajam/elektromobilnost-2026");
  });

  test("adresa mape (i QR sa ulaznog panoa) ne vodi u garažu", async () => {
    navigation.redirect.mockClear();
    await expect(
      FairEventMapPage({
        params: Promise.resolve({ eventSlug: "elektromobilnost-2026" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  test("meni ima stavku Mapa koja vodi na mapu", () => {
    const html = renderToStaticMarkup(
      <FairEventShell eventId="e1" eventSlug="elektromobilnost-2026" eventTitle="Sajam automobila" eventName="Sajam elektromobilnosti 2026" dict={fairModelSr} current="garage" />,
    );
    expect(html).toContain(`href="/sajam/elektromobilnost-2026"`);
    expect(html).toContain(fairModelSr.mapNav);
  });

  test("na mapi je Mapa označena kao trenutna strana", () => {
    const html = renderToStaticMarkup(
      <FairEventShell eventId="e1" eventSlug="elektromobilnost-2026" eventTitle="Sajam automobila" eventName="Sajam elektromobilnosti 2026" dict={fairModelSr} current="map" />,
    );
    expect(html).toMatch(new RegExp(`aria-current="page"><svg[^]*?<span>${fairModelSr.mapNav}</span>`));
  });

  test("stranica modela ima čip štanda sa linkom na štand na mapi", () => {
    expect(fairModelStand({ code: "elektromobilnost-2026" }, { standMapLocationId: "hala-9" }, "elektromobilnost-2026")).toEqual({
      text: expect.stringContaining("9"),
      href: "/sajam/elektromobilnost-2026?stand=hala-9",
    });
    expect(fairModelStand({ code: "elektromobilnost-2026" }, { standMapLocationId: "nema-na-mapi" }, "elektromobilnost-2026")).toBeNull();
  });
});
