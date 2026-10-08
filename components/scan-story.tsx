"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, QrCode, ScanLine } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import { decideScanStoryClick } from "@/lib/scan-story-transition";

const steps = [
  {
    title: "Fizički ScanMe predmet",
    body: "Nalepnica, kartica ili stalak stoji tamo gde kupac već donosi odluku.",
    icon: QrCode,
  },
  {
    title: "Kupac skenira",
    body: "Telefon otvara stabilnu ScanMe adresu bez dodatne aplikacije.",
    icon: ScanLine,
  },
  {
    title: "Otvara se prava destinacija",
    body: "Kupac stiže do Google recenzije, ponude ili rezervacije koju ste izabrali.",
    icon: ExternalLink,
  },
] as const;

type StoryNodeProps = {
  index: number;
  activeIndex: number;
  attentionActive: boolean;
  panelId: string;
  mobile?: boolean;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
};

type SignalConnectorProps = {
  index: number;
  attentionActive: boolean;
  vertical?: boolean;
  reducedMotion: boolean;
};

type SignalDirection = "forward" | "backward";
type SignalLinkIndex = 0 | 1;

function getSignalLength(target: unknown) {
  const element = target as SVGElement;
  return Number(element.dataset.signalLength) || 1;
}

// Dve polovine zelene ivice kartice, u pikselima, sa istim zaobljenjem kao
// kartica (radius + 1 px, jer overlay stoji 1 px izvan ivice). Desktop deli
// ivicu na gornju i donju polovinu (ulaz levo), mobilni na levu i desnu (ulaz gore).
function roundedBranchPaths(width: number, height: number, radius: number, vertical: boolean) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const w = width;
  const h = height;
  if (vertical) {
    return [
      `M ${w / 2} 0 L ${r} 0 A ${r} ${r} 0 0 0 0 ${r} L 0 ${h - r} A ${r} ${r} 0 0 0 ${r} ${h} L ${w / 2} ${h}`,
      `M ${w / 2} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} L ${w / 2} ${h}`,
    ];
  }
  return [
    `M 0 ${h / 2} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h / 2}`,
    `M 0 ${h / 2} L 0 ${h - r} A ${r} ${r} 0 0 0 ${r} ${h} L ${w - r} ${h} A ${r} ${r} 0 0 0 ${w} ${h - r} L ${w} ${h / 2}`,
  ];
}

function settleSignal(section: HTMLElement, index: number) {
  gsap.set(section.querySelectorAll("[data-signal-branch]"), {
    strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
  });
  gsap.set(section.querySelectorAll("[data-signal-link]"), {
    strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
  });
  gsap.set(section.querySelectorAll(`[data-signal-branch="${index}"]`), {
    strokeDashoffset: 0,
  });
}

