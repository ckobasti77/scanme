"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { ExternalLink, QrCode, ScanLine, type LucideIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

export type HowItWorksStep = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const HOW_IT_WORKS_STEPS = [
  {
    id: "predmet",
    title: "Fizički ScanMe predmet",
    description:
      "Nalepnica, kartica ili stalak stoji tamo gde kupac već donosi odluku.",
    icon: QrCode,
  },
  {
    id: "skeniranje",
    title: "Kupac skenira",
    description:
      "Telefon otvara stabilnu ScanMe adresu bez dodatne aplikacije.",
    icon: ScanLine,
  },
  {
    id: "destinacija",
    title: "Otvara se prava destinacija",
    description:
      "ScanMe vodi gosta na odabranu stranicu, ponudu ili korisnu akciju.",
    icon: ExternalLink,
  },
] satisfies readonly HowItWorksStep[];

function StepFrameCorners() {
  return (
    <>
      <span className="absolute left-3 top-3 size-3 border-l border-t border-[var(--marketing-accent)]" />
      <span className="absolute right-3 top-3 size-3 border-r border-t border-[var(--marketing-accent)]" />
      <span className="absolute bottom-3 left-3 size-3 border-b border-l border-[var(--marketing-accent)]" />
      <span className="absolute bottom-3 right-3 size-3 border-b border-r border-[var(--marketing-accent)]" />
    </>
  );
}

