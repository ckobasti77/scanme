// Dev-only galerija: renderuje svaki preset u svakoj varijaciji kroz pravi
// public template, da se izgled poredi sa dizajnerskom referencom bez ulaska u
// editor i bez podataka iz baze. Nedostupna u produkciji.

import { notFound } from "next/navigation";
import { ScanMeLinksTemplate } from "@/components/scanme-links/templates/registry";
import type {
  PublicDestination,
  ScanMeLinksViewModel,
} from "@/components/scanme-links/templates/types";
import { DEFAULT_ACCENT_TOKENS } from "@/lib/scanme-links";
import {
  applyVariation,
  variationsForPreset,
  type ScanMeLinksVariation,
} from "@/lib/scanme-links-variations";
import {
  createDefaultScanMeLinksDesignV2,
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

export default function TemplateGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

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
