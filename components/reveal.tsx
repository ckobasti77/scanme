"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type RevealElement = "div" | "article" | "li";

export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: RevealElement;
}) {
  const reduce = useReducedMotion();
  const MotionElement = as === "article" ? motion.article : as === "li" ? motion.li : motion.div;

  return (
    <MotionElement
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.72, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionElement>
  );
}
