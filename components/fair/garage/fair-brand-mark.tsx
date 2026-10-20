import Image from "next/image";
import type { ReactNode } from "react";
import { fairBrandKey, fairBrandVector } from "@/lib/fair-brand-logo";

export function FairBrandMark({ brandName, className, fallback }: { brandName: string; className?: string; fallback?: ReactNode }) {
  const mark = fairBrandVector(brandName);

  if (mark?.kind === "file") {
    return <Image className={className} src={mark.src} width={mark.width} height={mark.height} alt="" aria-hidden="true" />;
  }

  if (!mark) {
    return fallback ?? <span className={className} aria-hidden="true">{fairBrandKey(brandName).slice(0, 2).toUpperCase()}</span>;
  }

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={mark.path} fill="currentColor" />
    </svg>
  );
}
