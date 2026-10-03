"use client";

// The shared base-property section (TASK-12 STEP 2): every block panel mounts
// this once below its content controls, so the twelve panels never reinvent
// visibility, responsive, size, alignment, spacing, radius, border, shadow,
// surface, colour override, typography override or animation. Every numeric
// control's range is the exported VENUE_BLOCK_BOUNDS tuple — the same object
// clampBase() enforces server-side — and every colour is a page-palette
// swatch.

import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import { DESIGN_FONT_KEYS, type DesignFontKey } from "@/lib/design-engine/typography";
import {
  VENUE_BLOCK_BOUNDS,
  type VenueBlock,
  type VenueBlockBase,
} from "@/lib/venue-blocks";
import {
  BoundedSlider,
  formatPercent,
  Segmented,
  SelectField,
  SwatchRow,
  ToggleRow,
  type SegmentedOption,
} from "./venue-editor-fields";
import { useVenuePanelServices } from "./venue-editor-panel-context";
import styles from "./venue-editor.module.css";

type DesignWeight = 400 | 500 | 600 | 700;
type Shadow = NonNullable<VenueBlockBase["shadow"]>;

// Exhaustive label maps: Record over the model's own union types, so a new
// member is a compile error here instead of a silently unlabeled option.
const WEIGHT_LABELS: Record<DesignWeight, string> = {
  400: dict.weight400,
  500: dict.weight500,
  600: dict.weight600,
  700: dict.weight700,
};
const SCALE_LABELS: Record<"small" | "medium" | "large", string> = {
  small: dict.scaleSmall,
  medium: dict.scaleMedium,
  large: dict.scaleLarge,
};
const ANIMATION_LABELS: Record<
  NonNullable<VenueBlockBase["animation"]>,
  string
> = {
  none: dict.animationNone,
  "fade-up": dict.animationFadeUp,
  reveal: dict.animationReveal,
};

const INHERIT = "__inherit" as const;
type WithInherit<T extends string> = T | typeof INHERIT;

function withInheritOptions<T extends string>(
  options: readonly SegmentedOption<T>[],
): SegmentedOption<WithInherit<T>>[] {
  return [{ value: INHERIT, label: dict.inheritOption }, ...options];
}

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

export const FONT_OPTIONS: SegmentedOption<DesignFontKey>[] =
  DESIGN_FONT_KEYS.map((key) => ({ value: key, label: FONT_LABELS[key] }));

export const WEIGHT_OPTIONS: SegmentedOption<`${DesignWeight}`>[] = (
  [400, 500, 600, 700] as const
).map((weight) => ({ value: `${weight}`, label: WEIGHT_LABELS[weight] }));

