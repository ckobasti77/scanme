"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./scanme-links-editor.module.css";

export function EditorTooltip({
  label,
  children,
  align = "center",
}: {
  label: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const portalRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

  const show = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left =
      align === "start"
        ? rect.left
        : align === "end"
          ? rect.right
          : rect.left + rect.width / 2;
    setPosition({ left, top: rect.top - 10 });
  }, [align]);

  const hide = useCallback(() => setPosition(null), []);

  useEffect(() => {
    if (!position) return;
    const update = () => show();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [position, show]);

  // Drži balon unutar viewporta kada je sadržaj širi od prostora uz ivicu.
  useLayoutEffect(() => {
    const portal = portalRef.current;
    if (!position || !portal) return;
    portal.style.marginLeft = "";
    const rect = portal.getBoundingClientRect();
    let shift = 0;
    if (rect.left < 8) shift = 8 - rect.left;
    else if (rect.right > window.innerWidth - 8) {
      shift = window.innerWidth - 8 - rect.right;
    }
    if (shift) portal.style.marginLeft = `${shift}px`;
  }, [position, label]);

  return (
    <span
      ref={anchorRef}
      className={styles.tooltipAnchor}
      data-align={align}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {position
        ? createPortal(
            <span
              ref={portalRef}
              className={styles.tooltipPortal}
              data-align={align}
              style={{ left: position.left, top: position.top }}
            >
              <span className={styles.tooltipPortalBubble} role="tooltip">
                {label}
              </span>
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
