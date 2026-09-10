"use client";

// The sticky scroll-spy nav (RFC-003 §2.2, §4 TASK-52). It JUMPS to a group and
// highlights the group currently under the scroll position — it NEVER filters:
// every group section stays in the DOM at all times (the "filter bar that hides
// the rest" is the rejected option in §2.2, and it is not reintroduced here).
// An IntersectionObserver tracks the active group; tapping a chip scrolls its
// section into view, honouring prefers-reduced-motion.

import { useEffect, useMemo, useState } from "react";
import { menuSr as dict } from "@/lib/i18n/sr/menu";
import type { MenuGroup } from "@/lib/menu-blocks";
import { cn } from "@/lib/utils";
import { groupAnchorId } from "./blocks/group-shell";
import styles from "./menu-public.module.css";

export function MenuNav({ groups }: { groups: MenuGroup[] }) {
  // A jump target needs a label; only titled groups get a chip. Every section
  // still renders — this filters the NAV, never the menu.
  const titled = useMemo(
    () => groups.filter((group) => group.base.title.trim().length > 0),
    [groups],
  );
  const [activeId, setActiveId] = useState<string | null>(() =>
    titled[0] ? groupAnchorId(titled[0]) : null,
  );

  useEffect(() => {
    if (titled.length === 0) return;
    const sections = titled
      .map((group) => document.getElementById(groupAnchorId(group)))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The topmost section still intersecting the band wins.
        const top = sections.find((section) => visible.has(section.id));
        if (top) setActiveId(top.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [titled]);

  if (titled.length === 0) return null;

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActiveId(id);
  };

  return (
    <nav className={styles.nav} aria-label={dict.navAria}>
      <ul className={styles.navList}>
        {titled.map((group) => {
          const id = groupAnchorId(group);
          const active = id === activeId;
          return (
            <li key={group.base.id} className={styles.navItem}>
              <button
                type="button"
                className={cn(styles.navChip, active && styles.navChipActive)}
                aria-current={active ? "true" : undefined}
                onClick={() => jump(id)}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                  })
                }
              >
                {group.base.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
