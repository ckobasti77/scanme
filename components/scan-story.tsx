"use client";

import { useEffect, useRef } from "react";
import { Activity, ExternalLink, QrCode, ScanLine } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

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
    title: "Sken se beleži",
    body: "Brojimo odlazne posete uz minimalne podatke i bez čuvanja sirove IP adrese.",
    icon: Activity,
  },
  {
    title: "Otvara se prava destinacija",
    body: "Kupac stiže do Google recenzije, ponude ili rezervacije koju ste izabrali.",
    icon: ExternalLink,
  },
];

export function ScanStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || reduce) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add("(min-width: 1024px)", () => {
        const panels = gsap.utils.toArray<HTMLElement>("[data-story-panel]");
        const nodes = gsap.utils.toArray<HTMLElement>("[data-story-node]");
        const signal = section.querySelector<HTMLElement>("[data-story-signal]");

        gsap.set(panels.slice(1), { autoAlpha: 0, y: 24 });
        gsap.set(nodes.slice(1), { opacity: 0.28 });

        const timeline = gsap.timeline({
          defaults: { duration: 0.35, ease: "power2.out" },
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "+=220%",
            scrub: 0.8,
            pin: true,
            invalidateOnRefresh: true,
          },
        });

        panels.slice(1).forEach((panel, index) => {
          timeline
            .to(panels[index], { autoAlpha: 0, y: -20 }, index + 0.55)
            .to(panel, { autoAlpha: 1, y: 0 }, index + 0.72)
            .to(nodes[index], { opacity: 0.28, scale: 0.96 }, index + 0.55)
            .to(nodes[index + 1], { opacity: 1, scale: 1 }, index + 0.72)
            .to(signal, { xPercent: (index + 1) * 100 }, index + 0.64);
        });

        const onReady = () => ScrollTrigger.refresh();
        document.fonts.ready.then(onReady);
        return () => timeline.kill();
      });
    }, section);

    return () => {
      media.revert();
      context.revert();
    };
  }, [reduce]);

  return (
    <section
      ref={sectionRef}
      id="kako-radi"
      className="relative min-h-[100dvh] border-y border-white/10 bg-[#10110e]"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-24 sm:px-6 lg:flex lg:min-h-[100dvh] lg:items-center lg:px-10 lg:py-20">
        <div className="w-full">
          <h2 className="max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
            Od fizičkog predmeta do korisne akcije.
          </h2>

          <div className="mt-14 grid gap-5 lg:hidden">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="border-l border-[#c6ff4a] py-3 pl-5">
                  <Icon aria-hidden="true" className="size-6 text-[#c6ff4a]" strokeWidth={1.5} />
                  <h3 className="mt-5 text-xl font-semibold tracking-[-0.035em]">{step.title}</h3>
                  <p className="mt-2 max-w-[48ch] text-sm leading-6 text-white/62">{step.body}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-20 hidden grid-cols-[0.9fr_1.3fr] gap-20 lg:grid">
            <div className="relative min-h-56">
              {steps.map((step) => (
                <article key={step.title} data-story-panel className="absolute inset-0">
                  <h3 className="max-w-[16ch] text-3xl font-semibold tracking-[-0.05em] xl:text-4xl">
                    {step.title}
                  </h3>
                  <p className="mt-5 max-w-[48ch] leading-7 text-white/62">{step.body}</p>
                </article>
              ))}
            </div>

            <div className="relative flex items-center">
              <div className="absolute left-[10%] right-[10%] top-1/2 h-px bg-white/18" />
              <div
                data-story-signal
                className="absolute left-[10%] top-1/2 h-px w-[26.666%] origin-left bg-[#c6ff4a]"
              />
              <div className="relative grid w-full grid-cols-4 gap-5">
                {steps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.title}
                      data-story-node
                      className="flex aspect-square items-center justify-center border border-white/20 bg-[#10110e] text-[#c6ff4a]"
                    >
                      <Icon aria-hidden="true" className="size-8 xl:size-10" strokeWidth={1.35} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
