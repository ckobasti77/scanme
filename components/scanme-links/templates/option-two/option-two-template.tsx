"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { TemplateIcon } from "@/components/scanme-links/template-icon";
import type {
  AccentStyle,
  PublicDestination,
  ScanMeLinksViewModel,
  TemplateProps,
} from "@/components/scanme-links/templates/types";
import {
  createDefaultScanMeLinksDesignV2,
  normalizeDesignForPreset,
  type ScanMeLinksBackgroundV2,
  type ScanMeLinksDesignV2,
  type ScanMeLinksFontKey,
  type ScanMeLinksIconStyle,
} from "@/lib/scanme-links-design";
import { cn } from "@/lib/utils";
import styles from "./option-two-template.module.css";

export const optionTwoDestinationClassName = styles.destination;

const FONT_STACKS: Record<ScanMeLinksFontKey, string> = {
  "dm-sans": '"DM Sans", "Segoe UI", Arial, sans-serif',
  "nunito-sans": '"Nunito Sans", "Segoe UI", Arial, sans-serif',
  "source-sans-3": '"Source Sans 3", "Segoe UI", Arial, sans-serif',
  "system-ui": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  inter: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  manrope: 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif',
  "cormorant-garamond":
    '"Cormorant Garamond", Georgia, "Times New Roman", serif',
  "playfair-display": '"Playfair Display", Georgia, "Times New Roman", serif',
  lora: 'Lora, Georgia, "Times New Roman", serif',
  "libre-baskerville":
    '"Libre Baskerville", Georgia, "Times New Roman", serif',
  "space-grotesk": '"Space Grotesk", "Arial Narrow", Arial, sans-serif',
  archivo: 'Archivo, "Arial Narrow", Arial, sans-serif',
};

const ICON_STYLE_CLASSES: Record<ScanMeLinksIconStyle, string> = {
  "soft-line": "",
  "ios-rounded": styles.iconIos,
  "luxury-line": styles.iconLux,
  "rustic-stamp": styles.iconRustic,
  "minimal-line": styles.iconMinimal,
  "bold-fill": styles.iconBold,
};

function duplicateNumbers(destinations: PublicDestination[]) {
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const destination of destinations) {
    totals.set(destination.kind, (totals.get(destination.kind) ?? 0) + 1);
  }
  return destinations.map((destination) => {
    const occurrence = (seen.get(destination.kind) ?? 0) + 1;
    seen.set(destination.kind, occurrence);
    return (totals.get(destination.kind) ?? 0) > 1 && occurrence > 1
      ? occurrence
      : null;
  });
}

function resolveDesign(view: ScanMeLinksViewModel): ScanMeLinksDesignV2 {
  if (view.design) {
    return normalizeDesignForPreset(view.design);
  }

  const fallback = createDefaultScanMeLinksDesignV2("gentle");
  return {
    ...fallback,
    colors: {
      ...fallback.colors,
      accent: view.accentTokens.accent,
      border: view.accentTokens.border,
      focus: view.accentTokens.focus,
      icon: view.accentTokens.strong,
    },
  };
}

function scaleTokens(scale: ScanMeLinksDesignV2["typography"]["scale"]) {
  if (scale === "small") {
    return { heading: "1.9rem", body: "0.86rem" };
  }
  if (scale === "large") {
    return { heading: "2.55rem", body: "1.06rem" };
  }
  return { heading: "2.25rem", body: "0.96rem" };
}

