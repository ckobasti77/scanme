// The collapsed-items caret (RFC-003 §2.1). TASK-51 shipped it as a static
// label; TASK-52 makes it the single-open accordion trigger. With an accordion
// context (the public page) it is a <button> that toggles its group and carries
// aria-expanded; without one (the editor preview, the SSR first paint before
// hydration, and the render tests) it renders the exact static <p> label TASK-51
// emitted — byte-identical.

"use client";

import { ChevronDown } from "lucide-react";
import { fmt } from "@/lib/i18n";
import { menuSr as dict } from "@/lib/i18n/sr/menu";
import { cn } from "@/lib/utils";
import { useMenuAccordion } from "../menu-accordion-context";
import styles from "../menu-template.module.css";

export function MoreCaret({
  count,
  groupId,
  expanded = false,
}: {
  count: number;
  groupId?: string;
  expanded?: boolean;
}) {
  const accordion = useMenuAccordion();
  if (count <= 0) return null;

  // No interactive context: the static label, unchanged from TASK-51.
  if (!accordion || !groupId) {
    return (
      <p className={styles.moreCaret} data-menu-more={count}>
        <span>{fmt(dict.moreItems, { count })}</span>
        <ChevronDown className={styles.moreCaretIcon} aria-hidden="true" />
      </p>
    );
  }

  return (
    <button
      type="button"
      className={cn(styles.moreCaret, styles.moreCaretButton)}
      data-menu-more={count}
      data-menu-caret={groupId}
      aria-expanded={expanded}
      onClick={() => accordion.toggle(groupId)}
    >
      <span>{expanded ? dict.showLess : fmt(dict.moreItems, { count })}</span>
      <ChevronDown
        className={cn(styles.moreCaretIcon, expanded && styles.moreCaretIconOpen)}
        aria-hidden="true"
      />
    </button>
  );
}
