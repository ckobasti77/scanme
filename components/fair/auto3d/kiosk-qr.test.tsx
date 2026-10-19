// QR „Nastavi na telefonu“ u kiosku (A10, A03 §6.2): SVG sa imenom za čitače ekrana, prazno mesto
// iste veličine pre mount-a (server ne zna domen, E12) i adresa /sajam/3d na domenu stranice.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { qrMatrix } from "@/lib/qr/qrcodegen";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { KioskQr, kioskQrUrl, qrPath, QrSvg } from "./kiosk-qr";

const classOf = (html: string) => html.match(/class="([^"]+)"/)?.[1];

describe("kiosk QR", () => {
  test("adresa je /sajam/3d na domenu stranice", () => {
    expect(kioskQrUrl("https://scanme.rs")).toBe("https://scanme.rs/sajam/3d");
    expect(kioskQrUrl("http://localhost:3180/")).toBe("http://localhost:3180/sajam/3d");
  });

  test("SVG ima role=img, aria-label i kodira tačno tu adresu", () => {
    const url = "https://scanme.rs/sajam/3d";
    const html = renderToStaticMarkup(<QrSvg url={url} label={t.kioskQrLabel} />);
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${t.kioskQrLabel}"`);
    expect(html).toContain(`data-qr-url="${url}"`);
    const n = qrMatrix(url, "MEDIUM").length;
    expect(html).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`);
    const { path } = qrPath(url);
    expect(html).toContain(`d="${path}"`);
    // Broj tamnih modula u putanji je isti kao u matrici.
    const dark = qrMatrix(url, "MEDIUM").flat().filter(Boolean).length;
    expect(path.match(/M/g)?.length).toBe(dark);
  });

  test("pre mount-a prazno mesto iste veličine (ista klasa), bez slike", () => {
    const placeholder = renderToStaticMarkup(<KioskQr />);
    const svg = renderToStaticMarkup(<QrSvg url="https://scanme.rs/sajam/3d" label={t.kioskQrLabel} />);
    expect(placeholder).toContain("data-qr-placeholder");
    expect(placeholder).toContain('aria-hidden="true"');
    expect(placeholder).not.toContain("<svg");
    expect(classOf(placeholder)).toBe(classOf(svg));
  });
});
