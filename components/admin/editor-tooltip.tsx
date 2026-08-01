import type { ReactNode } from "react";
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
  return (
    <span className={styles.tooltipAnchor} data-align={align}>
      {children}
      <span className={styles.tooltipBubble} role="tooltip">
        {label}
      </span>
    </span>
  );
}
