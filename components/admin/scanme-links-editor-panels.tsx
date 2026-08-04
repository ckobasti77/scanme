"use client";

import {
  AlertTriangle,
  Check,
  Crown,
  ImagePlus,
  Link2,
  Palette,
  Trash2,
  Upload,
  Video,
  Waves,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorTooltip } from "@/components/admin/editor-tooltip";
import { ScanMeColorField as ColorField } from "@/components/admin/scanme-color-picker";
import { ScanMeSmartPalette } from "@/components/admin/scanme-smart-palette";
import { EditorAnalyticsPanel } from "@/components/scanme-links/editor-analytics-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { colorDisplayName } from "@/lib/color-display-name";
import {
  DESTINATION_DEFAULTS,
  DESTINATION_KINDS,
  ICON_LIBRARY,
  type DestinationKind,
} from "@/lib/scanme-links";
import {
  applyVariation,
  variationsForPreset,
} from "@/lib/scanme-links-variations";
import {
  SCANME_LINKS_BACKGROUND_CATEGORIES,
  SCANME_LINKS_PRESET_CAPABILITIES,
  SCANME_LINKS_PRESET_KEYS,
  createDefaultScanMeLinksDesignV2,
  iconPackageForPreset,
  type ScanMeLinksBackgroundCategory,
  type ScanMeLinksBackgroundV2,
  type ScanMeLinksButtonVariant,
  type ScanMeLinksDesignV2,
  type ScanMeLinksFontKey,
  type ScanMeLinksShadowV2,
} from "@/lib/scanme-links-design";
import { TemplateIcon } from "@/components/scanme-links/template-icon";
import { deriveBackgroundCompanionColor } from "@/lib/scanme-palette";
import { cn } from "@/lib/utils";
import styles from "./scanme-links-editor.module.css";
import type {
  EditorDestination,
  EditorDocumentSetter,
  ScanMeLinksEditorDocument,
} from "./scanme-links-editor-types";

const destinationLabels: Record<DestinationKind, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  website: "Web-sajt",
  reservations: "Rezervacije",
  whatsapp: "WhatsApp",
  viber: "Viber",
  telegram: "Telegram",
  youtube: "YouTube",
  custom: "Drugi link",
};

const backgroundLabels: Record<ScanMeLinksBackgroundCategory, string> = {
  flat: "Flat",
  gradient: "Gradijent",
  pattern: "Šara",
  texture: "Tekstura",
  media: "Slika / video",
  animation: "Animacija",
};

const fontLabels: Record<ScanMeLinksFontKey, string> = {
  "dm-sans": "DM Sans",
  "nunito-sans": "Nunito Sans",
  "source-sans-3": "Source Sans 3",
  "system-ui": "System UI",
  inter: "Inter",
  manrope: "Manrope",
  "cormorant-garamond": "Cormorant Garamond",
  "playfair-display": "Playfair Display",
  lora: "Lora",
  "libre-baskerville": "Libre Baskerville",
  "space-grotesk": "Space Grotesk",
  archivo: "Archivo",
};

export function ContentPanel({
  document,
  setDocument,
  selectedDestination,
  onUploadLogo,
  onDeleteDestination,
  uploadBusy,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
  selectedDestination: EditorDestination | null;
  onUploadLogo: (file: File) => void;
  onDeleteDestination: (destination: EditorDestination) => void;
  uploadBusy: boolean;
}) {
  const linkEditorRef = useRef<HTMLDivElement>(null);
  const selectedDestinationId = selectedDestination?.id ?? null;

  useEffect(() => {
    if (selectedDestinationId) {
      requestAnimationFrame(() => {
        linkEditorRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      });
    }
  }, [selectedDestinationId]);

  function updateDestination(
    destinationId: Id<"serviceDestinations">,
    update: (destination: EditorDestination) => EditorDestination,
    group: string,
  ) {
    setDocument(
      (current) => ({
        ...current,
        destinations: current.destinations.map((destination) =>
          destination.id === destinationId ? update(destination) : destination,
        ),
      }),
      group,
    );
  }

  return (
    <div className="grid gap-4">
      <section className={styles.sectionCard}>
        <h3 className={styles.subheading}>Identitet stranice</h3>
        <div className={styles.fieldGrid}>
          <label className={styles.fieldLabel}>
            <span className="flex items-center justify-between gap-3">
              Naziv lokala
              <span className={styles.counter}>{document.title.length}/50</span>
            </span>
            <input
              className={styles.fieldControl}
              maxLength={50}
              value={document.title}
              onChange={(event) =>
                setDocument(
                  (current) => ({ ...current, title: event.target.value }),
                  "content-title",
                )
              }
              placeholder="Naziv ispod logotipa"
            />
          </label>

          <label className={styles.fieldLabel}>
            <span className="flex items-center justify-between gap-3">
              Kratak opis
              <span className={styles.counter}>
                {document.description.length}/50
              </span>
            </span>
            <textarea
              className={cn(styles.fieldControl, styles.textarea)}
              maxLength={50}
              value={document.description}
              onChange={(event) =>
                setDocument(
                  (current) => ({
                    ...current,
                    description: event.target.value,
                  }),
                  "content-description",
                )
              }
              placeholder="Na primer: Dizajn enterijera · Beograd"
            />
          </label>
        </div>
      </section>

      <section className={styles.sectionCard}>
        <h3 className={styles.subheading}>Logotip</h3>
        <label
          className={cn(styles.uploadZone, uploadBusy && "pointer-events-none opacity-60")}
        >
          <span className={styles.logoPreview}>
            {document.logoUrl ? (
              // Customer logos are uploaded at arbitrary supported aspect ratios.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={document.logoUrl} alt="" />
            ) : (
              <ImagePlus className="size-7 text-black/45" aria-hidden="true" />
            )}
          </span>
          <span>
            <span className="flex items-center gap-2 text-sm font-bold">
              <Upload className="size-4" aria-hidden="true" />
              {uploadBusy
                ? "Otpremanje…"
                : document.logoUrl
                  ? "Zameni logotip"
                  : "Dodaj logotip"}
            </span>
            <span className="mt-1 block text-[11px] leading-5 text-black/50">
              PNG, JPEG, WebP ili SVG do 5 MB
            </span>
          </span>
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
            disabled={uploadBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUploadLogo(file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold text-black/55">
            Boje pronađene u logotipu
          </p>
          <div className={styles.paletteRow}>
            {document.palette.length ? (
              document.palette.map((color) => (
                <EditorTooltip
                  key={color}
                  label={`${colorDisplayName(color)} · ${color.toUpperCase()}`}
                >
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: color }}
                  />
                </EditorTooltip>
              ))
            ) : (
              <span className="text-[11px] text-black/45">
                Paleta će se pojaviti nakon otpremanja.
              </span>
            )}
          </div>
        </div>

        <ScanMeSmartPalette document={document} setDocument={setDocument} />
      </section>

      <ShadowControls
        title="Senka logotipa"
        description="Suptilna dubina logotipa bez uticaja na ostale elemente."
        switchLabel="Uključi senku logotipa"
        shadow={document.design.effects.logoShadow}
        groupPrefix="logo-shadow"
        onChange={(logoShadow, group) =>
          setDocument(
            (current) => ({
              ...current,
              design: {
                ...current.design,
                effects: { ...current.design.effects, logoShadow },
              },
            }),
            group,
          )
        }
      />

      {selectedDestination ? (
        <section
          ref={linkEditorRef}
          className={styles.sectionCard}
          aria-labelledby="selected-link-heading"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 id="selected-link-heading" className="text-base font-bold">
                Uredi link
              </h3>
              <p className="mt-1 text-[11px] text-black/50">
                Izabrano dugme u nacrtu
              </p>
            </div>
            <span className={styles.badge}>Nacrt</span>
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.twoColumns}>
              <div className={styles.fieldLabel}>
                <span>Tip</span>
                <EditorSelect
                  ariaLabel="Tip linka"
                  value={selectedDestination.kind}
                  onValueChange={(value) => {
                    const nextKind = value as DestinationKind;
                    updateDestination(
                      selectedDestination.id,
                      (destination) => {
                        const hadDefaultLabel =
                          destination.label ===
                          DESTINATION_DEFAULTS[destination.kind].label;
                        return {
                          ...destination,
                          kind: nextKind,
                          iconKey: DESTINATION_DEFAULTS[nextKind].iconKey,
                          label: hadDefaultLabel
                            ? DESTINATION_DEFAULTS[nextKind].label
                            : destination.label,
                        };
                      },
                      `destination-${selectedDestination.id}-kind`,
                    );
                  }}
                  options={DESTINATION_KINDS.map((kind) => ({
                    value: kind,
                    label: destinationLabels[kind],
                  }))}
                />
              </div>

              <div className={styles.fieldLabel}>
                <span>Status</span>
                <EditorSelect
                  ariaLabel="Status linka"
                  value={
                    selectedDestination.state === "inactive"
                      ? "inactive"
                      : "active"
                  }
                  onValueChange={(value) =>
                    updateDestination(
                      selectedDestination.id,
                      (destination) => ({
                        ...destination,
                        state: value as "active" | "inactive",
                      }),
                      `destination-${selectedDestination.id}-state`,
                    )
                  }
                  options={[
                    { value: "active", label: "Aktivno" },
                    { value: "inactive", label: "Isključeno" },
                  ]}
                />
              </div>
            </div>

            <label className={styles.fieldLabel}>
              Naziv dugmeta
              <input
                className={styles.fieldControl}
                maxLength={80}
                value={selectedDestination.label}
                onChange={(event) =>
                  updateDestination(
                    selectedDestination.id,
                    (destination) => ({
                      ...destination,
                      label: event.target.value,
                    }),
                    `destination-${selectedDestination.id}-label`,
                  )
                }
              />
            </label>

            <label className={styles.fieldLabel}>
              HTTPS URL
              <input
                className={styles.fieldControl}
                inputMode="url"
                value={selectedDestination.url}
                onChange={(event) =>
                  updateDestination(
                    selectedDestination.id,
                    (destination) => ({
                      ...destination,
                      url: event.target.value,
                    }),
                    `destination-${selectedDestination.id}-url`,
                  )
                }
                placeholder="https://"
              />
            </label>

            {selectedDestination.state === "active" &&
            !selectedDestination.url.trim() ? (
              <div className={styles.warning} role="status">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Dugme se vidi u nacrtu kao „Nedostaje URL”, ali neće biti
                  prikazano na javnoj stranici dok ne dodate bezbedan HTTPS link.
                </span>
              </div>
            ) : null}

            <IconPicker
              packageStyle={iconPackageForPreset(document.design.presetKey)}
              value={selectedDestination.iconKey}
              onSelect={(iconKey) =>
                updateDestination(
                  selectedDestination.id,
                  (destination) => ({ ...destination, iconKey }),
                  `destination-${selectedDestination.id}-icon`,
                )
              }
            />

            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => onDeleteDestination(selectedDestination)}
            >
              <Trash2 className="mr-2 inline size-4" aria-hidden="true" />
              Obriši link
            </button>
          </div>
        </section>
      ) : (
        <div className={styles.futurePalette}>
          <Link2 className="size-5 shrink-0" aria-hidden="true" />
          Kliknite na dugme u telefonu da biste uredili njegov tip, naziv, status
          i URL.
        </div>
      )}
    </div>
  );
}

