export function requireText(
  value: string,
  label: string,
  minLength: number,
  maxLength: number,
) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new Error(`${label} mora imati između ${minLength} i ${maxLength} karaktera.`);
  }
  return normalized;
}

export function optionalText(value: string | undefined, maxLength: number) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new Error(`Polje može imati najviše ${maxLength} karaktera.`);
  }
  return normalized;
}

export function isSafeGoogleReviewDestination(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (hostname === "search.google.com") {
      return path.startsWith("/local/writereview");
    }
    if (hostname === "www.google.com" || hostname === "google.com") {
      return path.startsWith("/maps");
    }
    if (hostname === "g.page") {
      return path.startsWith("/r/");
    }
    if (hostname === "maps.app.goo.gl") {
      return path.length > 1;
    }
    if (hostname === "goo.gl") {
      return path.startsWith("/maps/");
    }

    return false;
  } catch {
    return false;
  }
}

export function requireSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new Error("QR oznaka nije ispravna.");
  }
  return slug;
}
