"use client";

// The page-level panels (TASK-12 STEP 3): event, style, background, text,
// colour, settings — the page's own design document. Design edits go through
// the SAME history/autosave document as blocks (undo covers them); top-level
// media (logo, background image/video) saves immediately through saveDraft's
// dedicated storage-id args, exactly like the Links editor treats media.
//
// Constrained freedom here: numeric ranges come from VENUE_DESIGN_BOUNDS (the
// tuple clampVenueDesign enforces at render), colours are page-palette
// swatches, and the colour panel never shows a picker — palettes are DERIVED
// from the business's brand through lib/design-engine/palette.ts.

import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import {
  SCANME_LINKS_BACKGROUND_CATEGORIES,
  SCANME_LINKS_BACKGROUND_ANIMATIONS,
  SCANME_LINKS_GRADIENT_VARIANTS,
  SCANME_LINKS_MEDIA_TYPES,
  SCANME_LINKS_PATTERN_VARIANTS,
  SCANME_LINKS_TEXTURE_VARIANTS,
  type ScanMeLinksBackgroundV2,
} from "@/lib/scanme-links-design";
import {
  DEFAULT_PALETTE_SCHEME,
  deriveVenueRoleColors,
  generateMaterialRoles,
  MATERIAL_VARIANT_CYCLE,
  PALETTE_SCHEME_TYPES,
  type MaterialVariant,
  type PaletteSchemeType,
} from "@/lib/design-engine/palette";
import type { DesignFontKey } from "@/lib/design-engine/typography";
import {
  clampVenueDesign,
  DEFAULT_VENUE_DESIGN,
  VENUE_DESIGN_BOUNDS,
  type VenueDesign,
  type VenueEffects,
} from "@/lib/design-engine/venue-tokens";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import { formatBelgradeDate, formatBelgradeTime } from "@/lib/venue-calendar";
import {
  FONT_OPTIONS,
  WEIGHT_OPTIONS,
} from "./venue-editor-base-section";
import {
  BoundedSlider,
  formatPercent,
  formatPx,
  Segmented,
  SelectField,
  SubHeading,
  SwatchRow,
  TextField,
  ToggleRow,
} from "./venue-editor-fields";
import { paletteSwatches } from "./venue-editor-panel-context";
import { MediaUploadTile } from "./venue-editor-upload";
import styles from "./venue-editor.module.css";
import type {
  VenueEditorData,
  VenueEditorDocument,
  VenueEditorDocumentSetter,
  VenueEditorEvent,
} from "./venue-editor-types";

type DesignWeight = 400 | 500 | 600 | 700;

export type VenueTopMediaKind = "logo" | "backgroundImage" | "backgroundVideo";

export type VenuePagePanelProps = {
  data: VenueEditorData;
  document: VenueEditorDocument;
  setDocument: VenueEditorDocumentSetter;
  /** Immediate top-level media save (outside the undo document, like Links). */
  saveMedia: (kind: VenueTopMediaKind, storageId: string | null) => void;
};

// One shared design mutator: always materializes the full (clamped) design so
// the first edit of a never-designed page starts from the engine default.
function designUpdater(setDocument: VenueEditorDocumentSetter) {
  return (mutate: (design: VenueDesign) => VenueDesign, group?: string) =>
    setDocument(
      (current) => ({
        ...current,
        design: mutate(clampVenueDesign(current.design)),
      }),
      group,
    );
}

function currentDesign(document: VenueEditorDocument): VenueDesign {
  return clampVenueDesign(document.design);
}

// ------------------------------------------------------------------- event

const EVENT_STATUS_LABELS: Record<VenueEditorEvent["status"], string> = {
  draft: dict.statusDraft,
  scheduled: dict.statusScheduled,
  live: dict.statusLive,
  ended: dict.statusEnded,
  archived: dict.statusArchived,
};

