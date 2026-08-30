"use client";

import Image from "next/image";
import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ProductMockupProjectiveTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
};

export type ProductMockupTransformConfig = {
  plane?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  perspective?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  skewX?: number;
  skewY?: number;
  translateX?: number;
  translateY?: number;
  scale?: number;
  transformOrigin?: string;
  borderRadius?: string;
  clipPath?: string;
  projective?: ProductMockupProjectiveTransform;
};

export type ProductMockupProps = {
  baseImageSrc: string;
  logoSrc?: string | null;
  transformConfig: ProductMockupTransformConfig;
  children?: ReactNode;
  aspectRatio?: string;
  baseImageAlt?: string;
  logoAlt?: string;
  sizes?: string;
  className?: string;
  baseImageClassName?: string;
  overlayClassName?: string;
  overlayBlendMode?: CSSProperties["mixBlendMode"];
  inkFilter?: string;
  fill?: boolean;
};

function projectiveMatrix3d(
  width: number,
  height: number,
  transform: ProductMockupProjectiveTransform,
) {
  const { a, b, c, d, e, f, g, h } = transform;
  return `matrix3d(${[
    a, (height / width) * d, 0, g / width,
    (width / height) * b, e, 0, h / height,
    0, 0, 1, 0,
    width * c, height * f, 0, 1,
  ].join(",")})`;
}

function cssTransform(config: ProductMockupTransformConfig) {
  const {
    perspective = 1200,
    rotateX = 0,
    rotateY = 0,
    rotateZ = 0,
    skewX = 0,
    skewY = 0,
    translateX = 0,
    translateY = 0,
    scale = 1,
  } = config;

  return [
    `perspective(${perspective}px)`,
    `translate3d(${translateX}px, ${translateY}px, 0)`,
    `rotateX(${rotateX}deg)`,
    `rotateY(${rotateY}deg)`,
    `rotateZ(${rotateZ}deg)`,
    `skew(${skewX}deg, ${skewY}deg)`,
    `scale(${scale})`,
  ].join(" ");
}

/**
 * Lightweight DOM-only product compositing. A normal CSS 3D transform is
 * available for quick tuning, while `projective` maps all four corners when a
 * photographed plane needs more precision than rotate/skew can provide.
 */
export function ProductMockup({
  baseImageSrc,
  logoSrc,
  transformConfig,
  children,
  aspectRatio = "1 / 1",
  baseImageAlt = "",
  logoAlt = "",
  sizes = "100vw",
  className = "",
  baseImageClassName = "",
  overlayClassName = "",
  overlayBlendMode = "multiply",
  inkFilter =
    "drop-shadow(1px 1px 0 rgba(255,255,255,0.4)) drop-shadow(-1px -1px 0 rgba(0,0,0,0.5))",
  fill = false,
}: ProductMockupProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const {
    plane = { top: 0, left: 0, width: 100, height: 100 },
    projective,
    transformOrigin = "0 0",
    borderRadius,
    clipPath,
  } = transformConfig;

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const updateTransform = () => {
      overlay.style.transform = projective
        ? projectiveMatrix3d(overlay.offsetWidth, overlay.offsetHeight, projective)
        : cssTransform(transformConfig);
    };

    updateTransform();
    if (!projective) return;

    const observer = new ResizeObserver(updateTransform);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, [projective, transformConfig]);

  return (
    <div
      className={`${fill ? "absolute inset-0" : "relative w-full"} isolate ${className}`}
      style={fill ? undefined : { aspectRatio }}
    >
      <Image
        src={baseImageSrc}
        alt={baseImageAlt}
        fill
        sizes={sizes}
        loading="eager"
        className={`object-contain ${baseImageClassName}`}
      />

      <div
        ref={overlayRef}
        className={`absolute overflow-hidden ${overlayClassName}`}
        style={{
          top: `${plane.top}%`,
          left: `${plane.left}%`,
          width: `${plane.width}%`,
          height: `${plane.height}%`,
          transformOrigin,
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          borderRadius,
          clipPath,
          mixBlendMode: overlayBlendMode,
          filter: inkFilter,
        }}
      >
        {children}
        {logoSrc ? (
          <Image
            src={logoSrc}
            alt={logoAlt}
            fill
            unoptimized
            className="object-contain"
          />
        ) : null}
      </div>
    </div>
  );
}
