"use client";

// The page-level panels (TASK-51; FORKED from
// components/venue/editor/venue-editor-page-panels.tsx): style, background,
// text, colour — the menu's own design document — plus the Menu-specific
// dayparts panel (RFC-003 §2.5). Design edits go through the SAME
// history/autosave document as groups (undo covers them).
//
// Constrained freedom here: numeric ranges come from MENU_DESIGN_BOUNDS (the
// tuple clampMenuDesign enforces at render) and MENU_BOUNDS.daypartMinute,
// colours are page-palette swatches, and the colour panel never shows a
// picker — palettes are DERIVED from the business's brand through the engine.
// No "media" background: the Menu doc stores no page media id (§2.13), so the
// category is not offered rather than half-built.

import { useMemo, useState } from "react";
import {
  SCANME_LINKS_BACKGROUND_ANIMATIONS,
  SCANME_LINKS_GRADIENT_VARIANTS,
  SCANME_LINKS_PATTERN_VARIANTS,
  SCANME_LINKS_TEXTURE_VARIANTS,
  type ScanMeLinksBackgroundV2,
} from "@/lib/scanme-links-design";
import {
  DEFAULT_PALETTE_SCHEME,
  generateMaterialRoles,
  MATERIAL_VARIANT_CYCLE,
  PALETTE_SCHEME_TYPES,
  type MaterialVariant,
  type PaletteSchemeType,
} from "@/lib/design-engine/palette";
import {
  DESIGN_FONT_KEYS,
  type DesignFontKey,
} from "@/lib/design-engine/typography";
import {
  clampMenuDesign,
  DEFAULT_MENU_DESIGN,
  deriveMenuRoleColors,
  MENU_DESIGN_BOUNDS,
  type MenuDesign,
  type MenuEffects,
} from "@/lib/design-engine/menu-tokens";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import {
  daypartDefaults,
  MENU_BOUNDS,
  type MenuDaypart,
} from "@/lib/menu-blocks";
import {
  BoundedSlider,
  formatMinutes,
  formatPercent,
  formatPx,
  Segmented,
  SelectField,
  SubHeading,
  SwatchRow,
  TextField,
  ToggleRow,
  type SegmentedOption,
} from "./menu-editor-fields";
import { EditableItemList } from "./menu-editor-item-list";
import { paletteSwatches } from "./menu-editor-panel-context";
import styles from "./menu-editor.module.css";
import type {
  MenuEditorData,
  MenuEditorDocument,
  MenuEditorDocumentSetter,
} from "./menu-editor-types";

type DesignWeight = 400 | 500 | 600 | 700;

export type MenuPagePanelProps = {
  data: MenuEditorData;
  document: MenuEditorDocument;
  setDocument: MenuEditorDocumentSetter;
};

// Exhaustive label maps: Record over the model's own union types, so a new
// member is a compile error here instead of a silently unlabeled option.
const WEIGHT_LABELS: Record<DesignWeight, string> = {
  400: dict.weight400,
  500: dict.weight500,
  600: dict.weight600,
  700: dict.weight700,
};

const FONT_LABELS: Record<DesignFontKey, string> = {
  "dm-sans": "DM Sans",
  "nunito-sans": "Nunito Sans",
  "source-sans-3": "Source Sans",
  "system-ui": "Sistemsko pismo",
  inter: "Inter",
  manrope: "Manrope",
  "cormorant-garamond": "Cormorant Garamond",
  "playfair-display": "Playfair Display",
  lora: "Lora",
  "libre-baskerville": "Libre Baskerville",
  "space-grotesk": "Space Grotesk",
  archivo: "Archivo",
};

const FONT_OPTIONS: SegmentedOption<DesignFontKey>[] = DESIGN_FONT_KEYS.map(
  (key) => ({ value: key, label: FONT_LABELS[key] }),
);

const WEIGHT_OPTIONS: SegmentedOption<`${DesignWeight}`>[] = (
  [400, 500, 600, 700] as const
).map((weight) => ({ value: `${weight}`, label: WEIGHT_LABELS[weight] }));

// One shared design mutator: always materializes the full (clamped) design so
// the first edit of a never-designed menu starts from the engine default.
function designUpdater(setDocument: MenuEditorDocumentSetter) {
  return (mutate: (design: MenuDesign) => MenuDesign, group?: string) =>
    setDocument(
      (current) => ({
        ...current,
        design: mutate(clampMenuDesign(current.design)),
      }),
      group,
    );
}

function currentDesign(document: MenuEditorDocument): MenuDesign {
  return clampMenuDesign(document.design);
}

// ------------------------------------------------------------------- style

