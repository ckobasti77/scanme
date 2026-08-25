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
  iconPackageForPreset,
  layoutForPreset,
  normalizeDesignForPreset,
  type ScanMeLinksDesignV2,
  type ScanMeLinksIconPackage,
  type ScanMeLinksIconStyle,
  type ScanMeLinksPresetKey,
} from "@/lib/scanme-links-design";
import {
  backgroundContrastSamples,
  safeNeutralForBackgrounds,
} from "@/lib/scanme-color-science";
import { backgroundPresentation } from "@/lib/design-engine/background";
import { rgba } from "@/lib/design-engine/color";
import { logoShadowCss, shadowCss } from "@/lib/design-engine/shadows";
import { FONT_STACKS } from "@/lib/design-engine/typography";
import { cn } from "@/lib/utils";
import styles from "./option-two-template.module.css";

export const optionTwoDestinationClassName = styles.destination;

const ICON_STYLE_CLASSES: Record<ScanMeLinksIconStyle, string> = {
  "soft-line": "",
  "ios-rounded": styles.iconIos,
  "luxury-line": styles.iconLux,
  "rustic-stamp": styles.iconRustic,
  "minimal-line": styles.iconMinimal,
  "bold-fill": styles.iconBold,
  "editorial-outline": styles.iconEditorial,
  "pop-sticker": styles.iconPop,
  "craft-badge": styles.iconCraft,
  "glass-tile": styles.iconGlass,
  "wanderlust-glow": styles.iconWanderlust,
  "bistro-seal": styles.iconBistro,
  "bloom-soft": styles.iconBloom,
  "chicken-comic": styles.iconChicken,
  "pulse-neon": styles.iconPulse,
};

const TEMPLATE_BACKGROUNDS: Partial<Record<ScanMeLinksPresetKey, string>> = {
  wanderlust: "/scanme-links-template-backgrounds/wanderlust-background.avif",
  bistro: "/scanme-links-template-backgrounds/bistro-background.avif",
  bloom: "/scanme-links-template-backgrounds/bloom-background.avif",
  chicken: "/scanme-links-template-backgrounds/chicken-background.avif",
  pulse: "/scanme-links-template-backgrounds/pulse-background.avif",
};

const TEMPLATE_LOGOS: Partial<Record<ScanMeLinksPresetKey, string>> = {
  wanderlust: "/scanme-links-template-backgrounds/wanderlust-logo.svg",
  bistro: "/scanme-links-template-backgrounds/bistro-logo.svg",
  bloom: "/scanme-links-template-backgrounds/bloom-logo.svg",
  chicken: "/scanme-links-template-backgrounds/chicken-logo.svg",
  pulse: "/scanme-links-template-backgrounds/pulse-logo.svg",
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
  const buttonShadow = shadowCss(design.buttons.shadow);
  const textShadow = design.effects.textShadow.enabled
    ? shadowCss(design.effects.textShadow)
    : undefined;
  // Per-element text shadows fall back to the global one when no override is set.
  const titleShadow = design.effects.titleShadow?.enabled
    ? shadowCss(design.effects.titleShadow)
    : textShadow;
  const descriptionShadow = design.effects.descriptionShadow?.enabled
    ? shadowCss(design.effects.descriptionShadow)
    : textShadow;
  const buttonTextShadow = design.effects.buttonTextShadow?.enabled
    ? shadowCss(design.effects.buttonTextShadow)
    : textShadow;
  const logoShadow = logoShadowCss(design.effects.logoShadow);
  const mediaPresent =
    design.background.category === "media" &&
    Boolean(
      design.background.mediaType === "video"
        ? view.backgroundVideoUrl
        : view.backgroundImageUrl,
    );
  const poweredColor = safeNeutralForBackgrounds(
    backgroundContrastSamples(design, { mediaPresent }),
  );
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
    "--links-text-shadow": textShadow,
    "--links-title-shadow": titleShadow,
    "--links-description-shadow": descriptionShadow,
    "--links-button-text-shadow": buttonTextShadow,
    "--links-logo-shadow": logoShadow,
    "--links-powered-color": poweredColor,
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

function BackgroundVideo({
  src,
  fit,
  positionX,
  positionY,
}: {
  src: string;
  fit: "cover" | "contain";
  positionX: number;
  positionY: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = ref.current;
    const canvas = canvasRef.current;
    if (!element || !canvas) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = true;
    let animationFrameId: number | null = null;
    let videoFrameId: number | null = null;
    const lockNativeControls = () => {
      element.controls = false;
      element.disablePictureInPicture = true;
      element.disableRemotePlayback = true;
      element.removeAttribute("controls");
    };
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
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const leavePictureInPicture = () => {
      if (document.pictureInPictureElement === element) {
        void document.exitPictureInPicture().catch(() => undefined);
      }
    };
    const resumeDecorativePlayback = () => {
      if (active && !motionQuery.matches) syncPlayback();
    };
    const drawFrame = () => {
      if (
        !active ||
        element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !element.videoWidth ||
        !element.videoHeight
      ) {
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.max(1, Math.round(bounds.width * density));
      const targetHeight = Math.max(1, Math.round(bounds.height * density));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const context = canvas.getContext("2d");
      if (!context) return;
      const scale =
        fit === "contain"
          ? Math.min(
              targetWidth / element.videoWidth,
              targetHeight / element.videoHeight,
            )
          : Math.max(
              targetWidth / element.videoWidth,
              targetHeight / element.videoHeight,
            );
      const drawWidth = element.videoWidth * scale;
      const drawHeight = element.videoHeight * scale;
      const offsetX =
        (targetWidth - drawWidth) * (Math.min(100, Math.max(0, positionX)) / 100);
      const offsetY =
        (targetHeight - drawHeight) *
        (Math.min(100, Math.max(0, positionY)) / 100);

      context.clearRect(0, 0, targetWidth, targetHeight);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(element, offsetX, offsetY, drawWidth, drawHeight);
    };
    const scheduleFrame = () => {
      if (!active) return;
      if ("requestVideoFrameCallback" in element) {
        videoFrameId = element.requestVideoFrameCallback(() => {
          drawFrame();
          scheduleFrame();
        });
      } else {
        animationFrameId = window.requestAnimationFrame(() => {
          drawFrame();
          scheduleFrame();
        });
      }
    };
    const controlsObserver = new MutationObserver(lockNativeControls);
    const resizeObserver = new ResizeObserver(drawFrame);

    lockNativeControls();
    syncPlayback();
    controlsObserver.observe(element, {
      attributes: true,
      attributeFilter: ["controls"],
    });
    element.addEventListener("contextmenu", preventContextMenu);
    element.addEventListener("enterpictureinpicture", leavePictureInPicture);
    element.addEventListener("loadeddata", drawFrame);
    element.addEventListener("seeked", drawFrame);
    element.addEventListener("pause", resumeDecorativePlayback);
    resizeObserver.observe(canvas);
    scheduleFrame();
    motionQuery.addEventListener("change", syncPlayback);
    return () => {
      active = false;
      controlsObserver.disconnect();
      resizeObserver.disconnect();
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      if (videoFrameId !== null && "cancelVideoFrameCallback" in element) {
        element.cancelVideoFrameCallback(videoFrameId);
      }
      element.removeEventListener("contextmenu", preventContextMenu);
      element.removeEventListener(
        "enterpictureinpicture",
        leavePictureInPicture,
      );
      element.removeEventListener("loadeddata", drawFrame);
      element.removeEventListener("seeked", drawFrame);
      element.removeEventListener("pause", resumeDecorativePlayback);
      motionQuery.removeEventListener("change", syncPlayback);
      element.pause();
    };
  }, [fit, positionX, positionY, src]);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" />
      <video
        ref={ref}
        className={styles.mediaDecoder}
        src={src}
        aria-hidden="true"
        muted
        loop
        playsInline
        preload="auto"
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        onContextMenu={(event) => event.preventDefault()}
        {...{ "x-webkit-airplay": "deny" }}
      />
    </>
  );
}

