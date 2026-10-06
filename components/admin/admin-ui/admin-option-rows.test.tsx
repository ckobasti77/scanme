import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { AdminOptionRows } from "./admin-option-rows";

// Admin UX A6 — AdminOptionRows (SSR): labelled rows, move/remove buttons
// with aria labels, limits and the problems after a save attempt.

const dict = adminUiSr.optionRows;
const noop = () => undefined;
const render = (labels: string[], showProblems = false) =>
  renderToStaticMarkup(<AdminOptionRows label="Opcije" value={labels.map((label, index) => ({ id: `o${index + 1}`, label }))} onChange={noop} showProblems={showProblems} />);
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("AdminOptionRows", () => {
  test("a fieldset with a legend, one labelled input per row and the count", () => {
    const html = render(["TEST da", "TEST ne"]);
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain(`aria-label="${dict.option.replace("{n}", "1")}"`);
    expect(html).toContain('value="TEST ne"');
    expect(html).toContain(dict.count.replace("{count}", "2").replace("{max}", "5"));
  });

  test("the first row cannot move up, the last cannot move down, 2 rows cannot be removed, 5 rows cannot grow", () => {
    const two = render(["A", "B"]);
    expect(button(two, dict.moveUp.replace("{n}", "1"))).toContain('disabled=""');
    expect(button(two, dict.moveDown.replace("{n}", "1"))).not.toContain('disabled=""');
    expect(button(two, dict.moveDown.replace("{n}", "2"))).toContain('disabled=""');
    expect(button(two, dict.remove.replace("{n}", "1"))).toContain('disabled=""');
    const three = render(["A", "B", "C"]);
    expect(button(three, dict.remove.replace("{n}", "2"))).not.toContain('disabled=""');
    const five = render(["A", "B", "C", "D", "E"]);
    expect(five).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${dict.add}`));
  });

  test("after a save attempt: empty and duplicate rows are marked and explained", () => {
    expect(render(["", "Da"])).not.toContain('aria-invalid="true"');
    const html = render(["", "Da", "da"], true);
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(3);
    expect(html).toContain(dict.empty);
    expect(html).toContain(dict.duplicate);
    expect(html).toContain(dict.duplicateRow);
    expect(html).toContain(dict.emptyRow);
    expect(render(["Samo jedna"], true)).toContain(dict.tooFew.replace("{min}", "2"));
  });
});