function shadowDefaults(design: MenuDesign): MenuEffects {
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

export function StylePagePanel({ document, setDocument }: MenuPagePanelProps) {
  const design = currentDesign(document);
  const update = designUpdater(setDocument);
  const swatches = paletteSwatches(design.colors);
  const effects = design.effects ?? shadowDefaults(design);

  function updateShadow(
    key: "textShadow" | "logoShadow",
    partial: Partial<MenuEffects["textShadow"]>,
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
        bounds={MENU_DESIGN_BOUNDS.verticalSpacing}
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
        bounds={MENU_DESIGN_BOUNDS.lineHeight}
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
                  bounds={MENU_DESIGN_BOUNDS.shadowOffset}
                  onChange={(y) => updateShadow(key, { y }, `${key}-y`)}
                />
                <BoundedSlider
                  label={dict.shadowBlurLabel}
                  value={shadow.blur}
                  bounds={MENU_DESIGN_BOUNDS.shadowBlur}
                  onChange={(blur) => updateShadow(key, { blur }, `${key}-blur`)}
                />
                <BoundedSlider
                  label={dict.shadowOpacityLabel}
                  value={shadow.opacity}
                  bounds={MENU_DESIGN_BOUNDS.shadowOpacity}
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

type OfferedBackgroundCategory = Exclude<
  ScanMeLinksBackgroundV2["category"],
  "media"
>;

const OFFERED_CATEGORIES: readonly OfferedBackgroundCategory[] = [
  "flat",
  "gradient",
  "pattern",
  "texture",
  "animation",
];

const CATEGORY_LABELS: Record<OfferedBackgroundCategory, string> = {
  flat: dict.bgCatFlat,
  gradient: dict.bgCatGradient,
  pattern: dict.bgCatPattern,
  texture: dict.bgCatTexture,
  animation: dict.bgCatAnimation,
};

// A fresh, valid background of each offered category, seeded from the current
// palette.
function backgroundDefaults(
  category: OfferedBackgroundCategory,
  design: MenuDesign,
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
  document,
  setDocument,
}: MenuPagePanelProps) {
  const design = currentDesign(document);
  const update = designUpdater(setDocument);
  const swatches = paletteSwatches(design.colors);
  const background = design.background;
  // A stored "media" background (unreachable from this editor) shows as flat.
  const selectedCategory: OfferedBackgroundCategory =
    background.category === "media" ? "flat" : background.category;

  function patchBackground(
    partial: Partial<ScanMeLinksBackgroundV2>,
    group?: string,
  ) {
    update(
      (current) => ({
        ...current,
        background: {
          ...current.background,
          ...partial,
        } as ScanMeLinksBackgroundV2,
      }),
      group,
    );
  }

  return (
    <div className={styles.panelForm}>
      <SelectField
        label={dict.bgCategoryLabel}
        value={selectedCategory}
        options={OFFERED_CATEGORIES.map((category) => ({
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
              bounds={MENU_DESIGN_BOUNDS.gradientAngle}
              format={(value) => `${value}°`}
              onChange={(angle) => patchBackground({ angle }, "bg-angle")}
            />
          ) : (
            <>
              <BoundedSlider
                label={dict.bgGradientCenterX}
                value={background.centerX}
                bounds={MENU_DESIGN_BOUNDS.gradientCenter}
                format={formatPercentPlain}
                onChange={(centerX) => patchBackground({ centerX }, "bg-cx")}
              />
              <BoundedSlider
                label={dict.bgGradientCenterY}
                value={background.centerY}
                bounds={MENU_DESIGN_BOUNDS.gradientCenter}
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
            bounds={MENU_DESIGN_BOUNDS.patternScale}
            onChange={(scale) => patchBackground({ scale }, "bg-scale")}
          />
          <BoundedSlider
            label={dict.bgPatternOpacity}
            value={background.opacity}
            bounds={MENU_DESIGN_BOUNDS.patternOpacity}
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
            bounds={MENU_DESIGN_BOUNDS.textureIntensity}
            step={0.01}
            format={formatPercent}
            onChange={(intensity) => patchBackground({ intensity }, "bg-int")}
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
            bounds={MENU_DESIGN_BOUNDS.animationSpeed}
            step={0.05}
            format={(value) => `×${value.toFixed(2)}`}
            onChange={(speed) => patchBackground({ speed }, "bg-speed")}
          />
          <BoundedSlider
            label={dict.bgAnimationIntensity}
            value={background.intensity}
            bounds={MENU_DESIGN_BOUNDS.animationIntensity}
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

export function TextPagePanel({ document, setDocument }: MenuPagePanelProps) {
  const design = currentDesign(document);
  const update = designUpdater(setDocument);

  function patchTypography(
    partial: Partial<MenuDesign["typography"]>,
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
}: MenuPagePanelProps) {
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
  // the engine — recomputed live as the owner moves the three levers. The
  // role helpers come from menu-tokens.ts (TASK-48), not from palette.ts.
  const candidate = useMemo(() => {
    const roles = generateMaterialRoles({
      sourceColors: data.brandColors,
      mode,
      schemeType,
      variant,
    });
    return deriveMenuRoleColors(roles);
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
            colors: { ...DEFAULT_MENU_DESIGN.colors },
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

// ---------------------------------------------------------------- dayparts

// ASCII key, no diacritics, no spaces (the schema's "dorucak" | "rucak" |
// "vecera" convention, RFC-003 §2.13).
function normalizeDaypartKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);
}

const NO_OVERRIDE = "__clock" as const;

export function DaypartsPagePanel({
  document,
  setDocument,
}: MenuPagePanelProps) {
  const dayparts = document.dayparts;
  const setDayparts = (next: MenuDaypart[]) =>
    setDocument((current) => ({ ...current, dayparts: next }));
  const patchDaypart = (id: string, partial: Partial<MenuDaypart>, group?: string) =>
    setDocument(
      (current) => ({
        ...current,
        dayparts: current.dayparts.map((daypart) =>
          daypart.id === id ? { ...daypart, ...partial } : daypart,
        ),
      }),
      group,
    );

  const overrideOptions = [
    { value: NO_OVERRIDE, label: dict.daypartOverrideNone },
    ...dayparts
      .filter((daypart) => daypart.key.trim() !== "")
      .map((daypart) => ({
        value: daypart.key,
        label: daypart.label.trim() || daypart.key,
      })),
  ];
  const override = document.daypartOverride;
  if (override && !overrideOptions.some((option) => option.value === override)) {
    overrideOptions.push({ value: override, label: override });
  }

  return (
    <div className={styles.panelForm}>
      {dayparts.length === 0 ? (
        <p className={styles.fieldHint}>{dict.daypartsEmptyHint}</p>
      ) : null}
      <EditableItemList
        heading={dict.daypartsHeading}
        items={dayparts}
        onItemsChange={setDayparts}
        itemName={(daypart) => daypart.label || daypart.key}
        addLabel={dict.daypartAdd}
        onAdd={() =>
          setDayparts([
            ...dayparts,
            { ...daypartDefaults(), id: crypto.randomUUID() },
          ])
        }
        renderItem={(daypart) => (
          <>
            <TextField
              label={dict.daypartLabelLabel}
              value={daypart.label}
              maxLength={40}
              placeholder={dict.daypartLabelPlaceholder}
              error={daypart.label.trim() === "" ? dict.requiredFieldError : null}
              onChange={(label) => patchDaypart(daypart.id, { label }, `${daypart.id}:label`)}
            />
            <TextField
              label={dict.daypartKeyLabel}
              value={daypart.key}
              maxLength={40}
              placeholder={dict.daypartKeyPlaceholder}
              hint={dict.daypartKeyHint}
              error={daypart.key.trim() === "" ? dict.requiredFieldError : null}
              onChange={(key) =>
                patchDaypart(daypart.id, { key: normalizeDaypartKey(key) }, `${daypart.id}:key`)
              }
            />
            <BoundedSlider
              label={dict.daypartStartLabel}
              value={daypart.startMinute}
              bounds={MENU_BOUNDS.daypartMinute}
              step={15}
              format={formatMinutes}
              onChange={(startMinute) =>
                patchDaypart(daypart.id, { startMinute }, `${daypart.id}:start`)
              }
            />
            <BoundedSlider
              label={dict.daypartEndLabel}
              value={daypart.endMinute}
              bounds={MENU_BOUNDS.daypartMinute}
              step={15}
              format={formatMinutes}
              onChange={(endMinute) =>
                patchDaypart(daypart.id, { endMinute }, `${daypart.id}:end`)
              }
            />
          </>
        )}
      />
      <SelectField
        label={dict.daypartOverrideLabel}
        value={override ?? NO_OVERRIDE}
        options={overrideOptions}
        hint={dict.daypartOverrideHint}
        onChange={(value) =>
          setDocument((current) => {
            const next = { ...current };
            if (value === NO_OVERRIDE) delete next.daypartOverride;
            else next.daypartOverride = value;
            return next;
          })
        }
      />
    </div>
  );
}

// One dispatcher the workspace calls for the five page panels.
export function MenuPagePanel({
  panel,
  ...props
}: MenuPagePanelProps & {
  panel: "style" | "background" | "text" | "color" | "dayparts";
}) {
  switch (panel) {
    case "style":
      return <StylePagePanel {...props} />;
    case "background":
      return <BackgroundPagePanel {...props} />;
    case "text":
      return <TextPagePanel {...props} />;
    case "color":
      return <ColorPagePanel {...props} />;
    case "dayparts":
      return <DaypartsPagePanel {...props} />;
  }
}
