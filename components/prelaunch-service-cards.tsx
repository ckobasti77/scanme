"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DotMatrix } from "@/components/dot-matrix";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import styles from "./prelaunch-service-cards.module.css";

// 13×13 dot-matrix ikonice; "#" je tačka, "." prazno mesto mreže.
const ICONS = {
  // Karika lanca (kao lucide Link2): dve polukarike i prečka.
  links: [
    ".............",
    ".............",
    ".............",
    "..###...###..",
    ".#.........#.",
    "#...........#",
    "#..#######..#",
    "#...........#",
    ".#.........#.",
    "..###...###..",
    ".............",
    ".............",
    ".............",
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
  // Telefon (isti okvir kao ranije) sa koktel čašom.
  menu: [
    "..#########..",
    "..#.......#..",
    "..#.......#..",
    "..#.#####.#..",
    "..#..###..#..",
    "..#...#...#..",
    "..#...#...#..",
    "..#...#...#..",
    "..#...#...#..",
    "..#..###..#..",
    "..#.......#..",
    "..#.......#..",
    "..#########..",
  ],
} as const;

const CARD_KEYS = ["links", "review", "menu"] as const;

type Service = (typeof dict.services.items)[number];

function ServiceCard({ service, index }: { service: Service; index: number }) {
  const cardRef = useRef<HTMLLIElement>(null);
  // false = animacija nije krenula: ikonica je statična i cela. Tačke se slažu
  // samo jednom, kad kartica prvi put uđe u ekran; hover ih ne pokreće ponovo.
  const [run, setRun] = useState(false);
  const soon = service.status === "soon";

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setRun(true);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <li ref={cardRef} className={styles.card} data-status={service.status}>
      <div className={styles.cardTop}>
        <span className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          {soon ? dict.services.soon : dict.services.available}
        </span>
      </div>

      <div className={styles.iconStage} data-run={run ? "true" : undefined}>
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
          <a href="#kontakt" className={`${styles.cta} button-primary focus-signal`}>
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
