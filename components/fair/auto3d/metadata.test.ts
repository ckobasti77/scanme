// Metapodaci /sajam/3d (A11): konačan naslov i opis za pregled linka, apsolutna adresa og.jpg preko
// metadataBase rute (Viber, WhatsApp i mejl ne razrešavaju relativne adrese) i `noindex` iz layout-a.

import { describe, expect, test, vi } from "vitest";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";

vi.mock("next/image", () => ({ default: () => null, getImageProps: () => ({ props: {} }) }));

const { generateMetadata } = await import("@/app/sajam/3d/page");

const meta = (search: Record<string, string> = {}) => generateMetadata({ searchParams: Promise.resolve(search) });

describe("generateMetadata /sajam/3d", () => {
  test("naslov i opis stranice za izlagače", async () => {
    const m = await meta();
    expect(m.title).toBe("3D Rendgen · Auto Moto Fest 2026 · ScanMe");
    expect(m.description).toBe(t.metaDescription);
    expect(m.description).toContain("8.000 RSD po modelu");
    expect((m.description as string).length).toBeLessThanOrEqual(160);
    expect(m.openGraph?.title).toBe(m.title);
    expect(m.openGraph?.description).toBe(m.description);
  });

  test("og.jpg se razrešava na apsolutnu adresu scanme.rs", async () => {
    const m = await meta();
    expect(String(m.metadataBase)).toBe("https://scanme.rs/");
    const images = m.openGraph?.images as { url: string | URL; width: number; height: number }[];
    expect(images).toHaveLength(1);
    expect(images[0].width).toBe(1200);
    expect(images[0].height).toBe(630);
    expect(new URL(String(images[0].url), String(m.metadataBase)).href).toBe("https://scanme.rs/3d/auto3d/og.jpg");
  });

  test("link na deo zadržava naslov dela i istu OG sliku", async () => {
    const m = await meta({ deo: "turbopunjac" });
    expect(m.title).toBe(`${delovi.parts.turbopunjac.name} · 3D Rendgen · Auto Moto Fest 2026`);
    expect(String(m.metadataBase)).toBe("https://scanme.rs/");
    expect(m.openGraph?.images).toHaveLength(1);
  });
});
