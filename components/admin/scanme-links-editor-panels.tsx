"use client";

import {
  AlertTriangle,
  Check,
  Crown,
  ImagePlus,
  Link2,
  Palette,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EditorAnalyticsPanel } from "@/components/scanme-links/editor-analytics-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DESTINATION_DEFAULTS,
  DESTINATION_KINDS,
  type DestinationKind,
} from "@/lib/scanme-links";
import {
  SCANME_LINKS_BACKGROUND_CATEGORIES,
  SCANME_LINKS_PRESET_CAPABILITIES,
  SCANME_LINKS_PRESET_KEYS,
  createDefaultScanMeLinksDesignV2,
  type ScanMeLinksBackgroundCategory,
  type ScanMeLinksBackgroundV2,
  type ScanMeLinksButtonVariant,
  type ScanMeLinksDesignV2,
  type ScanMeLinksFontKey,
} from "@/lib/scanme-links-design";
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
              <span className={styles.counter}>{document.title.length}/20</span>
            </span>
            <input
              className={styles.fieldControl}
              maxLength={20}
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
                <span
                  key={color}
                  className={styles.swatch}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))
            ) : (
              <span className="text-[11px] text-black/45">
                Paleta će se pojaviti nakon otpremanja.
              </span>
            )}
          </div>
        </div>

        <div className={cn(styles.futurePalette, "mt-4")}>
          <Sparkles className="size-5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="block text-black/65">
              Pametni predlog palete
            </strong>
            Uskoro ćemo ovde predlagati skladne pozadinske, akcentne i tekstualne
            boje na osnovu logotipa.
          </span>
        </div>
      </section>

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

export function StylePanel({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  return (
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
              setDocument((current) => ({
                ...current,
                design: createDefaultScanMeLinksDesignV2(presetKey),
              }))
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
        {allowedCategories.map((category) => (
          <button
            key={category}
            type="button"
            className={cn(
              styles.backgroundTab,
              design.background.category === category &&
                styles.backgroundTabActive,
            )}
            aria-pressed={design.background.category === category}
            onClick={() => selectCategory(category)}
          >
            {backgroundLabels[category]}
          </button>
        ))}
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
            "mt-4 !grid-cols-1 text-center",
            uploadBusy && "pointer-events-none opacity-60",
          )}
        >
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/65">
            {mediaType === "image" ? (
              <ImagePlus className="size-5" aria-hidden="true" />
            ) : (
              <Video className="size-5" aria-hidden="true" />
            )}
          </span>
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
              label="Preliv"
              value={background.overlayColor}
              onChange={(overlayColor) =>
                updateBackground(
                  { ...background, overlayColor },
                  "background-media-overlay",
                )
              }
            />
            <RangeField
              label={`Preliv · ${Math.round(background.overlayOpacity * 100)}%`}
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
            <Sparkles className="size-5" aria-hidden="true" />
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
          {capabilities.allowedButtonVariants.map((variant) => (
            <button
              key={variant}
              type="button"
              className={cn(
                styles.choiceCard,
                design.buttons.variant === variant && styles.selectedCard,
              )}
              onClick={() =>
                patchButtons({ variant }, "button-variant")
              }
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
          ))}
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

      <section className={styles.sectionCard}>
        <div className={styles.switchRow}>
          <div>
            <h3 className="text-sm font-bold">Drop shadow</h3>
            <p className="mt-1 text-[11px] text-black/50">
              Neutralna ili obojena senka ispod dugmeta.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={design.buttons.shadow.enabled}
            aria-label="Uključi senku dugmeta"
            className={cn(
              styles.switch,
              design.buttons.shadow.enabled && styles.switchOn,
            )}
            onClick={() =>
              patchButtons(
                {
                  shadow: {
                    ...design.buttons.shadow,
                    enabled: !design.buttons.shadow.enabled,
                  },
                },
                "button-shadow-toggle",
              )
            }
          />
        </div>

        {design.buttons.shadow.enabled ? (
          <div className={cn(styles.fieldGrid, "mt-4")}>
            <ColorField
              label="Boja senke"
              value={design.buttons.shadow.color}
              onChange={(color) =>
                patchButtons(
                  { shadow: { ...design.buttons.shadow, color } },
                  "button-shadow-color",
                )
              }
            />
            <div className={styles.twoColumns}>
              <RangeField
                label={`X · ${Math.round(design.buttons.shadow.x)} px`}
                min={-24}
                max={24}
                value={design.buttons.shadow.x}
                onChange={(x) =>
                  patchButtons(
                    { shadow: { ...design.buttons.shadow, x } },
                    "button-shadow-x",
                  )
                }
              />
              <RangeField
                label={`Y · ${Math.round(design.buttons.shadow.y)} px`}
                min={-24}
                max={32}
                value={design.buttons.shadow.y}
                onChange={(y) =>
                  patchButtons(
                    { shadow: { ...design.buttons.shadow, y } },
                    "button-shadow-y",
                  )
                }
              />
            </div>
            <div className={styles.twoColumns}>
              <RangeField
                label={`Blur · ${Math.round(design.buttons.shadow.blur)} px`}
                min={0}
                max={64}
                value={design.buttons.shadow.blur}
                onChange={(blur) =>
                  patchButtons(
                    { shadow: { ...design.buttons.shadow, blur } },
                    "button-shadow-blur",
                  )
                }
              />
              <RangeField
                label={`Intenzitet · ${Math.round(
                  design.buttons.shadow.opacity * 100,
                )}%`}
                min={0}
                max={60}
                value={design.buttons.shadow.opacity * 100}
                onChange={(value) =>
                  patchButtons(
                    {
                      shadow: {
                        ...design.buttons.shadow,
                        opacity: value / 100,
                      },
                    },
                    "button-shadow-opacity",
                  )
                }
              />
            </div>
          </div>
        ) : null}
      </section>

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
            <button
              key={value}
              type="button"
              disabled
              className={cn(styles.choiceCard, styles.disabledCard)}
              title="Vizuelna referenca će biti dodata u sledećoj fazi."
            >
              <Sparkles className="size-5" aria-hidden="true" />
              <span className="mt-3 block text-xs font-bold">{label}</span>
            </button>
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
    </div>
  );
}

