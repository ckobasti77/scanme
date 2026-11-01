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

  const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
  // The attribute, not the `disabled:` utility class.
  const DISABLED = / disabled(=""| |>|\/>)/;

  test("disabled (V5): the group keeps its name and its options, every option is disabled and the group is dimmed", () => {
    const html = renderToStaticMarkup(<ChartSegmented label="Prikaz" value="a" onChange={() => undefined} options={options} disabled />);
    expect(html).toContain('role="radiogroup" aria-label="Prikaz" aria-disabled="true"');
    expect(html).toContain("opacity-50");
    const buttons = html.split("<button").slice(1);
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toMatch(DISABLED);
      expect(button).toContain('role="radio"');
    }
    // The choice is still shown, and the unchosen option no longer promises a hover.
    expect(buttons[0]).toContain('aria-checked="true"');
    expect(buttons[0]).toContain(adminSegmentOnClass);
    expect(buttons[1]).toContain(">B</button>");
    expect(buttons[1]).not.toContain("hover:bg-");
  });

  test("not disabled: nothing of the above is in the markup", () => {
    const html = renderToStaticMarkup(<ChartSegmented label="Prikaz" value="a" onChange={() => undefined} options={options} />);
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toMatch(DISABLED);
    expect(html).not.toContain("opacity-50");
    expect(html).toContain("hover:bg-");
  });
});
