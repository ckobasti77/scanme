"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, QrCode } from "lucide-react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { syncLiquidGlassSource } from "@/components/liquid-glass";
import { createScanStoryScene, type ScanStoryScene } from "@/components/scan-story-scene";
import { AUREA_METRICS, formatReviewCount } from "@/components/scan-story-data";
import type { MarketingTheme, ServiceId } from "@/lib/marketing-services";
import styles from "@/components/scan-story.module.css";

gsap.registerPlugin(ScrollTrigger);

const fallbackRestaurants = [
  [
    "Restoran Aurea",
    AUREA_METRICS.final.rating.toFixed(1),
    formatReviewCount(AUREA_METRICS.final.reviews),
    true,
  ],
  ["Bistro Sfera", "4.8", "812", false],
  ["Kesten 27", "4.7", "638", false],
  ["Mala Terasa", "4.7", "521", false],
  ["Atelje Ukusa", "4.6", "504", false],
  ["Kuća Nera", "4.5", "446", false],
] as const;

const fallbackDistribution = [
  ["5", "92%"],
  ["4", "66%"],
  ["3", "28%"],
  ["2", "12%"],
  ["1", "5%"],
] as const;

type RenderMode = "loading" | "ready" | "fallback" | "reduced";

function FallbackScene() {
  return (
    <div className={styles.fallbackScene} aria-hidden="true">
      <div className={styles.fallbackPlate}>
        <div className={styles.fallbackHeader}>
          <span className={styles.fallbackIdentity}>
            <span className={styles.googleBadge}>
              <Image src="/brand/google-g.png" alt="" width={20} height={20} />
            </span>
            <span>PROFIL / AUREA</span>
          </span>
          <span className={styles.fallbackScanBadge}>
            <QrCode aria-hidden="true" />
            SKEN / RED PO RED
          </span>
        </div>

        <div className={styles.fallbackReview}>
          <div className={styles.fallbackMetric}>
            <span>PROSEČNA OCENA</span>
            <strong>{AUREA_METRICS.final.rating.toFixed(1)}</strong>
            <small>{formatReviewCount(AUREA_METRICS.final.reviews)} recenzija</small>
          </div>

          <div className={styles.fallbackStars}>
            {[0, 1, 2, 3, 4].map((star) => (
              <span
                key={star}
                className={`${styles.fallbackStar} ${
                  star === 4 ? styles.fallbackStarPartial : styles.fallbackStarFull
                }`}
              />
            ))}
          </div>

          <div className={styles.fallbackBars}>
            {fallbackDistribution.map(([label, width]) => (
              <span key={label} className={styles.fallbackBar}>
                <small>{label}</small>
                <i>
                  <b style={{ width }} />
                </i>
              </span>
            ))}
          </div>
        </div>

        <strong className={styles.fallbackQuery}>
          <span>restorani Beograd</span>
          <small>LOKALNI REZULTATI</small>
        </strong>
        <div className={styles.fallbackRows}>
          {fallbackRestaurants.map(([name, rating, reviews, featured], index) => (
            <div
              key={name}
              className={`${styles.fallbackRow} ${featured ? styles.fallbackRowFeatured : ""}`}
            >
              <span className={styles.fallbackRank}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.fallbackRestaurant}>
                <strong>{name}</strong>
                <small>{featured ? "Premium restoran · 0,9 km" : "Restoran · Beograd"}</small>
              </span>
              <span className={styles.fallbackRating}>
                {rating}
                <small>★ {reviews}</small>
              </span>
            </div>
          ))}
        </div>
        <div className={styles.fallbackSignal}>
          <span>SCANME / PROFIL VIDLJIVIJI</span>
          <span>ILUSTRATIVNI PRIKAZ</span>
        </div>
      </div>
    </div>
  );
}

