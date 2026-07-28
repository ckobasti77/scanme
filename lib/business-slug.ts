export const BUSINESS_SLUG_MAX_LENGTH = 66;
export const GOOGLE_REVIEW_SLUG_SUFFIX = "-google-review";

export const RESERVED_ROOT_SLUGS = [
  "admin",
  "api",
  "icon",
  "client-panel",
  "preview-login",
] as const;

const reservedRootSlugs = new Set<string>(RESERVED_ROOT_SLUGS);

export function isReservedRootSlug(slug: string) {
  return reservedRootSlugs.has(slug);
}

export function businessSlugFromName(name: string) {
  const slug = name
    .trim()
    .replace(/[Đđ]/g, (letter) => (letter === "Đ" ? "Dj" : "dj"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BUSINESS_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

  if (!slug) {
    throw new Error(
      "Naziv lokala mora sadržati bar jedno latinično slovo ili cifru da bi adresa mogla da se napravi.",
    );
  }
  if (isReservedRootSlug(slug)) {
    throw new Error("Ovaj naziv lokala proizvodi adresu rezervisanu za ScanMe sistem.");
  }
  return slug;
}

export function googleReviewSlugFromBase(baseSlug: string) {
  return `${baseSlug}${GOOGLE_REVIEW_SLUG_SUFFIX}`;
}

export function canonicalBusinessSlugs(name: string) {
  const slug = businessSlugFromName(name);
  return {
    slug,
    reviewSlug: googleReviewSlugFromBase(slug),
  };
}
