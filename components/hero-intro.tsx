"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function HeroIntro() {
  const reduce = useReducedMotion();
  const enter = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className="relative z-10 flex min-h-[100dvh] items-end pb-10 pt-24 sm:pb-14 lg:pb-16">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="max-w-4xl">
          <motion.h1
            {...enter(0.05)}
            className="max-w-[13ch] text-[clamp(3.25rem,8vw,7.5rem)] font-semibold leading-[0.88] tracking-[-0.075em] text-white"
          >
            Jedan sken. Prava akcija.
          </motion.h1>
          <motion.p
            {...enter(0.16)}
            className="mt-6 max-w-[58ch] text-base leading-7 text-white/76 sm:text-lg"
          >
            Pretvaramo nalepnice, kartice i stolove u recenzije, ponude i rezervacije.
          </motion.p>
          <motion.div {...enter(0.27)} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#ponuda" className="button-primary focus-signal">
              Zatraži ponudu
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </a>
            <a href="#kako-radi" className="button-secondary focus-signal">
              Pogledaj kako radi
              <ArrowDownRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </a>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
