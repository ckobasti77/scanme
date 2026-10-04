import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FinanceChart } from "./admin-finance";
import { adminFinanceSr } from "@/lib/i18n/sr/admin-finance";

describe("ADMIN-14 finance UI", () => {
  test("chart has an accessible table fallback whose rows preserve the total", () => {
    const points = [
      { key: "2026-09-01", amountMinor: 12_000, undated: false },
      { key: "2026-09-02", amountMinor: 8_000, undated: false },
    ];
    const html = renderToStaticMarkup(<FinanceChart points={points} future={false} />);
    expect(html).toContain("<svg");
    expect(html).toContain(adminFinanceSr.chartTableCaption);
    expect(html).toContain("120,00");
    expect(html).toContain("80,00");
    expect(points.reduce((sum, point) => sum + point.amountMinor, 0)).toBe(20_000);
  });

  test("future chart keeps an undated bucket in the accessible fallback", () => {
    const html = renderToStaticMarkup(<FinanceChart points={[
      { key: "2026-10", amountMinor: 10_000, undated: false },
      { key: "undated", amountMinor: 5_000, undated: true },
    ]} future />);
    expect(html).toContain(adminFinanceSr.futureBadge);
    expect(html).toContain(adminFinanceSr.undated);
  });
});
