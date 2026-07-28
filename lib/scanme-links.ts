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
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

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

export function googleReviewSlug(baseSlug: string) {
  return `${baseSlug}-google-review`;
}

export function normalizeDestinationUrl(value: string): string {
  let url = value.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}