export function ScanStory({
  title = "Od fizičkog predmeta do korisne akcije.",
  compact = false,
}: {
  title?: string;
  compact?: boolean;
} = {}) {
  const sectionRef = useRef<HTMLElement>(null);
  const hasPlayedIntroRef = useRef(false);
  const hasInteractedRef = useRef(false);
  const settledIndexRef = useRef(0);
  const transitionInFlightRef = useRef(false);
  const signalTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const reduce = Boolean(useReducedMotion());
  const [activeIndex, setActiveIndex] = useState(0);
  const [contentIndex, setContentIndex] = useState(0);
  const [attentionActive, setAttentionActive] = useState(false);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const measureSignal = () => {
      // Ivica kartice se crta u pikselima stvarne veličine, sa zaobljenim uglovima.
      section.querySelectorAll<SVGSVGElement>("[data-signal-node]").forEach((overlay) => {
        const { width, height } = overlay.getBoundingClientRect();
        const card = overlay.parentElement;
        if (width <= 0 || height <= 0 || !card) return;
        const radius = (parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0) + 1;
        const paths = roundedBranchPaths(width, height, radius, overlay.dataset.signalLayout === "mobile");
        overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
        overlay.querySelectorAll<SVGPathElement>("[data-signal-branch]").forEach((branch, position) => {
          branch.setAttribute("d", paths[position]);
        });
      });

      const signalElements = section.querySelectorAll<SVGGeometryElement>("[data-signal-branch], [data-signal-link]");

      signalElements.forEach((element) => {
        const matrix = element.getScreenCTM();
        if (!matrix) return;

        const horizontalScale = Math.hypot(matrix.a, matrix.b);
        const verticalScale = Math.hypot(matrix.c, matrix.d);
        const isBranch = element.hasAttribute("data-signal-branch");
        const axis = element.getAttribute("data-signal-axis");
        const length = isBranch
          ? element.getTotalLength() * horizontalScale
          : 100 * (axis === "vertical" ? verticalScale : horizontalScale);

        if (length <= 0) {
          gsap.set(element, { opacity: 0 });
          return;
        }

        element.dataset.signalLength = String(length);
        gsap.set(element, {
          opacity: 1,
          strokeDasharray: `${length} ${length}`,
        });
      });

      // Usred prelaza ivicu vodi timeline; ne vraćamo je na staru karticu.
      if (!transitionInFlightRef.current) settleSignal(section, settledIndexRef.current);
    };

    measureSignal();
    const resizeObserver = new ResizeObserver(measureSignal);
    resizeObserver.observe(section);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (reduce) return;

    const section = sectionRef.current;
    if (!section) return;

    const timers: number[] = [];
    const schedule = (callback: () => void, delay: number) => {
      timers.push(window.setTimeout(callback, delay));
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasPlayedIntroRef.current) return;

        hasPlayedIntroRef.current = true;
        observer.disconnect();

        const showReminder = () => {
          if (hasInteractedRef.current) return;

          setAttentionActive(true);
          schedule(() => {
            setAttentionActive(false);
            if (!hasInteractedRef.current) schedule(showReminder, 10_000);
          }, 1_200);
        };

        schedule(showReminder, 500);
      },
      { threshold: 0.38 },
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reduce]);

  useEffect(
    () => () => {
      signalTimelineRef.current?.kill();
    },
    [],
  );

  function runSignalTransition(section: HTMLElement, from: number, to: number) {
    transitionInFlightRef.current = true;
    settleSignal(section, from);

    const direction: SignalDirection = to > from ? "forward" : "backward";
    const step = direction === "forward" ? 1 : -1;
    const hopCount = Math.abs(to - from);
    const speed = hopCount > 1 ? 0.56 : 1;
    const timeline = gsap.timeline({
      defaults: { ease: "power1.inOut" },
      onComplete: () => {
        settleSignal(section, to);
        settledIndexRef.current = to;
        setActiveIndex(to);
        setContentIndex(to);
        signalTimelineRef.current = null;
        transitionInFlightRef.current = false;
      },
    });

    signalTimelineRef.current = timeline;

    let sourceIndex = from;

    for (let hop = 0; hop < hopCount; hop += 1) {
      const targetIndex = sourceIndex + step;
      const outgoingLinkIndex = Math.min(sourceIndex, targetIndex) as SignalLinkIndex;
      const sourceBorder = section.querySelectorAll(`[data-signal-branch="${sourceIndex}"]`);
      const targetBorder = section.querySelectorAll(`[data-signal-branch="${targetIndex}"]`);
      const outgoingLink = section.querySelectorAll(`[data-signal-link="${outgoingLinkIndex}"]`);

      if (hop === hopCount - 1) {
        timeline.call(() => setContentIndex(to));
      }

      if (direction === "forward") {
        timeline
          .to(sourceBorder, {
            strokeDashoffset: (_: number, target: unknown) => -getSignalLength(target),
            duration: 0.16 * speed,
          })
          .set(sourceBorder, {
            strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
          })
          .set(outgoingLink, {
            strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
          })
          .to(outgoingLink, { strokeDashoffset: 0, duration: 0.1 * speed });

        timeline
          .set(targetBorder, {
            strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
          })
          .to(targetBorder, { strokeDashoffset: 0, duration: 0.18 * speed, ease: "power1.out" })
          .to(
            outgoingLink,
            {
              strokeDashoffset: (_: number, target: unknown) => -getSignalLength(target),
              duration: 0.18 * speed,
            },
            "<",
          )
          .set(outgoingLink, {
            strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
          });
      } else {
        timeline
          .to(sourceBorder, {
            strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
            duration: 0.16 * speed,
          })
          .set(sourceBorder, {
            strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
          })
          .set(outgoingLink, {
            strokeDashoffset: (_: number, target: unknown) => -getSignalLength(target),
          })
          .to(outgoingLink, { strokeDashoffset: 0, duration: 0.1 * speed });

        timeline
          .set(targetBorder, {
            strokeDashoffset: (_: number, target: unknown) => -getSignalLength(target),
          })
          .to(targetBorder, { strokeDashoffset: 0, duration: 0.18 * speed, ease: "power1.out" })
          .to(
            outgoingLink,
            {
              strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
              duration: 0.18 * speed,
            },
            "<",
          )
          .set(outgoingLink, {
            strokeDashoffset: (_: number, target: unknown) => getSignalLength(target),
          });
      }

      sourceIndex = targetIndex;
    }
  }

  function selectStep(index: number) {
    const section = sectionRef.current;
    if (!section) return;

    const decision = decideScanStoryClick({
      activeIndex: settledIndexRef.current,
      targetIndex: index,
      transitionInFlight: transitionInFlightRef.current,
      reducedMotion: reduce,
    });
    if (decision === "ignore") return;

    hasInteractedRef.current = true;
    setAttentionActive(false);

    if (decision === "instant") {
      settledIndexRef.current = index;
      settleSignal(section, index);
      setActiveIndex(index);
      setContentIndex(index);
      return;
    }

    runSignalTransition(section, settledIndexRef.current, index);
  }

  return (
    <section
      ref={sectionRef}
      id="kako-radi"
      className="landing-glass-section relative border-y border-foreground/10"
    >
      <div
        data-reveal-group
        className={
          compact
            ? "mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:px-10 lg:py-16"
            : "mx-auto max-w-[1440px] px-4 py-24 sm:px-6 lg:px-10 lg:py-28"
        }
      >
        <h2
          className={
            compact
              ? "max-w-[22ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-5xl"
              : "max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl"
          }
        >
          {title}
        </h2>

        <div className={compact ? "mt-10 lg:hidden" : "mt-14 lg:hidden"}>
          <StoryPanel id="scan-story-panel-mobile" index={contentIndex} reducedMotion={reduce} mobile />

          <div className="mt-9" role="group" aria-label="Koraci ScanMe procesa">
            {steps.map((_, index) => (
              <div key={steps[index].title}>
                <StoryNode
                  index={index}
                  activeIndex={activeIndex}
                  attentionActive={attentionActive}
                  panelId="scan-story-panel-mobile"
                  mobile
                  reducedMotion={reduce}
                  onSelect={selectStep}
                />
                {index < steps.length - 1 ? (
                  <SignalConnector
                    index={index}
                    attentionActive={attentionActive}
                    vertical
                    reducedMotion={reduce}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div
          className={
            compact
              ? "mt-12 hidden grid-cols-[0.9fr_1.3fr] items-center gap-14 lg:grid"
              : "mt-20 hidden grid-cols-[0.9fr_1.3fr] items-center gap-20 lg:grid"
          }
        >
          <StoryPanel id="scan-story-panel-desktop" index={contentIndex} reducedMotion={reduce} />

          <div className="flex w-full items-center" role="group" aria-label="Koraci ScanMe procesa">
            {steps.map((_, index) => (
              <Fragment key={steps[index].title}>
                <StoryNode
                  index={index}
                  activeIndex={activeIndex}
                  attentionActive={attentionActive}
                  panelId="scan-story-panel-desktop"
                  reducedMotion={reduce}
                  onSelect={selectStep}
                />
                {index < steps.length - 1 ? (
                  <SignalConnector
                    index={index}
                    attentionActive={attentionActive}
                    reducedMotion={reduce}
                  />
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryPanel({ id, index, reducedMotion, mobile = false }: { id: string; index: number; reducedMotion: boolean; mobile?: boolean }) {
  const step = steps[index];

  return (
    <div id={id} data-reveal="off" className={mobile ? "min-h-36" : "relative min-h-56"} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.article
          key={step.title}
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
          transition={{ duration: reducedMotion ? 0 : 0.14, ease: [0.16, 1, 0.3, 1] }}
          className={mobile ? "border-l border-primary py-2 pl-5" : "absolute inset-0"}
        >
          <h3 className={mobile ? "max-w-[18ch] text-2xl font-semibold tracking-[-0.04em]" : "max-w-[16ch] text-3xl font-semibold tracking-[-0.05em] xl:text-4xl"}>
            {step.title}
          </h3>
          <p className={mobile ? "mt-3 max-w-[48ch] text-sm leading-6 text-foreground/62" : "mt-5 max-w-[48ch] leading-7 text-foreground/62"}>
            {step.body}
          </p>
        </motion.article>
      </AnimatePresence>
    </div>
  );
}

function StoryNode({ index, activeIndex, attentionActive, panelId, mobile = false, reducedMotion, onSelect }: StoryNodeProps) {
  const step = steps[index];
  const Icon = step.icon;
  const active = index === activeIndex;
  const attention = attentionActive && index > 0;
  const signalState = active
    ? "bg-primary/[0.08] text-accent-readable"
    : "bg-card text-accent-readable/55 hover:bg-primary/[0.04] hover:text-accent-readable";

  return (
    <motion.button
      type="button"
      aria-pressed={active}
      aria-controls={panelId}
      aria-label={step.title}
      onClick={() => onSelect(index)}
      className={`group relative cursor-pointer border border-foreground/20 transition-[background-color,color] duration-200 focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background ${signalState} ${mobile ? "flex min-h-16 w-full items-center gap-4 px-3 py-2 text-left" : "z-10 flex aspect-square min-w-0 flex-1 items-center justify-center"}`}
    >
      <SignalNodeOverlay index={index} mobile={mobile} />

      {index > 0 ? <SignalPort side={mobile ? "top" : "left"} active={active || attention} /> : null}
      {index < steps.length - 1 ? <SignalPort side={mobile ? "bottom" : "right"} active={active || attention} /> : null}

      <motion.span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-2 transition-opacity duration-300 group-hover:!opacity-100 group-focus-visible:!opacity-100 ${active || attention ? "opacity-100" : "opacity-0"}`}
        animate={attention && !reducedMotion ? { opacity: [0, 1, 0.72] } : { opacity: active ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : attention ? 0.78 : active ? 0.2 : 0.08, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="absolute left-0 top-0 size-3 border-l border-t border-primary" />
        <span className="absolute right-0 top-0 size-3 border-r border-t border-primary" />
        <span className="absolute bottom-0 left-0 size-3 border-b border-l border-primary" />
        <span className="absolute bottom-0 right-0 size-3 border-b border-r border-primary" />
      </motion.span>

      <span className={`${mobile ? "flex size-12 shrink-0 items-center justify-center rounded-[var(--button-radius)] border border-current/35" : "relative"}`}>
        <Icon aria-hidden="true" className={`${mobile ? "size-6" : "size-8 transition-transform duration-200 group-hover:scale-110 xl:size-10"}`} strokeWidth={1.35} />
      </span>
      {mobile ? <span className={`text-sm font-semibold transition-colors ${active ? "text-accent-readable" : "text-foreground/76"}`}>{step.title}</span> : <span className="sr-only">{step.title}</span>}
    </motion.button>
  );
}

function SignalNodeOverlay({ index, mobile }: { index: number; mobile: boolean }) {
  const branchPaths = mobile
    ? ["M 50 0 L 0 0 L 0 100 L 50 100", "M 50 0 L 100 0 L 100 100 L 50 100"]
    : ["M 0 50 L 0 0 L 100 0 L 100 50", "M 0 50 L 0 100 L 100 100 L 100 50"];

  return (
    <svg
      aria-hidden="true"
      data-signal-node={index}
      data-signal-layout={mobile ? "mobile" : "desktop"}
      className="pointer-events-none absolute inset-[-1px] z-20 h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {branchPaths.map((path) => (
        <path
          key={path}
          data-signal-branch={index}
          d={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.15"
          strokeLinecap="butt"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="1 1"
          strokeDashoffset="1"
          style={{ opacity: 0 }}
        />
      ))}
    </svg>
  );
}

function SignalPort({ side, active }: { side: "left" | "right" | "top" | "bottom"; active: boolean }) {
  const position = {
    left: "-left-[3px] top-1/2 -translate-y-1/2",
    right: "-right-[3px] top-1/2 -translate-y-1/2",
    top: "left-9 -top-[3px] -translate-x-1/2",
    bottom: "bottom-[-3px] left-9 -translate-x-1/2",
  }[side];

  return (
    <span
      aria-hidden="true"
      className={`absolute z-30 size-1.5 border bg-background transition-colors duration-200 ${position} ${active ? "border-primary bg-primary" : "border-foreground/30 group-hover:border-primary"}`}
    />
  );
}

function SignalConnector({ index, attentionActive, vertical = false, reducedMotion }: SignalConnectorProps) {
  if (vertical) {
    return (
      <svg
        aria-hidden="true"
        className="ml-[30px] block h-9 w-3 overflow-visible"
        viewBox="0 0 12 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`vertical-attention-gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="6" y1="0" x2="6" y2="100" stroke="var(--foreground)" strokeOpacity="0.18" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <AnimatePresence initial={false}>
          {attentionActive && !reducedMotion ? (
            <motion.rect
              key={`vertical-attention-${index}`}
              x="3"
              y="0"
              width="6"
              height="42"
              fill={`url(#vertical-attention-gradient-${index})`}
              initial={{ opacity: 0, attrY: 0 }}
              animate={{ opacity: [0, 0.8, 0.8, 0], attrY: [0, 58] }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.82, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null}
        </AnimatePresence>
        <SignalLine index={index} vertical />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="block h-3 w-16 shrink-0 overflow-visible xl:w-24"
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`horizontal-attention-gradient-${index}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="6" x2="100" y2="6" stroke="var(--foreground)" strokeOpacity="0.18" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <AnimatePresence initial={false}>
        {attentionActive && !reducedMotion ? (
          <motion.rect
            key={`horizontal-attention-${index}`}
            x="0"
            y="3"
            width="42"
            height="6"
            fill={`url(#horizontal-attention-gradient-${index})`}
            initial={{ opacity: 0, attrX: 0 }}
            animate={{ opacity: [0, 0.8, 0.8, 0], attrX: [0, 58] }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.82, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : null}
      </AnimatePresence>
      <SignalLine index={index} />
    </svg>
  );
}

function SignalLine({ index, vertical = false }: { index: number; vertical?: boolean }) {
  return (
    <line
      data-signal-link={index}
      data-signal-axis={vertical ? "vertical" : "horizontal"}
      x1={vertical ? "6" : "0"}
      y1={vertical ? "0" : "6"}
      x2={vertical ? "6" : "100"}
      y2={vertical ? "100" : "6"}
      stroke="var(--primary)"
      strokeWidth="2"
      strokeLinecap="butt"
      vectorEffect="non-scaling-stroke"
      strokeDasharray="1 1"
      strokeDashoffset="1"
      style={{ opacity: 0 }}
    />
  );
}
