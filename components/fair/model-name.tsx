"use client";

import { useLayoutEffect, useRef } from "react";

/** Keep every word intact, fitting the longest word beside the price. */
export function ModelName({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const heading = ref.current;
    if (!heading) return;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    const fit = () => {
      heading.style.removeProperty("font-size");
      const style = getComputedStyle(heading);
      const size = parseFloat(style.fontSize);
      context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
      const longest = Math.max(...children.split(/\s+/).map((word) => context.measureText(word).width));
      if (longest > heading.clientWidth) heading.style.fontSize = `${size * heading.clientWidth / longest}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(heading);
    let active = true;
    void document.fonts.ready.then(() => { if (active) fit(); });
    fit();
    return () => { active = false; observer.disconnect(); };
  }, [children]);
  return <h1 ref={ref}>{children}</h1>;
}