// Icon picker shown inside "Uredi link". It lists every icon in ICON_LIBRARY,
// each rendered in the current template's icon package, so the choice a user
// makes previews in the same style the public page will use. Choosing an icon
// is available for every link, custom links included.
function IconPicker({
  packageStyle,
  value,
  onSelect,
}: {
  packageStyle: ReturnType<typeof iconPackageForPreset>;
  value: string;
  onSelect: (iconKey: string) => void;
}) {
  const groups = [
    {
      label: "Brendovi",
      items: ICON_LIBRARY.filter((entry) => entry.group === "brand"),
    },
    {
      label: "Opšte",
      items: ICON_LIBRARY.filter((entry) => entry.group === "general"),
    },
  ];

  return (
    <div className={styles.fieldLabel}>
      <span>Ikonica</span>
      <div className={styles.iconPicker}>
        {groups.map((group) => (
          <div key={group.label} className={styles.iconPickerGroup}>
            <span className={styles.iconPickerGroupLabel}>{group.label}</span>
            <div className={styles.iconPickerGrid}>
              {group.items.map((entry) => {
                const selected = value === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={entry.label}
                    title={entry.label}
                    className={cn(
                      styles.iconPickerCell,
                      selected && styles.iconPickerCellActive,
                    )}
                    onClick={() => onSelect(entry.key)}
                  >
                    <TemplateIcon
                      iconKey={entry.key}
                      packageStyle={packageStyle}
                      className={styles.iconPickerGlyph}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StylePanel({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const variations = variationsForPreset(document.design.presetKey);

  return (
    <>
    <div className={styles.styleGrid}>
      {SCANME_LINKS_PRESET_KEYS.map((presetKey) => {
        const capability = SCANME_LINKS_PRESET_CAPABILITIES[presetKey];
        const selected = document.design.presetKey === presetKey;
        return (
          <button
            key={presetKey}
            type="button"
            className={cn(styles.styleCard, selected && styles.selectedCard)}
            aria-pressed={selected}
            onClick={() =>
              setDocument((current) => {
                const base = createDefaultScanMeLinksDesignV2(presetKey);
                const first = variationsForPreset(presetKey)[0];
                return {
                  ...current,
                  design: first ? applyVariation(base, first) : base,
                };
              })
            }
          >
            <span
              className={styles.styleMiniPage}
              style={{
                background: capability.preview.background,
                color: capability.preview.text,
              }}
            >
              <span
                className="mx-auto block size-7 rounded-full"
                style={{ backgroundColor: capability.preview.accent }}
              />
              <span
                className="mx-auto block h-2 w-16 rounded-full"
                style={{ backgroundColor: capability.preview.text, opacity: 0.82 }}
              />
              <span
                className={styles.styleMiniLine}
                style={{ backgroundColor: capability.preview.surface }}
              />
              <span
                className={styles.styleMiniLine}
                style={{ backgroundColor: capability.preview.surface }}
              />
            </span>
            <span className={styles.styleName}>
              {capability.label}
              {selected ? <Check className="size-4" aria-hidden="true" /> : null}
            </span>
          </button>
        );
      })}
    </div>

    {variations.length > 0 ? (
      <section className={styles.variationSection}>
        <h3 className={styles.variationTitle}>Varijacija boja</h3>
        <div className={styles.variationRow}>
          {variations.map((variation) => {
            const selected = document.design.variationKey === variation.key;
            return (
              <button
                key={variation.key}
                type="button"
                className={cn(
                  styles.variationCard,
                  selected && styles.selectedCard,
                )}
                aria-pressed={selected}
                title={variation.label}
                onClick={() =>
                  setDocument((current) => ({
                    ...current,
                    design: applyVariation(current.design, variation),
                  }))
                }
              >
                <span className={styles.variationSwatch} aria-hidden="true">
                  {variation.swatch.map((stop, index) => (
                    <span key={index} style={{ backgroundColor: stop }} />
                  ))}
                </span>
                <span className={styles.variationName}>
                  {variation.label}
                  {selected ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    ) : null}
    </>
  );
}

export function BackgroundPanel({
  document,
  setDocument,
  onUploadBackground,
  uploadBusy,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
  onUploadBackground: (kind: "image" | "video", file: File) => void;
  uploadBusy: boolean;
}) {
  const design = document.design;
  const capabilities = SCANME_LINKS_PRESET_CAPABILITIES[design.presetKey];
  const allowedCategories = SCANME_LINKS_BACKGROUND_CATEGORIES.filter(
    (category) => capabilities.allowedBackgroundCategories.includes(category),
  );

  function updateBackground(
    background:
      | ScanMeLinksBackgroundV2
      | ((current: ScanMeLinksBackgroundV2) => ScanMeLinksBackgroundV2),
    group?: string,
  ) {
    setDocument(
      (current) => ({
        ...current,
        design: {
          ...current.design,
          background:
            typeof background === "function"
              ? background(current.design.background)
              : background,
        },
      }),
      group,
    );
  }

  function selectCategory(category: ScanMeLinksBackgroundCategory) {
    updateBackground(
      defaultBackgroundForCategory(category, design),
      "background-category",
    );
  }

  return (
    <>
      <div className={styles.backgroundTabs} aria-label="Tip pozadine">
        {allowedCategories.map((category) => {
          const selected = design.background.category === category;
          return (
            <button
              key={category}
              type="button"
              className={styles.backgroundTab}
              aria-pressed={selected}
              onClick={() => selectCategory(category)}
            >
              {selected ? (
                <motion.span
                  className={styles.backgroundTabActive}
                  layoutId="editor-background-active"
                  transition={{ type: "spring", stiffness: 430, damping: 34 }}
                />
              ) : null}
              <span className={styles.backgroundTabLabel}>
                {backgroundLabels[category]}
              </span>
            </button>
          );
        })}
      </div>

      <section className={styles.sectionCard}>
        <BackgroundFields
          document={document}
          background={design.background}
          updateBackground={updateBackground}
          onUploadBackground={onUploadBackground}
          uploadBusy={uploadBusy}
        />
      </section>
    </>
  );
}

function BackgroundFields({
  document,
  background,
  updateBackground,
  onUploadBackground,
  uploadBusy,
}: {
  document: ScanMeLinksEditorDocument;
  background: ScanMeLinksBackgroundV2;
  updateBackground: (
    background:
      | ScanMeLinksBackgroundV2
      | ((current: ScanMeLinksBackgroundV2) => ScanMeLinksBackgroundV2),
    group?: string,
  ) => void;
  onUploadBackground: (kind: "image" | "video", file: File) => void;
  uploadBusy: boolean;
}) {
  if (background.category === "flat") {
    return (
      <>
        <h3 className={styles.subheading}>Jednobojna pozadina</h3>
        <ColorField
          label="Boja"
          value={background.color}
          onChange={(color) =>
            updateBackground({ ...background, color }, "background-flat-color")
          }
        />
      </>
    );
  }

  if (background.category === "gradient") {
    return (
      <>
        <h3 className={styles.subheading}>Gradijent</h3>
        <div className={styles.fieldGrid}>
          <div className={styles.segmented}>
            {(["linear", "radial"] as const).map((variant) => (
              <button
                key={variant}
                type="button"
                className={cn(
                  styles.segment,
                  background.variant === variant && styles.segmentActive,
                )}
                onClick={() =>
                  updateBackground(
                    { ...background, variant },
                    "background-gradient-variant",
                  )
                }
              >
                {variant === "linear" ? "Linearni" : "Radijalni"}
              </button>
            ))}
          </div>
          <div className={styles.twoColumns}>
            <ColorField
              label="Početna boja"
              value={background.startColor}
              onChange={(startColor) =>
                updateBackground(
                  { ...background, startColor },
                  "background-gradient-start",
                )
              }
            />
            <ColorField
              label="Završna boja"
              value={background.endColor}
              onChange={(endColor) =>
                updateBackground(
                  { ...background, endColor },
                  "background-gradient-end",
                )
              }
            />
          </div>
          {background.variant === "linear" ? (
            <RangeField
              label={`Ugao · ${Math.round(background.angle)}°`}
              min={0}
              max={360}
              value={background.angle}
              onChange={(angle) =>
                updateBackground(
                  { ...background, angle },
                  "background-gradient-angle",
                )
              }
            />
          ) : (
            <div className={styles.twoColumns}>
              <RangeField
                label={`Centar X · ${Math.round(background.centerX)}%`}
                min={0}
                max={100}
                value={background.centerX}
                onChange={(centerX) =>
                  updateBackground(
                    { ...background, centerX },
                    "background-gradient-center-x",
                  )
                }
              />
              <RangeField
                label={`Centar Y · ${Math.round(background.centerY)}%`}
                min={0}
                max={100}
                value={background.centerY}
                onChange={(centerY) =>
                  updateBackground(
                    { ...background, centerY },
                    "background-gradient-center-y",
                  )
                }
              />
            </div>
          )}
        </div>
      </>
    );
  }

  if (background.category === "pattern") {
    const variants = SCANME_LINKS_PRESET_CAPABILITIES[
      document.design.presetKey
    ].allowedBackgroundVariants.pattern ?? ["grid"];
    return (
      <>
        <h3 className={styles.subheading}>Šara</h3>
        <div className={styles.choiceGrid}>
          {variants.map((variant) => (
            <button
              key={variant}
              type="button"
              className={cn(
                styles.choiceCard,
                background.variant === variant && styles.selectedCard,
              )}
              onClick={() =>
                updateBackground(
                  { ...background, variant },
                  "background-pattern",
                )
              }
            >
              <PatternPreview
                variant={variant}
                background={background.backgroundColor}
                foreground={background.patternColor}
              />
              <span className="mt-2 block text-xs font-bold capitalize">
                {patternLabel(variant)}
              </span>
            </button>
          ))}
        </div>
        <div className={cn(styles.fieldGrid, "mt-4")}>
          <div className={styles.twoColumns}>
            <ColorField
              label="Pozadina"
              value={background.backgroundColor}
              onChange={(backgroundColor) =>
                updateBackground(
                  { ...background, backgroundColor },
                  "background-pattern-base",
                )
              }
            />
            <ColorField
              label="Šara"
              value={background.patternColor}
              onChange={(patternColor) =>
                updateBackground(
                  { ...background, patternColor },
                  "background-pattern-color",
                )
              }
            />
          </div>
          <RangeField
            label={`Veličina · ${Math.round(background.scale)} px`}
            min={8}
            max={96}
            value={background.scale}
            onChange={(scale) =>
              updateBackground(
                { ...background, scale },
                "background-pattern-scale",
              )
            }
          />
          <RangeField
            label={`Intenzitet · ${Math.round(background.opacity * 100)}%`}
            min={0}
            max={100}
            value={background.opacity * 100}
            onChange={(value) =>
              updateBackground(
                { ...background, opacity: value / 100 },
                "background-pattern-opacity",
              )
            }
          />
        </div>
      </>
    );
  }

  if (background.category === "texture") {
    const variants = SCANME_LINKS_PRESET_CAPABILITIES[
      document.design.presetKey
    ].allowedBackgroundVariants.texture ?? ["paper"];
    return (
      <>
        <h3 className={styles.subheading}>Tekstura</h3>
        <div className={styles.choiceGrid}>
          {variants.map((variant) => (
            <button
              key={variant}
              type="button"
              className={cn(
                styles.choiceCard,
                background.variant === variant && styles.selectedCard,
              )}
              onClick={() =>
                updateBackground(
                  { ...background, variant },
                  "background-texture",
                )
              }
            >
              <TexturePreview
                variant={variant}
                background={background.backgroundColor}
                tint={background.tintColor}
              />
              <span className="mt-2 block text-xs font-bold">
                {textureLabel(variant)}
              </span>
            </button>
          ))}
        </div>
        <div className={cn(styles.fieldGrid, "mt-4")}>
          <div className={styles.twoColumns}>
            <ColorField
              label="Osnova"
              value={background.backgroundColor}
              onChange={(backgroundColor) =>
                updateBackground(
                  { ...background, backgroundColor },
                  "background-texture-base",
                )
              }
            />
            <ColorField
              label="Ton"
              value={background.tintColor}
              onChange={(tintColor) =>
                updateBackground(
                  { ...background, tintColor },
                  "background-texture-tint",
                )
              }
            />
          </div>
          <RangeField
            label={`Intenzitet · ${Math.round(background.intensity * 100)}%`}
            min={0}
            max={100}
            value={background.intensity * 100}
            onChange={(value) =>
              updateBackground(
                { ...background, intensity: value / 100 },
                "background-texture-intensity",
              )
            }
          />
        </div>
      </>
    );
  }

  if (background.category === "media") {
    const mediaType = background.mediaType;
    const mediaUrl =
      mediaType === "image"
        ? document.backgroundImageUrl
        : document.backgroundVideoUrl;
    return (
      <>
        <h3 className={styles.subheading}>Slika ili video</h3>
        <div className={styles.segmented}>
          {(["image", "video"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={cn(
                styles.segment,
                mediaType === kind && styles.segmentActive,
              )}
              onClick={() =>
                updateBackground(
                  { ...background, mediaType: kind },
                  "background-media-type",
                )
              }
            >
              {kind === "image" ? "Slika" : "Video · Pro"}
            </button>
          ))}
        </div>

        <label
          className={cn(
            styles.uploadZone,
            styles.mediaUploadZone,
            "mt-4",
            uploadBusy && "pointer-events-none opacity-60",
          )}
        >
          {mediaUrl ? (
            <span
              className={styles.mediaUploadPreview}
              data-media-upload-preview={mediaType}
            >
              {mediaType === "image" ? (
                // User-uploaded backgrounds can be arbitrary supported image formats.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="" />
              ) : (
                <video
                  src={mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  controls={false}
                  controlsList="nodownload nofullscreen noremoteplayback"
                  disablePictureInPicture
                  disableRemotePlayback
                  tabIndex={-1}
                  onContextMenu={(event) => event.preventDefault()}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    video.controls = false;
                    if (Number.isFinite(video.duration) && video.duration > 0) {
                      video.currentTime = Math.min(0.1, video.duration / 2);
                    }
                  }}
                  {...{ "x-webkit-airplay": "deny" }}
                />
              )}
              <span className={styles.mediaUploadKind} aria-hidden="true">
                {mediaType === "image" ? (
                  <ImagePlus className="size-4" />
                ) : (
                  <Video className="size-4" />
                )}
                {mediaType === "image" ? "Slika" : "Video"}
              </span>
            </span>
          ) : (
            <span className={styles.mediaUploadPlaceholder}>
              {mediaType === "image" ? (
                <ImagePlus className="size-5" aria-hidden="true" />
              ) : (
                <Video className="size-5" aria-hidden="true" />
              )}
            </span>
          )}
          <span className={styles.mediaUploadCopy}>
            <span className="text-xs font-bold">
              {uploadBusy
                ? "Otpremanje…"
                : mediaUrl
                  ? "Zameni medij"
                  : "Dodaj medij ili prevuci bilo gde"}
            </span>
            <span className="text-[10px] text-black/45">
              {mediaType === "image"
                ? "PNG, JPEG ili WebP do 12 MB"
                : "MP4 ili WebM do 30 MB"}
            </span>
          </span>
          <input
            className="sr-only"
            type="file"
            accept={
              mediaType === "image"
                ? "image/png,image/jpeg,image/webp"
                : "video/mp4,video/webm"
            }
            disabled={uploadBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUploadBackground(mediaType, file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        <div className={cn(styles.fieldGrid, "mt-4")}>
          <div className={styles.segmented}>
            {(["cover", "contain"] as const).map((fit) => (
              <button
                key={fit}
                type="button"
                className={cn(
                  styles.segment,
                  background.fit === fit && styles.segmentActive,
                )}
                onClick={() =>
                  updateBackground(
                    { ...background, fit },
                    "background-media-fit",
                  )
                }
              >
                {fit === "cover" ? "Ispuni" : "Uklopi"}
              </button>
            ))}
          </div>
          <RangeField
            label={`Zum · ${Math.round(background.zoom * 100)}%`}
            min={100}
            max={300}
            value={background.zoom * 100}
            onChange={(value) =>
              updateBackground(
                { ...background, zoom: value / 100 },
                "background-media-zoom",
              )
            }
          />
          <div className={styles.twoColumns}>
            <RangeField
              label={`Pozicija X · ${Math.round(background.positionX)}%`}
              min={0}
              max={100}
              value={background.positionX}
              onChange={(positionX) =>
                updateBackground(
                  { ...background, positionX },
                  "background-media-x",
                )
              }
            />
            <RangeField
              label={`Pozicija Y · ${Math.round(background.positionY)}%`}
              min={0}
              max={100}
              value={background.positionY}
              onChange={(positionY) =>
                updateBackground(
                  { ...background, positionY },
                  "background-media-y",
                )
              }
            />
          </div>
          <div className={styles.twoColumns}>
            <ColorField
              label="Overlay"
              value={background.overlayColor}
              onChange={(overlayColor) =>
                updateBackground(
                  { ...background, overlayColor },
                  "background-media-overlay",
                )
              }
            />
            <RangeField
              label={`Overlay · ${Math.round(background.overlayOpacity * 100)}%`}
              min={0}
              max={80}
              value={background.overlayOpacity * 100}
              onChange={(value) =>
                updateBackground(
                  { ...background, overlayOpacity: value / 100 },
                  "background-media-overlay-opacity",
                )
              }
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className={styles.subheading}>Animirana pozadina · Pro</h3>
      <div className={styles.choiceGrid}>
        {(["aurora", "soft-waves"] as const).map((variant) => (
          <button
            key={variant}
            type="button"
            className={cn(
              styles.choiceCard,
              background.variant === variant && styles.selectedCard,
            )}
            onClick={() =>
              updateBackground(
                { ...background, variant },
                "background-animation",
              )
            }
          >
            <Waves className="size-5" aria-hidden="true" />
            <span className="mt-3 block text-xs font-bold">
              {variant === "aurora" ? "Aurora" : "Meki talasi"}
            </span>
          </button>
        ))}
      </div>
      <div className={cn(styles.fieldGrid, "mt-4")}>
        <div className={styles.twoColumns}>
          <ColorField
            label="Osnova"
            value={background.baseColor}
            onChange={(baseColor) =>
              updateBackground(
                { ...background, baseColor },
                "background-animation-base",
              )
            }
          />
          <ColorField
            label="Akcent"
            value={background.accentColor}
            onChange={(accentColor) =>
              updateBackground(
                { ...background, accentColor },
                "background-animation-accent",
              )
            }
          />
        </div>
        <RangeField
          label={`Brzina · ${background.speed.toFixed(2)}×`}
          min={25}
          max={200}
          value={background.speed * 100}
          onChange={(value) =>
            updateBackground(
              { ...background, speed: value / 100 },
              "background-animation-speed",
            )
          }
        />
        <RangeField
          label={`Intenzitet · ${Math.round(background.intensity * 100)}%`}
          min={10}
          max={100}
          value={background.intensity * 100}
          onChange={(value) =>
            updateBackground(
              { ...background, intensity: value / 100 },
              "background-animation-intensity",
            )
          }
        />
      </div>
    </>
  );
}

function ShadowControls({
  title,
  description,
  switchLabel,
  shadow,
  groupPrefix,
  onChange,
  headerExtra,
}: {
  title: string;
  description: string;
  switchLabel: string;
  shadow: ScanMeLinksShadowV2;
  groupPrefix: string;
  onChange: (shadow: ScanMeLinksShadowV2, group: string) => void;
  headerExtra?: ReactNode;
}) {
  function patchShadow(
    patch: Partial<ScanMeLinksShadowV2>,
    groupSuffix: string,
  ) {
    onChange({ ...shadow, ...patch }, `${groupPrefix}-${groupSuffix}`);
  }

  return (
    <section className={styles.sectionCard}>
      <div className={styles.switchRow}>
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="mt-1 text-[11px] text-black/50">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={shadow.enabled}
          aria-label={switchLabel}
          className={cn(styles.switch, shadow.enabled && styles.switchOn)}
          onClick={() => patchShadow({ enabled: !shadow.enabled }, "toggle")}
        />
      </div>

      {headerExtra}

      {shadow.enabled ? (
        <div className={cn(styles.fieldGrid, "mt-4")}>
          <ColorField
            label="Boja senke"
            value={shadow.color}
            onChange={(color) => patchShadow({ color }, "color")}
          />
          <div className={styles.twoColumns}>
            <RangeField
              label={`X · ${Math.round(shadow.x)} px`}
              min={-24}
              max={24}
              value={shadow.x}
              onChange={(x) => patchShadow({ x }, "x")}
            />
            <RangeField
              label={`Y · ${Math.round(shadow.y)} px`}
              min={-24}
              max={32}
              value={shadow.y}
              onChange={(y) => patchShadow({ y }, "y")}
            />
          </div>
          <div className={styles.twoColumns}>
            <RangeField
              label={`Blur · ${Math.round(shadow.blur)} px`}
              min={0}
              max={64}
              value={shadow.blur}
              onChange={(blur) => patchShadow({ blur }, "blur")}
            />
            <RangeField
              label={`Intenzitet · ${Math.round(shadow.opacity * 100)}%`}
              min={0}
              max={60}
              value={shadow.opacity * 100}
              onChange={(value) => patchShadow({ opacity: value / 100 }, "opacity")}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

const TEXT_SHADOW_TARGETS = [
  { value: "global", label: "Sve (globalno)" },
  { value: "title", label: "Naslov" },
  { value: "description", label: "Opis" },
  { value: "buttonText", label: "Tekst dugmadi" },
] as const;

type TextShadowTarget = (typeof TEXT_SHADOW_TARGETS)[number]["value"];

// Wraps ShadowControls with a target selector so the user can edit the global text
// shadow (default) or a per-element override for the title, description, or button text.
function TextShadowControls({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const [target, setTarget] = useState<TextShadowTarget>("global");
  const effects = document.design.effects;
  const override =
    target === "title"
      ? effects.titleShadow
      : target === "description"
        ? effects.descriptionShadow
        : target === "buttonText"
          ? effects.buttonTextShadow
          : undefined;
  const activeShadow =
    target === "global" ? effects.textShadow : override ?? effects.textShadow;
  const hasOverride = target !== "global" && override != null;

  function applyShadow(shadow: ScanMeLinksShadowV2, group: string) {
    setDocument((current) => {
      const currentEffects = current.design.effects;
      const nextEffects =
        target === "global"
          ? { ...currentEffects, textShadow: shadow }
          : target === "title"
            ? { ...currentEffects, titleShadow: shadow }
            : target === "description"
              ? { ...currentEffects, descriptionShadow: shadow }
              : { ...currentEffects, buttonTextShadow: shadow };
      return {
        ...current,
        design: { ...current.design, effects: nextEffects },
      };
    }, group);
  }

  function resetToGlobal() {
    if (target === "global") return;
    setDocument((current) => {
      const nextEffects = { ...current.design.effects };
      if (target === "title") delete nextEffects.titleShadow;
      else if (target === "description") delete nextEffects.descriptionShadow;
      else delete nextEffects.buttonTextShadow;
      return {
        ...current,
        design: { ...current.design, effects: nextEffects },
      };
    }, "text-shadow-reset");
  }

  return (
    <ShadowControls
      title="Senka teksta"
      description="Globalna senka za sav tekst, ili zasebna senka za naslov, opis i tekst dugmadi."
      switchLabel="Uključi senku teksta"
      shadow={activeShadow}
      groupPrefix={`text-shadow-${target}`}
      onChange={applyShadow}
      headerExtra={
        <>
          <div className={styles.paletteModeRow}>
            <span className={styles.paletteModeLabel}>Primeni na</span>
            <Select
              value={target}
              onValueChange={(value) => setTarget(value as TextShadowTarget)}
            >
              <SelectTrigger
                className="h-9 w-40 text-xs"
                aria-label="Element za senku teksta"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXT_SHADOW_TARGETS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasOverride ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="text-[10px] font-semibold text-black/45 underline underline-offset-2 transition-colors hover:text-black/70"
                onClick={resetToGlobal}
              >
                Vrati na globalnu senku
              </button>
            </div>
          ) : null}
        </>
      }
    />
  );
}

export function ButtonPanel({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const design = document.design;
  const capabilities = SCANME_LINKS_PRESET_CAPABILITIES[design.presetKey];

  function patchButtons(
    patch: Partial<ScanMeLinksDesignV2["buttons"]>,
    group?: string,
  ) {
    setDocument(
      (current) => ({
        ...current,
        design: {
          ...current.design,
          buttons: { ...current.design.buttons, ...patch },
        },
      }),
      group,
    );
  }

  return (
    <div className="grid gap-4">
      <section className={styles.sectionCard}>
        <h3 className={styles.subheading}>Tip dugmeta</h3>
        <div className={styles.choiceGrid}>
          {(["solid", "outline", "glass"] as const).map((variant) => {
            const available = capabilities.allowedButtonVariants.includes(variant);
            const button = (
              <button
                type="button"
                disabled={!available}
                className={cn(
                  styles.choiceCard,
                  design.buttons.variant === variant && styles.selectedCard,
                  !available && styles.disabledCard,
                )}
                onClick={() => patchButtons({ variant }, "button-variant")}
              >
                <span
                  className="block h-9 w-full"
                  style={{
                    border: `${Math.max(1, design.buttons.borderWidth)}px solid ${design.colors.border}`,
                    borderRadius: design.buttons.radius,
                    background:
                      variant === "outline"
                        ? "transparent"
                        : variant === "glass"
                          ? "rgba(255,255,255,.5)"
                          : design.colors.button,
                    boxShadow:
                      variant === "glass"
                        ? "inset 0 1px rgba(255,255,255,.7)"
                        : undefined,
                  }}
                />
                <span className="mt-2 block text-xs font-bold">
                  {buttonVariantLabel(variant)}
                </span>
              </button>
            );

            return available ? (
              <span key={variant}>{button}</span>
            ) : (
              <EditorTooltip
                key={variant}
                label="Ovaj tip dugmeta nije dostupan za ovaj stil."
              >
                {button}
              </EditorTooltip>
            );
          })}
        </div>
        <div className={cn(styles.fieldGrid, "mt-4")}>
          <RadiusField
            value={design.buttons.radius}
            onChange={(radius) => patchButtons({ radius }, "button-radius")}
          />
          <div className={styles.twoColumns}>
            <ColorField
              label="Boja dugmeta"
              value={design.colors.button}
              onChange={(button) =>
                patchDesignColors(setDocument, { button }, "button-color")
              }
            />
            <ColorField
              label="Tekst dugmeta"
              value={design.colors.buttonText}
              onChange={(buttonText) =>
                patchDesignColors(
                  setDocument,
                  { buttonText },
                  "button-text-color",
                )
              }
            />
          </div>
        </div>
      </section>

      <ShadowControls
        title="Drop shadow"
        description="Neutralna ili obojena senka ispod dugmeta."
        switchLabel="Uključi senku dugmeta"
        shadow={design.buttons.shadow}
        groupPrefix="button-shadow"
        onChange={(shadow, group) => patchButtons({ shadow }, group)}
      />

      <section className={styles.sectionCard}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={styles.subheading}>Animacija · Pro</h3>
          <span className={styles.badge}>U pripremi</span>
        </div>
        <div className={styles.choiceGrid}>
          {[
            ["stroke", "Stroke"],
            ["liquid-metal", "Liquid metal"],
          ].map(([value, label]) => (
            <EditorTooltip
              key={value}
              label="Vizuelna referenca će biti dodata u sledećoj fazi."
            >
              <button
                type="button"
                disabled
                className={cn(styles.choiceCard, styles.disabledCard)}
              >
                <Waves className="size-5" aria-hidden="true" />
                <span className="mt-3 block text-xs font-bold">{label}</span>
              </button>
            </EditorTooltip>
          ))}
        </div>
      </section>
    </div>
  );
}

export function TextPanel({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const fonts =
    SCANME_LINKS_PRESET_CAPABILITIES[document.design.presetKey].fonts;

  return (
    <div className="grid gap-4">
      <section className={styles.sectionCard}>
        <h3 className={styles.subheading}>Font</h3>
        <div className={styles.choiceGrid}>
          {fonts.map((fontKey) => (
            <button
              key={fontKey}
              type="button"
              className={cn(
                styles.choiceCard,
                document.design.typography.fontKey === fontKey &&
                  styles.selectedCard,
              )}
              onClick={() =>
                setDocument((current) => ({
                  ...current,
                  design: {
                    ...current.design,
                    typography: {
                      ...current.design.typography,
                      fontKey,
                    },
                  },
                }))
              }
            >
              <span className="text-xl" style={{ fontFamily: fontFamily(fontKey) }}>
                Aa
              </span>
              <span className="mt-2 block text-[11px] font-bold">
                {fontLabels[fontKey]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.sectionCard}>
        <h3 className={styles.subheading}>Boje teksta</h3>
        <div className={styles.fieldGrid}>
          <ColorField
            label="Naslov"
            value={document.design.colors.title}
            onChange={(title) =>
              patchDesignColors(setDocument, { title }, "text-title-color")
            }
          />
          <ColorField
            label="Opis"
            value={document.design.colors.body}
            onChange={(body) =>
              patchDesignColors(setDocument, { body }, "text-body-color")
            }
          />
        </div>
      </section>

      <TextShadowControls document={document} setDocument={setDocument} />
    </div>
  );
}

function MasterBackgroundFields({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const background = document.design.background;

  function updateBackground(
    nextBackground: ScanMeLinksBackgroundV2,
    group: string,
    pageColor?: string,
  ) {
    setDocument(
      (current) => ({
        ...current,
        design: {
          ...current.design,
          background: nextBackground,
          colors: pageColor
            ? { ...current.design.colors, page: pageColor }
            : current.design.colors,
        },
      }),
      group,
    );
  }

  if (background.category === "flat") {
    return (
      <ColorField
        label="Pozadina"
        value={background.color}
        onChange={(color) =>
          updateBackground({ ...background, color }, "master-background-flat", color)
        }
      />
    );
  }

  if (background.category === "gradient") {
    return (
      <div className={styles.twoColumns}>
        <ColorField
          label="Početna boja"
          value={background.startColor}
          onChange={(startColor) =>
            updateBackground(
              { ...background, startColor },
              "master-background-gradient-start",
              startColor,
            )
          }
        />
        <ColorField
          label="Završna boja"
          value={background.endColor}
          onChange={(endColor) =>
            updateBackground(
              { ...background, endColor },
              "master-background-gradient-end",
            )
          }
        />
      </div>
    );
  }

  if (background.category === "pattern") {
    return (
      <div className={styles.twoColumns}>
        <ColorField
          label="Boja pozadine"
          value={background.backgroundColor}
          onChange={(backgroundColor) =>
            updateBackground(
              { ...background, backgroundColor },
              "master-background-pattern-base",
              backgroundColor,
            )
          }
        />
        <ColorField
          label="Boja šare"
          value={background.patternColor}
          onChange={(patternColor) =>
            updateBackground(
              { ...background, patternColor },
              "master-background-pattern-detail",
            )
          }
        />
      </div>
    );
  }

  if (background.category === "texture") {
    return (
      <div className={styles.twoColumns}>
        <ColorField
          label="Boja pozadine"
          value={background.backgroundColor}
          onChange={(backgroundColor) =>
            updateBackground(
              { ...background, backgroundColor },
              "master-background-texture-base",
              backgroundColor,
            )
          }
        />
        <ColorField
          label="Ton teksture"
          value={background.tintColor}
          onChange={(tintColor) =>
            updateBackground(
              { ...background, tintColor },
              "master-background-texture-tint",
            )
          }
        />
      </div>
    );
  }

  if (background.category === "media") {
    return (
      <div className={styles.twoColumns}>
        <ColorField
          label="Overlay"
          value={background.overlayColor}
          onChange={(overlayColor) =>
            updateBackground(
              { ...background, overlayColor },
              "master-background-media-overlay",
            )
          }
        />
        <RangeField
          label={`Overlay · ${Math.round(background.overlayOpacity * 100)}%`}
          min={0}
          max={80}
          value={background.overlayOpacity * 100}
          onChange={(value) =>
            updateBackground(
              { ...background, overlayOpacity: value / 100 },
              "master-background-media-opacity",
            )
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.twoColumns}>
      <ColorField
        label="Boja osnove"
        value={background.baseColor}
        onChange={(baseColor) =>
          updateBackground(
            { ...background, baseColor },
            "master-background-animation-base",
            baseColor,
          )
        }
      />
      <ColorField
        label="Akcent animacije"
        value={background.accentColor}
        onChange={(accentColor) =>
          updateBackground(
            { ...background, accentColor },
            "master-background-animation-accent",
          )
        }
      />
    </div>
  );
}

type MasterShadowTarget = "global" | "button" | "text" | "logo";

export function ColorPanel({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const colors = document.design.colors;
  const [shadowTarget, setShadowTarget] =
    useState<MasterShadowTarget>("global");
  const shadowColor =
    shadowTarget === "text"
      ? document.design.effects.textShadow.color
      : shadowTarget === "logo"
        ? document.design.effects.logoShadow.color
        : document.design.buttons.shadow.color;

  function updateShadowColor(color: string) {
    setDocument(
      (current) => {
        const updateButton =
          shadowTarget === "global" || shadowTarget === "button";
        const updateText = shadowTarget === "global" || shadowTarget === "text";
        const updateLogo = shadowTarget === "global" || shadowTarget === "logo";

        return {
          ...current,
          design: {
            ...current.design,
            buttons: updateButton
              ? {
                  ...current.design.buttons,
                  shadow: { ...current.design.buttons.shadow, color },
                }
              : current.design.buttons,
            effects: {
              textShadow: updateText
                ? { ...current.design.effects.textShadow, color }
                : current.design.effects.textShadow,
              logoShadow: updateLogo
                ? { ...current.design.effects.logoShadow, color }
                : current.design.effects.logoShadow,
            },
          },
        };
      },
      `master-shadow-${shadowTarget}`,
    );
  }

  return (
    <div className="grid gap-4">
      <section className={styles.sectionCard}>
        <div className="mb-4 flex items-center gap-2">
          <Palette className="size-5" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold">Master kontrola boja</h3>
            <p className="mt-1 text-[11px] text-black/50">
              Sve ključne boje stranice na jednom mestu.
            </p>
          </div>
        </div>
        <div className={styles.fieldGrid}>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/45">
            Pozadina · {backgroundLabels[document.design.background.category]}
          </p>
          <MasterBackgroundFields document={document} setDocument={setDocument} />
          <ColorField
            label="Površine"
            value={colors.surface}
            onChange={(surface) =>
              patchDesignColors(setDocument, { surface }, "master-surface")
            }
          />
          <ColorField
            label="Akcent"
            value={colors.accent}
            onChange={(accent) =>
              patchDesignColors(setDocument, { accent }, "master-accent")
            }
          />
          <div className={styles.twoColumns}>
            <ColorField
              label="Naslov"
              value={colors.title}
              onChange={(title) =>
                patchDesignColors(setDocument, { title }, "master-title")
              }
            />
            <ColorField
              label="Opis"
              value={colors.body}
              onChange={(body) =>
                patchDesignColors(setDocument, { body }, "master-body")
              }
            />
          </div>
          <div className={styles.twoColumns}>
            <ColorField
              label="Dugme"
              value={colors.button}
              onChange={(button) =>
                patchDesignColors(setDocument, { button }, "master-button")
              }
            />
            <ColorField
              label="Tekst dugmeta"
              value={colors.buttonText}
              onChange={(buttonText) =>
                patchDesignColors(
                  setDocument,
                  { buttonText },
                  "master-button-text",
                )
              }
            />
          </div>
          <div className={styles.twoColumns}>
            <ColorField
              label="Ikonica"
              value={colors.icon}
              onChange={(icon) =>
                patchDesignColors(setDocument, { icon }, "master-icon")
              }
            />
            <ColorField
              label="Ivica"
              value={colors.border}
              onChange={(border) =>
                patchDesignColors(setDocument, { border }, "master-border")
              }
            />
          </div>
          <div className="mt-2 border-t border-black/10 pt-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-black/45">
              Boja senke
            </p>
            <div className={styles.twoColumns}>
              <div className={styles.fieldLabel}>
                <span>Primena</span>
                <EditorSelect
                  ariaLabel="Izaberi senku"
                  value={shadowTarget}
                  onValueChange={(value) =>
                    setShadowTarget(value as MasterShadowTarget)
                  }
                  options={[
                    { value: "global", label: "Globalna" },
                    { value: "button", label: "Dugme" },
                    { value: "text", label: "Tekst" },
                    { value: "logo", label: "Logo" },
                  ]}
                />
              </div>
              <ColorField
                label={shadowTarget === "global" ? "Sve senke" : "Izabrana senka"}
                value={shadowColor}
                onChange={updateShadowColor}
              />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-black/45">
              Promena boje ne uključuje senke koje su trenutno isključene.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function SettingsPanel({
  businessName,
  slug,
  publicActive,
  onSaveIdentity,
  onTogglePublic,
  busy,
}: {
  businessName: string;
  slug: string;
  publicActive: boolean;
  onSaveIdentity: (name: string, slug: string) => Promise<void>;
  onTogglePublic: (active: boolean) => Promise<void>;
  busy: boolean;
}) {
  const [nameDraft, setNameDraft] = useState(businessName);
  const [slugDraft, setSlugDraft] = useState(slug);

  const identityChanged =
    nameDraft.trim() !== businessName ||
    slugDraft.trim().toLowerCase() !== slug;

  return (
    <div className="grid gap-4">
      <section className={styles.sectionCard}>
        <h3 className={styles.subheading}>Lokal i adresa</h3>
        <div className={styles.fieldGrid}>
          <label className={styles.fieldLabel}>
            Naziv lokala
            <input
              className={styles.fieldControl}
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            Javni slug
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-black/40">
                /
              </span>
              <input
                className={cn(styles.fieldControl, "w-full pl-7")}
                value={slugDraft}
                onChange={(event) =>
                  setSlugDraft(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                      .replace(/-+/g, "-"),
                  )
                }
              />
            </div>
          </label>
          <button
            type="button"
            className={cn(styles.topAction, styles.saveButton)}
            disabled={!identityChanged || busy}
            onClick={() => void onSaveIdentity(nameDraft, slugDraft)}
          >
            Sačuvaj naziv i adresu
          </button>
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.switchRow}>
          <div>
            <h3 className="text-sm font-bold">Aktivna javna stranica</h3>
            <p className="mt-1 text-[11px] leading-5 text-black/50">
              Kada je isključena, posetioci ne mogu da otvore ovu ScanMe Links
              stranicu.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={publicActive}
            aria-label="Aktivna javna stranica"
            disabled={busy}
            className={cn(styles.switch, publicActive && styles.switchOn)}
            onClick={() => void onTogglePublic(!publicActive)}
          />
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.switchRow}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">Pristup klijenta</h3>
              <span className={styles.badge}>U pripremi</span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-black/50">
              Omogućiće klijentu uređivanje stranice iz njegovog panela.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={false}
            aria-label="Pristup klijenta — uskoro"
            disabled
            className={cn(styles.switch, styles.switchDisabled)}
          />
        </div>
      </section>
    </div>
  );
}

export function AnalyticsPanel({
  businessId,
}: {
  businessId: Id<"businesses">;
}) {
  return <EditorAnalyticsPanel businessId={businessId} />;
}

export function ProPanel() {
  return (
    <section className={styles.sectionCard}>
      <div className="grid size-12 place-items-center rounded-2xl bg-black text-white">
        <Crown className="size-5" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-xl font-bold tracking-[-0.04em]">
        ScanMe Links Pro
      </h3>
      <p className="mt-2 max-w-[36ch] text-xs leading-6 text-black/55">
        Video pozadine, animacije i napredni vizuelni efekti biće deo Pro paketa.
        Kao administrator trenutno možete da ih testirate u editoru.
      </p>
    </section>
  );
}

export function HelpPanel() {
  return (
    <div className="grid gap-4">
      <section className={styles.sectionCard}>
        <h3 className="text-base font-bold">Kako se koristi editor?</h3>
        <ol className="mt-4 grid gap-3 text-xs leading-5 text-black/60">
          <li>
            <strong className="text-black/75">1.</strong> Otvorite sekciju iz
            leve trake i podesite izgled.
          </li>
          <li>
            <strong className="text-black/75">2.</strong> Kliknite na dugme u
            telefonu da uredite njegov link.
          </li>
          <li>
            <strong className="text-black/75">3.</strong> Sačuvajte nacrt, a
            zatim ga objavite kada ste zadovoljni.
          </li>
        </ol>
      </section>
      <div className={styles.futurePalette}>
        Detaljan interaktivni tutorial biće dodat u sledećoj fazi. Editor je
        napravljen tako da glavne akcije budu razumljive i bez njega.
      </div>
    </div>
  );
}

function EditorSelect({
  ariaLabel,
  value,
  options,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={styles.editorSelectTrigger}
        aria-label={ariaLabel}
      >
        <SelectValue>
          {options.find((option) => option.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={styles.editorSelectContent}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={styles.editorSelectItem}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const radiusOptions = [
  { value: 0, previewRadius: 0, label: "Oštro" },
  { value: 24, previewRadius: 12, label: "Srednje" },
  { value: 36, previewRadius: 28, label: "Naglašeno" },
] as const;

function RadiusField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const selectedValue = radiusOptions.reduce((closest, option) =>
    Math.abs(option.value - value) < Math.abs(closest.value - value)
      ? option
      : closest,
  ).value;

  return (
    <fieldset className={styles.fieldGrid}>
      <legend className={styles.fieldLabel}>Zaobljenje</legend>
      <div className={styles.radiusChoices}>
        {radiusOptions.map((option) => {
          const selected = option.value === selectedValue;
          return (
            <EditorTooltip key={option.value} label={option.label}>
              <button
                type="button"
                className={cn(
                  styles.radiusChoice,
                  selected && styles.radiusChoiceActive,
                )}
                aria-label={`${option.label} zaobljenje`}
                aria-pressed={selected}
                onClick={() => onChange(option.value)}
              >
                <span
                  className={styles.radiusShape}
                  style={{ borderTopLeftRadius: option.previewRadius }}
                  aria-hidden="true"
                />
                <span className="sr-only">{option.label}</span>
              </button>
            </EditorTooltip>
          );
        })}
      </div>
    </fieldset>
  );
}

function RangeField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const progress =
    max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <label className={styles.fieldLabel}>
      {label}
      <input
        className={styles.range}
        type="range"
        min={min}
        max={max}
        value={value}
        style={{
          background: `linear-gradient(90deg, rgba(37, 43, 39, .88) 0 ${progress}%, rgba(68, 62, 56, .14) ${progress}% 100%)`,
        }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function patchDesignColors(
  setDocument: EditorDocumentSetter,
  patch: Partial<ScanMeLinksDesignV2["colors"]>,
  group?: string,
) {
  setDocument(
    (current) => ({
      ...current,
      design: {
        ...current.design,
        colors: { ...current.design.colors, ...patch },
      },
    }),
    group,
  );
}

function defaultBackgroundForCategory(
  category: ScanMeLinksBackgroundCategory,
  design: ScanMeLinksDesignV2,
): ScanMeLinksBackgroundV2 {
  const colors = design.colors;
  const companion = deriveBackgroundCompanionColor(colors.page, category);
  const variants =
    SCANME_LINKS_PRESET_CAPABILITIES[design.presetKey]
      .allowedBackgroundVariants;

  switch (category) {
    case "gradient":
      return {
        category,
        variant: variants.gradient?.[0] ?? "linear",
        startColor: colors.page,
        endColor: companion,
        angle: 135,
        centerX: 50,
        centerY: 50,
      };
    case "pattern":
      return {
        category,
        variant: variants.pattern?.[0] ?? "grid",
        backgroundColor: colors.page,
        patternColor: companion,
        scale: 24,
        opacity: 0.18,
      };
    case "texture":
      return {
        category,
        variant: variants.texture?.[0] ?? "paper",
        backgroundColor: colors.page,
        tintColor: companion,
        intensity: 0.2,
      };
    case "media":
      return {
        category,
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
        category,
        variant: variants.animation?.[0] ?? "aurora",
        baseColor: colors.page,
        accentColor: companion,
        speed: 1,
        intensity: 0.4,
      };
    case "flat":
      return { category, color: colors.page };
  }
}

function PatternPreview({
  variant,
  background,
  foreground,
}: {
  variant: "grid" | "checker" | "dots" | "waves";
  background: string;
  foreground: string;
}) {
  const image =
    variant === "grid"
      ? `linear-gradient(${foreground}55 1px,transparent 1px),linear-gradient(90deg,${foreground}55 1px,transparent 1px)`
      : variant === "checker"
        ? `conic-gradient(${foreground}44 25%,transparent 0 50%,${foreground}44 0 75%,transparent 0)`
        : variant === "dots"
          ? `radial-gradient(${foreground}88 1.5px,transparent 1.5px)`
          : `repeating-radial-gradient(ellipse at 0 100%,transparent 0 8px,${foreground}44 9px 10px,transparent 11px 18px)`;
  return (
    <span
      className="block h-10 w-full rounded-xl"
      style={{
        backgroundColor: background,
        backgroundImage: image,
        backgroundSize: variant === "checker" ? "18px 18px" : "14px 14px",
      }}
    />
  );
}

function TexturePreview({
  variant,
  background,
  tint,
}: {
  variant: "paper" | "linen" | "wood" | "metal";
  background: string;
  tint: string;
}) {
  const image =
    variant === "linen"
      ? `repeating-linear-gradient(0deg,${tint}22 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,${tint}18 0 1px,transparent 1px 5px)`
      : variant === "wood"
        ? `repeating-radial-gradient(ellipse at 20% 30%,transparent 0 8px,${tint}30 9px 10px,transparent 11px 19px)`
        : variant === "metal"
          ? `linear-gradient(110deg,transparent 20%,${tint}33 42%,transparent 58%),repeating-linear-gradient(0deg,${tint}12 0 1px,transparent 1px 3px)`
          : `radial-gradient(${tint}30 .7px,transparent .8px)`;
  return (
    <span
      className="block h-10 w-full rounded-xl"
      style={{
        backgroundColor: background,
        backgroundImage: image,
        backgroundSize: variant === "paper" ? "5px 5px" : "auto",
      }}
    />
  );
}

function buttonVariantLabel(variant: ScanMeLinksButtonVariant) {
  if (variant === "solid") return "Solid";
  if (variant === "outline") return "Outline";
  return "Glass";
}

function patternLabel(variant: "grid" | "checker" | "dots" | "waves") {
  if (variant === "grid") return "Grid";
  if (variant === "checker") return "Checker";
  if (variant === "dots") return "Tačke";
  return "Talasi";
}

function textureLabel(variant: "paper" | "linen" | "wood" | "metal") {
  if (variant === "paper") return "Papir";
  if (variant === "linen") return "Lan";
  if (variant === "wood") return "Drvo";
  return "Metal";
}

function fontFamily(fontKey: ScanMeLinksFontKey) {
  const map: Record<ScanMeLinksFontKey, string> = {
    "dm-sans": '"DM Sans", ui-sans-serif, sans-serif',
    "nunito-sans": '"Nunito Sans", ui-sans-serif, sans-serif',
    "source-sans-3": '"Source Sans 3", ui-sans-serif, sans-serif',
    "system-ui": "system-ui, sans-serif",
    inter: "Inter, ui-sans-serif, sans-serif",
    manrope: "Manrope, ui-sans-serif, sans-serif",
    "cormorant-garamond": '"Cormorant Garamond", Georgia, serif',
    "playfair-display": '"Playfair Display", Georgia, serif',
    lora: "Lora, Georgia, serif",
    "libre-baskerville": '"Libre Baskerville", Georgia, serif',
    "space-grotesk": '"Space Grotesk", ui-sans-serif, sans-serif',
    archivo: "Archivo, ui-sans-serif, sans-serif",
  };
  return map[fontKey];
}
