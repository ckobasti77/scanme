// Dev-only galerija: renderuje svaki preset u svakoj varijaciji kroz pravi
// public template, da se izgled poredi sa dizajnerskom referencom bez ulaska u
// editor i bez podataka iz baze. Nedostupna u produkciji.
//
// Sa `?harness=1` ista ruta postaje korpus zlatnog harness-a (TASK-05 /
// RFC-001 §2.11): preset × varijacija × dozvoljena kategorija pozadine,
// svaki slučaj kroz pravi `ScanMeLinksTemplate` bez `preview` režima.

import { notFound } from "next/navigation";
import { ScanMeLinksTemplate } from "@/components/scanme-links/templates/registry";
import type {
  PublicDestination,
  ScanMeLinksViewModel,
} from "@/components/scanme-links/templates/types";
import optionTwoStyles from "@/components/scanme-links/templates/option-two/option-two-template.module.css";
import templateIconStyles from "@/components/scanme-links/template-icon.module.css";
import { DEFAULT_ACCENT_TOKENS } from "@/lib/scanme-links";
import {
  applyVariation,
  variationsForPreset,
  type ScanMeLinksVariation,
} from "@/lib/scanme-links-variations";
import {
  createDefaultScanMeLinksDesignV2,
  SCANME_LINKS_PRESET_CAPABILITIES,
  SCANME_LINKS_PRESET_KEYS,
  type ScanMeLinksBackgroundCategory,
  type ScanMeLinksBackgroundV2,
  type ScanMeLinksColorsV2,
  type ScanMeLinksDesignV2,
  type ScanMeLinksPresetKey,
} from "@/lib/scanme-links-design";
import styles from "./template-gallery.module.css";

type GallerySpec = {
  presetKey: ScanMeLinksPresetKey;
  title: string;
  description: string;
  destinations: ReadonlyArray<Pick<PublicDestination, "kind" | "label" | "iconKey">>;
  /** One business name per variation, mirroring the design reference. */
  names: readonly [string, string, string, string];
};

const SPECS: readonly GallerySpec[] = [
  {
    presetKey: "nude-editorial",
    title: "Nude Editorial",
    description: "Styling & Spa",
    destinations: [
      { kind: "instagram", label: "Book Now", iconKey: "instagram" },
      { kind: "reservations", label: "Calendar", iconKey: "calendar" },
      { kind: "website", label: "Website", iconKey: "globe" },
    ],
    names: ["Aurora Hair", "Serenity Spa", "Manipedi Studio", "Blush Makeup"],
  },
  {
    presetKey: "urban-pop",
    title: "Urban Pop",
    description: "Fast Food",
    destinations: [
      { kind: "tiktok", label: "TikTok", iconKey: "tiktok" },
      { kind: "custom", label: "Order Online", iconKey: "link" },
      { kind: "website", label: "Location", iconKey: "map-pin" },
    ],
    names: ["Burger Buzz", "Boba Time", "Taco Shack", "Chicken Spot"],
  },
  {
    presetKey: "artisan-craft",
    title: "Artisan Craft",
    description: "Specialty Coffee & Pastries",
    destinations: [
      { kind: "reservations", label: "Book Now", iconKey: "calendar" },
      { kind: "custom", label: "Events", iconKey: "calendar" },
      { kind: "website", label: "Website", iconKey: "globe" },
    ],
    names: [
      "The Daily Grind",
      "The Craft Brewery",
      "The Rolling Pin",
      "The Iron Bistro",
    ],
  },
  {
    presetKey: "glass-minimalist",
    title: "Glass Minimalist",
    description: "",
    destinations: [
      { kind: "linkedin", label: "LinkedIn", iconKey: "linkedin" },
      { kind: "custom", label: "Contact", iconKey: "mail" },
      { kind: "website", label: "Website", iconKey: "globe" },
    ],
    names: ["Apex Solutions", "The Tech Lab", "Moda Boutique", "The Winery"],
  },
  {
    presetKey: "wanderlust",
    title: "Wanderlust",
    description: "Travel & Adventures",
    destinations: [
      { kind: "instagram", label: "Instagram", iconKey: "instagram" },
      { kind: "youtube", label: "YouTube", iconKey: "youtube" },
      { kind: "website", label: "Blog", iconKey: "globe" },
    ],
    names: [
      "Wanderlust Co",
      "Nordic Horizon",
      "Alpine Escapes",
      "Aurora Expeditions",
    ],
  },
  {
    presetKey: "bistro",
    title: "The Iron Bistro",
    description: "Rustic & Dining",
    destinations: [
      { kind: "reservations", label: "Book Now", iconKey: "coffee" },
      { kind: "custom", label: "Events", iconKey: "calendar" },
      { kind: "website", label: "Website", iconKey: "globe" },
    ],
    names: [
      "The Iron Bistro",
      "Copper Kettle",
      "Old Oak Tavern",
      "Vintage Cellar",
    ],
  },
  {
    presetKey: "bloom",
    title: "Bloom Café",
    description: "Coffee & Community",
    destinations: [
      { kind: "instagram", label: "Instagram", iconKey: "instagram" },
      { kind: "facebook", label: "Facebook", iconKey: "facebook" },
      { kind: "custom", label: "Twitter", iconKey: "link" },
    ],
    names: [
      "Bloom Café",
      "Lavender Lounge",
      "Rose Petal Bake",
      "Mint & Honey",
    ],
  },
  {
    presetKey: "chicken",
    title: "Chicken Spot",
    description: "Fast Food",
    destinations: [
      { kind: "tiktok", label: "TikTok", iconKey: "tiktok" },
      { kind: "custom", label: "Order Online", iconKey: "utensils" },
      { kind: "website", label: "Location", iconKey: "map-pin" },
    ],
    names: [
      "Chicken Spot",
      "Tangerine Wings",
      "Cherry Chili",
      "Neon Nugget",
    ],
  },
  {
    presetKey: "pulse",
    title: "Pulse",
    description: "Cocktails & Nightlife",
    destinations: [
      { kind: "instagram", label: "Instagram", iconKey: "instagram" },
      { kind: "tiktok", label: "TikTok", iconKey: "tiktok" },
      { kind: "custom", label: "Events", iconKey: "calendar" },
    ],
    names: [
      "Pulse Nightlife",
      "Violet Velocity",
      "Matrix Lounge",
      "Solar Rave",
    ],
  },
];

