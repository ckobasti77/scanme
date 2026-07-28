import type { CSSProperties, PropsWithChildren } from "react";

type LiquidGlassProps = PropsWithChildren<{
  className?: string;
  radius?: string;
  blur?: string;
  tint?: string;
}>;

type GlassStyle = CSSProperties & {
  "--glass-radius": string;
  "--glass-blur": string;
  "--glass-tint": string;
};

export function LiquidGlass({
  children,
  className = "",
  radius = "1.5rem",
  blur = "22px",
  tint = "rgba(255, 255, 255, 0.1)",
}: LiquidGlassProps) {
  const style: GlassStyle = {
    "--glass-radius": radius,
    "--glass-blur": blur,
    "--glass-tint": tint,
  };

  return (
    <section className={`liquidGlass ${className}`.trim()} style={style}>
      <div className="liquidGlassContent">{children}</div>
    </section>
  );
}