export function ScanStory({
  activeService,
  theme,
}: {
  activeService: ServiceId;
  theme: MarketingTheme;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneShellRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ScanStoryScene | null>(null);
  const themeRef = useRef(theme);
  const [renderMode, setRenderMode] = useState<RenderMode>("loading");
  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const sceneShell = sceneShellRef.current;
    if (!section || !canvas || !sceneShell) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let generation = 0;
    let cleanupCurrent = () => {};

    const configure = async () => {
      const run = ++generation;
      cleanupCurrent();
      cleanupCurrent = () => {};

      section.dataset.progress = "0";
      const query = new URLSearchParams(window.location.search);
      const forceFallback = query.get("webgl") === "0";
      const forceReduced = query.get("motion") === "reduce";
      if (motionQuery.matches || forceReduced) {
        section.dataset.mode = "reduced";
        section.dataset.progress = "100";
        setRenderMode("reduced");
        syncLiquidGlassSource(null, themeRef.current, true);
        return;
      }
      if (forceFallback) {
        section.dataset.mode = "fallback";
        section.dataset.progress = "100";
        setRenderMode("fallback");
        syncLiquidGlassSource(null, themeRef.current, true);
        return;
      }

      section.dataset.mode = "loading";
      setRenderMode("loading");
      await document.fonts.ready;
      if (run !== generation) return;

      let scene: ScanStoryScene;
      try {
        const title = section.querySelector("h1");
        const fontFamily = getComputedStyle(title ?? section).fontFamily || "sans-serif";
        scene = await createScanStoryScene(canvas, fontFamily, themeRef.current);
      } catch {
        if (run !== generation) return;
        section.dataset.mode = "fallback";
        section.dataset.progress = "100";
        setRenderMode("fallback");
        syncLiquidGlassSource(null, themeRef.current, true);
        return;
      }

      if (run !== generation) {
        scene.dispose();
        return;
      }

      sceneRef.current = scene;

      let frameRequest = 0;
      let isVisible = true;
      let renderCount = 1;
      let lastProgress = -1;

      const renderFrame = (time: number) => {
        frameRequest = 0;
        if (!isVisible || document.hidden) return;
        const shouldContinue = scene.render(time);
        syncLiquidGlassSource(canvas, themeRef.current);
        renderCount += 1;
        if (renderCount % 30 === 0) section.dataset.renderCount = String(renderCount);
        if (shouldContinue) frameRequest = window.requestAnimationFrame(renderFrame);
      };

      const requestRender = () => {
        if (frameRequest || !isVisible || document.hidden) return;
        frameRequest = window.requestAnimationFrame(renderFrame);
      };

      const updateProgressUi = (progress: number) => {
        const integer = Math.round(progress * 100);
        if (integer !== lastProgress) {
          lastProgress = integer;
          section.dataset.progress = String(integer);
        }
      };

      let master: gsap.core.Timeline | null = null;
      const context = gsap.context(() => {
        master = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          onUpdate: () => {
            if (!master) return;
            updateProgressUi(master.progress());
            requestRender();
          },
          scrollTrigger: {
            id: "scanme-hero",
            trigger: section,
            start: "top top",
            end: () =>
              `+=${Math.round(
                window.innerHeight * (window.innerWidth < 768 ? 3.15 : 4.25),
              )}`,
            scrub: window.innerWidth < 768 ? 0.65 : 0.82,
            pin: true,
            pinSpacing: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onRefresh: requestRender,
          },
        });

        master
          .addLabel("intro", 0)
          .addLabel("scan", 18)
          .addLabel("review", 30)
          .addLabel("metrics", 46)
          .addLabel("local", 62)
          .addLabel("rank", 78)
          .addLabel("settle", 94)
          .addLabel("complete", 100)
          .to(scene.state, { intro: 1, duration: 18, ease: "sine.inOut" }, "intro")
          .to(scene.state, { scan: 1, duration: 12, ease: "none" }, "scan")
          .to(scene.state, { review: 1, duration: 16, ease: "power2.inOut" }, "review")
          .to(scene.state, { metrics: 1, duration: 16, ease: "none" }, "metrics")
          .to(scene.state, { local: 1, duration: 16, ease: "power2.inOut" }, "local")
          .to(scene.state, { rank: 1, duration: 16, ease: "power2.inOut" }, "rank")
          .to(scene.state, { settle: 1, duration: 6, ease: "sine.out" }, "settle");
      }, section);

      const resizeObserver = new ResizeObserver(([entry]) => {
        scene.resize(entry.contentRect.width, entry.contentRect.height);
        requestRender();
      });
      resizeObserver.observe(sceneShell);

      const intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          isVisible = entry.isIntersecting;
          if (isVisible) requestRender();
          else if (frameRequest) {
            window.cancelAnimationFrame(frameRequest);
            frameRequest = 0;
          }
        },
        { threshold: 0.01 },
      );
      intersectionObserver.observe(section);

      const onVisibilityChange = () => {
        if (document.hidden && frameRequest) {
          window.cancelAnimationFrame(frameRequest);
          frameRequest = 0;
        } else if (!document.hidden) {
          requestRender();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      let enhancedCleanup = () => {};
      const onContextLost = (event: Event) => {
        event.preventDefault();
        const cleanup = enhancedCleanup;
        enhancedCleanup = () => {};
        cleanup();
        section.dataset.mode = "fallback";
        section.dataset.progress = "100";
        setRenderMode("fallback");
      };
      canvas.addEventListener("webglcontextlost", onContextLost);

      enhancedCleanup = () => {
        canvas.removeEventListener("webglcontextlost", onContextLost);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        if (frameRequest) window.cancelAnimationFrame(frameRequest);
        context.revert();
        if (sceneRef.current === scene) sceneRef.current = null;
        scene.dispose();
        delete section.dataset.renderCount;
      };
      cleanupCurrent = () => {
        const cleanup = enhancedCleanup;
        enhancedCleanup = () => {};
        cleanup();
      };

      section.dataset.mode = "enhanced";
      section.dataset.renderCount = String(renderCount);
      setRenderMode("ready");
      updateProgressUi(0);
      requestRender();
      window.requestAnimationFrame(() => ScrollTrigger.refresh());
    };

    const onMotionChange = () => void configure();
    motionQuery.addEventListener("change", onMotionChange);
    void configure();

    return () => {
      generation += 1;
      motionQuery.removeEventListener("change", onMotionChange);
      cleanupCurrent();
    };
  }, []);

  useEffect(() => {
    themeRef.current = theme;
    sectionRef.current?.setAttribute("data-theme", theme);
    sceneRef.current?.setTheme(theme);
    syncLiquidGlassSource(sceneRef.current ? canvasRef.current : null, theme, true);
  }, [theme]);

  return (
    <section
      ref={sectionRef}
      id="pocetak"
      className={styles.hero}
      data-scroll-story-hero
      data-mode="loading"
      data-progress="0"
      data-service={activeService}
      data-copy-side={activeService === "venue" || activeService === "loyalty" ? "right" : "left"}
      data-theme={theme}
    >
      <div className={styles.viewport}>
        <div className={styles.layout}>
          <motion.div className={styles.copyColumn}>
            <div className={styles.copyContent}>
              <h1 className={styles.title}>Jedan gost. <span className="text-nowrap ">Mnogo novih.</span></h1>

              <p className={styles.subtitle}>Vaš najbolji marketing već sedi za stolom.</p>

              <p className="sr-only">
                Ilustrativna priča prikazuje kako Restoran Aurea, nakon rasta ocene sa{" "}
                {AUREA_METRICS.initial.rating.toLocaleString("sr-Latn-RS", {
                  minimumFractionDigits: 1,
                })}{" "}
                i {formatReviewCount(AUREA_METRICS.initial.reviews)} recenzija na{" "}
                {AUREA_METRICS.final.rating.toLocaleString("sr-Latn-RS", {
                  minimumFractionDigits: 1,
                })}{" "}
                i {formatReviewCount(AUREA_METRICS.final.reviews)} recenzija, dobija četiri pune i
                jednu 80 posto popunjenu zvezdicu, pa prelazi sa petog na prvo mesto u izmišljenim
                lokalnim rezultatima za upit restorani Beograd. Pozicija nije zagarantovana.
              </p>

              <div className={styles.actions}>
                <a href="#ponuda" className="button-primary focus-signal">
                  Zatraži ponudu
                  <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </a>
              </div>
            </div>
          </motion.div>

          <div className={styles.visualColumn}>
            <div
              ref={sceneShellRef}
              className={styles.sceneShell}
              data-webgl={renderMode}
            >
              <FallbackScene />
              <canvas
                ref={canvasRef}
                className={styles.canvas}
                data-liquid-glass-source-scene
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