export function HowItWorks() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [handoff, setHandoff] = useState({
    from: 0,
    to: 0,
    direction: 1,
    id: 0,
  });
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduceMotion = useReducedMotion();
  const activeStep = HOW_IT_WORKS_STEPS[activeIndex];
  const direction = handoff.direction;

  function selectStep(index: number, moveFocus = true) {
    if (index === activeIndex) return;

    setHandoff((current) => ({
      from: activeIndex,
      to: index,
      direction: index > activeIndex ? 1 : -1,
      id: current.id + 1,
    }));
    setActiveIndex(index);
    if (moveFocus) buttonRefs.current[index]?.focus();
  }

  function handleStepKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % HOW_IT_WORKS_STEPS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (index - 1 + HOW_IT_WORKS_STEPS.length) % HOW_IT_WORKS_STEPS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = HOW_IT_WORKS_STEPS.length - 1;
    }

    if (nextIndex === undefined) return;

    event.preventDefault();
    selectStep(nextIndex);
  }

  return (
    <section
      id="kako-radi"
      aria-labelledby="kako-radi-title"
      className="marketing-section section-shell border-t border-white/10 py-24 sm:py-32 lg:py-40"
    >
      <header>
        <p className="marketing-data text-sm font-medium text-[var(--marketing-accent)]">
          Kako radi
        </p>
        <h2
          id="kako-radi-title"
          className="mt-5 max-w-[26ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl"
        >
          Od fizičkog predmeta do korisne akcije.
        </h2>
      </header>

      <div className="mt-14 grid gap-12 lg:mt-18 lg:grid-cols-[minmax(15rem,0.62fr)_minmax(0,1.38fr)] lg:items-center lg:gap-16 xl:gap-24">
        <div
          aria-live="polite"
          aria-atomic="true"
          className="min-h-44 max-w-xl lg:min-h-52"
        >
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.div
              key={activeStep.id}
              custom={direction}
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, x: direction * 10, y: 4 }
              }
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: direction * -8, y: -2 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
              }
            >
              <p className="marketing-data text-xs text-[var(--marketing-muted)]">
                Korak {String(activeIndex + 1).padStart(2, "0")} / 03
              </p>
              <h3 className="mt-4 max-w-[18ch] text-2xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-3xl">
                {activeStep.title}
              </h3>
              <p className="mt-5 max-w-[46ch] text-base leading-7 text-[var(--marketing-muted)]">
                {activeStep.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div>
          <p id="kako-radi-uputstvo" className="sr-only">
            Izaberite korak klikom, tasterima sa strelicama ili tasterima Home i
            End.
          </p>
          <ol
            aria-label="ScanMe tok u tri koraka"
            aria-describedby="kako-radi-uputstvo"
            className="grid gap-0 md:grid-cols-3 md:gap-6 xl:gap-10"
          >
            {HOW_IT_WORKS_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeIndex;
              const isOutgoing =
                handoff.id > 0 && handoff.from === index && handoff.to !== index;
              const connectorIsInPath =
                handoff.id > 0 &&
                (direction > 0
                  ? index >= handoff.from && index < handoff.to
                  : index >= handoff.to && index < handoff.from);
              const connectorOrder =
                direction > 0
                  ? index - handoff.from
                  : handoff.from - 1 - index;
              const connectorDelay = 0.12 + Math.max(0, connectorOrder) * 0.1;
              const incomingClip =
                direction > 0 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)";
              const outgoingClip =
                direction > 0 ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
              const horizontalSignal =
                direction > 0
                  ? [
                      "inset(0 100% 0 0)",
                      "inset(0 0% 0 0)",
                      "inset(0 0% 0 100%)",
                    ]
                  : [
                      "inset(0 0 0 100%)",
                      "inset(0 0 0 0)",
                      "inset(0 100% 0 0)",
                    ];
              const verticalSignal =
                direction > 0
                  ? [
                      "inset(0 0 100% 0)",
                      "inset(0 0 0% 0)",
                      "inset(100% 0 0% 0)",
                    ]
                  : [
                      "inset(100% 0 0 0)",
                      "inset(0 0 0 0)",
                      "inset(0 0 100% 0)",
                    ];

              return (
                <li
                  key={step.id}
                  className="relative min-w-0 pb-10 last:pb-0 md:pb-0"
                >
                  <motion.button
                    ref={(node) => {
                      buttonRefs.current[index] = node;
                    }}
                    type="button"
                    aria-pressed={isActive}
                    aria-label={step.title}
                    onClick={() => selectStep(index, false)}
                    onKeyDown={(event) => handleStepKeyDown(event, index)}
                    animate={{ opacity: isActive || isOutgoing ? 1 : 0.72 }}
                    whileHover={reduceMotion ? undefined : { opacity: 1 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            duration: 0.2,
                            delay: isActive ? 0.38 : isOutgoing ? 0.3 : 0,
                            ease: [0.2, 0, 0, 1],
                          }
                    }
                    className="liquid-glass focus-signal group relative flex min-h-36 w-full items-center justify-center overflow-hidden rounded-[28px] border border-[var(--marketing-border)] p-5 text-left md:aspect-square md:min-h-0 sm:p-6"
                  >
                    <motion.span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[#c6ff4a]"
                      initial={false}
                      animate={{ opacity: isActive ? 0.11 : 0 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.18,
                              delay: isActive ? 0.42 : isOutgoing ? 0.3 : 0,
                              ease: [0.4, 0, 0.2, 1],
                            }
                      }
                    />

                    {isOutgoing && !reduceMotion ? (
                      <motion.span
                        key={`outgoing-${handoff.id}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-[var(--marketing-accent)]"
                        initial={{ clipPath: "inset(0 0 0 0)" }}
                        animate={{ clipPath: outgoingClip }}
                        transition={{
                          duration: 0.18,
                          ease: [0.3, 0, 1, 1],
                        }}
                      >
                        <StepFrameCorners />
                      </motion.span>
                    ) : null}

                    {isActive ? (
                      <motion.span
                        key={`incoming-${handoff.id}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-[var(--marketing-accent)] shadow-[0_0_0_1px_rgba(198,255,74,0.08),0_18px_48px_rgba(0,0,0,0.24)]"
                        initial={
                          reduceMotion || handoff.id === 0
                            ? false
                            : { clipPath: incomingClip }
                        }
                        animate={{ clipPath: "inset(0 0 0 0)" }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : {
                                duration: 0.32,
                                delay: 0.24,
                                ease: [0.16, 1, 0.3, 1],
                              }
                        }
                      >
                        <StepFrameCorners />
                      </motion.span>
                    ) : null}

                    <motion.span
                      aria-hidden="true"
                      className="relative z-20"
                      animate={{
                        color: isActive
                          ? "var(--marketing-accent)"
                          : "var(--marketing-muted)",
                      }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.18,
                              delay: isActive ? 0.42 : isOutgoing ? 0.3 : 0,
                            }
                      }
                    >
                      <Icon className="size-9 sm:size-10" strokeWidth={1.45} />
                    </motion.span>

                    <span
                      className={`relative z-20 ml-5 max-w-[18ch] text-sm font-semibold leading-5 tracking-[-0.025em] transition-colors md:sr-only ${
                        isActive
                          ? "text-[var(--marketing-text)]"
                          : "text-[var(--marketing-muted)]"
                      }`}
                    >
                      {step.title}
                    </span>

                    {index > 0 ? (
                      <motion.span
                        aria-hidden="true"
                        className="absolute left-[-3px] top-1/2 z-20 size-[5px] -translate-y-1/2 border border-[var(--marketing-border)]"
                        animate={{
                          backgroundColor: isActive
                            ? "var(--marketing-accent)"
                            : "transparent",
                          borderColor: isActive
                            ? "var(--marketing-accent)"
                            : "var(--marketing-border)",
                        }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { duration: 0.12, delay: isActive ? 0.3 : 0.1 }
                        }
                      />
                    ) : null}

                    {index < HOW_IT_WORKS_STEPS.length - 1 ? (
                      <motion.span
                        aria-hidden="true"
                        className="absolute right-[-3px] top-1/2 z-20 size-[5px] -translate-y-1/2 border border-[var(--marketing-border)]"
                        animate={{
                          backgroundColor: isActive
                            ? "var(--marketing-accent)"
                            : "transparent",
                          borderColor: isActive
                            ? "var(--marketing-accent)"
                            : "var(--marketing-border)",
                        }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { duration: 0.12, delay: isActive ? 0.3 : 0.1 }
                        }
                      />
                    ) : null}
                  </motion.button>

                  {index < HOW_IT_WORKS_STEPS.length - 1 ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-1/2 h-10 w-px -translate-x-1/2 overflow-hidden bg-[var(--marketing-border)] md:hidden"
                      >
                        <AnimatePresence initial={false}>
                          {connectorIsInPath && !reduceMotion ? (
                            <motion.span
                              key={`vertical-signal-${handoff.id}`}
                              className="absolute inset-0 bg-[#c6ff4a]"
                              initial={{ clipPath: verticalSignal[0] }}
                              animate={{ clipPath: verticalSignal }}
                              transition={{
                                duration: 0.3,
                                delay: connectorDelay,
                                times: [0, 0.55, 1],
                                ease: [0.4, 0, 0.2, 1],
                              }}
                            />
                          ) : null}
                        </AnimatePresence>
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute left-full top-1/2 hidden h-px w-6 -translate-y-1/2 overflow-hidden bg-[var(--marketing-border)] md:block xl:w-10"
                      >
                        <AnimatePresence initial={false}>
                          {connectorIsInPath && !reduceMotion ? (
                            <motion.span
                              key={`horizontal-signal-${handoff.id}`}
                              className="absolute inset-0 bg-[#c6ff4a]"
                              initial={{ clipPath: horizontalSignal[0] }}
                              animate={{ clipPath: horizontalSignal }}
                              transition={{
                                duration: 0.3,
                                delay: connectorDelay,
                                times: [0, 0.55, 1],
                                ease: [0.4, 0, 0.2, 1],
                              }}
                            />
                          ) : null}
                        </AnimatePresence>
                      </span>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