export function EventPagePanel({
  data,
  document,
  setDocument,
}: VenuePagePanelProps) {
  const event = data.event!;
  return (
    <div className={styles.panelForm}>
      <TextField
        label={dict.eventDisplayNameLabel}
        value={document.displayName ?? ""}
        placeholder={data.businessName}
        hint={dict.eventDisplayNameHint}
        maxLength={120}
        onChange={(next) =>
          setDocument(
            (current) => ({
              ...current,
              displayName: next === "" ? null : next,
            }),
            "display-name",
          )
        }
      />
      <dl className={styles.factList}>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventTitleLabel}</dt>
          <dd className={styles.factValue}>{event.title}</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventPathLabel}</dt>
          <dd className={styles.factValue}>
            /{data.businessSlug}/venue/{event.slug}
          </dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventStatusLabel}</dt>
          <dd className={styles.factValue}>
            {EVENT_STATUS_LABELS[event.status]}
          </dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventScheduleLabel}</dt>
          <dd className={styles.factValue}>
            {event.startsAt !== null
              ? `${formatBelgradeDate(event.startsAt)} · ${formatBelgradeTime(event.startsAt)}`
              : dict.eventNoSchedule}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ------------------------------------------------------------------- style

function shadowDefaults(design: VenueDesign): VenueEffects {
  const base = {
    enabled: false,
    color: design.colors.title,
    x: 0,
    y: 2,
    blur: 12,
    opacity: 0.35,
  };
  return { textShadow: { ...base }, logoShadow: { ...base } };
}

