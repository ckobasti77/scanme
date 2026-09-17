export type AdminSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type LegacyLocationService = "links" | "review" | "venue" | "menu";

export function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function withSearchParams(
  destination: string,
  searchParams: AdminSearchParams,
  skipKeys: readonly string[] = [],
) {
  const [pathname, existingQuery = ""] = destination.split("?", 2);
  const query = new URLSearchParams(existingQuery);
  const skipped = new Set(skipKeys);

  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (skipped.has(key) || rawValue === undefined) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) query.append(key, value);
  }

  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export function safeAdminReturnPath(value: string | string[] | undefined) {
  const candidate = firstSearchParam(value);
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return "/admin";
  }

  const base = new URL("https://scanme.invalid");
  const parsed = new URL(candidate, base);
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (
    parsed.origin !== base.origin ||
    (pathname !== "/admin" && !pathname.startsWith("/admin/")) ||
    pathname === "/admin/login"
  ) {
    return "/admin";
  }

  return `${parsed.pathname}${parsed.search}`;
}

export function legacyLocationTarget({
  accountId,
  businessId,
  service,
  serviceProfileId,
}: {
  accountId: string | null;
  businessId: string;
  service?: LegacyLocationService;
  serviceProfileId?: string;
}) {
  if (!accountId) return null;

  if (!service) {
    const query = new URLSearchParams({ section: "venues", venue: businessId });
    return `/admin/klijenti/${encodeURIComponent(accountId)}?${query}`;
  }

  if (service === "venue" || service === "menu" || !serviceProfileId) {
    return null;
  }

  const target = service === "links"
    ? "/admin/usluge/links"
    : "/admin/usluge/review";
  return `${target}?${new URLSearchParams({ profile: serviceProfileId })}`;
}
