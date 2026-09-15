import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { adminSettingsSr as dict } from "@/lib/i18n/sr/admin-settings";

const { useQuery, useMutation } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
}));

vi.mock("convex/react", () => ({ useQuery, useMutation }));

import { AdminSettingsWorkspace, premiumDraftError, SETTINGS_TABS } from "./admin-settings";

const settings = {
  premiumReference: { amountMinor: 1_490, currency: "RSD" as const, validFrom: null, validUntil: null, version: 0, temporary: true },
};
const email = { configured: false, syncEnabled: false, outboundEnabled: false };
const directory = { accounts: [], friendTags: [], agreements: [], referrals: [] };

beforeEach(() => {
  useQuery.mockReset();
  useMutation.mockClear();
});

function render(tab: (typeof SETTINGS_TABS)[number], preview = false) {
  useQuery.mockReturnValueOnce(settings).mockReturnValueOnce(email);
  if (tab === "pricing" || tab === "referral") {
    useQuery.mockReturnValueOnce(directory).mockReturnValue([]);
  }
  return renderToStaticMarkup(<AdminSettingsWorkspace initialTab={tab} preview={preview} />);
}

describe("ADMIN-16 settings UI", () => {
  test("renders exactly the six required sections", () => {
    expect(SETTINGS_TABS).toEqual(["general", "subscriptions", "payments", "communication", "pricing", "referral"]);
    for (const tab of SETTINGS_TABS) expect(render(tab)).toContain(dict[tab]);
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
});
