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
const { default: FairEventMapPage } = await import("@/app/sajam/[eventSlug]/(mapa)/page");
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
    expect(fairModelStand({ code: "auto-moto-fest-2026" }, { standMapLocationId: "hala-1" }, "auto-moto-fest-2026")).toEqual(enabled ? {
      text: "Hala",
      href: "/sajam/auto-moto-fest-2026?stand=hala-1",
    } : null);
    expect(fairModelStand({ code: "elektromobilnost-2026" }, { standMapLocationId: "nema-na-mapi" }, "elektromobilnost-2026")).toBeNull();
  });
});

// Auto Expo (owner, 27. 11.): the event home is not public whatever the map switch says, and no
// public link leads to it; the other events keep the behaviour above.
describe.each([true, false])("Auto Expo bez početne stranice: mapa=%s", (enabled) => {
  beforeEach(() => {
    mapState.enabled = enabled;
  });

  test("/sajam vodi na pasoše Auto Expo-a", async () => {
    const { loadFairActiveEventSlug } = await import("@/lib/fair-server/garage-page");
    vi.mocked(loadFairActiveEventSlug).mockResolvedValueOnce("auto-expo-2026");
    const response = await GET();
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/sajam/auto-expo-2026/pasosi");
  });

  test("/sajam/auto-expo-2026 je 404 bez čitanja događaja", async () => {
    const { fetchQuery } = await import("convex/nextjs");
    vi.mocked(fetchQuery).mockClear();
    navigation.redirect.mockClear();
    await expect(
      FairEventMapPage({
        params: Promise.resolve({ eventSlug: "auto-expo-2026" }),
        searchParams: Promise.resolve({ stand: "hala" }),
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(fetchQuery).not.toHaveBeenCalled();
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  test("zaglavlje nema link ka početnoj stranici", () => {
    const html = renderToStaticMarkup(
      <FairEventShell eventId="e1" eventSlug="auto-expo-2026" eventTitle="Sajam automobila" eventName="Auto Expo 2026" dict={fairModelSr} currentBrand="ford" />,
    );
    expect(html).not.toContain(`href="/sajam/auto-expo-2026"`);
    expect(html).not.toContain(`href="/sajam/auto-expo-2026?`);
    expect(html).toContain(`href="/sajam/auto-expo-2026/brend/mg"`);
    expect(html).toContain(`href="/sajam/auto-expo-2026/pasosi"`);
  });

  test("čip štanda na stranici modela je samo oznaka", () => {
    const stand = fairModelStand({ code: "auto-expo-2026" }, { standMapLocationId: "hala" }, "auto-expo-2026");
    if (stand) expect(stand.href).toBeNull();
  });
});
