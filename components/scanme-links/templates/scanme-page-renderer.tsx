import type { CSSProperties, ReactNode } from "react";
import { TemplateIcon } from "@/components/scanme-links/template-icon";
import type {
  PublicDestination,
  ScanMeDesignStyle,
  ScanMeLinksViewModel,
  ScanMeRenderMode,
  TemplateProps,
} from "@/components/scanme-links/templates/types";
import {
  designForPreset,
  legacyScanMeDesign,
  type ScanMeButtonDesign,
  type ScanMeDesignV1,
  type ScanMePresetKey,
} from "@/lib/scanme-design";
import { cn } from "@/lib/utils";

export const SCANME_PATTERN_ASSETS = {
  grid: "/images/scanme-links-woven-pattern.webp",
  dots: "/images/scanme-links-dots-pattern.webp",
  waves: "/images/scanme-links-waves-pattern.webp",
} as const;

export const SCANME_NATURE_BACKGROUND =
  "/images/scanme-links-nature-background.webp";

const presetNames: Record<ScanMePresetKey, string> = {
  gentle: "Gentle",
  lux: "Lux",
  ios: "iOS",
  frosty: "Frosty",
  noir: "Noir",
  neon: "Neon",
  nature: "Nature",
};

const fontClasses = {
  mono: "[font-family:var(--font-plex-mono),'IBM_Plex_Mono',monospace]",
  sans: "[font-family:Arial,'Helvetica_Neue',Helvetica,sans-serif]",
  serif: "[font-family:Georgia,'Times_New_Roman',serif]",
} as const;

const alignmentClasses = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

const scaleClasses = {
  small: {
    title: "text-[1.8rem]",
    description: "text-[0.9rem]",
  },
  medium: {
    title: "text-[2.1rem]",
    description: "text-[0.98rem]",
  },
  large: {
    title: "text-[2.45rem]",
    description: "text-[1.06rem]",
  },
} as const;

const buttonFontSizes = {
  small: "0.95rem",
  medium: "1rem",
  large: "1.08rem",
} as const;

const shadowClasses: Record<ScanMeButtonDesign["shadow"], string> = {
  none: "shadow-none",
  soft: "shadow-[0_8px_24px_color-mix(in_srgb,var(--scanme-title)_8%,transparent)]",
  elevated:
    "shadow-[0_14px_38px_color-mix(in_srgb,var(--scanme-accent)_20%,transparent)]",
};

const animationClasses: Record<ScanMeButtonDesign["animation"], string> = {
  none: "",
  lift: "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
  glow:
    "motion-safe:hover:shadow-[0_0_0_1px_var(--scanme-accent),0_12px_34px_color-mix(in_srgb,var(--scanme-accent)_28%,transparent)]",
  liquid:
    "motion-safe:hover:scale-[1.012] motion-safe:active:scale-[0.99] motion-safe:hover:shadow-[0_12px_32px_color-mix(in_srgb,var(--scanme-accent)_20%,transparent)]",
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

export function resolveScanMeDesign(view: ScanMeLinksViewModel) {
  return (
    view.design ??
    legacyScanMeDesign({
      accent: view.accent,
      accentTokens: view.accentTokens,
    })
  );
}

function cssImageUrl(url: string) {
  return `url(${JSON.stringify(url)})`;
}

function frameBackgroundStyle(
  view: ScanMeLinksViewModel,
  design: ScanMeDesignV1,
): CSSProperties {
  const background = design.background;
  switch (background.kind) {
    case "solid":
      return { backgroundColor: background.color };
    case "gradient":
      return {
        backgroundColor: design.colors.page,
        backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
      };
    case "pattern":
      return { backgroundColor: background.backgroundColor };
    case "image": {
      const url =
        view.backgroundImageUrl ??
        (background.builtInAsset === "nature"
          ? SCANME_NATURE_BACKGROUND
          : null);
      return {
        backgroundColor: design.colors.page,
        backgroundImage: url ? cssImageUrl(url) : undefined,
        backgroundPosition: background.position,
        backgroundRepeat: "no-repeat",
        backgroundSize: background.fit,
      };
    }
  }
}

function BackgroundLayer({ design }: { design: ScanMeDesignV1 }) {
  const background = design.background;
  if (background.kind === "solid") return null;
  if (background.kind === "gradient") {
    return background.overlayOpacity > 0 ? (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: background.overlayColor,
          opacity: background.overlayOpacity,
        }}
      />
    ) : null;
  }
  if (background.kind === "pattern") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-repeat"
        style={{
          backgroundColor: background.patternColor,
          backgroundImage: cssImageUrl(
            SCANME_PATTERN_ASSETS[background.pattern],
          ),
          backgroundBlendMode: "multiply",
          backgroundSize: background.pattern === "dots" ? "220px" : "360px",
          mixBlendMode: "multiply",
          opacity: background.opacity,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: background.overlayColor,
        opacity: background.overlayOpacity,
      }}
    />
  );
}

