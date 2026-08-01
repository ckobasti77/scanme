"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { HeroLinksAnimation } from "@/components/hero-links-animation";
import { HeroOutcomeAnimation } from "@/components/hero-outcome-animation";
import { getHeroCarouselCycleAction } from "@/lib/hero-animation-playback";

type HeroService = "links" | "review";

const services: Array<{
  id: HeroService;
  label: string;
  headline: ReactNode;
  body: ReactNode;
}> = [
  {
    id: "links",
    label: "ScanMe Links",
    headline: (
      <>
        Jedan sken. <span className="sm:text-nowrap">Svi vaši linkovi.</span>
      </>
    ),
    body: (
      <>
        Jedna ScanMe stranica za sve važne linkove vašeg biznisa, uz jasan uvid u
        svaki klik.
      </>
    ),
  },
  {
    id: "review",
    label: "ScanMe Review",
    headline: (
      <>
        Jedan gost. <span className="text-nowrap">Mnogo novih.</span>
      </>
    ),
    body: (
      <>
        Vaš najbolji marketing već sedi za stolom. Poruči svoju{" "}
        <b>Google Review</b> karticu danas i pretvori svakog gosta u promotera.
      </>
    ),
  },
];

function HeroAnimationPlayer({
  service,
  paused,
  reducedMotion,
  onCycleBoundary,
}: {
  service: HeroService;
  paused: boolean;
  reducedMotion: boolean;
  onCycleBoundary: () => "repeat" | "switch";
}) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      aria-hidden={!isPresent}
      className="pointer-events-none absolute inset-0"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.28,
        ease: "linear",
      }}
    >
      {service === "links" ? (
        <HeroLinksAnimation
          active
          paused={paused}
          onCycleBoundary={onCycleBoundary}
        />
      ) : (
        <HeroOutcomeAnimation
          active={isPresent}
          paused={paused}
          onCycleBoundary={onCycleBoundary}
        />
      )}
    </motion.div>
  );
}

export function HeroIntro() {
  const reduce = useReducedMotion();
  const [activeService, setActiveService] = useState<HeroService>("links");
  const [selectorHovered, setSelectorHovered] = useState(false);
  const [selectorFocused, setSelectorFocused] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [completedCycles, setCompletedCycles] = useState(0);
  const animationPaused = selectorHovered || selectorFocused;

  const enter = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  const reachServiceCycleBoundary = useCallback(
    (service: HeroService) => {
      const result = getHeroCarouselCycleAction({
        autoplayEnabled,
        completedCycles,
      });

      setCompletedCycles(result.completedCycles);
      if (result.action === "switch") {
        setActiveService((current) =>
          current === service ? (service === "links" ? "review" : "links") : current,
        );
      }

      return result.action;
    },
    [autoplayEnabled, completedCycles],
  );

  return (
    <div className="relative z-10 flex min-h-[100dvh] items-center py-24 sm:py-28 lg:py-24">
      <div className="section-shell">
        <div className="grid items-center gap-x-12 gap-y-9 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-5 xl:gap-x-16">
          <motion.div
            {...enter(0.12)}
            aria-label="Izaberite ScanMe uslugu"
            role="group"
            className="order-1 flex w-full items-center gap-7 lg:col-start-2 lg:row-start-1 lg:justify-self-end"
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setSelectorFocused(false);
              }
            }}
            onFocusCapture={() => setSelectorFocused(true)}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setSelectorHovered(true);
            }}
            onPointerLeave={() => setSelectorHovered(false)}
          >
            {services.map((service) => {
              const active = service.id === activeService;

              return (
                <button
                  key={service.id}
                  type="button"
                  aria-pressed={active}
                  className={`focus-signal relative min-h-11 py-2 font-mono text-xs uppercase tracking-[0.14em] transition-colors duration-300 sm:text-sm ${
                    active
                      ? "font-bold text-foreground"
                      : "font-medium text-foreground/60 hover:text-foreground/78"
                  }`}
                  onClick={() => {
                    setSelectorHovered(false);
                    setAutoplayEnabled(false);
                    setCompletedCycles(0);
                    if (!active) setActiveService(service.id);
                  }}
                  onPointerUp={(event) => event.currentTarget.blur()}
                >
                  {service.label}
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-px bg-accent"
                    initial={false}
                    animate={{ opacity: active ? 1 : 0 }}
                    transition={{
                      duration: reduce ? 0 : 0.2,
                      ease: "linear",
                    }}
                  />
                </button>
              );
            })}
          </motion.div>

          <div className="order-2 max-w-4xl lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:justify-self-start">
            <motion.div {...enter(0.05)} className="grid">
              {services.map((service) => {
                const active = service.id === activeService;

                return (
                  <motion.div
                    key={service.id}
                    aria-hidden={!active}
                    className={`[grid-area:1/1] ${
                      active ? "" : "pointer-events-none select-none"
                    }`}
                    animate={{
                      opacity: active ? 1 : 0,
                    }}
                    initial={false}
                    transition={{
                      duration: reduce ? 0 : 0.28,
                      ease: "linear",
                    }}
                  >
                    <p className="mb-5 font-mono text-sm font-semibold uppercase tracking-[0.14em] text-accent-readable sm:text-base">
                      {service.label}
                    </p>
                    <h1
                      className={`font-semibold leading-[0.88] tracking-[-0.075em] text-foreground ${
                        service.id === "links"
                          ? "max-w-[15ch] text-[clamp(3.25rem,5vw,5rem)]"
                          : "max-w-[13ch] text-[clamp(3.25rem,5vw,7.5rem)]"
                      }`}
                    >
                      {service.headline}
                    </h1>
                    <p className="mt-6 max-w-[58ch] text-base leading-7 text-foreground/76 sm:text-lg">
                      {service.body}
                    </p>
                  </motion.div>
                );
              })}
            </motion.div>

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
            className="relative order-3 mx-auto aspect-square w-full max-w-[20rem] sm:max-w-[24rem] lg:col-start-2 lg:row-start-2 lg:mx-0 lg:max-w-[38rem] lg:justify-self-end"
          >
            <AnimatePresence initial={false}>
              <HeroAnimationPlayer
                key={activeService}
                service={activeService}
                paused={animationPaused}
                reducedMotion={Boolean(reduce)}
                onCycleBoundary={() => reachServiceCycleBoundary(activeService)}
              />
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
