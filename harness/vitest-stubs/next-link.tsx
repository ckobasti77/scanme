// Vitest stub for next/link — a plain anchor with the same children/href.

import type { ReactElement, ReactNode } from "react";

export default function Link({
  href,
  children,
  className,
}: {
  href: string | { pathname?: string };
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <a href={typeof href === "string" ? href : (href.pathname ?? "#")} className={className}>
      {children}
    </a>
  );
}