function frameDesignStyle(design: ScanMeDesignV1): ScanMeDesignStyle {
  return {
    "--links-accent": design.colors.accent,
    "--links-accent-strong": design.colors.buttonHover,
    "--links-accent-soft": design.colors.surface,
    "--links-accent-border": design.colors.border,
    "--links-accent-focus": design.colors.focus,
    "--links-on-accent": design.colors.buttonText,
    "--scanme-page": design.colors.page,
    "--scanme-surface": design.colors.surface,
    "--scanme-title": design.colors.title,
    "--scanme-body": design.colors.body,
    "--scanme-accent": design.colors.accent,
    "--scanme-border": design.colors.border,
    "--scanme-focus": design.colors.focus,
    "--scanme-button": design.colors.button,
    "--scanme-button-hover": design.colors.buttonHover,
    "--scanme-button-text": design.colors.buttonText,
    "--scanme-button-radius": `${design.buttons.radius}px`,
    "--scanme-button-border": `${design.buttons.borderWidth}px`,
    "--scanme-button-padding-x": `${design.buttons.paddingX}px`,
    "--scanme-button-padding-y": `${design.buttons.paddingY}px`,
    "--scanme-button-font-size": buttonFontSizes[design.typography.scale],
    "--scanme-line-height": design.typography.lineHeight,
    "--scanme-section-gap": `${design.typography.verticalSpacing}px`,
    "--scanme-text-align": design.typography.alignment,
    fontWeight: design.typography.bodyWeight,
  };
}

function buttonVariantClass(design: ScanMeDesignV1) {
  switch (design.buttons.variant) {
    case "solid":
      return "bg-[var(--scanme-button)] hover:bg-[var(--scanme-button-hover)]";
    case "outline":
      return "bg-transparent hover:bg-[var(--scanme-button-hover)]";
    case "glass":
      return "bg-[color-mix(in_srgb,var(--scanme-button)_76%,transparent)] backdrop-blur-md hover:bg-[color-mix(in_srgb,var(--scanme-button-hover)_86%,transparent)]";
  }
}

export function scanMeButtonStyleClasses(design: ScanMeDesignV1) {
  return cn(
    buttonVariantClass(design),
    shadowClasses[design.buttons.shadow],
    animationClasses[design.buttons.animation],
  );
}

export const scanMeDestinationClassName =
  "group relative flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-[var(--scanme-button-radius)] border-[length:var(--scanme-button-border)] border-[var(--scanme-border)] px-[var(--scanme-button-padding-x)] py-[var(--scanme-button-padding-y)] text-[length:var(--scanme-button-font-size)] text-[var(--scanme-button-text)] outline-none transition-[transform,background-color,box-shadow,border-color] duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--scanme-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scanme-page)] motion-reduce:transform-none motion-reduce:transition-none";

export function ScanMeDestinationContent({
  destination,
  duplicate,
  compact = false,
  alignment,
}: {
  destination: PublicDestination;
  duplicate: number | null;
  compact?: boolean;
  alignment?: ScanMeDesignV1["typography"]["alignment"];
}) {
  return (
    <>
      <span
        className={cn(
          "relative grid shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--scanme-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--scanme-surface)_88%,transparent)] text-[var(--scanme-accent)]",
          compact ? "size-6" : "size-9",
        )}
      >
        <TemplateIcon
          iconKey={destination.iconKey}
          className={compact ? "size-3.5" : "size-[1.15rem]"}
        />
        {duplicate ? (
          <span
            className={cn(
              "absolute -right-1 -top-1 grid place-items-center rounded-full bg-[var(--scanme-accent)] font-bold text-[var(--scanme-page)]",
              compact ? "size-3 text-[6px]" : "size-4 text-[8px]",
            )}
          >
            {duplicate}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          alignment
            ? alignmentClasses[alignment]
            : "[text-align:var(--scanme-text-align)]",
        )}
      >
        {destination.label}
      </span>
      <span aria-hidden="true" className={compact ? "w-6" : "w-9"} />
    </>
  );
}

