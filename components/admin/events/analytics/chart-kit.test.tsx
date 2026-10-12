import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ChartSegmented } from "@/components/admin/events/analytics/chart-kit";
import { adminSegmentOnClass } from "@/components/admin/admin-ui/admin-controls";

describe("X6 ChartSegmented", () => {
  test("the chosen option wears the shared segment class, not a raw ink token", () => {
    const html = renderToStaticMarkup(
      <ChartSegmented label="Prikaz" value="a" onChange={() => undefined} options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />,
    );
    const buttons = html.split("<button").slice(1);
    expect(buttons[0]).toContain(adminSegmentOnClass);
    expect(buttons[1]).not.toContain(adminSegmentOnClass);
    expect(html).not.toContain("bg-[var(--admin-ink)]");
  });
});