export function BlockBaseSection({
  block,
  onChange,
}: {
  block: VenueBlock;
  onChange: (next: VenueBlock, group?: string) => void;
}) {
  const { swatches } = useVenuePanelServices();
  const base = block.base;
  const groupFor = (property: string) => `${base.id}:${property}`;

  function patchBase(partial: Partial<VenueBlockBase>, group?: string) {
    onChange({ ...block, base: { ...base, ...partial } } as VenueBlock, group);
  }

  const responsive = base.responsive ?? { desktop: true, mobile: true };
  const spacing = base.spacing ?? { top: 0, bottom: 0 };
  const shadow: Shadow = base.shadow ?? {
    enabled: false,
    color: swatches.find((s) => s.key === "title")?.color ?? "#161916",
    x: 0,
    y: 10,
    blur: 30,
    opacity: 0.22,
  };
  const surfaceKind =
    base.surface === undefined || base.surface === "none"
      ? "none"
      : base.surface === "card"
        ? "card"
        : "custom";

  return (
    <>
      <details className={styles.panelDetails}>
        <summary className={styles.panelDetailsSummary}>
          {dict.baseSectionHeading}
        </summary>
        <div className={styles.panelDetailsBody}>
          <ToggleRow
            label={dict.baseVisibleLabel}
            checked={base.visible}
            onChange={(visible) => patchBase({ visible })}
          />
          <ToggleRow
            label={dict.baseResponsiveMobile}
            checked={responsive.mobile}
            onChange={(mobile) =>
              patchBase({ responsive: { ...responsive, mobile } })
            }
          />
          <ToggleRow
            label={dict.baseResponsiveDesktop}
            checked={responsive.desktop}
            onChange={(desktop) =>
              patchBase({ responsive: { ...responsive, desktop } })
            }
          />
          <Segmented
            label={dict.baseSizeLabel}
            value={base.size ?? "full"}
            options={[
              { value: "full", label: dict.sizeFull },
              { value: "wide", label: dict.sizeWide },
              { value: "narrow", label: dict.sizeNarrow },
            ]}
            onChange={(size) => patchBase({ size })}
          />
          <Segmented
            label={dict.baseAlignmentLabel}
            value={(base.alignment ?? INHERIT) as WithInherit<"left" | "center" | "right">}
            options={withInheritOptions([
              { value: "left", label: dict.alignLeft },
              { value: "center", label: dict.alignCenter },
              { value: "right", label: dict.alignRight },
            ] as const)}
            onChange={(alignment) =>
              patchBase({
                alignment: alignment === INHERIT ? undefined : alignment,
              })
            }
          />
          <BoundedSlider
            label={dict.baseSpacingTop}
            value={spacing.top}
            bounds={VENUE_BLOCK_BOUNDS.spacing}
            onChange={(top) =>
              patchBase({ spacing: { ...spacing, top } }, groupFor("spacing-top"))
            }
          />
          <BoundedSlider
            label={dict.baseSpacingBottom}
            value={spacing.bottom}
            bounds={VENUE_BLOCK_BOUNDS.spacing}
            onChange={(bottom) =>
              patchBase(
                { spacing: { ...spacing, bottom } },
                groupFor("spacing-bottom"),
              )
            }
          />
          <BoundedSlider
            label={dict.baseRadiusLabel}
            value={base.radius ?? 0}
            bounds={VENUE_BLOCK_BOUNDS.radius}
            onChange={(radius) => patchBase({ radius }, groupFor("radius"))}
          />
          <Segmented
            label={dict.baseSurfaceLabel}
            value={surfaceKind}
            options={[
              { value: "none", label: dict.surfaceNone },
              { value: "card", label: dict.surfaceCard },
              { value: "custom", label: dict.surfaceCustom },
            ]}
            onChange={(kind) =>
              patchBase({
                surface:
                  kind === "none"
                    ? "none"
                    : kind === "card"
                      ? "card"
                      : {
                          kind: "custom",
                          color:
                            swatches.find((s) => s.key === "surface")?.color ??
                            "#FFFFFF",
                        },
              })
            }
          />
          {typeof base.surface === "object" ? (
            <SwatchRow
              label={dict.surfaceCustomColor}
              value={base.surface.color}
              swatches={swatches}
              onPick={(color) =>
                patchBase({ surface: { kind: "custom", color } })
              }
            />
          ) : null}
          <BoundedSlider
            label={dict.baseBorderWidth}
            value={base.border?.width ?? 0}
            bounds={VENUE_BLOCK_BOUNDS.borderWidth}
            onChange={(width) =>
              patchBase(
                {
                  border: {
                    width,
                    color:
                      base.border?.color ??
                      swatches.find((s) => s.key === "border")?.color ??
                      "#DADED2",
                  },
                },
                groupFor("border-width"),
              )
            }
          />
          {base.border && base.border.width > 0 ? (
            <SwatchRow
              label={dict.baseBorderColor}
              value={base.border.color}
              swatches={swatches}
              onPick={(color) =>
                patchBase({ border: { width: base.border!.width, color } })
              }
            />
          ) : null}
          <ToggleRow
            label={dict.baseShadowLabel}
            checked={shadow.enabled}
            onChange={(enabled) => patchBase({ shadow: { ...shadow, enabled } })}
          />
          {shadow.enabled ? (
            <>
              <BoundedSlider
                label={dict.shadowXLabel}
                value={shadow.x}
                bounds={VENUE_BLOCK_BOUNDS.shadowOffset}
                onChange={(x) =>
                  patchBase({ shadow: { ...shadow, x } }, groupFor("shadow-x"))
                }
              />
              <BoundedSlider
                label={dict.shadowYLabel}
                value={shadow.y}
                bounds={VENUE_BLOCK_BOUNDS.shadowOffset}
                onChange={(y) =>
                  patchBase({ shadow: { ...shadow, y } }, groupFor("shadow-y"))
                }
              />
              <BoundedSlider
                label={dict.shadowBlurLabel}
                value={shadow.blur}
                bounds={VENUE_BLOCK_BOUNDS.shadowBlur}
                onChange={(blur) =>
                  patchBase(
                    { shadow: { ...shadow, blur } },
                    groupFor("shadow-blur"),
                  )
                }
              />
              <BoundedSlider
                label={dict.shadowOpacityLabel}
                value={shadow.opacity}
                bounds={VENUE_BLOCK_BOUNDS.shadowOpacity}
                step={0.01}
                format={formatPercent}
                onChange={(opacity) =>
                  patchBase(
                    { shadow: { ...shadow, opacity } },
                    groupFor("shadow-opacity"),
                  )
                }
              />
              <SwatchRow
                label={dict.shadowColorLabel}
                value={shadow.color}
                swatches={swatches}
                onPick={(color) => patchBase({ shadow: { ...shadow, color } })}
              />
            </>
          ) : null}
        </div>
      </details>

      <details className={styles.panelDetails}>
        <summary className={styles.panelDetailsSummary}>
          {dict.baseColorsHeading}
        </summary>
        <div className={styles.panelDetailsBody}>
          {(
            [
              ["title", dict.colorTitleLabel],
              ["body", dict.colorBodyLabel],
              ["accent", dict.colorAccentLabel],
            ] as const
          ).map(([key, label]) => (
            <SwatchRow
              key={key}
              label={label}
              value={base.colorOverride?.[key]}
              swatches={swatches}
              onPick={(color) =>
                patchBase({
                  colorOverride: { ...base.colorOverride, [key]: color },
                })
              }
              onInherit={() => {
                const next = { ...base.colorOverride };
                delete next[key];
                patchBase({
                  colorOverride: Object.keys(next).length ? next : undefined,
                });
              }}
            />
          ))}
        </div>
      </details>

      <details className={styles.panelDetails}>
        <summary className={styles.panelDetailsSummary}>
          {dict.baseTypographyHeading}
        </summary>
        <div className={styles.panelDetailsBody}>
          <SelectField
            label={dict.typoFontLabel}
            value={(base.typographyOverride?.fontKey ?? INHERIT) as WithInherit<DesignFontKey>}
            options={withInheritOptions(FONT_OPTIONS)}
            onChange={(fontKey) =>
              patchBase({
                typographyOverride: {
                  ...base.typographyOverride,
                  fontKey: fontKey === INHERIT ? undefined : fontKey,
                },
              })
            }
          />
          <SelectField
            label={dict.typoHeadingWeight}
            value={
              (base.typographyOverride?.headingWeight !== undefined
                ? `${base.typographyOverride.headingWeight}`
                : INHERIT) as WithInherit<`${DesignWeight}`>
            }
            options={withInheritOptions(WEIGHT_OPTIONS)}
            onChange={(value) =>
              patchBase({
                typographyOverride: {
                  ...base.typographyOverride,
                  headingWeight:
                    value === INHERIT
                      ? undefined
                      : (Number(value) as DesignWeight),
                },
              })
            }
          />
          <SelectField
            label={dict.typoBodyWeight}
            value={
              (base.typographyOverride?.bodyWeight !== undefined
                ? `${base.typographyOverride.bodyWeight}`
                : INHERIT) as WithInherit<`${DesignWeight}`>
            }
            options={withInheritOptions(WEIGHT_OPTIONS)}
            onChange={(value) =>
              patchBase({
                typographyOverride: {
                  ...base.typographyOverride,
                  bodyWeight:
                    value === INHERIT
                      ? undefined
                      : (Number(value) as DesignWeight),
                },
              })
            }
          />
          <Segmented
            label={dict.typoScaleLabel}
            value={(base.typographyOverride?.scale ?? INHERIT) as WithInherit<"small" | "medium" | "large">}
            options={withInheritOptions(
              (Object.keys(SCALE_LABELS) as ("small" | "medium" | "large")[]).map(
                (scale) => ({ value: scale, label: SCALE_LABELS[scale] }),
              ),
            )}
            onChange={(scale) =>
              patchBase({
                typographyOverride: {
                  ...base.typographyOverride,
                  scale: scale === INHERIT ? undefined : scale,
                },
              })
            }
          />
          <Segmented
            label={dict.baseAnimationLabel}
            value={base.animation ?? "none"}
            options={(
              Object.keys(ANIMATION_LABELS) as NonNullable<
                VenueBlockBase["animation"]
              >[]
            ).map((animation) => ({
              value: animation,
              label: ANIMATION_LABELS[animation],
            }))}
            onChange={(animation) => patchBase({ animation })}
          />
        </div>
      </details>
    </>
  );
}
