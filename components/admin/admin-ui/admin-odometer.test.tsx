import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminOdometer } from "./admin-odometer";

describe("AdminOdometer first render", () => {
  it("is plain text in one span, not rolling and not hidden from screen readers", () => {
    const html = renderToStaticMarkup(<AdminOdometer value={179} />);
    expect(html).toMatch(/^<span data-admin-odometer="" class="tabular-nums">179<\/span>$/);
    expect(html).not.toContain("data-rolling");
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("sr-only");
  });

  it("formats the value like the other counters", () => {
    expect(renderToStaticMarkup(<AdminOdometer value={1286} />)).toMatch(/>1[.\s ]?286<\/span>$/);
  });

  it("shows the text, which wins over the value", () => {
    const html = renderToStaticMarkup(<AdminOdometer value={412} text="412+" />);
    expect(html).toContain(">412+</span>");
    expect(html).not.toContain("data-rolling");
  });

  it("keeps the class of the caller next to tabular-nums", () => {
    expect(renderToStaticMarkup(<AdminOdometer value={3} className="text-lg" />)).toContain('class="tabular-nums text-lg"');
  });
});