export function StylePagePanel({
  document,
  setDocument,
}: VenuePagePanelProps) {
  const design = currentDesign(document);
  const update = designUpdater(setDocument);
  const swatches = paletteSwatches(design.colors);
  const effects = design.effects ?? shadowDefaults(design);

  function updateShadow(
    key: "textShadow" | "logoShadow",
    partial: Partial<VenueEffects["textShadow"]>,
    group?: string,
  ) {
    update(
      (current) => ({
        ...current,
        effects: {
          ...(current.effects ?? shadowDefaults(current)),
          [key]: {
            ...(current.effects ?? shadowDefaults(current))[key],
            ...partial,
          },
        },
      }),
      group,
    );
  }

  return (
    <div className={styles.panelForm}>
      <BoundedSlider
        label={dict.styleSpacingLabel}
        value={design.typography.verticalSpacing}
        bounds={VENUE_DESIGN_BOUNDS.verticalSpacing}
        format={formatPx}
        onChange={(verticalSpacing) =>
          update(
            (current) => ({
              ...current,
              typography: { ...current.typography, verticalSpacing },
            }),
            "style-spacing",
          )
        }
      />
      <BoundedSlider
        label={dict.styleLineHeightLabel}
        value={design.typography.lineHeight}
        bounds={VENUE_DESIGN_BOUNDS.lineHeight}
        step={0.05}
        format={(value) => value.toFixed(2)}
        onChange={(lineHeight) =>
          update(
            (current) => ({
              ...current,
              typography: { ...current.typography, lineHeight },
            }),
            "style-line-height",
          )
        }
      />
      <SubHeading>{dict.styleEffectsHeading}</SubHeading>
      {(
        [
          ["textShadow", dict.styleTextShadow],
          ["logoShadow", dict.styleLogoShadow],
        ] as const
      ).map(([key, label]) => {
        const shadow = effects[key];
        return (
          <div key={key}>
            <ToggleRow
              label={label}
              checked={shadow.enabled}
              onChange={(enabled) => updateShadow(key, { enabled })}
            />
            {shadow.enabled ? (
              <>
                <BoundedSlider
                  label={dict.shadowYLabel}
                  value={shadow.y}
                  bounds={VENUE_DESIGN_BOUNDS.shadowOffset}
                  onChange={(y) => updateShadow(key, { y }, `${key}-y`)}
                />
                <BoundedSlider
                  label={dict.shadowBlurLabel}
                  value={shadow.blur}
                  bounds={VENUE_DESIGN_BOUNDS.shadowBlur}
                  onChange={(blur) => updateShadow(key, { blur }, `${key}-blur`)}
                />
                <BoundedSlider
                  label={dict.shadowOpacityLabel}
                  value={shadow.opacity}
                  bounds={VENUE_DESIGN_BOUNDS.shadowOpacity}
                  step={0.01}
                  format={formatPercent}
                  onChange={(opacity) =>
                    updateShadow(key, { opacity }, `${key}-opacity`)
                  }
                />
                <SwatchRow
                  label={dict.shadowColorLabel}
                  value={shadow.color}
                  swatches={swatches}
                  onPick={(color) => updateShadow(key, { color })}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------- background

const CATEGORY_LABELS: Record<ScanMeLinksBackgroundV2["category"], string> = {
  flat: dict.bgCatFlat,
  gradient: dict.bgCatGradient,
  pattern: dict.bgCatPattern,
  texture: dict.bgCatTexture,
  media: dict.bgCatMedia,
  animation: dict.bgCatAnimation,
};

// A fresh, valid background of each category, seeded from the current palette.
function backgroundDefaults(
  category: ScanMeLinksBackgroundV2["category"],
  design: VenueDesign,
): ScanMeLinksBackgroundV2 {
  const colors = design.colors;
  switch (category) {
    case "flat":
      return { category, color: colors.page };
    case "gradient":
      return {
        category,
        variant: SCANME_LINKS_GRADIENT_VARIANTS[0],
        startColor: colors.page,
        endColor: colors.surface,
        angle: 160,
        centerX: 50,
        centerY: 20,
      };
    case "pattern":
      return {
        category,
        variant: SCANME_LINKS_PATTERN_VARIANTS[0],
        backgroundColor: colors.page,
        patternColor: colors.border,
        scale: 24,
        opacity: 0.35,
      };
    case "texture":
      return {
        category,
        variant: SCANME_LINKS_TEXTURE_VARIANTS[0],
        backgroundColor: colors.page,
        tintColor: colors.border,
        intensity: 0.4,
      };
    case "media":
      return {
        category,
        mediaType: SCANME_LINKS_MEDIA_TYPES[0],
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
        variant: SCANME_LINKS_BACKGROUND_ANIMATIONS[0],
        baseColor: colors.page,
        accentColor: colors.accent,
        speed: 1,
        intensity: 0.4,
      };
  }
}

export function BackgroundPagePanel({
  data,
  document,
  setDocument,
  saveMedia,
}: VenuePagePanelProps) {
  const event = data.event!;
  const design = currentDesign(document);
  const update = designUpdater(setDocument);
  const swatches = paletteSwatches(design.colors);
  const background = design.background;

  function patchBackground(
    partial: Partial<ScanMeLinksBackgroundV2>,
    group?: string,
  ) {
    update(
      (current) => ({
        ...current,
        background: { ...current.background, ...partial } as ScanMeLinksBackgroundV2,
      }),
      group,
    );
  }

  return (
    <div className={styles.panelForm}>
      <SelectField
        label={dict.bgCategoryLabel}
        value={background.category}
        options={SCANME_LINKS_BACKGROUND_CATEGORIES.map((category) => ({
          value: category,
          label: CATEGORY_LABELS[category],
        }))}
        onChange={(category) =>
          update((current) => ({
            ...current,
            background: backgroundDefaults(category, current),
          }))
        }
      />

      {background.category === "flat" ? (
        <SwatchRow
          label={dict.bgFlatColor}
          value={background.color}
          swatches={swatches}
          onPick={(color) => patchBackground({ color })}
        />
      ) : null}

      {background.category === "gradient" ? (
        <>
          <Segmented
            label={dict.bgGradientVariant}
            value={background.variant}
            options={[
              { value: "linear", label: dict.gradientLinear },
              { value: "radial", label: dict.gradientRadial },
            ]}
            onChange={(variant) => patchBackground({ variant })}
          />
          <SwatchRow
            label={dict.bgGradientStart}
            value={background.startColor}
            swatches={swatches}
            onPick={(startColor) => patchBackground({ startColor })}
          />
          <SwatchRow
            label={dict.bgGradientEnd}
            value={background.endColor}
            swatches={swatches}
            onPick={(endColor) => patchBackground({ endColor })}
          />
          {background.variant === "linear" ? (
            <BoundedSlider
              label={dict.bgGradientAngle}
              value={background.angle}
              bounds={VENUE_DESIGN_BOUNDS.gradientAngle}
              format={(value) => `${value}°`}
              onChange={(angle) => patchBackground({ angle }, "bg-angle")}
            />
          ) : (
            <>
              <BoundedSlider
                label={dict.bgGradientCenterX}
                value={background.centerX}
                bounds={VENUE_DESIGN_BOUNDS.gradientCenter}
                format={formatPercentPlain}
                onChange={(centerX) => patchBackground({ centerX }, "bg-cx")}
              />
              <BoundedSlider
                label={dict.bgGradientCenterY}
                value={background.centerY}
                bounds={VENUE_DESIGN_BOUNDS.gradientCenter}
                format={formatPercentPlain}
                onChange={(centerY) => patchBackground({ centerY }, "bg-cy")}
              />
            </>
          )}
        </>
      ) : null}

      {background.category === "pattern" ? (
        <>
          <Segmented
            label={dict.bgPatternVariant}
            value={background.variant}
            options={[
              { value: "grid", label: dict.patternGrid },
              { value: "checker", label: dict.patternChecker },
              { value: "dots", label: dict.patternDots },
              { value: "waves", label: dict.patternWaves },
            ]}
            onChange={(variant) => patchBackground({ variant })}
          />
          <SwatchRow
            label={dict.bgPatternBase}
            value={background.backgroundColor}
            swatches={swatches}
            onPick={(backgroundColor) => patchBackground({ backgroundColor })}
          />
          <SwatchRow
            label={dict.bgPatternColor}
            value={background.patternColor}
            swatches={swatches}
            onPick={(patternColor) => patchBackground({ patternColor })}
          />
          <BoundedSlider
            label={dict.bgPatternScale}
            value={background.scale}
            bounds={VENUE_DESIGN_BOUNDS.patternScale}
            onChange={(scale) => patchBackground({ scale }, "bg-scale")}
          />
          <BoundedSlider
            label={dict.bgPatternOpacity}
            value={background.opacity}
            bounds={VENUE_DESIGN_BOUNDS.patternOpacity}
            step={0.01}
            format={formatPercent}
            onChange={(opacity) => patchBackground({ opacity }, "bg-opacity")}
          />
        </>
      ) : null}

      {background.category === "texture" ? (
        <>
          <Segmented
            label={dict.bgTextureVariant}
            value={background.variant}
            options={[
              { value: "paper", label: dict.texturePaper },
              { value: "linen", label: dict.textureLinen },
              { value: "wood", label: dict.textureWood },
              { value: "metal", label: dict.textureMetal },
            ]}
            onChange={(variant) => patchBackground({ variant })}
          />
          <SwatchRow
            label={dict.bgTextureBase}
            value={background.backgroundColor}
            swatches={swatches}
            onPick={(backgroundColor) => patchBackground({ backgroundColor })}
          />
          <SwatchRow
            label={dict.bgTextureTint}
            value={background.tintColor}
            swatches={swatches}
            onPick={(tintColor) => patchBackground({ tintColor })}
          />
          <BoundedSlider
            label={dict.bgTextureIntensity}
            value={background.intensity}
            bounds={VENUE_DESIGN_BOUNDS.textureIntensity}
            step={0.01}
            format={formatPercent}
            onChange={(intensity) => patchBackground({ intensity }, "bg-int")}
          />
        </>
      ) : null}

      {background.category === "media" ? (
        <>
          <Segmented
            label={dict.bgMediaTypeLabel}
            value={background.mediaType}
            options={[
              { value: "image", label: dict.mediaImage },
              { value: "video", label: dict.mediaVideo },
            ]}
            onChange={(mediaType) => patchBackground({ mediaType })}
          />
          {background.mediaType === "image" ? (
            <MediaUploadTile
              kind="image"
              storageId={undefined}
              previewUrl={event.draftBackgroundImageUrl}
              onUploaded={(storageId) => saveMedia("backgroundImage", storageId)}
              onRemove={
                event.draftBackgroundImageUrl
                  ? () => saveMedia("backgroundImage", null)
                  : undefined
              }
            />
          ) : (
            <MediaUploadTile
              kind="video"
              storageId={undefined}
              previewUrl={event.draftBackgroundVideoUrl}
              onUploaded={(storageId) => saveMedia("backgroundVideo", storageId)}
              onRemove={
                event.draftBackgroundVideoUrl
                  ? () => saveMedia("backgroundVideo", null)
                  : undefined
              }
            />
          )}
          {background.mediaType === "image" && !event.draftBackgroundImageUrl ? (
            <p className={styles.fieldHint}>{dict.bgMediaMissing}</p>
          ) : null}
          {background.mediaType === "video" && !event.draftBackgroundVideoUrl ? (
            <p className={styles.fieldHint}>{dict.bgMediaMissing}</p>
          ) : null}
          <Segmented
            label={dict.bgMediaFit}
            value={background.fit}
            options={[
              { value: "cover", label: dict.fitCover },
              { value: "contain", label: dict.fitContain },
            ]}
            onChange={(fit) => patchBackground({ fit })}
          />
          <BoundedSlider
            label={dict.bgMediaZoom}
            value={background.zoom}
            bounds={VENUE_DESIGN_BOUNDS.mediaZoom}
            step={0.05}
            format={(value) => `×${value.toFixed(2)}`}
            onChange={(zoom) => patchBackground({ zoom }, "bg-zoom")}
          />
          <BoundedSlider
            label={dict.bgMediaPosX}
            value={background.positionX}
            bounds={VENUE_DESIGN_BOUNDS.mediaPosition}
            format={formatPercentPlain}
            onChange={(positionX) => patchBackground({ positionX }, "bg-px")}
          />
          <BoundedSlider
            label={dict.bgMediaPosY}
            value={background.positionY}
            bounds={VENUE_DESIGN_BOUNDS.mediaPosition}
            format={formatPercentPlain}
            onChange={(positionY) => patchBackground({ positionY }, "bg-py")}
          />
          <SwatchRow
            label={dict.bgOverlayColor}
            value={background.overlayColor}
            swatches={swatches}
            onPick={(overlayColor) => patchBackground({ overlayColor })}
          />
          <BoundedSlider
            label={dict.bgOverlayOpacity}
            value={background.overlayOpacity}
            bounds={VENUE_DESIGN_BOUNDS.overlayOpacity}
            step={0.01}
            format={formatPercent}
            onChange={(overlayOpacity) =>
              patchBackground({ overlayOpacity }, "bg-overlay")
            }
          />
        </>
      ) : null}

      {background.category === "animation" ? (
        <>
          <Segmented
            label={dict.bgAnimationVariant}
            value={background.variant}
            options={[
              { value: "aurora", label: dict.bgAnimationAurora },
              { value: "soft-waves", label: dict.bgAnimationSoftWaves },
            ]}
            onChange={(variant) => patchBackground({ variant })}
          />
          <SwatchRow
            label={dict.bgAnimationBase}
            value={background.baseColor}
            swatches={swatches}
            onPick={(baseColor) => patchBackground({ baseColor })}
          />
          <SwatchRow
            label={dict.bgAnimationAccent}
            value={background.accentColor}
            swatches={swatches}
            onPick={(accentColor) => patchBackground({ accentColor })}
          />
          <BoundedSlider
            label={dict.bgAnimationSpeed}
            value={background.speed}
            bounds={VENUE_DESIGN_BOUNDS.animationSpeed}
            step={0.05}
            format={(value) => `×${value.toFixed(2)}`}
            onChange={(speed) => patchBackground({ speed }, "bg-speed")}
          />
          <BoundedSlider
            label={dict.bgAnimationIntensity}
            value={background.intensity}
            bounds={VENUE_DESIGN_BOUNDS.animationIntensity}
            step={0.01}
            format={formatPercent}
            onChange={(intensity) => patchBackground({ intensity }, "bg-aint")}
          />
          <p className={styles.fieldHint}>{dict.bgAnimationRenderNote}</p>
        </>
      ) : null}
    </div>
  );
}

function formatPercentPlain(value: number) {
  return `${value}%`;
}

// -------------------------------------------------------------------- text

export function TextPagePanel({ document, setDocument }: VenuePagePanelProps) {
  const design = currentDesign(document);
  const update = designUpdater(setDocument);

  function patchTypography(
    partial: Partial<VenueDesign["typography"]>,
    group?: string,
  ) {
    update(
      (current) => ({
        ...current,
        typography: { ...current.typography, ...partial },
      }),
      group,
    );
  }

  return (
    <div className={styles.panelForm}>
      <SelectField
        label={dict.textFontLabel}
        value={design.typography.fontKey}
        options={FONT_OPTIONS}
        onChange={(fontKey: DesignFontKey) => patchTypography({ fontKey })}
      />
      <SelectField
        label={dict.textHeadingWeight}
        value={`${design.typography.headingWeight}` as `${DesignWeight}`}
        options={WEIGHT_OPTIONS}
        onChange={(value) =>
          patchTypography({ headingWeight: Number(value) as DesignWeight })
        }
      />
      <SelectField
        label={dict.textBodyWeight}
        value={`${design.typography.bodyWeight}` as `${DesignWeight}`}
        options={WEIGHT_OPTIONS}
        onChange={(value) =>
          patchTypography({ bodyWeight: Number(value) as DesignWeight })
        }
      />
      <Segmented
        label={dict.textScaleLabel}
        value={design.typography.scale}
        options={[
          { value: "small", label: dict.scaleSmall },
          { value: "medium", label: dict.scaleMedium },
          { value: "large", label: dict.scaleLarge },
        ]}
        onChange={(scale) => patchTypography({ scale })}
      />
      <Segmented
        label={dict.textAlignmentLabel}
        value={design.typography.alignment}
        options={[
          { value: "left", label: dict.alignLeft },
          { value: "center", label: dict.alignCenter },
          { value: "right", label: dict.alignRight },
        ]}
        onChange={(alignment) => patchTypography({ alignment })}
      />
    </div>
  );
}

// ------------------------------------------------------------------ colour

const SCHEME_LABELS: Record<PaletteSchemeType, string> = {
  complementary: dict.schemeComplementary,
  analogous: dict.schemeAnalogous,
  monochromatic: dict.schemeMonochromatic,
  triadic: dict.schemeTriadic,
  "split-complementary": dict.schemeSplitComplementary,
};

const VARIANT_LABELS: Record<MaterialVariant, string> = {
  content: dict.variantContent,
  tonalSpot: dict.variantTonalSpot,
  vibrant: dict.variantVibrant,
};

export function ColorPagePanel({
  data,
  document,
  setDocument,
}: VenuePagePanelProps) {
  const design = currentDesign(document);
  const update = designUpdater(setDocument);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [schemeType, setSchemeType] = useState<PaletteSchemeType>(
    DEFAULT_PALETTE_SCHEME,
  );
  const [variant, setVariant] = useState<MaterialVariant>(
    MATERIAL_VARIANT_CYCLE[0],
  );

  // The candidate palette, derived from the business's brand colours through
  // the engine — recomputed live as the owner moves the three levers.
  const candidate = useMemo(() => {
    const roles = generateMaterialRoles({
      sourceColors: data.brandColors,
      mode,
      schemeType,
      variant,
    });
    return deriveVenueRoleColors(roles);
  }, [data.brandColors, mode, schemeType, variant]);

  const candidateSwatches = paletteSwatches(candidate);
  const activeSwatches = paletteSwatches(design.colors);

  return (
    <div className={styles.panelForm}>
      <p className={styles.fieldHint}>{dict.colorBrandNote}</p>
      <Segmented
        label={dict.colorModeLabel}
        value={mode}
        options={[
          { value: "light", label: dict.modeLight },
          { value: "dark", label: dict.modeDark },
        ]}
        onChange={setMode}
      />
      <SelectField
        label={dict.colorSchemeLabel}
        value={schemeType}
        options={PALETTE_SCHEME_TYPES.map((scheme) => ({
          value: scheme,
          label: SCHEME_LABELS[scheme],
        }))}
        onChange={setSchemeType}
      />
      <Segmented
        label={dict.colorVariantLabel}
        value={variant}
        options={MATERIAL_VARIANT_CYCLE.map((option) => ({
          value: option,
          label: VARIANT_LABELS[option],
        }))}
        onChange={setVariant}
      />
      <div className={styles.paletteStrip} aria-hidden="true">
        {candidateSwatches.map((swatch) => (
          <span
            key={swatch.key}
            className={styles.paletteChip}
            style={{ background: swatch.color }}
            title={swatch.label}
          />
        ))}
      </div>
      <button
        type="button"
        className={styles.itemAddButton}
        onClick={() => update((current) => ({ ...current, colors: candidate }))}
      >
        {dict.colorApplyAction}
      </button>
      <button
        type="button"
        className={styles.panelInlineAction}
        onClick={() =>
          update((current) => ({
            ...current,
            colors: { ...DEFAULT_VENUE_DESIGN.colors },
          }))
        }
      >
        {dict.colorResetAction}
      </button>
      <SubHeading>{dict.colorPreviewHeading}</SubHeading>
      <ul className={styles.roleList}>
        {activeSwatches.map((swatch) => (
          <li key={swatch.key} className={styles.roleRow}>
            <span
              className={styles.paletteChip}
              style={{ background: swatch.color }}
              aria-hidden="true"
            />
            <span>{swatch.label}</span>
            <code className={styles.roleHex}>{swatch.color}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- settings

export function SettingsPagePanel({ data, saveMedia }: VenuePagePanelProps) {
  const event = data.event!;
  const publicPath = `/${data.businessSlug}/venue/${event.slug}`;
  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.settingsPublicHeading}</SubHeading>
      <dl className={styles.factList}>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventPathLabel}</dt>
          <dd className={styles.factValue}>{publicPath}</dd>
        </div>
      </dl>
      <a
        className={styles.itemAddButton}
        href={publicPath}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        {dict.settingsOpenPublic}
      </a>
      <SubHeading>{dict.settingsLogoHeading}</SubHeading>
      <MediaUploadTile
        kind="image"
        storageId={undefined}
        previewUrl={event.draftLogoUrl}
        onUploaded={(storageId) => saveMedia("logo", storageId)}
        onRemove={
          event.draftLogoUrl ? () => saveMedia("logo", null) : undefined
        }
      />
      <p className={styles.fieldHint}>{dict.settingsLogoHint}</p>
    </div>
  );
}

// One dispatcher the workspace calls for the six page panels.
export function VenuePagePanel({
  panel,
  ...props
}: VenuePagePanelProps & {
  panel: "event" | "style" | "background" | "text" | "color" | "settings";
}) {
  switch (panel) {
    case "event":
      return <EventPagePanel {...props} />;
    case "style":
      return <StylePagePanel {...props} />;
    case "background":
      return <BackgroundPagePanel {...props} />;
    case "text":
      return <TextPagePanel {...props} />;
    case "color":
      return <ColorPagePanel {...props} />;
    case "settings":
      return <SettingsPagePanel {...props} />;
  }
}
