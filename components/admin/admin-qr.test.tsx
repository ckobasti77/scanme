import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

// ADMIN v2 — QR kodovi: no filter block above the list. The search and the
// filters are in the sidebar and in the URL; the preview filters its fixture
// rows with the same state, the workspace sends it to the query. SSR markup,
// like the other admin views.

const nav = vi.hoisted(() => ({ search: "" }));
const queries = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/operativa/qr",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    queries.calls.push(args);
    return { results: [], status: "Exhausted", loadMore: () => undefined };
  },
  useQuery: () => undefined,
}));

import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminProductsSr as dict } from "@/lib/i18n/sr/admin-products";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminQrPreview } from "./admin-qr";
import { AdminQrWorkspace } from "./admin-qr-workspace";

function preview(search = "") {
  nav.search = search;
  return renderToStaticMarkup(<AdminQrPreview />);
}

const triggers = (html: string) => html.match(/data-channel-trigger/g)?.length ?? 0;

beforeEach(() => {
  nav.search = "";
  queries.calls = [];
});

describe("QR kodovi: the page", () => {
  test("one H1 and the header; no search, select or tabs above the list", () => {
    const html = preview();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${dict.qrModuleTitle}</h1>`);
    expect(html).toContain(adminV1Sr.navOperations);
    expect(html).toContain(dict.previewBadge);
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain(dict.channelSearchLabel);
    expect(html).not.toContain(dict.bindingAll);
  });

  test("the URL state filters the preview rows: povezanost, vrsta, status and the search", () => {
    expect(triggers(preview())).toBe(6);
    expect(triggers(preview("?veza=digital"))).toBe(2);
    expect(triggers(preview("?veza=physical"))).toBe(4);
    expect(triggers(preview("?vrsta=nfc"))).toBe(2);
    expect(triggers(preview("?status=problem"))).toBe(2);
    expect(triggers(preview("?veza=physical&vrsta=qr"))).toBe(2);
    expect(triggers(preview("?q=SMQ-0102-01-016"))).toBe(2);
    expect(triggers(preview("?q=rz11"))).toBe(2);
    const none = preview("?q=nepostojeci");
    expect(triggers(none)).toBe(0);
    expect(none).toContain(dict.noChannelsTitle);
  });

  test("the table and the cards break on the width of the screen, not the window", () => {
    const html = preview();
    expect(html).toContain("@container");
    expect(html).toContain("hidden @4xl:block");
    expect(html).toContain("@4xl:hidden");
    expect(html).not.toContain("min-w-[64rem]");
    expect(html).not.toMatch(/class="[^"]*\blg:(hidden|block)\b/);
  });
});

describe("QR kodovi: the sidebar", () => {
  const html = renderToStaticMarkup(<AdminSidebarView config={resolveAdminSidebar("/admin/operativa/qr")} state={{}} onPatch={() => undefined} />);

  test("the area navigation, the search and three groups", () => {
    expect(html).toContain(adminV1Sr.navOperations);
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain(dict.channelSearchLabel);
    expect(html.match(/data-admin-filter-toggle=""/g)).toHaveLength(3);
    for (const label of [dict.bindingFilter, dict.kindFilter, dict.colStatus]) expect(html).toContain(`>${label}</span>`);
  });
});

describe("QR kodovi: the workspace sends the same query arguments as before", () => {
  const render = (search: string) => { nav.search = search; queries.calls = []; renderToStaticMarkup(<AdminQrWorkspace />); return queries.calls[0]; };

  test("empty state: all channels, newest first", () => {
    expect(render("")).toEqual({ direction: "desc" });
  });

  test("every filter and the search become arguments", () => {
    expect(render("?q=SMQ-0102&veza=physical&vrsta=nfc&status=problem")).toEqual({ search: "SMQ-0102", binding: "physical", kind: "nfc", state: "problem", direction: "desc" });
    expect(render("?veza=digital")).toEqual({ binding: "digital", direction: "desc" });
  });

  test("an invalid value is ignored", () => {
    expect(render("?veza=sve&vrsta=ostalo&status=zatvoren")).toEqual({ direction: "desc" });
  });
});
