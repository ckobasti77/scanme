import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminV1Sr as dict } from "@/lib/i18n/sr/admin-v1";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

// ADMIN v2 — Klijenti: the filters are in the sidebar of the admin frame and
// in the URL; the screen has the header and the list (SSR markup, no DOM).

let query = "";
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/klijenti",
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ push() {}, replace() {} }),
}));

import { AdminClientsPreview, AdminClientsWorkspace } from "./admin-clients";

function previewHtml(search = "", mode?: "loaded" | "loading" | "empty" | "error") {
  query = search;
  return renderToStaticMarkup(<AdminClientsPreview mode={mode} />);
}

beforeEach(() => {
  query = "";
});

describe("Klijenti screen", () => {
  test("one H1, no filter block: no select, tablist or search field", () => {
    query = "";
    const workspace = renderToStaticMarkup(<AdminClientsWorkspace />);
    for (const html of [previewHtml(), workspace]) {
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain(dict.clientsTitle);
      expect(html).not.toContain("<select");
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('type="search"');
      expect(html).not.toContain("<input");
      expect(html).not.toContain(dict.clientsSearchPlaceholder);
    }
  });

  test("the preview badge is a status, not the green-on-green pill", () => {
    const html = previewHtml();
    expect(html).toContain(`data-admin-primitive="status"`);
    expect(html).toContain(dict.clientsFixtureBadge);
    expect(html).not.toContain("bg-[var(--admin-accent)] px-2.5");
  });

  test("the list picks the table or the cards by the width of the container, not of the window", () => {
    const html = previewHtml();
    expect(html).toContain("@container");
    expect(html).toContain("hidden @4xl:block");
    expect(html).toContain("@4xl:hidden");
    expect(html).not.toMatch(/\bxl:(block|hidden)\b/);
    // The table scrolls with the screen: no box of its own around it, no max-h.
    expect(html).not.toContain("max-h-");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("overflow-y");
    expect(html).toContain('data-admin-primitive="table"');
    expect(html).not.toMatch(/data-admin-primitive="panel"[^>]*overflow-hidden/);
  });

  test("no URL state shows both fixture clients in the order of the fixture", () => {
    const html = previewHtml();
    expect(html.indexOf("SMK-ANA-014")).toBeGreaterThan(-1);
    expect(html.indexOf("SMK-ANA-014")).toBeLessThan(html.indexOf("SMK-ANA-027"));
  });

  test("search narrows the preview rows", () => {
    const html = previewHtml("?q=terasa");
    expect(html).toContain("SMK-ANA-027");
    expect(html).not.toContain("SMK-ANA-014");
  });

  test("status works in the preview: no archived client shows the no-results state", () => {
    const html = previewHtml("?status=archived");
    expect(html).toContain(dict.clientsNoResultsTitle);
    expect(html).not.toContain("SMK-ANA-014");
    expect(previewHtml("?status=active")).toContain("SMK-ANA-014");
  });

  test("an empty preview without a narrowing says there are no clients", () => {
    expect(previewHtml("", "empty")).toContain(dict.clientsEmptyTitle);
    expect(previewHtml("?q=zzz")).toContain(dict.clientsNoResultsTitle);
  });

  test("sort works in the preview: by name puts the shorter same-name owner first", () => {
    const html = previewHtml("?sort=name");
    expect(html.indexOf("SMK-ANA-027")).toBeLessThan(html.indexOf("SMK-ANA-014"));
    const recent = previewHtml("?sort=recent");
    expect(recent.indexOf("SMK-ANA-014")).toBeLessThan(recent.indexOf("SMK-ANA-027"));
  });

  test("an invalid value in the URL falls back to the default", () => {
    const html = previewHtml("?status=xyz&sort=abc");
    expect(html).toContain("SMK-ANA-014");
    expect(html).toContain("SMK-ANA-027");
  });

  test("loading and error states keep the header", () => {
    expect(previewHtml("", "loading")).toContain('data-admin-primitive="loading"');
    const error = previewHtml("", "error");
    expect(error).toContain(dict.clientsErrorTitle);
    expect(error.match(/<h1/g)).toHaveLength(1);
  });
});

describe("Klijenti sidebar", () => {
  const html = renderToStaticMarkup(
    <AdminSidebarView config={resolveAdminSidebar("/admin/klijenti")} state={{}} onPatch={() => undefined} />,
  );

  test("has the search, the Status group with two options and the sort with three", () => {
    expect(html).toContain(dict.clientsSearchLabel);
    expect(html).toContain(`placeholder="${dict.clientsSearchPlaceholder}"`);
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain(`>${adminUiSr.filters.status}</span>`);
    for (const label of [dict.clientsStatusActive, dict.clientsStatusArchived]) expect(html).toContain(`>${label}</span>`);
    expect(html).not.toContain(`>${dict.clientsStatusAll}</span>`);
    expect(html).toContain(adminUiSr.filters.sort);
    for (const label of [dict.clientsSortUrgency, dict.clientsSortName, dict.clientsSortRecent]) expect(html).toContain(label);
  });

  test("a chosen status and sort show in the sidebar", () => {
    const chosen = renderToStaticMarkup(
      <AdminSidebarView config={resolveAdminSidebar("/admin/klijenti")} state={{ status: "archived", q: "Ana", sort: "name" }} onPatch={() => undefined} />,
    );
    expect(chosen).toContain(`${dict.clientsSearchLabel}: Ana`);
    expect(chosen).toContain(dict.clientsStatusArchived);
  });
});
