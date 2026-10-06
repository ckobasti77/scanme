"use client";

import gsap from "gsap";
import { ChevronDown, FileText } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useFairHistoryLayer } from "@/lib/fair-client/history-layer";

export function AnimatedModelDisclosure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const initialRenderRef = useRef(true);
  const requestClose = useFairHistoryLayer(
    open,
    () => setOpen(false),
    "model-disclosure",
  );

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const main = section?.closest<HTMLElement>(".fair-model-main");
    const hero = main?.querySelector<HTMLElement>(".fair-model-hero");
    if (!main || !hero) return;

    const frame = window.requestAnimationFrame(() => {
      main.style.setProperty(
        "--fair-model-hero-locked-height",
        `${hero.getBoundingClientRect().height}px`,
      );
      main.dataset.heroLocked = "true";
    });

    return () => {
      window.cancelAnimationFrame(frame);
      main.style.removeProperty("--fair-model-hero-locked-height");
      delete main.dataset.heroLocked;
    };
  }, []);

  useLayoutEffect(() => {
    const drop = dropRef.current;
    const inner = innerRef.current;
    if (!drop || !inner) return;

    timelineRef.current?.kill();

    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      gsap.set(drop, { height: 0 });
      gsap.set(inner, { opacity: 0, y: -6 });
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      gsap.set(drop, { height: open ? "auto" : 0 });
      gsap.set(inner, { opacity: open ? 1 : 0, y: 0 });
      return;
    }

    const currentHeight = drop.getBoundingClientRect().height;
    gsap.set(drop, { height: currentHeight });

    if (open) {
      timelineRef.current = gsap
        .timeline()
        .to(drop, {
          height: inner.scrollHeight,
          duration: 0.52,
          ease: "sine.inOut",
        })
        .to(
          inner,
          {
            opacity: 1,
            y: 0,
            duration: 0.34,
            ease: "power2.out",
          },
          0.08,
        )
        .set(drop, { height: "auto" });
    } else {
      timelineRef.current = gsap
        .timeline()
        .to(inner, {
          opacity: 0,
          y: -6,
          duration: 0.24,
          ease: "power1.inOut",
        })
        .to(
          drop,
          {
            height: 0,
            duration: 0.46,
            ease: "sine.inOut",
          },
          0,
        );
    }

    return () => {
      timelineRef.current?.kill();
    };
  }, [open]);

  return (
    <section ref={sectionRef} className="fair-model-disclosure" data-open={open}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="fair-model-disclosure-content"
        onClick={() => open ? requestClose() : setOpen(true)}
      >
        <FileText aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown className="fair-disclosure-chevron" aria-hidden="true" />
      </button>
      <div ref={dropRef} className="fair-model-disclosure__drop" aria-hidden={!open}>
        <div ref={innerRef} className="fair-model-disclosure__drop-inner">
          <div id="fair-model-disclosure-content" className="fair-model-disclosure__content">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
