"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { MousePointer2, Plus, Store } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import { TemplateIcon } from "@/components/scanme-links/template-icon";
import styles from "@/components/hero-links-animation.module.css";
import {
  appendHeroQrScanSequence,
  HeroQrScanScene,
  QR_GLOW_BAND_HEIGHT,
  resetHeroQrScan,
  resolveHeroQrScanElements,
} from "@/components/hero-qr-scan-scene";
import {
  type HeroCarouselCycleAction,
  isHeroAnimationVisible,
  shouldPlayHeroAnimation,
} from "@/lib/hero-animation-playback";

type HeroLinksAnimationProps = {
  active?: boolean;
  paused?: boolean;
  onCycleBoundary?: () => HeroCarouselCycleAction;
};

type CounterElements = {
  instagram: HTMLSpanElement;
  facebook: HTMLSpanElement;
  website: HTMLSpanElement;
};

function AnimatedLinkCard({
  cardRef,
  countRef,
  popRef,
  iconKey,
  label,
  initialCount,
  positionClass,
}: {
  cardRef: RefObject<HTMLDivElement | null>;
  countRef: RefObject<HTMLSpanElement | null>;
  popRef: RefObject<HTMLSpanElement | null>;
  iconKey: string;
  label: string;
  initialCount: number;
  positionClass: string;
}) {
  return (
    <div
      ref={cardRef}
      data-links-card={iconKey}
      className={`absolute left-[9%] right-[9%] flex h-[11.5%] items-center gap-[clamp(0.32rem,1.6cqi,0.62rem)] rounded-[clamp(0.65rem,3.2cqi,1.35rem)] border px-[clamp(0.42rem,2.2cqi,0.82rem)] backdrop-blur-[8px] ${styles.card} ${positionClass}`}
    >
      <span aria-hidden="true" data-click-hit className={styles.hitSignal} />
      <span className={`grid size-[clamp(1.15rem,5.4cqi,2rem)] shrink-0 place-items-center rounded-full border ${styles.icon}`}>
        <TemplateIcon
          iconKey={iconKey}
          className="size-[clamp(0.62rem,2.8cqi,1.05rem)]"
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-[clamp(0.54rem,2.35cqi,0.82rem)] font-semibold tracking-[-0.03em]">
        {label}
      </span>
      <span className="relative w-[clamp(2.15rem,10cqi,3.75rem)] shrink-0 text-right">
        <span
          ref={countRef}
          data-link-click-count
          className={`inline-block whitespace-nowrap text-[clamp(0.72rem,3.25cqi,1.18rem)] font-semibold leading-none tracking-[-0.06em] tabular-nums ${styles.accent}`}
        >
          {initialCount}
        </span>
        <span
          ref={popRef}
          data-click-pop
          className={`invisible pointer-events-none absolute -right-[3%] -top-[clamp(0.8rem,3.8cqi,1.4rem)] whitespace-nowrap text-[clamp(0.35rem,1.45cqi,0.53rem)] font-semibold uppercase tracking-[0.08em] ${styles.accent}`}
          style={{ opacity: 0 }}
        >
          +1 klik
        </span>
      </span>
    </div>
  );
}

