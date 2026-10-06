import { ExternalLink } from "lucide-react";
import { websiteLabel } from "@/lib/admin-v1/website";
import { cn } from "@/lib/utils";

// Izlagači 2026 — the exhibitor's logo and website, the same on the
// Interakcije cards, the exhibitor page and the Izlagači list.

const SIZES = { sm: "size-10", md: "size-14", lg: "size-20" } as const;

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function ExhibitorLogo({ name, logoUrl, size = "md", className }: { name: string; logoUrl: string | null; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-white",
        SIZES[size],
        className,
      )}
    >
      {logoUrl ? (
        <>
          {/* Logos are the organizer's files under /fair/izlagaci or an uploaded file; next/image would need next.config (outside the admin). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain p-1" />
        </>
      ) : (
        <span aria-hidden="true" className="text-sm font-semibold tracking-[-0.02em] text-[#3f3f46]">{initials(name)}</span>
      )}
    </span>
  );
}

export function ExhibitorWebsiteLink({ url, ariaLabel, className }: { url: string; ariaLabel: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex min-h-9 min-w-0 items-center gap-1 text-xs font-semibold text-[var(--admin-text-muted)] underline-offset-4 hover:text-[var(--admin-ink)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]",
        className,
      )}
    >
      <span className="min-w-0 truncate">{websiteLabel(url)}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}
