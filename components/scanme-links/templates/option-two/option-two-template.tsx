import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { TemplateIcon } from "@/components/scanme-links/template-icon";
import type {
  AccentStyle,
  PublicDestination,
  ScanMeLinksViewModel,
  TemplateProps,
} from "@/components/scanme-links/templates/types";
import { cn } from "@/lib/utils";

export const optionTwoDestinationClassName =
  "group relative flex min-h-[5.25rem] w-full touch-manipulation items-center rounded-[9999px] border border-white/95 bg-white/80 py-2 pl-[4.65rem] pr-5 text-left shadow-[0_14px_34px_color-mix(in_srgb,var(--links-accent)_18%,transparent),inset_0_1px_0_rgba(255,255,255,.9)] outline-none transition-[transform,box-shadow,border-color] duration-200 active:scale-[0.985] focus-visible:ring-4 focus-visible:ring-[var(--links-accent-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f5ef]";

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

export function OptionTwoDestinationContent({
  destination,
  duplicate,
}: {
  destination: PublicDestination;
  duplicate: number | null;
}) {
  return (
    <>
      <span className="absolute -left-3 top-1/2 grid size-[5.45rem] -translate-y-1/2 place-items-center rounded-[9999px] border-2 border-[var(--links-accent-border)] bg-[#fbf8f2] text-[#202428] shadow-[0_10px_24px_color-mix(in_srgb,var(--links-accent)_22%,transparent),inset_0_0_0_6px_rgba(255,255,255,.68)]">
        <TemplateIcon iconKey={destination.iconKey} className="size-9" />
        {duplicate ? (
          <span className="absolute right-0 top-0 grid size-6 place-items-center rounded-[9999px] border-2 border-[#fbf8f2] bg-[var(--links-accent-strong)] text-[10px] font-bold text-white">
            {duplicate}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate px-4 text-[1.18rem] font-semibold tracking-[-0.025em] text-[#202428]">
        {destination.label}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-7 shrink-0 text-[#202428] transition-transform duration-200 group-active:translate-x-0.5"
        strokeWidth={2}
      />
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
  const style: AccentStyle = {
    "--links-accent": view.accentTokens.accent,
    "--links-accent-strong": view.accentTokens.strong,
    "--links-accent-soft": view.accentTokens.soft,
    "--links-accent-border": view.accentTokens.border,
    "--links-accent-focus": view.accentTokens.focus,
    "--links-on-accent": view.accentTokens.onAccent,
  };

  return (
    <div
      style={style}
      className={cn(
        "relative flex w-full flex-col overflow-hidden bg-[#f8f5ef] [font-family:Arial,Helvetica,sans-serif] text-[#202428]",
        preview ? "min-h-[660px] rounded-[1.8rem]" : "min-h-[100dvh]",
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_50%_5%,rgba(255,255,255,.98),transparent_35%),radial-gradient(circle_at_10%_72%,var(--links-accent-soft),transparent_42%),radial-gradient(circle_at_92%_92%,rgba(255,255,255,.8),transparent_34%)]" />
      <main
        className={cn(
          "relative mx-auto flex w-full max-w-[29rem] flex-1 flex-col px-7",
          preview ? "py-9" : "py-10 sm:py-14",
        )}
      >
        <header className="flex flex-col items-center text-center">
          {view.logoUrl ? (
            // Customer logos have arbitrary supported raster aspect ratios.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.logoUrl}
              alt={`${view.displayName} logo`}
              className="size-28 object-contain"
            />
          ) : (
            <div
              aria-hidden="true"
              className="grid size-24 place-items-center rounded-[9999px] border-2 border-[var(--links-accent-border)] text-3xl font-semibold text-[var(--links-accent-strong)]"
            >
              {view.displayName.trim().slice(0, 1).toUpperCase()}
            </div>
          )}
          <h1 className="mt-6 text-[2.25rem] font-semibold leading-tight tracking-[-0.045em]">
            {view.displayName}
          </h1>
        </header>

        <nav
          aria-label={`Linkovi za ${view.displayName}`}
          className="mt-12"
        >
          {children}
        </nav>
      </main>
      <footer className="relative px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-7 text-center text-sm font-medium tracking-[0.02em] text-[#5d6063]">
        Powered by ScanMe
      </footer>
    </div>
  );
}

export function OptionTwoTemplate({
  view,
  onDestinationClick,
  preview = false,
}: TemplateProps) {
  const duplicates = duplicateNumbers(view.destinations);

  return (
    <OptionTwoFrame view={view} preview={preview}>
      <ul className="grid gap-5 pl-3">
        {view.destinations.map((destination, index) => {
          const content = (
            <>
              <OptionTwoDestinationContent
                destination={destination}
                duplicate={duplicates[index]}
              />
            </>
          );
          return (
            <li key={destination.id}>
              {destination.url ? (
                <a
                  href={destination.url}
                  onClick={(event) => onDestinationClick?.(destination, event)}
                  className={optionTwoDestinationClassName}
                  style={{ borderRadius: "9999px" }}
                >
                  {content}
                </a>
              ) : (
                <button
                  type="button"
                  aria-disabled="true"
                  className={optionTwoDestinationClassName}
                  style={{ borderRadius: "9999px" }}
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
