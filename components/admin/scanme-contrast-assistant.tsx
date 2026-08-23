"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { EditorTooltip } from "@/components/admin/editor-tooltip";
import { colorDisplayName } from "@/lib/color-display-name";
import type {
  ContrastIssue,
  ContrastSuggestion,
} from "@/lib/scanme-contrast";
import {
  contrastSeverity,
  contrastSeverityLabel,
} from "@/lib/scanme-contrast";
import type { PreviewDevice } from "./scanme-links-editor-types";
import styles from "./scanme-links-editor.module.css";

type CardPosition = {
  left: number;
  top: number;
  width: number;
  side: "left" | "right";
};

const COLLAPSED_HEIGHT = 56;
const EXPANDED_HEIGHT = 246;
const CARD_GAP = 10;

function samePositions(
  first: Record<string, CardPosition>,
  second: Record<string, CardPosition>,
) {
  const firstKeys = Object.keys(first);
  if (firstKeys.length !== Object.keys(second).length) return false;
  return firstKeys.every((key) => {
    const a = first[key];
    const b = second[key];
    return (
      b !== undefined &&
      a.left === b.left &&
      a.top === b.top &&
      a.width === b.width &&
      a.side === b.side
    );
  });
}

export function ScanMeContrastAssistant({
  issues,
  device,
  containerRef,
  onApply,
  compact = false,
}: {
  issues: ContrastIssue[];
  device: PreviewDevice;
  containerRef: RefObject<HTMLDivElement | null>;
  onApply: (suggestion: ContrastSuggestion) => void;
  // Mobilni shell: minimizovane kartice postaju čipovi (samo ikonica ! ), ništa
  // se ne otvara automatski, a prošireni oblik je kompaktna kartica u rail-u uz
  // desnu ivicu — ne apsolutno pozicionirana ploča preko celog pregleda.
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  // Kartice se nikad ne otvaraju same — ni na desktopu ni na mobilnom. Otvaraju se samo
  // kad ih korisnik kucne. Zastareli aktivan id pokriva `resolvedActiveId` pri renderu.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, CardPosition>>({});
  const activeStillPresent =
    activeId !== null && issues.some((issue) => issue.id === activeId);
  // Kad aktivni problem nestane, zaboravi otvoreni id (obrazac „prilagodi stanje
  // pri renderu"). Inače bi ista kartica, kad se problem kasnije vrati (korisnik
  // je razreši pa opet pokvari boju), iskočila već otvorena i prekršila pravilo
  // „nijedna se ne otvara sama". `resolvedActiveId` drži ovaj render ispravnim.
  if (activeId !== null && !activeStillPresent) setActiveId(null);
  const resolvedActiveId = activeStillPresent ? activeId : null;

  const measure = useCallback(() => {
    // Mobilni raspored je čisto CSS (rail + kompaktna kartica); merenje pozicija
    // pokreće se samo za apsolutno pozicionirane kartice na desktopu.
    if (compact) return;
    const container = containerRef.current;
    if (!container || !issues.length) {
      setPositions({});
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const preview = container.querySelector<HTMLElement>(
      "[data-editor-preview='true']",
    );
    if (!preview) return;
    const previewRect = preview.getBoundingClientRect();
    const cardWidth = Math.min(296, Math.max(236, containerRect.width - 20));
    const protectedRects = Array.from(
      container.querySelectorAll<HTMLElement>("[data-contrast-anchor]"),
    ).map((element) => element.getBoundingClientRect());

    const measured = issues
      .map((issue) => {
        const anchor = container.querySelector<HTMLElement>(
          `[data-contrast-anchor='${issue.zone}']`,
        );
        const anchorRect = anchor?.getBoundingClientRect() ?? previewRect;
        return {
          issue,
          desiredTop:
            anchorRect.top -
            containerRect.top +
            Math.min(anchorRect.height / 2, 24) -
            22,
          height:
            issue.id === resolvedActiveId
              ? EXPANDED_HEIGHT
              : COLLAPSED_HEIGHT,
        };
      })
      .sort((first, second) => first.desiredTop - second.desiredTop);

    let previousBottom = 8;
    const stacked = measured.map((entry) => {
      const top = Math.max(8, entry.desiredTop, previousBottom);
      previousBottom = top + entry.height + CARD_GAP;
      return { ...entry, top };
    });
    const overflow = Math.max(0, previousBottom - CARD_GAP - containerRect.height + 8);
    if (overflow) {
      const shift = Math.min(overflow, Math.max(0, stacked[0]?.top - 8));
      for (const entry of stacked) entry.top -= shift;
    }

    const nextPositions: Record<string, CardPosition> = {};
    for (const entry of stacked) {
      const top = Math.max(
        8,
        Math.min(entry.top, containerRect.height - entry.height - 8),
      );
      const rightCandidate = Math.max(8, containerRect.width - cardWidth - 12);
      const leftCandidate = 12;

      let left: number;
      let side: "left" | "right";
      if (device === "phone") {
        const rightSpace = containerRect.right - previewRect.right;
        const leftSpace = previewRect.left - containerRect.left;
        if (rightSpace >= cardWidth + 12 || rightSpace >= leftSpace) {
          left = previewRect.right - containerRect.left + 12;
          side = "right";
        } else {
          left = previewRect.left - containerRect.left - cardWidth - 12;
          side = "left";
        }
        left = Math.max(8, Math.min(left, containerRect.width - cardWidth - 8));
      } else {
        const score = (candidateLeft: number) =>
          protectedRects.filter((rect) => {
            const x1 = candidateLeft + containerRect.left;
            const y1 = top + containerRect.top;
            const x2 = x1 + cardWidth;
            const y2 = y1 + entry.height;
            return !(
              x2 + 8 < rect.left ||
              x1 - 8 > rect.right ||
              y2 + 6 < rect.top ||
              y1 - 6 > rect.bottom
            );
          }).length;
        const leftScore = score(leftCandidate);
        const rightScore = score(rightCandidate);
        left = rightScore <= leftScore ? rightCandidate : leftCandidate;
        side = rightScore <= leftScore ? "right" : "left";
      }

      nextPositions[entry.issue.id] = { left, top, width: cardWidth, side };
    }
    setPositions((current) =>
      samePositions(current, nextPositions) ? current : nextPositions,
    );
  }, [containerRef, device, issues, resolvedActiveId, compact]);

  // useEffect, ne useLayoutEffect: layout efekat deteta se izvršava pre nego
  // što React zakači ref predačkog elementa, pa bi containerRef.current bio
  // null na prvom mount-u i merenje se nikada ne bi pokrenulo.
  useEffect(() => {
    if (compact) return;
    const container = containerRef.current;
    if (!container) return;
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    let observedPreview: HTMLElement | null = null;
    const observePreview = () => {
      const preview = container.querySelector<HTMLElement>(
        "[data-editor-preview='true']",
      );
      if (preview && preview !== observedPreview) {
        if (observedPreview) observer.unobserve(observedPreview);
        observedPreview = preview;
        observer.observe(preview);
      }
    };
    observePreview();
    // Preview i anchor elementi mogu da se montiraju posle prvog merenja;
    // bez ovoga kartice ostaju na početnoj poziciji animacije do prve interakcije.
    const mutationObserver = new MutationObserver(() => {
      observePreview();
      measure();
    });
    mutationObserver.observe(container, { childList: true, subtree: true });
    container.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutationObserver.disconnect();
      container.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, measure, compact]);

  const orderedIssues = useMemo(
    () =>
      [...issues].sort(
        (first, second) =>
          (positions[first.id]?.top ?? 0) - (positions[second.id]?.top ?? 0),
      ),
    [issues, positions],
  );

  // Mobilni rail: najvažniji čip na vrhu (loš → dobar → preporuka), pošto se
  // ne oslanjamo na izmerene pozicije.
  const compactOrderedIssues = useMemo(() => {
    const rank = (candidate: ContrastIssue) => {
      const severity = contrastSeverity(candidate);
      if (severity === "poor") return 0;
      if (severity === "good") return 1;
      return 2;
    };
    return [...issues].sort((first, second) => rank(first) - rank(second));
  }, [issues]);

  const renderCard = (
    issue: ContrastIssue,
    { expanded, position }: { expanded: boolean; position?: CardPosition },
  ) => {
    const severity = contrastSeverity(issue);
    return (
      <motion.article
        key={issue.id}
        className={styles.contrastCard}
        data-compact={compact ? "true" : undefined}
        data-expanded={expanded}
        data-severity={severity}
        data-side={position?.side}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{
          opacity: 1,
          scale: 1,
          // Apsolutne pozicije samo na desktopu; u compact modu raspored drži CSS.
          ...(position
            ? { left: position.left, top: position.top, width: position.width }
            : {}),
        }}
        transition={
          reducedMotion
            ? { duration: 0.01 }
            : { type: "spring", stiffness: 360, damping: 32 }
        }
      >
        <button
          type="button"
          className={styles.contrastCardHeader}
          aria-expanded={expanded}
          aria-label={
            compact
              ? `${issue.title}: ${contrastSeverityLabel(issue)}`
              : undefined
          }
          onClick={() =>
            setActiveId((current) => (current === issue.id ? null : issue.id))
          }
        >
          <span className={styles.contrastWarningIcon} data-severity={severity}>
            <AlertTriangle aria-hidden="true" />
          </span>
          <span className={styles.contrastCardHeading}>
            <strong>{issue.title}</strong>
            <small>{contrastSeverityLabel(issue)}</small>
          </span>
          <ChevronDown
            className={styles.contrastChevron}
            data-open={expanded}
            aria-hidden="true"
          />
        </button>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              className={styles.contrastCardBody}
              initial={reducedMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reducedMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
            >
              <p>{issue.detail}</p>
              <div className={styles.contrastSuggestions}>
                {issue.suggestions.map((suggestion) => (
                  <EditorTooltip
                    key={`${suggestion.role}-${suggestion.color}`}
                    label={colorDisplayName(suggestion.color)}
                  >
                    <button
                      type="button"
                      className={styles.contrastSuggestion}
                      onClick={() => onApply(suggestion)}
                    >
                      <span
                        className={styles.contrastSuggestionSwatch}
                        style={{ backgroundColor: suggestion.color }}
                      />
                      <span>
                        <strong>{suggestion.label}</strong>
                        <small>{suggestion.color.toUpperCase()}</small>
                      </span>
                    </button>
                  </EditorTooltip>
                ))}
              </div>
              <span className={styles.contrastStandard}>
                Ovo je preporuka — ne blokira objavu
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.article>
    );
  };

  if (!issues.length) return null;

  // Mobilni: čipovi (samo ikonica) u vertikalnom rail-u uz desnu ivicu; jedan
  // se po potrebi širi u kompaktnu karticu, ostali ostaju sitni.
  if (compact) {
    return (
      <div
        className={styles.contrastAssistantLayer}
        data-compact="true"
        data-editor-preserve-panel="true"
        aria-label="Asistent za kontrast"
        aria-live="polite"
      >
        <div className={styles.contrastRail}>
          {compactOrderedIssues.map((issue) =>
            renderCard(issue, { expanded: issue.id === resolvedActiveId }),
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.contrastAssistantLayer}
      data-editor-preserve-panel="true"
      aria-label="Asistent za kontrast"
      aria-live="polite"
    >
      {orderedIssues.map((issue, index) => {
        const expanded = issue.id === resolvedActiveId;
        const position = positions[issue.id] ?? {
          left: 12,
          top:
            8 +
            index *
              ((expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT) + CARD_GAP),
          width: 296,
          side: "left" as const,
        };
        return renderCard(issue, { expanded, position });
      })}
    </div>
  );
}
