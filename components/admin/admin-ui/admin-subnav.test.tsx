import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { eventNavGroups } from "@/lib/admin-v1/event-sections";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { AdminSubnav } from "./index";

// Admin UX A2 — SSR markup of the section navigation.

// The shared next/link stub drops every prop except href/className; these
// checks need aria-current on the link, so the anchor keeps all its props.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("AdminSubnav (A2)", () => {
  test("the open section is the only link with aria-current, in the bar and in the sidebar", () => {
    const html = renderToStaticMarkup(<AdminSubnav ariaLabel="TEST sekcije" groups={eventNavGroups((path) => `/x/${path}`, "leadovi/follow-up")} />);
    expect(count(html, '<nav aria-label="TEST sekcije"')).toBe(2);
    expect(count(html, 'aria-current="page"')).toBe(2);
    expect(html).toMatch(/<a[^>]*href="\/x\/leadovi\/follow-up"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/<a[^>]*href="\/x\/pregled"[^>]*aria-current/);
    // The phone bar shows the sub-pages of the open section.
    expect(html).toContain(`<ul aria-label="${adminEventsSr.navLeads}"`);
    for (const label of Object.values(adminEventsSr.sectionLabels)) expect(html).toContain(label);
  });

  test("the bar scrolls in its own container; the sidebar starts at lg", () => {
    const html = renderToStaticMarkup(<AdminSubnav ariaLabel="TEST" groups={eventNavGroups((path) => `/x/${path}`, "pregled")} />);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("lg:hidden");
    expect(html).toContain("hidden min-w-0 lg:sticky lg:top-24 lg:block");
  });

  test("count and urgency slots render with screen reader text (filled by A10)", () => {
    const html = renderToStaticMarkup(
      <AdminSubnav ariaLabel="TEST" groups={[{ id: "g", items: [{ id: "a", href: "/a", label: "TEST A", active: false, count: 7, urgency: { tone: "hitno", count: 2 } }] }]} />,
    );
    expect(html).toContain('data-urgency="hitno"');
    expect(html).toContain("Hitno: 2");
    expect(html).toContain(adminUiSr.navCount.replace("{count}", "7"));
  });
});
