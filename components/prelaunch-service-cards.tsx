"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DotMatrix } from "@/components/dot-matrix";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import styles from "./prelaunch-service-cards.module.css";

// 13×13 dot-matrix ikonice; "#" je tačka, "." prazno mesto mreže.
const ICONS = {
  // Telefon sa redovima linkova.
  links: [
    "..#########..",
    "..#.......#..",
    "..#.#####.#..",
    "..#.......#..",
    "..#.#####.#..",
    "..#.......#..",
    "..#.#####.#..",
    "..#.......#..",
    "..#.###...#..",
    "..#.......#..",
    "..#.......#..",
    "..#...#...#..",
    "..#########..",
  ],
  // Zvezda utiska.
  review: [
    "......#......",
    ".....###.....",
    ".....###.....",
    "....#####....",
    "#############",
    ".###########.",
    "..#########..",
    "...#######...",
    "...#######...",
    "..####.####..",
    "..###...###..",
    ".###.....###.",
    ".#.........#.",
  ],
  // Poklopac za posluženje na tanjiru.
  menu: [
    ".............",
    ".............",
    "......#......",
    ".....###.....",
    "...#######...",
    "..##.######..",
    ".##.########.",
    ".###########.",
    "#############",
    ".............",
    "#############",
    ".............",
    ".............",
  ],
} as const;

const CARD_KEYS = ["links", "review", "menu"] as const;
// Prva dostupna usluga dobija primary CTA, ostale ghost (sekundarni).
const CTA_CLASSES = ["button-primary", "button-ghost", "button-ghost"] as const;

type Service = (typeof dict.services.items)[number];

function ServiceCard({ service, index }: { service: Service; index: number }) {
  const cardRef = useRef<HTMLLIElement>(null);
  const reducedMotionRef = useRef(true);
  const [inView, setInView] = useState(false);
  // 0 = animacija nije krenula: ikonica je statična i cela. Svaka promena
  // ključa ponovo montira scenu i iznova pokreće CSS animaciju.
  const [run, setRun] = useState(0);
  const soon = service.status === "soon";

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotionRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) setRun((current) => (current === 0 ? 1 : current));
      },
      { threshold: 0.35 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const replay = () => {
    if (!reducedMotionRef.current) setRun((current) => current + 1);
  };

  return (
    <li
      ref={cardRef}
      className={styles.card}
      data-status={service.status}
      data-in-view={inView ? "true" : "false"}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") replay();
      }}
      onFocus={replay}
    >
      <div className={styles.cardTop}>
        <span className={styles.index} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          {soon ? dict.services.soon : dict.services.available}
        </span>
      </div>

      <div key={run} className={styles.iconStage} data-run={run > 0 ? "true" : undefined}>
        <DotMatrix
          pattern={ICONS[CARD_KEYS[index]]}
          className={styles.icon}
          dotClassName={styles.dot}
        />
      </div>

      <div className={styles.cardBody}>
        <h3>{service.name}</h3>
        <p>{service.body}</p>
      </div>

      <div className={styles.cardFoot}>
        {soon ? (
          <span className={styles.soonNote}>{dict.services.soonNote}</span>
        ) : (
          <a href="#kontakt" className={`${styles.cta} ${CTA_CLASSES[index]} focus-signal`}>
            {dict.services.cta}
            <span className="sr-only"> — {service.name}</span>
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </a>
        )}
      </div>
    </li>
  );
}

export function PrelaunchServiceCards() {
  return (
    <ul className={styles.grid}>
      {dict.services.items.map((service, index) => (
        <ServiceCard key={service.name} service={service} index={index} />
      ))}
    </ul>
  );
}
