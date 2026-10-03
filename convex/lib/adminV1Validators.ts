import { v } from "convex/values";

export const ADMIN_V1_MIGRATION_VERSION = 1;

export const clientLifecycleStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

export const clientRoleValidator = v.union(
  v.literal("full_access"),
  v.literal("venue_management"),
  v.literal("finance"),
  v.literal("view_only"),
);

export const membershipVenueAccessValidator = v.union(
  v.literal("all"),
  v.literal("selected"),
);

export const accountContactStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
);

export const accountTagKindValidator = v.union(
  v.literal("friend"),
  v.literal("custom"),
);

export const accountCapabilityValidator = v.union(
  v.literal("manage_account"),
  v.literal("manage_venue"),
  v.literal("cancel_service"),
  v.literal("buy_services"),
  v.literal("buy_premium"),
);

export function normalizeAdminSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeAdminEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeAdminPhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeAdminSearchToken(value: string): string {
  return normalizeAdminSearchText(value).replace(/[^a-z0-9]/g, "");
}

export function normalizeAdminDirectoryQuery(value: string): string {
  const normalized = normalizeAdminSearchText(value);
  if (!normalized) return "";
  const compact = normalizeAdminSearchToken(value);
  if (/^sm[kqfl]/.test(compact) || value.includes("@")) return compact;
  const phone = normalizeAdminPhone(value);
  if (phone.length >= 3 && /^[\d+()\s./-]+$/.test(value.trim())) return phone;
  return normalized;
}

export function normalizeAdminHumanCode(
  value: string,
  prefix: "SMK" | "SML" | "SMF" | "SMQ",
): string {
  const code = value.trim().toUpperCase();
  const pattern = new RegExp(`^${prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)*$`);
  if (!pattern.test(code)) throw new Error(`invalid_${prefix.toLowerCase()}_code`);
  return code;
}
