// Vitest stub for next/image: the real component reads browser globals at
// module scope, which the edge-runtime test environment lacks. The render
// smoke only needs a plain <img> with the same accessible surface.

import type { CSSProperties, ReactElement } from "react";

export default function Image({
  src,
  alt,
  fill,
  sizes,
  width,
  height,
  style,
  className,
}: {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
  className?: string;
  loading?: string;
  priority?: boolean;
}): ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      width={width}
      height={height}
      className={className}
      style={fill ? { ...style, position: "absolute", inset: 0 } : style}
    />
  );
}
