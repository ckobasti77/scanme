export const SERVICE_TYPES = ["scanme_links", "google_review"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_STATUSES = ["inactive", "active", "archived"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const DESTINATION_KINDS = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "website",
  "reservations",
  "whatsapp",
  "viber",
  "telegram",
  "youtube",
  "custom",
] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const DESTINATION_STATES = ["active", "inactive", "archived", "deleted"] as const;
export type DestinationLifecycle = (typeof DESTINATION_STATES)[number];

export type TemplateKey = "option-two";
export type BackgroundKey = "warm-ivory";

export type AccentTokens = {
  accent: string;
  strong: string;
  soft: string;
  border: string;
  focus: string;
  onAccent: string;
};

export const DEFAULT_ACCENT = "#7A5C43";
export const DEFAULT_ACCENT_TOKENS: AccentTokens = {
  accent: DEFAULT_ACCENT,
  strong: "#493628",
  soft: "#EFE7DF",
  border: "#CDBCAD",
  focus: "#6C4D37",
  onAccent: "#FFFFFF",
};

export const DESTINATION_DEFAULTS: Record<
  DestinationKind,
  { label: string; iconKey: string }
> = {
  instagram: { label: "Instagram", iconKey: "instagram" },
  facebook: { label: "Facebook", iconKey: "facebook" },
  tiktok: { label: "TikTok", iconKey: "tiktok" },
  linkedin: { label: "LinkedIn", iconKey: "linkedin" },
  website: { label: "Website", iconKey: "globe" },
  reservations: { label: "Rezervacije", iconKey: "calendar" },
  whatsapp: { label: "WhatsApp", iconKey: "whatsapp" },
  viber: { label: "Viber", iconKey: "viber" },
  telegram: { label: "Telegram", iconKey: "telegram" },
  youtube: { label: "YouTube", iconKey: "youtube" },
  custom: { label: "Link", iconKey: "link" },
};

export const ICON_KEYS = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "whatsapp",
  "viber",
  "telegram",
  "youtube",
  "globe",
  "calendar",
  "link",
  "map-pin",
  "mail",
  "phone",
  // General-purpose icons the picker offers alongside the brand set. Every key
  // here must have a glyph in components/scanme-links/template-icon.tsx.
  "store",
  "shopping-bag",
  "utensils",
  "coffee",
  "menu",
  "ticket",
  "truck",
  "percent",
  "gift",
  "star",
  "heart",
  "sparkles",
  "clock",
  "music",
  "camera",
  "message-circle",
  "navigation",
  "tag",
  "credit-card",
  "book-open",
  "user",
  "home",
  "qr-code",
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

/**
 * Which icons the editor's picker lists, and how they are grouped. The order
 * here is the order shown in the picker. `group` only drives the picker's
 * section headings; rendering style comes from the template's icon package.
 */
export type IconGroup = "brand" | "general";

export type IconLibraryEntry = {
  key: IconKey;
  label: string;
  group: IconGroup;
};

export const ICON_LIBRARY: readonly IconLibraryEntry[] = [
  { key: "instagram", label: "Instagram", group: "brand" },
  { key: "facebook", label: "Facebook", group: "brand" },
  { key: "tiktok", label: "TikTok", group: "brand" },
  { key: "youtube", label: "YouTube", group: "brand" },
  { key: "linkedin", label: "LinkedIn", group: "brand" },
  { key: "whatsapp", label: "WhatsApp", group: "brand" },
  { key: "viber", label: "Viber", group: "brand" },
  { key: "telegram", label: "Telegram", group: "brand" },
  { key: "globe", label: "Veb-sajt", group: "general" },
  { key: "calendar", label: "Kalendar", group: "general" },
  { key: "map-pin", label: "Lokacija", group: "general" },
  { key: "navigation", label: "Navigacija", group: "general" },
  { key: "mail", label: "Email", group: "general" },
  { key: "phone", label: "Telefon", group: "general" },
  { key: "message-circle", label: "Poruka", group: "general" },
  { key: "store", label: "Prodavnica", group: "general" },
  { key: "shopping-bag", label: "Kupovina", group: "general" },
  { key: "utensils", label: "Hrana", group: "general" },
  { key: "coffee", label: "Kafa", group: "general" },
  { key: "menu", label: "Meni", group: "general" },
  { key: "ticket", label: "Ulaznica", group: "general" },
  { key: "truck", label: "Dostava", group: "general" },
  { key: "percent", label: "Popust", group: "general" },
  { key: "gift", label: "Poklon", group: "general" },
  { key: "credit-card", label: "Kartica", group: "general" },
  { key: "star", label: "Zvezda", group: "general" },
  { key: "heart", label: "Srce", group: "general" },
  { key: "sparkles", label: "Sjaj", group: "general" },
  { key: "clock", label: "Radno vreme", group: "general" },
  { key: "music", label: "Muzika", group: "general" },
  { key: "camera", label: "Galerija", group: "general" },
  { key: "tag", label: "Oznaka", group: "general" },
  { key: "book-open", label: "Meni / knjiga", group: "general" },
  { key: "user", label: "Profil", group: "general" },
  { key: "home", label: "Početna", group: "general" },
  { key: "qr-code", label: "QR kod", group: "general" },
  { key: "link", label: "Link", group: "general" },
];

export function isIconKey(value: string): value is IconKey {
  return (ICON_KEYS as readonly string[]).includes(value);
}

export type TemplateManifest = {
  key: TemplateKey;
  name: string;
  layout: "single-column";
  iconStyle: "raised-circle";
  defaultBackground: BackgroundKey;
  backgrounds: ReadonlyArray<{ key: BackgroundKey; name: string }>;
};

export const TEMPLATE_REGISTRY: Record<TemplateKey, TemplateManifest> = {
  "option-two": {
    key: "option-two",
    name: "Option 2",
    layout: "single-column",
    iconStyle: "raised-circle",
    defaultBackground: "warm-ivory",
    backgrounds: [{ key: "warm-ivory", name: "Warm ivory" }],
  },
};

export function isTemplateBackgroundCompatible(
  templateKey: string,
  backgroundKey: string,
): templateKey is TemplateKey {
  const manifest = TEMPLATE_REGISTRY[templateKey as TemplateKey];
  return Boolean(
    manifest?.backgrounds.some((background) => background.key === backgroundKey),
  );
}

export function defaultBackgroundForTemplate(templateKey: TemplateKey) {
  return TEMPLATE_REGISTRY[templateKey].defaultBackground;
}

export const SLUG_MAX_LENGTH = 66;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

export function googleReviewSlug(baseSlug: string) {
  return `${baseSlug}-google-review`;
}

