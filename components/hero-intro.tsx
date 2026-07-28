"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { HeroOutcomeAnimation } from "@/components/hero-outcome-animation";

export function HeroIntro() {
  const reduce = useReducedMotion();
  const enter = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className="relative z-10 flex min-h-[100dvh] items-center py-24 sm:py-28 lg:py-24">
      <div className="section-shell">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-12 xl:gap-16">
          <div className="max-w-4xl lg:justify-self-start">
            <motion.h1
              {...enter(0.05)}
              className="max-w-[13ch] text-[clamp(3.25rem,5vw,7.5rem)] font-semibold leading-[0.88] tracking-[-0.075em] text-foreground"
            >
              Jedan gost. <span className="text-nowrap">Mnogo novih.</span>
            </motion.h1>
            <motion.p
              {...enter(0.16)}
              className="mt-6 max-w-[58ch] text-base leading-7 text-foreground/76 sm:text-lg"
            >
              Vaš najbolji marketing već sedi za stolom. <span className="text">Poruči svoju <b>Google Review</b> karticu danas i pretvori svakog gosta u promotera.</span>
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

          <motion.div
            {...enter(0.18)}
            className="mx-auto w-full max-w-[20rem] sm:max-w-[24rem] lg:mx-0 lg:max-w-[38rem] lg:justify-self-end"
          >
            <HeroOutcomeAnimation />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