function PageIdentity({
  view,
  design,
  mode,
}: {
  view: ScanMeLinksViewModel;
  design: ScanMeDesignV1;
  mode: ScanMeRenderMode;
}) {
  const thumbnail = mode === "thumbnail";
  const scale = scaleClasses[design.typography.scale];
  const alignment = design.typography.alignment;

  return (
    <header
      className={cn(
        "flex flex-col",
        alignmentClasses[alignment],
        alignment === "left"
          ? "items-start"
          : alignment === "right"
            ? "items-end"
            : "items-center",
      )}
    >
      {view.logoUrl ? (
        // Logos are user uploads with arbitrary aspect ratios and Convex URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.logoUrl}
          alt={`${view.displayName} logo`}
          className={cn(
            "object-contain",
            thumbnail ? "size-12" : "size-24 sm:size-28",
          )}
        />
      ) : (
        <div
          aria-hidden="true"
          className={cn(
            "grid place-items-center rounded-full border border-[var(--scanme-border)] bg-[color-mix(in_srgb,var(--scanme-surface)_82%,transparent)] font-semibold text-[var(--scanme-title)]",
            thumbnail ? "size-11 text-sm" : "size-24 text-3xl",
          )}
        >
          {view.displayName.trim().slice(0, 1).toUpperCase()}
        </div>
      )}
      <h1
        className={cn(
          "leading-tight tracking-[-0.035em] text-[var(--scanme-title)]",
          thumbnail ? "mt-3 text-base" : cn("mt-6", scale.title),
        )}
        style={{ fontWeight: design.typography.headingWeight }}
      >
        {view.displayName}
      </h1>
      {view.description ? (
        <p
          className={cn(
            "max-w-[34ch] text-[var(--scanme-body)]",
            thumbnail
              ? "mt-1 line-clamp-1 text-[8px]"
              : cn("mt-2", scale.description),
          )}
        >
          {view.description}
        </p>
      ) : null}
    </header>
  );
}

export function ScanMePageFrame({
  view,
  mode,
  children,
}: {
  view: ScanMeLinksViewModel;
  mode: ScanMeRenderMode;
  children: ReactNode;
}) {
  const design = resolveScanMeDesign(view);
  const thumbnail = mode === "thumbnail";

  return (
    <div
      style={{
        ...frameDesignStyle(design),
        ...frameBackgroundStyle(view, design),
        lineHeight: design.typography.lineHeight,
      }}
      className={cn(
        "relative flex w-full flex-col overflow-hidden text-[var(--scanme-title)]",
        fontClasses[design.typography.family],
        mode === "public" ? "min-h-[100dvh]" : "rounded-[1.75rem]",
        mode === "preview" && "min-h-[660px]",
        thumbnail && "min-h-[17rem] rounded-xl",
      )}
    >
      <BackgroundLayer design={design} />
      <main
        className={cn(
          "relative mx-auto flex w-full flex-1 flex-col",
          thumbnail
            ? "max-w-[13rem] px-3 py-4"
            : "max-w-[30rem] px-7 py-10 sm:py-14",
        )}
      >
        <PageIdentity view={view} design={design} mode={mode} />
        <nav
          aria-label={`Linkovi za ${view.displayName}`}
          className={thumbnail ? "mt-4" : "mt-[var(--scanme-section-gap)]"}
        >
          {children}
        </nav>
      </main>
      <footer
        className={cn(
          "relative text-center text-[var(--scanme-body)]",
          thumbnail
            ? "px-2 pb-3 pt-3 text-[7px]"
            : "px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-7 text-xs font-medium tracking-[0.04em]",
        )}
      >
        ScanMe Links
      </footer>
    </div>
  );
}

function SocialDestination({
  destination,
  onDestinationClick,
  compact,
}: {
  destination: PublicDestination;
  onDestinationClick: TemplateProps["onDestinationClick"];
  compact: boolean;
}) {
  return (
    <a
      href={destination.url || "#"}
      aria-label={destination.label}
      title={destination.label}
      onClick={(event) => onDestinationClick?.(destination, event)}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-[length:var(--scanme-button-border)] border-[var(--scanme-border)] bg-[color-mix(in_srgb,var(--scanme-surface)_74%,transparent)] text-[var(--scanme-title)] outline-none transition-[transform,background-color,box-shadow] duration-200 hover:bg-[var(--scanme-button-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--scanme-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scanme-page)] motion-safe:hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
        compact ? "size-7" : "size-12",
      )}
    >
      <TemplateIcon
        iconKey={destination.iconKey}
        className={compact ? "size-3.5" : "size-5"}
      />
    </a>
  );
}

