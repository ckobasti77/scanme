import "server-only";

/**
 * Production exposes only the prelaunch marketing surface. Operational
 * product, client and admin routes keep their own existing access rules.
 */
export function isProductionPrelaunchOnly() {
  return process.env.NODE_ENV === "production";
}