export function OptionTwoDestinationContent({
  destination,
  duplicate,
  preview = false,
  iconStyle = "soft-line",
  packageStyle = "line",
}: {
  destination: PublicDestination;
  duplicate: number | null;
  preview?: boolean;
  iconStyle?: ScanMeLinksIconStyle;
  packageStyle?: ScanMeLinksIconPackage;
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
        <TemplateIcon
          iconKey={destination.iconKey}
          className={styles.icon}
          packageStyle={packageStyle}
        />
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
        : (view.backgroundImageUrl ||
           TEMPLATE_BACKGROUNDS[design.presetKey] ||
           null)
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
          data-fit={background.fit}
          style={
            {
              "--links-media-fit": background.fit,
              "--links-media-zoom": String(background.zoom),
              "--links-media-position": `${background.positionX}% ${background.positionY}%`,
            } as CSSProperties
          }
        >
          {background.mediaType === "video" ? (
            <BackgroundVideo
              src={mediaUrl}
              fit={background.fit}
              positionX={background.positionX}
              positionY={background.positionY}
            />
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
  const title = view.displayName.trim().slice(0, 50);
  const description = view.description?.trim().slice(0, 50) ?? "";
  const logoUrl = view.logoUrl || TEMPLATE_LOGOS[design.presetKey] || null;
  const hasIdentity = Boolean(logoUrl || title || description);

  return (
    <div
      style={designStyle(view, design)}
      data-button-variant={design.buttons.variant}
      data-icon-style={design.iconStyle}
      data-layout={layoutForPreset(design.presetKey)}
      data-preset={design.presetKey}
      className={cn(styles.frame, preview && styles.preview)}
    >
      <Background view={view} design={design} />
      <main className={styles.main}>
        {hasIdentity ? (
          <header className={styles.header}>
            {logoUrl ? (
              // Customer logos include arbitrary raster formats and SVG.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={title ? `${title} logo` : "Logotip lokala"}
                className={styles.logo}
                data-contrast-anchor="logo"
                draggable={false}
              />
            ) : title ? (
              <div
                aria-hidden="true"
                className={styles.fallbackMark}
                data-contrast-anchor="logo"
              >
                {title.slice(0, 1).toUpperCase()}
              </div>
            ) : null}
            {title ? (
              <h1 className={styles.title} data-contrast-anchor="title">
                {title}
              </h1>
            ) : null}
            {description ? (
              <p className={styles.description} data-contrast-anchor="body">
                {description}
              </p>
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
  const packageStyle = iconPackageForPreset(design.presetKey);

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
              packageStyle={packageStyle}
            />
          );

          return (
            <li key={destination.id}>
              {href && !isDisabled ? (
                <a
                  href={href}
                  onClick={(event) => onDestinationClick?.(destination, event)}
                  className={className}
                  data-contrast-anchor={index === 0 ? "button" : undefined}
                >
                  {content}
                </a>
              ) : (
                <button
                  type="button"
                  aria-disabled="true"
                  className={className}
                  data-contrast-anchor={index === 0 ? "button" : undefined}
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
