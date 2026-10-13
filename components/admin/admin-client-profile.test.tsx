import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { CLIENT_PROFILE_SECTIONS, CLIENT_PROFILE_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/pages";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 — Profil klijenta: the sections are in the sidebar and in the URL
// (?section=), the page keeps the header, the selected contact (?contact=) and
// the selected venue (?venue=). SSR markup, like the other admin views.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/klijenti/preview",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

const { AdminClientProfilePreview } = await import("./admin-client-profile");

beforeEach(() => {
  nav.search = "";
});

function render(search = "") {
  nav.search = search;
  return renderToStaticMarkup(<AdminClientProfilePreview />);
}

describe("Profil klijenta", () => {
  test("one h1 with the client name, no fluid heading", () => {
    const html = render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Ana Petrović sa veoma dugim poslovnim imenom<\/h1>/);
    expect(html).not.toContain("clamp(");
    expect(html).toContain(dict.navClients);
    expect(html).toContain("SMK-ANA-014");
    expect(html).toContain("Bistro Zelen d.o.o.");
  });

  test("the preview label and the premium mark are status marks, not the accent fill", () => {
    const html = render();
    expect(html).toContain(dict.clientProfileFixtureBadge);
    expect(html).toContain(dict.clientProfilePremiumGrace);
    expect(html).toContain('data-tone="waiting"');
    expect(html).not.toContain("--admin-accent-ink");
  });

  test("has no row of section buttons and no link back in the screen", () => {
    for (const section of CLIENT_PROFILE_SECTIONS) {
      const html = render(section === "overview" ? "" : `section=${section}`);
      expect(html).not.toContain("aria-current");
      expect(html).not.toContain(dict.clientProfileBack);
      expect(html).not.toContain('href="/admin/klijenti"');
      expect(html).not.toContain('role="tablist"');
      expect(html.match(/<h1/g)).toHaveLength(1);
    }
  });

  test("shows the section from ?section=; an invalid one shows the overview", () => {
    expect(render("section=activity")).toContain(dict.clientProfileActivityTitle);
    expect(render("section=activity")).not.toContain(dict.clientProfileOrganization);
    expect(render("section=venues")).toContain(dict.clientProfileVenueSelect);
    expect(render("section=products")).toContain(dict.clientProfileProductsSummary);
    const overview = render();
    expect(overview).toContain(dict.clientProfileOrganization);
    expect(overview).toContain(dict.clientProfileUrgentWork);
    const invalid = render("section=xyz");
    expect(invalid).toContain(dict.clientProfileOrganization);
    expect(invalid).not.toContain(dict.clientProfileActivityTitle);
  });

  test("?contact= picks the contact; an unknown id falls back to the default one", () => {
    const selected = (search: string) => render(search).match(/<strong class="truncate">([^<]*)<\/strong>/)?.[1];
    expect(selected("")).toBe("Ana Petrović");
    expect(selected("contact=fixture-contact-2")).toBe("Marko Ilić");
    expect(selected("contact=nepostoji")).toBe("Ana Petrović");
    expect(render("contact=fixture-contact-2")).toContain("<option value=\"fixture-contact-2\" selected=\"\">");
  });

  test("?venue= picks the venue detail; an unknown one shows the first venue", () => {
    expect(render("section=venues&venue=fixture-venue-2")).toContain("Bulevar Zorana Đinđića 64");
    expect(render("section=venues&venue=nepostoji")).toContain("Cara Dušana 42");
  });

  test("the link to the venues section keeps the contact and the venue", () => {
    expect(render()).toContain('href="?section=venues"');
    const kept = render("contact=fixture-contact-2&venue=fixture-venue-2");
    expect(kept).toContain('href="?contact=fixture-contact-2&amp;venue=fixture-venue-2&amp;section=venues"');
  });

  test("the layout breaks by the width of the container, not of the window", () => {
    const html = render();
    expect(html).toContain("@container");
    expect(html).toContain("@4xl:grid-cols-[minmax(0,1fr)_21rem]");
    expect(html).not.toMatch(/(^|[\s"])xl:grid-cols-\[minmax\(0,1fr\)_21rem\]/);
  });

  test("the sidebar has the link back and the six sections, the one in the URL is marked", () => {
    const config = resolveAdminSidebar("/admin/klijenti/a1");
    expect(config.views?.items).toHaveLength(6);
    const html = renderToStaticMarkup(<AdminSidebarView config={config} state={readUrlState(CLIENT_PROFILE_URL_FIELDS, "?section=finance&contact=c1")} onPatch={() => undefined} />);
    expect(html).toContain(dict.clientProfileBack);
    expect(html).toContain('href="/admin/klijenti"');
    expect(html.match(/type="radio"/g)).toHaveLength(6);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    const checkedLabel = (markup: string) => markup.match(/checked=""\/><span[^>]*>([^<]*)<\/span>/)?.[1];
    expect(checkedLabel(html)).toBe(dict.clientProfileSectionFinance);
    const byDefault = renderToStaticMarkup(<AdminSidebarView config={config} state={readUrlState(CLIENT_PROFILE_URL_FIELDS, "?section=xyz")} onPatch={() => undefined} />);
    expect(checkedLabel(byDefault)).toBe(dict.clientProfileSectionOverview);
  });

  test("the page keys survive: contact and venue are read, not dropped by the schema", () => {
    expect(readUrlState(CLIENT_PROFILE_URL_FIELDS, "?section=venues&contact=c1&venue=v1")).toEqual({ section: "venues", contact: "c1", venue: "v1" });
    expect(readUrlState(CLIENT_PROFILE_URL_FIELDS, "")).toEqual({});
  });

  test("the sections carry the reveal attributes: text row, rows lists, kpi tiles with a count", () => {
    const overview = render();
    expect(overview).toContain('data-admin-reveal="text"');
    expect(overview).toContain('data-admin-reveal="rows"');
    const venues = render("section=venues");
    expect(venues).toContain('data-admin-reveal="rows"');
    expect(venues).toContain('data-admin-reveal="kpi"');
    expect(venues).toContain('data-admin-tilt=""');
    expect(venues).toContain('data-admin-count=""');
    expect(render("section=products")).toContain('data-admin-reveal="kpi"');
    expect(render("section=activity")).toContain('<ol data-admin-reveal="rows"');
    expect(render("section=communication")).toContain('data-admin-reveal="card"');
  });
});
