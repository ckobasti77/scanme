import { BrandLogo } from "@/components/brand-logo";

export function ClientWordmark() {
  return (
    <span className="inline-flex min-h-11 items-center gap-3" aria-label="ScanMe Client">
      <BrandLogo width="7rem" />
      <span className="border-l border-foreground/20 pl-3 text-xs font-semibold tracking-[0.08em]">CLIENT</span>
    </span>
  );
}