export function HeroLinksAnimation({
  active = true,
  paused = false,
  onCycleBoundary,
}: HeroLinksAnimationProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const qrMarkRef = useRef<HTMLSpanElement>(null);
  const qrColorRevealRef = useRef<HTMLSpanElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const instagramCardRef = useRef<HTMLDivElement>(null);
  const facebookCardRef = useRef<HTMLDivElement>(null);
  const websiteCardRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const touchRippleRef = useRef<HTMLSpanElement>(null);
  const instagramCountRef = useRef<HTMLSpanElement>(null);
  const facebookCountRef = useRef<HTMLSpanElement>(null);
  const websiteCountRef = useRef<HTMLSpanElement>(null);
  const instagramPopRef = useRef<HTMLSpanElement>(null);
  const facebookPopRef = useRef<HTMLSpanElement>(null);
  const websitePopRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const visibleRef = useRef(false);
  const cycleActionRef = useRef<HeroCarouselCycleAction>("repeat");
  const onCycleBoundaryRef = useRef(onCycleBoundary);
  const syncPlaybackRef = useRef<() => void>(() => undefined);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    onCycleBoundaryRef.current = onCycleBoundary;
  }, [onCycleBoundary]);

  useLayoutEffect(() => {
    const wasActive = activeRef.current;
    activeRef.current = active;
    pausedRef.current = paused;

    if (active && !wasActive) {
      timelineRef.current?.restart();
    }

    syncPlaybackRef.current();
  }, [active, paused]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const qrElements = root ? resolveHeroQrScanElements(root) : null;
    const qrMark = qrMarkRef.current;
    const qrColorReveal = qrColorRevealRef.current;
    const phone = phoneRef.current;
    const identity = identityRef.current;
    const instagramCard = instagramCardRef.current;
    const facebookCard = facebookCardRef.current;
    const websiteCard = websiteCardRef.current;
    const instagramHit = instagramCard?.querySelector<HTMLSpanElement>("[data-click-hit]");
    const facebookHit = facebookCard?.querySelector<HTMLSpanElement>("[data-click-hit]");
    const websiteHit = websiteCard?.querySelector<HTMLSpanElement>("[data-click-hit]");
    const addButton = addButtonRef.current;
    const cursor = cursorRef.current;
    const touchRipple = touchRippleRef.current;
    const instagramPop = instagramPopRef.current;
    const facebookPop = facebookPopRef.current;
    const websitePop = websitePopRef.current;
    const counters: CounterElements | null =
      instagramCountRef.current &&
      facebookCountRef.current &&
      websiteCountRef.current
        ? {
            instagram: instagramCountRef.current,
            facebook: facebookCountRef.current,
            website: websiteCountRef.current,
          }
        : null;

    if (
      !root ||
      !qrElements ||
      !qrMark ||
      !qrColorReveal ||
      !phone ||
      !identity ||
      !instagramCard ||
      !facebookCard ||
      !websiteCard ||
      !instagramHit ||
      !facebookHit ||
      !websiteHit ||
      !addButton ||
      !cursor ||
      !touchRipple ||
      !instagramPop ||
      !facebookPop ||
      !websitePop ||
      !counters
    ) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityHandler: (() => void) | null = null;

    const context = gsap.context(() => {
      const instagramProgress = { value: 0 };
      const facebookProgress = { value: 0 };
      const websiteProgress = { value: 0 };
      const formatter = new Intl.NumberFormat("sr-RS");
      const counterGrowthEnd = 12.86;
      const resetStart = 12.92;
      const counterExitGrowthEnd = resetStart + 0.38;
      const gentleGrowthEase = (progress: number) =>
        0.42 * progress + 0.58 * progress * progress;

      const addStep = () => phone.clientHeight * 0.14;
      const centerInRoot = (element: Element) => {
        const rootBox = root.getBoundingClientRect();
        const elementBox = element.getBoundingClientRect();
        return {
          x:
            elementBox.left +
            elementBox.width / 2 -
            rootBox.left -
            root.clientLeft,
          y:
            elementBox.top +
            elementBox.height / 2 -
            rootBox.top -
            root.clientTop,
        };
      };
      const cursorX = () => centerInRoot(addButton).x;
      const cursorY = () => centerInRoot(addButton).y;

      const renderCounters = () => {
        const instagram = 18 + Math.floor(instagramProgress.value * 114);
        const facebook = Math.floor(facebookProgress.value * 61);
        const website = Math.floor(websiteProgress.value * 26);

        counters.instagram.textContent = formatter.format(instagram);
        counters.facebook.textContent = formatter.format(facebook);
        counters.website.textContent = formatter.format(website);
        root.dataset.instagramClicks = String(instagram);
        root.dataset.facebookClicks = String(facebook);
        root.dataset.websiteClicks = String(website);
      };

      const setPhase = (phase: string) => {
        root.dataset.heroLinksPhase = phase;
      };

      const resetClickPop = (element: HTMLSpanElement) => {
        gsap.set(element, { autoAlpha: 0, y: 0, scale: 0.92 });
      };

      const addClickPop = (
        timeline: gsap.core.Timeline,
        hitSignal: HTMLSpanElement,
        element: HTMLSpanElement,
        at: number,
      ) => {
        timeline
          .set(element, { autoAlpha: 0, y: 3, scale: 0.94 }, at)
          .to(
            element,
            { autoAlpha: 1, y: -2, scale: 1, duration: 0.09, ease: "power3.out" },
            at,
          )
          .to(
            element,
            { autoAlpha: 0, y: -11, duration: 0.31, ease: "power2.out" },
            at + 0.11,
          )
          .to(
            hitSignal,
            {
              opacity: 1,
              duration: 0.18,
              ease: "power2.out",
            },
            at,
          )
          .to(
            hitSignal,
            {
              opacity: 0,
              duration: 0.42,
              ease: "power2.out",
            },
            at + 0.2,
          );
      };

      const addTap = (timeline: gsap.core.Timeline, at: number) => {
        timeline
          .to(
            cursor,
            { scale: 0.86, duration: 0.08, ease: "power1.out" },
            at,
          )
          .to(
            cursor,
            { scale: 1, duration: 0.13, ease: "power2.out" },
            at + 0.08,
          )
          .set(touchRipple, { autoAlpha: 0.7, scale: 0.45 }, at)
          .to(
            touchRipple,
            { autoAlpha: 0, scale: 1.35, duration: 0.36, ease: "power2.out" },
            at,
          );
      };

      const instagramClick = {
        hitSignal: instagramHit,
        pop: instagramPop,
      };
      const facebookClick = {
        hitSignal: facebookHit,
        pop: facebookPop,
      };
      const websiteClick = {
        hitSignal: websiteHit,
        pop: websitePop,
      };
      const createOrganicClickTimeline = () => {
        const clickTimeline = gsap.timeline();
        const organicTime = (base: number, variance: number) =>
          Number((base + (Math.random() * 2 - 1) * variance).toFixed(3));
        const lateClicks = gsap.utils.shuffle([
          websiteClick,
          instagramClick,
          facebookClick,
          instagramClick,
          websiteClick,
          facebookClick,
          instagramClick,
          facebookClick,
          websiteClick,
          instagramClick,
        ]);
        const schedule = [
          { at: organicTime(3.36, 0.04), target: instagramClick },
          { at: organicTime(7.78, 0.04), target: lateClicks[0] },
          { at: organicTime(8.6, 0.04), target: lateClicks[1] },
          { at: organicTime(9.32, 0.035), target: lateClicks[2] },
          { at: organicTime(9.96, 0.03), target: lateClicks[3] },
          { at: organicTime(10.52, 0.025), target: lateClicks[4] },
          { at: organicTime(11, 0.02), target: lateClicks[5] },
          { at: organicTime(11.42, 0.018), target: lateClicks[6] },
          { at: organicTime(11.79, 0.015), target: lateClicks[7] },
          { at: organicTime(12.12, 0.012), target: lateClicks[8] },
          { at: organicTime(12.42, 0.01), target: lateClicks[9] },
        ];

        schedule.forEach(({ at, target }) => {
          addClickPop(clickTimeline, target.hitSignal, target.pop, at);
        });

        return clickTimeline;
      };

      resetHeroQrScan(qrElements);
      gsap.set(qrColorReveal, {
        autoAlpha: 0,
        clipPath: "inset(0 0 100% 0)",
      });
      gsap.set(phone, { autoAlpha: 0, y: 14, scale: 0.975 });
      gsap.set(identity, { autoAlpha: 0, y: 6 });
      gsap.set(instagramCard, { autoAlpha: 0, y: 8 });
      gsap.set([facebookCard, websiteCard], { autoAlpha: 0, y: 9 });
      gsap.set(addButton, { autoAlpha: 0, y: 6 });
      gsap.set(cursor, { autoAlpha: 0, x: 0, y: 0, scale: 1 });
      gsap.set(touchRipple, { autoAlpha: 0, scale: 0.45 });
      resetClickPop(instagramPop);
      resetClickPop(facebookPop);
      resetClickPop(websitePop);
      gsap.set([instagramHit, facebookHit, websiteHit], { opacity: 0 });
      renderCounters();

      if (reduceMotion) {
        setPhase("links");
        instagramProgress.value = 1;
        facebookProgress.value = 1;
        websiteProgress.value = 1;
        renderCounters();
        gsap.set(qrElements.scene, { autoAlpha: 0 });
        gsap.set(phone, { autoAlpha: 1, y: 0, scale: 1 });
        gsap.set([identity, instagramCard, facebookCard, websiteCard], {
          autoAlpha: 1,
          y: 0,
        });
        gsap.set(addButton, { autoAlpha: 1, y: () => addStep() * 2 });
        return;
      }

      let organicClickTimeline: gsap.core.Timeline | null = null;
      const timeline = gsap.timeline({
        paused: true,
        defaults: { overwrite: "auto" },
        onComplete: () => {
          if (activeRef.current && cycleActionRef.current === "repeat") {
            if (organicClickTimeline) {
              timeline.remove(organicClickTimeline);
              organicClickTimeline.kill();
            }
            organicClickTimeline = createOrganicClickTimeline();
            timeline.add(organicClickTimeline, 0);
            gsap.set(qrColorReveal, {
              autoAlpha: 0,
              clipPath: "inset(0 0 100% 0)",
            });
            timeline.restart();
            syncPlaybackRef.current();
          }
        },
      });
      timelineRef.current = timeline;

      timeline.call(() => {
        cycleActionRef.current = "repeat";
        setPhase("qr");
        instagramProgress.value = 0;
        facebookProgress.value = 0;
        websiteProgress.value = 0;
        renderCounters();
        resetHeroQrScan(qrElements);
        gsap.set(qrColorReveal, {
          autoAlpha: 0,
          clipPath: "inset(0 0 100% 0)",
        });
        gsap.set(phone, { autoAlpha: 0, y: 14, scale: 0.975 });
        gsap.set(identity, { autoAlpha: 0, y: 6 });
        gsap.set(instagramCard, { autoAlpha: 0, y: 8 });
        gsap.set([facebookCard, websiteCard], { autoAlpha: 0, y: 9 });
        gsap.set(addButton, { autoAlpha: 0, y: 6 });
        gsap.set(cursor, { autoAlpha: 0, x: 0, y: 0, scale: 1 });
        gsap.set(touchRipple, { autoAlpha: 0, scale: 0.45 });
        resetClickPop(instagramPop);
        resetClickPop(facebookPop);
        resetClickPop(websitePop);
        gsap.set([instagramHit, facebookHit, websiteHit], { opacity: 0 });
      }, [], 0);

      appendHeroQrScanSequence({
        timeline,
        elements: qrElements,
        onProgress: (_progress, lineCenterY) => {
          const markBox = qrMark.getBoundingClientRect();
          const markProgress = gsap.utils.clamp(
            0,
            1,
            (lineCenterY - markBox.top) / Math.max(1, markBox.height),
          );
          gsap.set(qrColorReveal, {
            clipPath: `inset(0 0 ${(1 - markProgress) * 100}% 0)`,
          });
        },
      });
      timeline
        .set(qrColorReveal, { autoAlpha: 1 }, 0.34);

      timeline
        .call(() => setPhase("links"), [], 2.65)
        .set(
          [identity, instagramCard, addButton],
          { autoAlpha: 1, y: 0 },
          2.65,
        )
        .to(
          phone,
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.85,
            ease: "power3.out",
          },
          2.65,
        )
        .to(
          instagramProgress,
          {
            value: 1,
            duration: counterGrowthEnd - 3.12,
            ease: gentleGrowthEase,
            onUpdate: renderCounters,
          },
          3.12,
        )
        .set(
          cursor,
          {
            autoAlpha: 0,
            x: cursorX,
            y: () => cursorY() - phone.clientHeight * 0.035,
            scale: 0.98,
          },
          4.02,
        )
        .to(
          cursor,
          {
            autoAlpha: 0.9,
            y: cursorY,
            scale: 1,
            duration: 0.5,
            ease: "power2.out",
          },
          4.05,
        )
        .call(() => setPhase("add-facebook"), [], 4.65);

      addTap(timeline, 4.65);

      timeline
        .to(
          addButton,
          { y: addStep, duration: 0.32, ease: "power2.inOut" },
          4.72,
        )
        .to(
          facebookCard,
          { autoAlpha: 1, y: 0, duration: 0.42, ease: "power3.out" },
          4.96,
        )
        .to(
          facebookProgress,
          {
            value: 1,
            duration: counterGrowthEnd - 5.13,
            ease: gentleGrowthEase,
            onUpdate: renderCounters,
          },
          5.13,
        )
        .to(
          cursor,
          {
            x: cursorX,
            y: cursorY,
            duration: 0.48,
            ease: "power2.inOut",
          },
          5.48,
        )
        .call(() => setPhase("add-website"), [], 6.1);

      addTap(timeline, 6.1);

      timeline
        .to(
          addButton,
          { y: () => addStep() * 2, duration: 0.32, ease: "power2.inOut" },
          6.17,
        )
        .to(
          websiteCard,
          { autoAlpha: 1, y: 0, duration: 0.42, ease: "power3.out" },
          6.4,
        )
        .to(
          websiteProgress,
          {
            value: 1,
            duration: counterGrowthEnd - 6.62,
            ease: gentleGrowthEase,
            onUpdate: renderCounters,
          },
          6.62,
        )
        .to(
          cursor,
          {
            x: cursorX,
            y: cursorY,
            duration: 0.42,
            ease: "power2.inOut",
          },
          6.5,
        )
        .to(
          cursor,
          {
            autoAlpha: 0,
            y: "+=5",
            duration: 0.3,
            ease: "power1.out",
          },
          7.28,
        )
        .call(() => setPhase("growth"), [], 7.05);

      organicClickTimeline = createOrganicClickTimeline();
      timeline.add(organicClickTimeline, 0);

      timeline
        .to(
          [instagramProgress, facebookProgress, websiteProgress],
          {
            value: 1.08,
            duration: counterExitGrowthEnd - counterGrowthEnd,
            ease: "none",
            onUpdate: renderCounters,
          },
          counterGrowthEnd,
        )
        .call(() => {
          const action = onCycleBoundaryRef.current?.() ?? "repeat";
          cycleActionRef.current = action;
          if (action === "switch") {
            setPhase("switch-ready");
          } else {
            setPhase("reset");
          }
        }, [], resetStart)
        .to(
          phone,
          { autoAlpha: 0, y: -8, duration: 0.34, ease: "power2.in" },
          resetStart + 0.02,
        )
        .set(
          qrElements.glowBand,
          { attr: { y: -QR_GLOW_BAND_HEIGHT } },
          resetStart + 0.12,
        )
        .set(qrElements.glowGroup, { autoAlpha: 0 }, resetStart + 0.12)
        .set(
          qrColorReveal,
          { autoAlpha: 0, clipPath: "inset(0 0 100% 0)" },
          resetStart + 0.12,
        )
        .to(
          qrElements.scene,
          { autoAlpha: 1, y: 0, duration: 0.27, ease: "power2.out" },
          resetStart + 0.16,
        )
        .set(cursor, { autoAlpha: 0 }, resetStart + 0.4)
        .call(() => undefined, [], resetStart + 0.48);

      const syncPlayback = () => {
        if (shouldPlayHeroAnimation({
          active: activeRef.current,
          visible: visibleRef.current,
          paused: pausedRef.current,
          documentHidden: document.hidden,
        })) {
          timeline.play();
        } else {
          timeline.pause();
        }
      };
      syncPlaybackRef.current = syncPlayback;

      visibleRef.current = isHeroAnimationVisible(
        root.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight,
      );
      syncPlayback();

      observer = new IntersectionObserver(
        ([entry]) => {
          visibleRef.current = entry.isIntersecting;
          syncPlayback();
        },
        { threshold: 0.12 },
      );
      resizeObserver = new ResizeObserver(() => timeline.invalidate());
      visibilityHandler = syncPlayback;

      observer.observe(root);
      resizeObserver.observe(root);
      document.addEventListener("visibilitychange", visibilityHandler);
    }, root);

    return () => {
      timelineRef.current = null;
      syncPlaybackRef.current = () => undefined;
      visibleRef.current = false;
      observer?.disconnect();
      resizeObserver?.disconnect();
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      context.revert();
    };
  }, [reduceMotion]);

  return (
    <div
      ref={rootRef}
      data-hero-links-animation
      data-hero-links-phase="qr"
      data-instagram-clicks="18"
      data-facebook-clicks="0"
      data-website-clicks="0"
      className={`relative aspect-square w-full select-none overflow-hidden border border-foreground/14 bg-card [container-type:inline-size] ${styles.root}`}
      style={{ WebkitUserSelect: "none" }}
      aria-hidden="true"
    >
      <div className="scan-frame pointer-events-none absolute inset-[clamp(0.65rem,3.2cqi,1.25rem)] z-40">
        <i />
        <i />
        <i />
        <i />
      </div>

      <HeroQrScanScene
        center={
          <span ref={qrMarkRef} className="relative block size-full">
            <Store
              aria-hidden="true"
              className="absolute inset-0 size-full text-[#5d625c]"
              strokeWidth={1.55}
            />
            <span
              ref={qrColorRevealRef}
              data-qr-center-color
              className={`absolute inset-0 block size-full overflow-hidden ${styles.accent}`}
              style={{
                clipPath: "inset(0 0 100% 0)",
                opacity: 0,
                visibility: "hidden",
              }}
            >
              <Store aria-hidden="true" className="size-full" strokeWidth={1.55} />
            </span>
          </span>
        }
      />

      <div
        ref={phoneRef}
        data-links-phone
        className={`invisible absolute bottom-[7%] left-1/2 top-[7%] z-20 w-[57%] -translate-x-1/2 overflow-hidden rounded-[clamp(1.35rem,6.8cqi,3rem)] border-[clamp(0.28rem,1.4cqi,0.58rem)] border-[#151815] shadow-[0_18px_45px_rgba(0,0,0,0.2)] ${styles.phone}`}
        style={{ opacity: 0 }}
      >
        <div className={`absolute inset-0 ${styles.phoneSurface}`} />

        <div className="absolute left-1/2 top-[4.5%] h-[3.6%] w-[24%] -translate-x-1/2 rounded-full bg-[#151815]" />

        <div
          ref={identityRef}
          className="invisible absolute inset-x-[9%] top-[11%] grid place-items-center text-center"
          style={{ opacity: 0 }}
        >
          <span className={`grid size-[clamp(1.6rem,7.7cqi,2.85rem)] place-items-center rounded-full border shadow-[0_8px_22px_rgba(0,0,0,0.06)] ${styles.identityMark}`}>
            <Store
              aria-hidden="true"
              className="size-[48%]"
              strokeWidth={1.55}
            />
          </span>
          <span className="mt-[clamp(0.3rem,1.5cqi,0.58rem)] text-[clamp(0.62rem,2.7cqi,0.96rem)] font-semibold tracking-[-0.04em]">
            Vaš lokal
          </span>
          <span className={`mt-[clamp(0.18rem,0.8cqi,0.3rem)] h-px w-[42%] opacity-25 ${styles.accentBackground}`} />
        </div>

        <AnimatedLinkCard
          cardRef={instagramCardRef}
          countRef={instagramCountRef}
          popRef={instagramPopRef}
          iconKey="instagram"
          label="Instagram"
          initialCount={18}
          positionClass="top-[39%]"
        />
        <AnimatedLinkCard
          cardRef={facebookCardRef}
          countRef={facebookCountRef}
          popRef={facebookPopRef}
          iconKey="facebook"
          label="Facebook"
          initialCount={0}
          positionClass="top-[53%]"
        />
        <AnimatedLinkCard
          cardRef={websiteCardRef}
          countRef={websiteCountRef}
          popRef={websitePopRef}
          iconKey="globe"
          label="Website"
          initialCount={0}
          positionClass="top-[67%]"
        />

        <div
          ref={addButtonRef}
          data-add-link-button
          className={`absolute left-[9%] right-[9%] top-[53.8%] flex h-[9.5%] items-center justify-center gap-[clamp(0.22rem,1.1cqi,0.42rem)] rounded-[clamp(0.55rem,2.8cqi,1.1rem)] border border-dashed text-[clamp(0.45rem,1.95cqi,0.7rem)] font-medium ${styles.addButton}`}
        >
          <Plus
            aria-hidden="true"
            className="size-[clamp(0.58rem,2.4cqi,0.86rem)]"
            strokeWidth={1.65}
          />
          Dodaj novi link
          <span
            ref={touchRippleRef}
            className={`absolute left-1/2 top-1/2 size-[clamp(1.1rem,5cqi,1.8rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border sm:hidden ${styles.accent}`}
            style={{ opacity: 0 }}
          />
        </div>

        <span className={`absolute bottom-[2.7%] left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(0.32rem,1.45cqi,0.5rem)] font-medium ${styles.muted}`}>
          Powered by ScanMe
        </span>
      </div>

      <div
        ref={cursorRef}
        data-virtual-cursor
        className={`invisible pointer-events-none absolute left-0 top-0 z-30 hidden drop-shadow-[0_2px_3px_rgba(0,0,0,0.22)] sm:block ${styles.cursor}`}
        style={{ opacity: 0 }}
      >
        <MousePointer2
          aria-hidden="true"
          className="size-[clamp(0.9rem,3.8cqi,1.35rem)]"
          strokeWidth={1.7}
        />
      </div>
    </div>
  );
}
