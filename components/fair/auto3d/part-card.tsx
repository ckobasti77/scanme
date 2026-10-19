"use client";

// Kartica dela (A03 §5.1, PLAN P3): sistem i naziv, opis, specifikacije u tabeli, zanimljivost,
// napomena „Primer vrednosti…“, prethodni i sledeći deo iste grupe i „Kopiraj link“. Prikaz je čist
// (ulaz su props), pa se renderuje i na serveru za `?deo=`. Prethodni i sledeći su `submit` GET
// forme, pa rade i bez JS-a.

import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Info, Link2, Sparkles, X } from "lucide-react";
import type { PartId, SystemId } from "@/lib/auto3d/catalog";
import type { Mode } from "@/lib/auto3d/filter";
import { neighbors, partDef, SYSTEM_COLOR } from "@/lib/auto3d/groups";
import { fmt } from "@/lib/i18n/format";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { CARD_TITLE_ID, UrlHidden } from "./ui-bits";
import styles from "./auto3d.module.css";

export function PartCard({
  part,
  group,
  mode,
  onSelect,
  onClose,
  onCopied,
}: {
  part: PartId;
  group: SystemId | null;
  mode: Mode;
  onSelect?: (part: PartId) => void;
  onClose?: () => void;
  onCopied?: () => void;
}) {
  const [fallback, setFallback] = useState<string | null>(null);
  const def = partDef(part);
  const copy = delovi.parts[part];
  const system = delovi.systems[def.system];
  const nb = neighbors(part);

  const copyLink = async () => {
    const url = `${window.location.origin}/sajam/3d?deo=${part}`;
    try {
      await navigator.clipboard.writeText(url);
      setFallback(null);
      onCopied?.();
    } catch {
      setFallback(url);
    }
  };

  const neighbor = (id: PartId, dir: "prev" | "next") => (
    <button
      type="submit"
      name="deo"
      value={id}
      className={styles.neighbor}
      data-dir={dir}
      aria-label={fmt(dir === "prev" ? t.cardPrevAria : t.cardNextAria, { name: delovi.parts[id].name })}
      onClick={(e) => {
        if (!onSelect) return;
        e.preventDefault();
        onSelect(id);
      }}
    >
      {dir === "prev" ? <ChevronLeft aria-hidden="true" /> : null}
      <span className={styles.neighborText}>
        <small>{dir === "prev" ? t.cardPrev : t.cardNext}</small>
        <span>{delovi.parts[id].name}</span>
      </span>
      {dir === "next" ? <ChevronRight aria-hidden="true" /> : null}
    </button>
  );

  return (
    <article className={styles.card} aria-labelledby={CARD_TITLE_ID} style={{ "--a3-dot": SYSTEM_COLOR[def.system] } as CSSProperties}>
      <header className={styles.cardHead}>
        <p className={styles.cardSystem}>
          <span className={styles.rowDot} aria-hidden="true" />
          {system.name}
          {def.instances.length === 2 ? (
            <span className={styles.badge}>
              <span aria-hidden="true">{t.instancesTwo}</span>
              <span className="sr-only">{t.instancesTwoLong}</span>
            </span>
          ) : null}
        </p>
        <h2 id={CARD_TITLE_ID} className={styles.cardTitle} tabIndex={-1}>
          {copy.name}
        </h2>
        {onClose ? (
          <button type="button" className={styles.cardClose} onClick={onClose}>
            <X aria-hidden="true" />
            <span className="sr-only">{fmt(t.selectedClose, { name: copy.name })}</span>
          </button>
        ) : null}
      </header>

      <p className={styles.cardDesc}>{copy.description}</p>

      <table className={styles.specs}>
        <caption>{t.cardSpecs}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t.cardSpecLabel}</th>
            <th scope="col">{t.cardSpecValue}</th>
          </tr>
        </thead>
        <tbody>
          {copy.specs.map((spec) => (
            <tr key={spec.label}>
              <th scope="row">{spec.label}</th>
              <td>{spec.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className={styles.fact} aria-labelledby="a3-card-fact">
        <h3 id="a3-card-fact">
          <Sparkles aria-hidden="true" />
          {t.cardFact}
        </h3>
        <p>{copy.fact}</p>
      </section>

      <p className={styles.note}>
        <Info aria-hidden="true" />
        {t.exampleNote}
      </p>

      <footer className={styles.cardFoot}>
        <form action="/sajam/3d" method="get" className={styles.neighbors} aria-label={t.cardNav} onSubmit={(e) => e.preventDefault()}>
          <UrlHidden group={group} mode={mode} />
          {neighbor(nb.prev, "prev")}
          <span className={styles.position}>{fmt(t.cardPosition, { index: nb.index, total: nb.total })}</span>
          {neighbor(nb.next, "next")}
        </form>
        <button type="button" className={styles.copyButton} onClick={() => void copyLink()}>
          <Link2 aria-hidden="true" />
          {t.copyLink}
        </button>
        {fallback ? (
          <label className={styles.copyField}>
            <span>{t.copyFieldLabel}</span>
            <input readOnly value={fallback} ref={(el) => el?.select()} onFocus={(e) => e.currentTarget.select()} />
          </label>
        ) : null}
      </footer>
    </article>
  );
}