function rgba(hex: string, opacity: number) {
  const normalized = hex.trim();
  const match = normalized.match(/^#([\da-f]{6})$/i);
  if (!match) return `color-mix(in srgb, ${hex} ${opacity * 100}%, transparent)`;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

function backgroundPresentation(background: ScanMeLinksBackgroundV2): {
  baseImage: string;
  detailImage: string;
  detailSize: string;
  detailOpacity: number;
} {
  switch (background.category) {
    case "flat":
      return {
        baseImage: `linear-gradient(${background.color}, ${background.color})`,
        detailImage: "none",
        detailSize: "auto",
        detailOpacity: 0,
      };
    case "gradient":
      return {
        baseImage:
          background.variant === "radial"
            ? `radial-gradient(circle at ${background.centerX}% ${background.centerY}%, ${background.startColor}, ${background.endColor})`
            : `linear-gradient(${background.angle}deg, ${background.startColor}, ${background.endColor})`,
        detailImage: "none",
        detailSize: "auto",
        detailOpacity: 0,
      };
    case "pattern": {
      const size = Math.max(4, background.scale);
      const color = rgba(background.patternColor, 1);
      const base = background.backgroundColor;
      const images: Record<typeof background.variant, string> = {
        grid: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px), linear-gradient(${base}, ${base})`,
        checker: `conic-gradient(from 90deg at 1px 1px, transparent 90deg, ${color} 0)`,
        dots: `radial-gradient(circle, ${color} 1.5px, transparent 1.7px), linear-gradient(${base}, ${base})`,
        waves: `radial-gradient(ellipse at 50% 100%, transparent 65%, ${color} 66%, transparent 69%), linear-gradient(${base}, ${base})`,
      };
      return {
        baseImage: `linear-gradient(${base}, ${base})`,
        detailImage: images[background.variant],
        detailSize:
          background.variant === "waves"
            ? `${size * 2}px ${size}px`
            : `${size}px ${size}px`,
        detailOpacity: background.opacity,
      };
    }
    case "texture": {
      const tint = rgba(background.tintColor, 0.85);
      const base = background.backgroundColor;
      const images: Record<typeof background.variant, string> = {
        paper: `radial-gradient(circle at 20% 30%, ${tint} 0 .65px, transparent .8px), radial-gradient(circle at 75% 68%, ${tint} 0 .55px, transparent .75px), linear-gradient(${base}, ${base})`,
        linen: `repeating-linear-gradient(0deg, ${tint} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${tint} 0 1px, transparent 1px 5px), linear-gradient(${base}, ${base})`,
        wood: `repeating-radial-gradient(ellipse at -20% 50%, transparent 0 15px, ${tint} 16px 17px, transparent 18px 29px), linear-gradient(${base}, ${base})`,
        metal: `repeating-linear-gradient(105deg, transparent 0 3px, ${tint} 4px, transparent 5px 9px), linear-gradient(120deg, ${base}, color-mix(in srgb, ${base} 74%, white), ${base})`,
      };
      return {
        baseImage: `linear-gradient(${base}, ${base})`,
        detailImage: images[background.variant],
        detailSize:
          background.variant === "paper"
            ? "17px 19px"
            : background.variant === "wood"
              ? "80px 46px"
              : "auto",
        detailOpacity: background.intensity,
      };
    }
    case "media":
    case "animation":
      return {
        baseImage:
          background.category === "animation"
            ? `linear-gradient(${background.baseColor}, ${background.baseColor})`
            : `linear-gradient(var(--links-page), var(--links-page))`,
        detailImage: "none",
        detailSize: "auto",
        detailOpacity: 0,
      };
  }
}

function alignmentTokens(
  alignment: ScanMeLinksDesignV2["typography"]["alignment"],
) {
  if (alignment === "left") {
    return { text: "left", cross: "flex-start" };
  }
  if (alignment === "right") {
    return { text: "right", cross: "flex-end" };
  }
  return { text: "center", cross: "center" };
}

function designStyle(
  view: ScanMeLinksViewModel,
  design: ScanMeLinksDesignV2,
): AccentStyle {
  const background = backgroundPresentation(design.background);
  const type = scaleTokens(design.typography.scale);
  const alignment = alignmentTokens(design.typography.alignment);
  const shadow = design.buttons.shadow;
  const buttonShadow =
    shadow.enabled && shadow.opacity > 0
      ? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${rgba(
          shadow.color,
          shadow.opacity,
        )}`
      : "0 0 0 transparent";
  const animationSpeed =
    design.background.category === "animation"
      ? Math.max(0.25, design.background.speed)
      : 1;

  return {
    "--links-accent": design.colors.accent,
    "--links-accent-strong": view.design
      ? design.colors.accent
      : view.accentTokens.strong,
    "--links-accent-soft": view.design
      ? rgba(design.colors.accent, 0.18)
      : view.accentTokens.soft,
    "--links-accent-border": view.design
      ? design.colors.border
      : view.accentTokens.border,
    "--links-accent-focus": design.colors.focus,
    "--links-on-accent": view.design
      ? design.colors.page
      : view.accentTokens.onAccent,
    "--links-page": design.colors.page,
    "--links-surface": design.colors.surface,
    "--links-title": design.colors.title,
    "--links-body": design.colors.body,
    "--links-button": design.colors.button,
    "--links-button-hover": design.colors.buttonHover,
    "--links-button-text": design.colors.buttonText,
    "--links-icon": design.colors.icon,
    "--links-border": design.colors.border,
    "--links-button-radius": `${design.buttons.radius}px`,
    "--links-button-border-width": `${design.buttons.borderWidth}px`,
    "--links-button-padding-x": `${design.buttons.paddingX}px`,
    "--links-button-padding-y": `${design.buttons.paddingY}px`,
    "--links-button-shadow": buttonShadow,
    "--links-flow-gap": `${design.typography.verticalSpacing}px`,
    "--links-heading-size": type.heading,
    "--links-body-size": type.body,
    "--links-line-height": String(design.typography.lineHeight),
    "--links-heading-weight": String(design.typography.headingWeight),
    "--links-body-weight": String(design.typography.bodyWeight),
    "--links-font-family": FONT_STACKS[design.typography.fontKey],
    "--links-background-image": background.baseImage,
    "--links-background-detail-image": background.detailImage,
    "--links-background-detail-size": background.detailSize,
    "--links-background-detail-opacity": String(background.detailOpacity),
    "--links-text-align": alignment.text,
    "--links-cross-align": alignment.cross,
    "--links-animation-duration": `${18 / animationSpeed}s`,
    "--links-animation-intensity":
      design.background.category === "animation"
        ? String(design.background.intensity)
        : "0",
  } as AccentStyle;
}

function safeDestinationHref(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function BackgroundVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (motionQuery.matches) {
        element.pause();
        element.currentTime = 0;
        return;
      }
      void element.play().catch(() => {
        // Browser autoplay policies can still pause the decorative background.
      });
    };

    syncPlayback();
    motionQuery.addEventListener("change", syncPlayback);
    return () => {
      motionQuery.removeEventListener("change", syncPlayback);
      element.pause();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      tabIndex={-1}
    />
  );
}

export function OptionTwoDestinationContent({
  destination,
  duplicate,
  preview = false,
  iconStyle = "soft-line",
}: {
  destination: PublicDestination;
  duplicate: number | null;
  preview?: boolean;
  iconStyle?: ScanMeLinksIconStyle;
}) {
  const href = safeDestinationHref(destination.url);
  const isInactive = destination.state === "inactive";
  const stateLabel = !preview
    ? null
    : !href
      ? "Nedostaje URL"
      : isInactive
        ? "Samo u nacrtu"
        : null;

  return (
    <>
      <span
        className={cn(
          styles.iconSurface,
          ICON_STYLE_CLASSES[iconStyle],
        )}
      >
        <TemplateIcon iconKey={destination.iconKey} className={styles.icon} />
        {duplicate ? (
          <span className={styles.duplicate}>{duplicate}</span>
        ) : null}
      </span>
      <span className={styles.destinationText}>
        <span className={styles.destinationLabel}>{destination.label}</span>
        {stateLabel ? (
          <span className={styles.destinationState}>{stateLabel}</span>
        ) : null}
      </span>
      <ChevronRight
        aria-hidden="true"
        className={styles.chevron}
        strokeWidth={2}
      />
    </>
  );
}

function Background({
  view,
  design,
}: {
  view: ScanMeLinksViewModel;
  design: ScanMeLinksDesignV2;
}) {
  const background = design.background;
  const animatedClass =
    background.category === "animation"
      ? background.variant === "aurora"
        ? styles.aurora
        : styles.softWaves
      : null;
  const mediaUrl =
    background.category === "media"
      ? background.mediaType === "video"
        ? view.backgroundVideoUrl
        : view.backgroundImageUrl
      : null;

  return (
    <>
      <span
        aria-hidden="true"
        className={styles.backgroundLayer}
      />
      {background.category === "pattern" ||
      background.category === "texture" ? (
        <span
          aria-hidden="true"
          className={cn(
            styles.backgroundDetail,
            background.category === "texture" && styles.backgroundTexture,
          )}
        />
      ) : null}
      {background.category === "media" && mediaUrl ? (
        <span
          aria-hidden="true"
          className={styles.mediaLayer}
          style={
            {
              "--links-media-fit": background.fit,
              "--links-media-zoom": String(background.zoom),
              "--links-media-position": `${background.positionX}% ${background.positionY}%`,
            } as CSSProperties
          }
        >
          {background.mediaType === "video" ? (
            <BackgroundVideo src={mediaUrl} />
          ) : (
            // User-uploaded backgrounds can be arbitrary supported image formats.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" />
          )}
        </span>
      ) : null}
      {background.category === "media" ? (
        <span
          aria-hidden="true"
          className={styles.mediaOverlay}
          style={
            {
              "--links-media-overlay": rgba(
                background.overlayColor,
                background.overlayOpacity,
              ),
            } as CSSProperties
          }
        />
      ) : null}
      {animatedClass ? (
        <span
          aria-hidden="true"
          className={cn(styles.animatedLayer, animatedClass)}
        />
      ) : null}
    </>
  );
}

export function OptionTwoFrame({
  view,
  preview = false,
  children,
}: {
  view: ScanMeLinksViewModel;
  preview?: boolean;
  children: ReactNode;
}) {
  const design = resolveDesign(view);
  const title = view.displayName.trim().slice(0, 20);
  const description = view.description?.trim().slice(0, 50) ?? "";
  const hasIdentity = Boolean(view.logoUrl || title || description);

  return (
    <div
      style={designStyle(view, design)}
      data-button-variant={design.buttons.variant}
      data-icon-style={design.iconStyle}
      className={cn(styles.frame, preview && styles.preview)}
    >
      <Background view={view} design={design} />
      <main className={styles.main}>
        {hasIdentity ? (
          <header className={styles.header}>
            {view.logoUrl ? (
              // Customer logos include arbitrary raster formats and SVG.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.logoUrl}
                alt={title ? `${title} logo` : "Logotip lokala"}
                className={styles.logo}
                draggable={false}
              />
            ) : title ? (
              <div aria-hidden="true" className={styles.fallbackMark}>
                {title.slice(0, 1).toUpperCase()}
              </div>
            ) : null}
            {title ? <h1 className={styles.title}>{title}</h1> : null}
            {description ? (
              <p className={styles.description}>{description}</p>
            ) : null}
          </header>
        ) : null}

        <nav
          aria-label={title ? `Linkovi za ${title}` : "Linkovi lokala"}
          className={cn(
            styles.navigation,
            !hasIdentity && styles.compactNavigation,
          )}
        >
          {children}
        </nav>
      </main>
      <footer className={styles.footer}>Powered by ScanMe</footer>
    </div>
  );
}

export function OptionTwoTemplate({
  view,
  onDestinationClick,
  preview = false,
}: TemplateProps) {
  const design = resolveDesign(view);
  const destinations = view.destinations.filter((destination) => {
    if (destination.state === "deleted" || destination.state === "archived") {
      return false;
    }
    if (preview) return true;
    return (
      destination.state !== "inactive" &&
      Boolean(safeDestinationHref(destination.url))
    );
  });
  const duplicates = duplicateNumbers(destinations);

  return (
    <OptionTwoFrame view={view} preview={preview}>
      <ul className={styles.list}>
        {destinations.map((destination, index) => {
          const href = safeDestinationHref(destination.url);
          const isInactive = destination.state === "inactive";
          const isDisabled = preview && (!href || isInactive);
          const className = cn(
            optionTwoDestinationClassName,
            styles[design.buttons.variant],
            isInactive && styles.inactive,
            !href && styles.missing,
            isDisabled && styles.disabled,
          );
          const content = (
            <OptionTwoDestinationContent
              destination={destination}
              duplicate={duplicates[index]}
              preview={preview}
              iconStyle={design.iconStyle}
            />
          );

          return (
            <li key={destination.id}>
              {href && !isDisabled ? (
                <a
                  href={href}
                  onClick={(event) => onDestinationClick?.(destination, event)}
                  className={className}
                >
                  {content}
                </a>
              ) : (
                <button
                  type="button"
                  aria-disabled="true"
                  className={className}
                  onClick={(event) => event.preventDefault()}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </OptionTwoFrame>
  );
}

export function optionTwoDuplicateNumber(
  destinations: PublicDestination[],
  index: number,
) {
  return duplicateNumbers(destinations)[index] ?? null;
}
