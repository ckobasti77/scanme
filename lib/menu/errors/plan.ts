// ScanMe Menu V1 (K03) — machine error codes of the commercial plan gate
// (master §2.2): a Premium capability on a Standard account, and the Standard
// language limit. Dependency-free like ./core.ts; the Serbian text lives in the
// `menu-domen` dictionary (`errors[code]`).
export const MENU_PLAN_ERROR = {
  /** The capability is part of the Premium account (lib/menu/capabilities.ts). */
  premiumRequired: "plan/premium_required",
  /** Standard allows at most two languages per Menu service, the source included. */
  languageLimit: "plan/language_limit",
} as const;

export type MenuPlanErrorCode = (typeof MENU_PLAN_ERROR)[keyof typeof MENU_PLAN_ERROR];