function buildView(
  spec: GallerySpec,
  variation: ScanMeLinksVariation,
  name: string,
): ScanMeLinksViewModel {
  const design = applyVariation(
    createDefaultScanMeLinksDesignV2(spec.presetKey),
    variation,
  );

  return {
    displayName: name,
    description: spec.description,
    logoUrl: null,
    templateKey: "option-two",
    backgroundKey: "warm-ivory",
    accent: design.colors.accent,
    accentTokens: DEFAULT_ACCENT_TOKENS,
    design,
    backgroundImageUrl: null,
    backgroundVideoUrl: null,
    destinations: spec.destinations.map((destination, index) => ({
      id: `${variation.key}-${index}`,
      kind: destination.kind,
      label: destination.label,
      url: "https://example.com",
      iconKey: destination.iconKey,
      state: "active",
    })),
  };
}

// ---------------------------------------------------------------------------
// Golden-harness corpus (`?harness=1`)
// ---------------------------------------------------------------------------

/**
 * Deterministic fixture background per category. Mirrors the shapes the
 * editor produces so `normalizeDesignForPreset` passes every value through
 * unchanged: the category and variant are always taken from the preset's own
 * capability allow-list, and every numeric sits inside its clamp range.
 */
function harnessBackground(
  presetKey: ScanMeLinksPresetKey,
  category: ScanMeLinksBackgroundCategory,
  colors: ScanMeLinksColorsV2,
): ScanMeLinksBackgroundV2 {
  const variants =
    SCANME_LINKS_PRESET_CAPABILITIES[presetKey].allowedBackgroundVariants;

  switch (category) {
    case "gradient":
      return {
        category: "gradient",
        variant: variants.gradient?.[0] ?? "linear",
        startColor: colors.page,
        endColor: colors.accent,
        angle: 135,
        centerX: 50,
        centerY: 50,
      };
    case "pattern":
      return {
        category: "pattern",
        variant: variants.pattern?.[0] ?? "grid",
        backgroundColor: colors.page,
        patternColor: colors.accent,
        scale: 24,
        opacity: 0.18,
      };
    case "texture":
      return {
        category: "texture",
        variant: variants.texture?.[0] ?? "paper",
        backgroundColor: colors.page,
        tintColor: colors.accent,
        intensity: 0.2,
      };
    case "media":
      return {
        category: "media",
        mediaType: variants.media?.[0] ?? "image",
        fit: "cover",
        zoom: 1,
        positionX: 50,
        positionY: 50,
        overlayColor: colors.page,
        overlayOpacity: 0.12,
      };
    case "animation":
      return {
        category: "animation",
        variant: variants.animation?.[0] ?? "aurora",
        baseColor: colors.page,
        accentColor: colors.accent,
        speed: 1,
        intensity: 0.4,
      };
    case "flat":
      return { category: "flat", color: colors.page };
  }
}

/** Static fixture image reused by every `media` case. */
const HARNESS_MEDIA_IMAGE =
  "/scanme-links-template-backgrounds/bistro-background.avif";

/**
 * Fixed destination set: one brand icon (simple-icons path), one lucide
 * generic, and a duplicated `custom` kind so the duplicate-number badge
 * renders. All URLs are valid https so the public (non-preview) path renders
 * real anchors.
 */
