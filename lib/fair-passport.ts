export function fairPassportBrandSlug(brandName: string): string {
  return brandName
    .replace(/^TEST\s+/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sr-Latn")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "brend";
}

export function fairPassportDisplayName(brandName: string, displayName: string): string {
  const brand = brandName.replace(/^TEST\s+/i, "").trim();
  const model = displayName.replace(/^TEST\s+/i, "").trim();
  return model.toLocaleLowerCase("sr-Latn").startsWith(`${brand.toLocaleLowerCase("sr-Latn")} `)
    ? model.slice(brand.length).trim()
    : model;
}
