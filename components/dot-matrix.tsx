import type { CSSProperties } from "react";

/**
 * Jednobojna ikonica od tačaka (dot-matrix). `pattern` je niz redova iste dužine:
 * "#" je upaljena tačka, "o" tačka koja se još „slaže“ (uskoro), "." prazno
 * mesto mreže. Svaka tačka nosi `--r`, `--c`, `--i` i `--n` (pseudo-slučajan
 * redosled) da bi CSS modul potrošača mogao da je animira samo preko
 * `transform` i `opacity`. Bez animacije ikonica je cela.
 */
export function DotMatrix({
  pattern,
  className,
  dotClassName,
  pendingDotClassName,
  gridDotClassName,
  cell = 10,
  radius = 3.4,
}: {
  pattern: readonly string[];
  className?: string;
  dotClassName?: string;
  pendingDotClassName?: string;
  gridDotClassName?: string;
  cell?: number;
  radius?: number;
}) {
  const rows = pattern.length;
  const cols = pattern[0]?.length ?? 0;
  const lit: Array<{ r: number; c: number; pending: boolean }> = [];
  const empty: Array<{ r: number; c: number }> = [];

  pattern.forEach((row, r) => {
    Array.from(row).forEach((mark, c) => {
      if (mark === "#" || mark === "o") lit.push({ r, c, pending: mark === "o" });
      else empty.push({ r, c });
    });
  });

  const center = (index: number) => index * cell + cell / 2;

  return (
    <svg
      viewBox={`0 0 ${cols * cell} ${rows * cell}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {gridDotClassName
        ? empty.map(({ r, c }) => (
            <circle key={`g${r}-${c}`} cx={center(c)} cy={center(r)} r={radius * 0.42} className={gridDotClassName} />
          ))
        : null}
      {lit.map(({ r, c, pending }, i) => (
        <circle
          key={`d${r}-${c}`}
          cx={center(c)}
          cy={center(r)}
          r={radius}
          className={pending && pendingDotClassName ? `${dotClassName ?? ""} ${pendingDotClassName}` : dotClassName}
          style={{ "--r": r, "--c": c, "--i": i, "--n": (i * 37) % Math.max(lit.length, 1) } as CSSProperties}
        />
      ))}
    </svg>
  );
}