const HARNESS_DESTINATIONS: PublicDestination[] = [
  {
    id: "d1",
    kind: "instagram",
    label: "Instagram",
    url: "https://example.com/instagram",
    iconKey: "instagram",
    state: "active",
  },
  {
    id: "d2",
    kind: "website",
    label: "Website",
    url: "https://example.com",
    iconKey: "globe",
    state: "active",
  },
  {
    id: "d3",
    kind: "custom",
    label: "Meni",
    url: "https://example.com/meni",
    iconKey: "utensils",
    state: "active",
  },
  {
    id: "d4",
    kind: "custom",
    label: "Kontakt",
    url: "https://example.com/kontakt",
    iconKey: "mail",
    state: "active",
  },
];

type HarnessCase = {
  id: string;
  view: ScanMeLinksViewModel;
};

function buildHarnessCases(): HarnessCase[] {
  const cases: HarnessCase[] = [];

  for (const presetKey of SCANME_LINKS_PRESET_KEYS) {
    const capability = SCANME_LINKS_PRESET_CAPABILITIES[presetKey];
    const variations = variationsForPreset(presetKey);
    const bases: Array<{ key: string; design: ScanMeLinksDesignV2 }> =
      variations.length > 0
        ? variations.map((variation) => ({
            key: variation.key,
            design: applyVariation(
              createDefaultScanMeLinksDesignV2(presetKey),
              variation,
            ),
          }))
        : [{ key: "base", design: createDefaultScanMeLinksDesignV2(presetKey) }];

    for (const base of bases) {
      for (const category of capability.allowedBackgroundCategories) {
        const design: ScanMeLinksDesignV2 = {
          ...base.design,
          background: harnessBackground(presetKey, category, base.design.colors),
        };
        cases.push({
          id: `${presetKey}--${base.key}--${category}`,
          view: {
            displayName: `${capability.label} ${base.key}`,
            description: `Harness ${category}`,
            logoUrl: null,
            templateKey: "option-two",
            backgroundKey: "warm-ivory",
            accent: design.colors.accent,
            accentTokens: DEFAULT_ACCENT_TOKENS,
            design,
            backgroundImageUrl:
              category === "media" ? HARNESS_MEDIA_IMAGE : null,
            backgroundVideoUrl: null,
            destinations: HARNESS_DESTINATIONS,
          },
        });
      }
    }
  }

  return cases;
}

/**
 * Hashed CSS-module class → stable name, so serialized goldens do not depend
 * on the bundler's class-name hashing (which can differ between machines).
 * Only the two modules that appear inside the serialized subtree are mapped.
 */
function buildClassMap(): Record<string, string> {
  const map: Record<string, string> = {};
  const sources: Array<[string, Record<string, string>]> = [
    ["ot", optionTwoStyles as Record<string, string>],
    ["ti", templateIconStyles as Record<string, string>],
  ];
  for (const [prefix, moduleStyles] of sources) {
    for (const [localName, value] of Object.entries(moduleStyles)) {
      for (const cls of String(value).split(/\s+/).filter(Boolean)) {
        map[cls] = `${prefix}_${localName}`;
      }
    }
  }
  return map;
}

function HarnessCorpus() {
  const cases = buildHarnessCases();
  const classMap = buildClassMap();

  return (
    <main data-harness-root data-case-count={cases.length}>
      <script
        id="__harness-classmap"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(classMap).replaceAll("<", "\\u003c"),
        }}
      />
      {cases.map((harnessCase) => (
        <section
          key={harnessCase.id}
          data-case-id={harnessCase.id}
          style={{ width: 390, margin: "0 auto" }}
        >
          <ScanMeLinksTemplate view={harnessCase.view} />
        </section>
      ))}
    </main>
  );
}

export default async function TemplateGalleryPage({
  searchParams,
}: PageProps<"/dev/template-gallery">) {
  if (process.env.NODE_ENV === "production") notFound();

  const resolved = await searchParams;
  if (resolved.harness === "1") {
    return <HarnessCorpus />;
  }

  return (
    <main className={styles.page}>
      {SPECS.map((spec) => (
        <section key={spec.presetKey} className={styles.group}>
          <h2 className={styles.groupTitle}>{spec.title}</h2>
          <div className={styles.row}>
            {variationsForPreset(spec.presetKey).map((variation, index) => (
              <figure key={variation.key} className={styles.item}>
                <figcaption className={styles.caption}>
                  Variation {index + 1} · {variation.label}
                </figcaption>
                <div className={styles.phone} data-shot={variation.key}>
                  <div className={styles.screen}>
                    <ScanMeLinksTemplate
                      view={buildView(spec, variation, spec.names[index])}
                      preview
                    />
                  </div>
                </div>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
