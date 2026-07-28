import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  width = "7.25rem",
}: {
  className?: string;
  width?: CSSProperties["width"];
}) {
  return <span aria-hidden="true" className={cn("scanme-wordmark", className)} style={{ width }} />;
}
