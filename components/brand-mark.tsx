import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("brand-mark inline-flex size-7 shrink-0 items-center justify-center", className)}
    >
      <Image
        src="/logo.png"
        alt=""
        width={28}
        height={28}
        priority={priority}
        className="size-full object-contain"
      />
    </span>
  );
}
