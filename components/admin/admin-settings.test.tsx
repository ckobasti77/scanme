import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { readUrlState } from "@/lib/admin-v2/query/url-state";
import { SETTINGS_URL_FIELDS } from "@/lib/admin-v2/sidebar/configs/pages";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminSettingsSr as dict } from "@/lib/i18n/sr/admin-settings";

const { useQuery, useMutation, nav } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
  nav: { search: "" },
}));

vi.mock("convex/react", () => ({ useQuery, useMutation }));
// The section comes from the URL (?tab=), written by the sidebar.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/podesavanja",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));

import { AdminSettingsWorkspace, premiumDraftError, SETTINGS_TABS, settingsTabIntercept } from "./admin-settings";

const settings = {
  premiumReference: { amountMinor: 1_490, currency: "RSD" as const, validFrom: null, validUntil: null, version: 0, temporary: true },
};
const email = { configured: false, syncEnabled: false, outboundEnabled: false };
const directory = { accounts: [], friendTags: [], agreements: [], referrals: [] };

beforeEach(() => {
  useQuery.mockReset();
  useMutation.mockClear();
  nav.search = "";
});

function render(tab: (typeof SETTINGS_TABS)[number], preview = false) {
  useQuery.mockReturnValueOnce(settings).mockReturnValueOnce(email);
  if (tab === "pricing" || tab === "referral") {
    useQuery.mockReturnValueOnce(directory).mockReturnValue([]);
  }
  nav.search = tab === "general" ? "" : `tab=${tab}`;
  return renderToStaticMarkup(<AdminSettingsWorkspace preview={preview} />);
}

