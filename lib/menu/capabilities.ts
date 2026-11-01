// ScanMe Menu V1 — Standard vs Premium capabilities (K03; master §2.2, §7.7).
//
// THE one place that says what Premium unlocks in ScanMe Menu. Premium lives on
// the ScanMe ACCOUNT, never on a single service (master §2.2): Convex resolves
// the tier through the existing entitlement chain (getEntitlement →
// convex/lib/menuCapabilities.ts) and every gate — mutations now, publish
// validation (K05) and UI locks with their surfaces — reads this table.
// The legacy renderer's MenuLimits (convex/lib/plans.ts) is a different,
// older table and is not changed here (K01 OTV 7).

export type MenuTier = "standard" | "premium";

/** The Premium switches (master §2.2). */
export const MENU_PREMIUM_CAPABILITIES = [
  /** Room service module (master §5.3, §21.4). */
  "roomService",
  /** AI translation suggestion; never published on its own (§7.7). */
  "aiTranslations",
  /** Scheduled promotions; manual promotions are Standard (§7.6). */
  "scheduledPromos",
  /** Additional layout and design variants. */
  "extraLayouts",
  /** Advanced analytics: 90 days, custom period, comparison, filters (§14). */
  "advancedAnalytics",
  /** CSV export of analytics. */
  "csvExport",
  /** Removing or reducing ScanMe branding. */
  "reducedBranding",
] as const;
export type MenuPremiumCapability = (typeof MENU_PREMIUM_CAPABILITIES)[number];

/** Standard: at most two languages per Menu service, the source language included (§2.2, §7.7). */
export const MENU_STANDARD_MAX_LANGUAGES = 2;
/** Premium has no commercial language limit; this is the technical ceiling (K01 OTV 17). */
export const MENU_MAX_LANGUAGES = 10;

export type MenuCapabilities = {
  tier: MenuTier;
  /** Languages per Menu service, the source language included. */
  maxLanguages: number;
} & Record<MenuPremiumCapability, boolean>;

function capabilitiesOf(tier: MenuTier): MenuCapabilities {
  const premium = tier === "premium";
  const switches = Object.fromEntries(
    MENU_PREMIUM_CAPABILITIES.map((capability) => [capability, premium]),
  ) as Record<MenuPremiumCapability, boolean>;
  return {
    tier,
    maxLanguages: premium ? MENU_MAX_LANGUAGES : MENU_STANDARD_MAX_LANGUAGES,
    ...switches,
  };
}

export const MENU_STANDARD: MenuCapabilities = capabilitiesOf("standard");
export const MENU_PREMIUM: MenuCapabilities = capabilitiesOf("premium");

/**
 * The capabilities of a resolved `scanme_menu` plan key. Only "premium" is
 * Premium (enterprise accounts already resolve to it in MENU_ACCOUNT_PLAN_TIER);
 * no entitlement, "basic" or an unknown key is Standard — the honest default.
 */
export function menuCapabilitiesFor(planKey: string | null | undefined): MenuCapabilities {
  return planKey === "premium" ? MENU_PREMIUM : MENU_STANDARD;
}