export function ScanMeLinksPageRenderer({
  view,
  onDestinationClick,
  preview = false,
  renderMode,
  editorSlot,
}: TemplateProps) {
  const mode = renderMode ?? (preview ? "preview" : "public");
  const design = resolveScanMeDesign(view);
  const thumbnail = mode === "thumbnail";
  const duplicates = duplicateNumbers(view.destinations);
  const buttonDestinations = view.destinations
    .map((destination, index) => ({ destination, duplicate: duplicates[index] }))
    .filter(({ destination }) => destination.presentation !== "social");
  const socialDestinations = view.destinations.filter(
    (destination) => destination.presentation === "social",
  );

  return (
    <ScanMePageFrame view={view} mode={mode}>
      {buttonDestinations.length ? (
        <ul className={cn("grid", thumbnail ? "gap-1.5" : "gap-4")}>
          {buttonDestinations.map(({ destination, duplicate }) => (
            <li key={destination.id}>
              <a
                href={destination.url || "#"}
                onClick={(event) => onDestinationClick?.(destination, event)}
                className={cn(
                  scanMeDestinationClassName,
                  scanMeButtonStyleClasses(design),
                  thumbnail
                    ? "min-h-0 gap-1 px-2 py-1 text-[8px]"
                    : undefined,
                )}
                style={{
                  borderRadius: "var(--scanme-button-radius)",
                  ...(thumbnail
                    ? { padding: "0.25rem 0.5rem" }
                    : undefined),
                }}
              >
                <ScanMeDestinationContent
                  destination={destination}
                  duplicate={duplicate}
                  compact={thumbnail}
                  alignment={design.typography.alignment}
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {socialDestinations.length ? (
        <ul
          aria-label="Društvene mreže"
          className={cn(
            "flex flex-wrap justify-center",
            thumbnail ? "mt-3 gap-1.5" : "mt-6 gap-3",
          )}
        >
          {socialDestinations.map((destination) => (
            <li key={destination.id}>
              <SocialDestination
                destination={destination}
                onDestinationClick={onDestinationClick}
                compact={thumbnail}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {editorSlot}
    </ScanMePageFrame>
  );
}

const presetPreviewDestinations: PublicDestination[] = [
  {
    id: "preview-portfolio",
    kind: "website",
    label: "Portfolio",
    url: "#",
    iconKey: "globe",
  },
  {
    id: "preview-booking",
    kind: "reservations",
    label: "Konsultacije",
    url: "#",
    iconKey: "calendar",
  },
  {
    id: "preview-instagram",
    kind: "instagram",
    label: "Instagram",
    url: "#",
    iconKey: "instagram",
  },
  {
    id: "preview-facebook",
    kind: "facebook",
    label: "Facebook",
    url: "#",
    iconKey: "facebook",
    presentation: "social",
  },
  {
    id: "preview-youtube",
    kind: "youtube",
    label: "YouTube",
    url: "#",
    iconKey: "youtube",
    presentation: "social",
  },
];

export function ScanMePresetPreview({
  presetKey,
  displayName = "Studio Forma",
  className,
}: {
  presetKey: ScanMePresetKey;
  displayName?: string;
  className?: string;
}) {
  const design = designForPreset(presetKey);
  return (
    <div
      aria-label={`Pregled stila ${presetNames[presetKey]}`}
      className={cn("pointer-events-none overflow-hidden rounded-xl", className)}
    >
      <ScanMeLinksPageRenderer
        renderMode="thumbnail"
        view={{
          displayName,
          description: "Dizajn enterijera",
          logoUrl: null,
          backgroundImageUrl: null,
          templateKey: "option-two",
          backgroundKey: "warm-ivory",
          accent: design.colors.accent,
          accentTokens: {
            accent: design.colors.accent,
            strong: design.colors.buttonHover,
            soft: design.colors.surface,
            border: design.colors.border,
            focus: design.colors.focus,
            onAccent: design.colors.buttonText,
          },
          design,
          destinations: presetPreviewDestinations,
        }}
      />
    </div>
  );
}

export function scanMeDuplicateNumber(
  destinations: PublicDestination[],
  index: number,
) {
  return duplicateNumbers(destinations)[index] ?? null;
}