export function ColorPanel({
  document,
  setDocument,
}: {
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
}) {
  const colors = document.design.colors;

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
          <ColorField
            label="Pozadina / osnova"
            value={colors.page}
            onChange={(page) =>
              setDocument(
                (current) => ({
                  ...current,
                  design: {
                    ...current.design,
                    colors: { ...current.design.colors, page },
                    background:
                      current.design.background.category === "flat"
                        ? { category: "flat", color: page }
                        : current.design.background,
                  },
                }),
                "master-page",
              )
            }
          />
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
  { value: 12, label: "Blago" },
  { value: 24, label: "Srednje" },
  { value: 36, label: "Naglašeno" },
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
            <button
              key={option.value}
              type="button"
              className={cn(
                styles.radiusChoice,
                selected && styles.radiusChoiceActive,
              )}
              aria-label={`${option.label} zaobljenje`}
              aria-pressed={selected}
              title={option.label}
              onClick={() => onChange(option.value)}
            >
              <span
                className={styles.radiusShape}
                style={{ borderTopLeftRadius: option.value }}
                aria-hidden="true"
              />
              <span className="sr-only">{option.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.fieldLabel}>
      {label}
      <span className={styles.colorControl}>
        <input
          className={styles.colorInput}
          type="color"
          value={safeColor(value)}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          className={styles.fieldControl}
          value={value}
          maxLength={9}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} heksadecimalna vrednost`}
        />
      </span>
    </label>
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
  const variants =
    SCANME_LINKS_PRESET_CAPABILITIES[design.presetKey]
      .allowedBackgroundVariants;

  switch (category) {
    case "gradient":
      return {
        category,
        variant: variants.gradient?.[0] ?? "linear",
        startColor: colors.page,
        endColor: colors.accent,
        angle: 135,
        centerX: 50,
        centerY: 50,
      };
    case "pattern":
      return {
        category,
        variant: variants.pattern?.[0] ?? "grid",
        backgroundColor: colors.page,
        patternColor: colors.accent,
        scale: 24,
        opacity: 0.18,
      };
    case "texture":
      return {
        category,
        variant: variants.texture?.[0] ?? "paper",
        backgroundColor: colors.page,
        tintColor: colors.accent,
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
        accentColor: colors.accent,
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

function safeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
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
