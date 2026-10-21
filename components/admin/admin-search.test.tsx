import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { actorOptions, searchScope, searchSidebarLive } from "@/lib/admin-v2/lists/search";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { groupControlKind } from "@/lib/admin-v2/sidebar/accordion";
import { ACTIVITY_CATEGORIES, SEARCH_GROUPS, SEARCH_URL_FIELDS, searchActivitySidebar, searchResultsSidebar } from "@/lib/admin-v2/sidebar/configs/search";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminSearchSr as dict } from "@/lib/i18n/sr/admin-search";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";

// ADMIN v2 / Pretraga — above the results there is one field, the search of
// the page; the kind of record, the scope, the category and the actor are in
// the sidebar and in the URL. SSR markup, like the other admin views.

const mocks = vi.hoisted(() => ({
  search: "",
  paginated: [] as unknown[],
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
  usePaginatedQuery: (_query: unknown, args: unknown) => {
    mocks.paginated.push(args);
    return { results: [], status: "LoadingFirstPage", loadMore: () => undefined };
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/pretraga",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

// Imported after the mocks.
import { AdminSearchPreviewWorkspace, AdminSearchWorkspace } from "./admin-search";

beforeEach(() => {
  mocks.search = "";
  mocks.paginated = [];
});

function previewHtml(search = "", initialState?: "loaded" | "loading" | "empty" | "error") {
  mocks.search = search;
  return renderToStaticMarkup(<AdminSearchPreviewWorkspace initialState={initialState} />);
}

function workspace(search = "") {
  mocks.search = search;
  mocks.paginated = [];
  const html = renderToStaticMarkup(<AdminSearchWorkspace />);
  return { html, args: mocks.paginated[0] };
}

const searchFields = (html: string) => html.match(new RegExp(`placeholder="${dict.searchPlaceholder}"`, "g")) ?? [];

describe("Pretraga page", () => {
  test("Rezultati: one header, one field, no chips, no switch of views, no selects", () => {
    for (const html of [previewHtml(), previewHtml("?q=SM&group=venues"), workspace().html, workspace("?q=bistro&group=products").html]) {
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain(dict.pageTitle);
      expect(html).toContain(dict.pageSubtitle);
      expect(searchFields(html)).toHaveLength(1);
      expect(html.match(/<input/g)).toHaveLength(1);
      expect(html).not.toContain("aria-pressed");
      expect(html).not.toContain(`>${dict.searchView}</button>`);
      expect(html).not.toContain(`>${dict.activityView}</button>`);
      expect(html).not.toContain("<select");
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('type="search"');
      // The scope picker lives in the sidebar, not on the screen.
      expect(html).not.toContain(dict.scopePlaceholder);
      expect(html).not.toContain(dict.scopeSuffixNote);
    }
  });

  test("Aktivnost: one header, the title of the feed below it, no selects and no field", () => {
    for (const html of [previewHtml("?view=activity"), previewHtml("?view=activity&kategorija=client&akter=user:preview-admin"), workspace("?view=activity").html]) {
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html.match(/<h2/g)).toHaveLength(1);
      expect(html).toContain(`>${dict.activityTitle}</h2>`);
      expect(html).toContain(dict.activitySubtitle);
      expect(html).not.toContain("<select");
      expect(html).not.toContain("<input");
      expect(html).not.toContain(dict.activityAllCategories);
      expect(html).not.toContain(dict.activityAllActors);
      expect(html).not.toContain(dict.scopePlaceholder);
    }
  });

  test("the main field takes its text from the URL", () => {
    expect(previewHtml("?q=Bistro").match(/value="Bistro"/g)).toHaveLength(1);
    expect(workspace("?q=%20stalak%20").html).toContain('value="stalak"');
    expect(workspace().html).toContain('value=""');
  });

  test("the table of the preview states keep their place under the field", () => {
    expect(previewHtml("", "loading")).toContain(dict.loading);
    expect(previewHtml("?q=SM", "error")).toContain(dict.errorTitle);
    expect(previewHtml("?q=SM", "empty")).toContain(dict.emptyTitle);
    expect(previewHtml()).toContain(dict.initialTitle);
  });
});

describe("the preview filters by the URL", () => {
  test("the term, the kind of record and the scope", () => {
    const clients = previewHtml("?q=SM");
    expect(clients).toContain("Bistro Primer");
    expect(clients).toContain("kontakt@bistro-primer.rs");
    expect(previewHtml("?q=nema")).toContain(dict.emptyTitle);
    // „Lokali“: the first of the two rows, the rest behind „Učitaj još“.
    const venues = previewHtml("?q=Centar&group=venues");
    expect(venues).toContain("SML-00618");
    expect(venues).not.toContain("SML-00944");
    expect(venues).toContain(dict.loadMore);
    // A scope other than the fixture client finds nothing.
    expect(previewHtml("?q=Centar&group=venues&klijent=drugi")).toContain(dict.emptyTitle);
    // A bare number is a local SMF suffix: it needs the scope.
    expect(previewHtml("?q=031&group=products")).toContain(dict.emptyTitle);
    expect(previewHtml("?q=031&group=products&klijent=preview-account&opseg=Bistro%20Primer")).toContain("SMF-00241-031");
    // An invalid kind falls back to clients.
    expect(previewHtml("?q=SM&group=xyz")).toContain("kontakt@bistro-primer.rs");
  });

  test("the activity by the category and the actor", () => {
    const all = previewHtml("?view=activity");
    expect(all).toContain("Bistro Primer · SMK-00241");
    expect(all).toContain("Bistro Primer · podrška");
    const category = previewHtml("?view=activity&kategorija=communication");
    expect(category).not.toContain("Bistro Primer · SMK-00241");
    expect(category).toContain("Bistro Primer · podrška");
    const actor = previewHtml("?view=activity&akter=user:preview-admin");
    expect(actor).toContain("Bistro Primer · SMK-00241");
    expect(actor).not.toContain("Bistro Primer · podrška");
    expect(previewHtml("?view=activity&kategorija=task")).toContain(dict.activityEmptyTitle);
    expect(previewHtml("?view=activity&kategorija=abc")).toContain("Bistro Primer · podrška");
  });
});

describe("the connected page", () => {
  test("Rezultati sends the same arguments to adminGlobalSearch.list as before", () => {
    // No term: the query is skipped.
    expect(workspace("").args).toBe("skip");
    expect(workspace("?group=venues").args).toBe("skip");
    expect(workspace("?q=bistro").args).toEqual({ term: "bistro", group: "clients" });
    expect(workspace("?q=%20bistro%20&group=venues").args).toEqual({ term: "bistro", group: "venues" });
    expect(workspace("?q=x&group=xyz").args).toEqual({ term: "x", group: "clients" });
    expect(workspace("?q=x&klijent=a1&opseg=Bistro").args).toEqual({ term: "x", group: "clients", accountId: "a1" });
    expect(workspace("?q=x&group=products&lokal=b1&task=t1").args).toEqual({ term: "x", group: "products", businessId: "b1" });
  });

  test("Aktivnost sends the same arguments to adminActivity.list as before", () => {
    expect(workspace("?view=activity").args).toEqual({});
    expect(workspace("?view=activity&kategorija=finance").args).toEqual({ category: "finance" });
    expect(workspace("?view=activity&kategorija=abc").args).toEqual({});
    expect(workspace("?view=activity&akter=user:u1").args).toEqual({ actorKey: "user:u1" });
    expect(workspace("?view=activity&q=x&klijent=a1&lokal=b1&kategorija=task&akter=kind:system").args).toEqual({
      accountId: "a1",
      businessId: "b1",
      category: "task",
      actorKey: "kind:system",
    });
  });
});

describe("Pretraga sidebar", () => {
  const scopeBody = <p>TEST telo opsega</p>;
  const draw = (search = "", actors: Parameters<typeof actorOptions>[0] = []) => {
    const state = readUrlState(SEARCH_URL_FIELDS, search);
    const view = new URLSearchParams(search).get("view");
    const live = searchSidebarLive({
      scope: searchScope(state),
      scopeBody,
      ...(view === "activity" ? { actors: actorOptions(actors, (kind) => (kind === "admin" ? dict.actorAdmin : dict.actorUnknown)) } : {}),
    });
    return renderToStaticMarkup(
      <AdminSidebarView config={resolveAdminSidebar("/admin/pretraga", search)} live={live} state={state} onPatch={() => undefined} />,
    );
  };

  test("the registry gives the configuration of each view", () => {
    expect(resolveAdminSidebar("/admin/pretraga")).toBe(searchResultsSidebar);
    expect(resolveAdminSidebar("/admin/pretraga", "?view=activity")).toBe(searchActivitySidebar);
    expect(searchResultsSidebar.views?.items).toHaveLength(2);
    expect(searchResultsSidebar.groups?.map((group) => group.id)).toEqual(["group", "opseg"]);
    expect(searchActivitySidebar.groups?.map((group) => group.id)).toEqual(["kategorija", "akter", "opseg"]);
  });

  test("Rezultati: the two views, „Vrsta“ without „Sve“ and with „Klijenti / SMK“ chosen, and „Opseg“", () => {
    const html = draw();
    expect(html).toContain(`>${dict.searchView}</span>`);
    expect(html).toContain(`>${dict.activityView}</span>`);
    expect(html).toContain(`>${dict.groupLabel}</span>`);
    expect(html).toContain(`<span class="text-[var(--admin-text-muted)]"> · ${dict.groupClients}</span>`);
    expect(html).toContain(`>${dict.scopeLabel}</span>`);
    expect(html).toContain("TEST telo opsega");
    expect(html).not.toContain(`>${adminUiSr.filters.any}</span>`);
    expect(html.match(/data-admin-filter-toggle=""/g)).toHaveLength(2);
    // All six kinds are drawn, a radio list, and exactly one is chosen.
    expect(groupControlKind(SEARCH_GROUPS.length)).toBe("radio");
    for (const label of [dict.groupClients, dict.groupVenues, dict.groupContacts, dict.groupProducts, dict.groupChannels, dict.groupOrders]) {
      expect(html).toContain(`>${label}</span>`);
    }
    expect(html.match(/<input type="radio"[^>]*checked=""/g)?.length).toBe(2);
    // No chip: the default kind is not a filter.
    expect(html).not.toContain(adminUiSr.filters.activeLabel);
  });

  test("another kind in the URL is chosen and has a chip; the scope has a summary and a chip", () => {
    const html = draw("?group=orders&klijent=a1&opseg=TEST%20Klijent");
    expect(html).toContain(`<span class="text-[var(--admin-text-muted)]"> · ${dict.groupOrders}</span>`);
    expect(html).toContain(`<span class="text-[var(--admin-text-muted)]"> · TEST Klijent</span>`);
    expect(html).toContain(`aria-label="${adminUiSr.filters.removeChip.replace("{label}", `${dict.groupLabel}: ${dict.groupOrders}`)}"`);
    expect(html).toContain(`aria-label="${adminUiSr.filters.removeChip.replace("{label}", `${dict.scopeLabel}: TEST Klijent`)}"`);
  });

  test("Aktivnost: the category is a search-select, the actor has the options of the page, „Opseg“ is the same", () => {
    expect(ACTIVITY_CATEGORIES).toHaveLength(10);
    const html = draw("?view=activity", [
      { actorKey: "user:u1", actorKind: "admin", displayName: "TEST Admin" },
      { actorKey: "kind:system", actorKind: "system", displayName: "TEST Sistem" },
    ]);
    expect(html).toContain(`>${dict.activityCategoryLabel}</span>`);
    expect(html).toContain(`>${dict.activityActorLabel}</span>`);
    expect(html).toContain(`>${dict.scopeLabel}</span>`);
    expect(html).toContain("TEST telo opsega");
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="${adminUiSr.filters.searchIn.replace("{group}", dict.activityCategoryLabel)}"`);
    expect(html).toContain(">TEST Admin · Admin</span>");
    expect(html).toContain(`>TEST Sistem · ${dict.actorUnknown}</span>`);
    // The kind of record belongs to Rezultati only.
    expect(html).not.toContain(`>${dict.groupLabel}</span>`);
  });

  test("Aktivnost: the choice of the actor is the header of its group", () => {
    const html = draw("?view=activity&akter=user:u1", [{ actorKey: "user:u1", actorKind: "admin", displayName: "TEST Admin" }]);
    expect(html).toContain(`<span class="text-[var(--admin-text-muted)]"> · TEST Admin · ${dict.actorAdmin}</span>`);
  });
});

describe("Pretraga reveal attributes", () => {
  test("the field is text and the results are rows, in the preview and in the feed", () => {
    const results = previewHtml("?q=SM");
    expect(results).toContain('<div data-admin-reveal="text" class="relative');
    expect(results).toContain('<div data-admin-reveal="rows" class="grid gap-2"');
    const feed = previewHtml("?view=activity");
    expect(feed).toContain('<header data-admin-reveal="text"');
    expect(feed).toContain('<div data-admin-reveal="rows" class="grid gap-2"');
    expect(workspace().html).toContain('<div data-admin-reveal="text" class="relative');
  });
});