describe("ADMIN-16 settings UI", () => {
  test("renders exactly the six required sections", () => {
    expect(SETTINGS_TABS).toEqual(["general", "subscriptions", "payments", "communication", "pricing", "referral"]);
    for (const tab of SETTINGS_TABS) expect(render(tab)).toContain(dict[tab]);
  });

  test("has no tab row: one h1, the section is chosen in the sidebar", () => {
    for (const tab of SETTINGS_TABS) {
      const html = render(tab);
      expect(html).not.toContain('role="tablist"');
      expect(html).not.toContain('role="tab"');
      expect(html).not.toContain("data-settings-tab");
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain(`<h2 id="settings-${tab}"`);
    }
  });

  test("an invalid ?tab= shows the general section", () => {
    useQuery.mockReturnValueOnce(settings).mockReturnValueOnce(email);
    nav.search = "tab=xyz";
    const html = renderToStaticMarkup(<AdminSettingsWorkspace />);
    expect(html).toContain('<h2 id="settings-general"');
    expect(html).toContain(dict.timezone);
  });

  test("the page header stands while the data loads", () => {
    useQuery.mockReturnValue(undefined);
    const html = renderToStaticMarkup(<AdminSettingsWorkspace />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(dict.title);
    expect(html).toContain(dict.loading);
  });

  test("the sidebar lists the six sections and marks the one in the URL", () => {
    const config = resolveAdminSidebar("/admin/podesavanja");
    expect(config.views?.items).toHaveLength(6);
    const html = renderToStaticMarkup(<AdminSidebarView config={config} state={readUrlState(SETTINGS_URL_FIELDS, "?tab=pricing")} onPatch={() => undefined} />);
    for (const tab of SETTINGS_TABS) expect(html).toContain(`>${dict[tab]}</span>`);
    expect(html.match(/type="radio"/g)).toHaveLength(6);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    const checkedLabel = (markup: string) => markup.match(/checked=""\/><span[^>]*>([^<]*)<\/span>/)?.[1];
    expect(checkedLabel(html)).toBe(dict.pricing);
    const byDefault = renderToStaticMarkup(<AdminSidebarView config={config} state={readUrlState(SETTINGS_URL_FIELDS, "?tab=xyz")} onPatch={() => undefined} />);
    expect(checkedLabel(byDefault)).toBe(dict.general);
  });

  test("the interceptor lets a clean move through and cancels a move that would lose a draft", () => {
    expect(settingsTabIntercept({ tab: "pricing" }, undefined, false)).toEqual({ patch: { tab: "pricing" }, pendingTab: null });
    expect(settingsTabIntercept({ tab: "referral" }, "pricing", true)).toEqual({ patch: null, pendingTab: "referral" });
    expect(settingsTabIntercept({ tab: null }, "pricing", true)).toEqual({ patch: null, pendingTab: "general" });
    expect(settingsTabIntercept({ tab: "pricing" }, "pricing", true)).toEqual({ patch: { tab: "pricing" }, pendingTab: null });
    expect(settingsTabIntercept({ tab: "general" }, undefined, true)).toEqual({ patch: { tab: "general" }, pendingTab: null });
    expect(settingsTabIntercept({ other: "x" }, "pricing", true)).toEqual({ patch: { other: "x" }, pendingTab: null });
  });

  test("keeps lifecycle facts read-only and separates warning from status", () => {
    const html = render("subscriptions");
    expect(html).toContain(dict.readOnly);
    expect(html).toContain(`7 ${dict.days}`);
    expect(html).toContain(`15 ${dict.days}`);
    expect(html).toContain(dict.lifecycleNote);
    expect(html).not.toContain('type="number"');
  });

  test("shows only truthful payment and communication availability", () => {
    const payments = render("payments");
    expect(payments).toContain(dict.bankTransfer);
    expect(payments).toContain(dict.supported);
    expect(payments).toContain(dict.unavailable);
    expect(payments).toContain(dict.notConfigured);
    const communication = render("communication");
    expect(communication).toContain(dict.needsConfiguration);
    expect(communication).toContain(dict.notConnected);
    expect(communication).not.toContain("Povezan");
  });

  test("labels the 1,490 RSD reference as temporary and keeps agreements explicit", () => {
    const html = render("pricing");
    expect(html).toContain(dict.temporary);
    expect(html).toContain("1.490");
    expect(html).toContain(dict.agreementNote);
    expect(html).toContain(dict.friendWaiverNote);
    expect(html).toContain(dict.futurePrice);
  });

  test("keeps an unconfigured referral free of invented reward terms", () => {
    const html = render("referral");
    expect(html).toContain(dict.referralNote);
    expect(html).toContain(dict.rewardNote);
    expect(html).toContain(dict.referralRegister);
  });

  test("enables saving only for a complete future premium draft", () => {
    const validFrom = Date.parse("2026-10-01T10:00:00Z");
    const now = Date.parse("2026-09-15T10:00:00Z");
    expect(premiumDraftError({ amountMinor: -1, validFrom, validUntil: null, reason: "Razlog", now })).toBe("amount");
    expect(premiumDraftError({ amountMinor: 1_490, validFrom: now, validUntil: null, reason: "Razlog", now })).toBe("date");
    expect(premiumDraftError({ amountMinor: 1_490, validFrom, validUntil: null, reason: "", now })).toBe("reason");
    expect(premiumDraftError({ amountMinor: 1_490, validFrom, validUntil: null, reason: "Buduća referentna cena", now })).toBeNull();
  });

  test("keeps fixtures out of production and clearly labels the dev preview", () => {
    expect(render("pricing", true)).toContain(dict.previewBadge);
    expect(render("pricing", true)).toContain(dict.previewDescription);
    const productionRoute = readFileSync(resolve(process.cwd(), "app/admin/podesavanja/page.tsx"), "utf8");
    const previewRoute = readFileSync(resolve(process.cwd(), "app/dev/admin-settings-preview/page.tsx"), "utf8");
    expect(productionRoute).not.toContain("preview");
    expect(previewRoute).toContain('process.env.NODE_ENV === "production"');
    expect(previewRoute).toContain("notFound()");
  });

  test("guards draft navigation and duplicate settings submissions", () => {
    const source = readFileSync(resolve(process.cwd(), "components/admin/admin-settings.tsx"), "utf8");
    expect(source).toContain("if (locked.current) return");
    expect(source).toContain("pendingTab");
    expect(source).toContain("onDirtyChange={setRulesDirty}");
    expect(source.match(/disabled=\{pending\}/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("disabled={pending || !priceDraftValid}");
  });
});
