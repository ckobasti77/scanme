import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { fairBrandVector } from "@/lib/fair-brand-logo";
import { PassportTicket } from "./passport-ticket";

test("Audi cover has one embossed logo, no extra white logo next to its name", () => {
  const html = renderToStaticMarkup(createElement(PassportTicket, {
    href: "/fixture", ariaLabel: "Audi", brand: "Audi", mark: fairBrandVector("Audi"), label: "Fixture",
    models: [], view: { got: 0, total: 3, fresh: 0, complete: false, cells: ["missing", "missing", "missing"] },
    newLabel: "Novo", unitLabel: "Markice", seal: "none", sealTexts: { top: "Fixture", bottom: "Fixture", center: "Audi", year: "2026" },
  }));
  expect(html.match(/<svg/g)).toHaveLength(1);
  expect(html).toContain('watermark');
  expect(html).toContain('<b>Audi</b>');
  expect(html).not.toContain('<img');
});
