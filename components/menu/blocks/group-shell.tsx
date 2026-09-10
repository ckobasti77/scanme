// The per-group section wrapper (TASK-51): the anchor the sticky scroll-spy
// jumps to (§2.2, TASK-52) and the heading the group is labelled by. FORKED in
// spirit from components/venue/blocks/block-shell.tsx, but a Menu group has no
// base properties (`MenuGroupBase` is id/title/icon/daypart, RFC-003 §2.13),
// so there is nothing to apply here beyond structure — deliberately.

import type { ReactNode } from "react";
import type { MenuGroup } from "@/lib/menu-blocks";
import styles from "../menu-template.module.css";

export function groupContainerId(groupId: string) {
  return `grupa-${groupId}`;
}

export function groupAnchorId(group: MenuGroup) {
  return groupContainerId(group.base.id);
}

export function GroupShell({
  group,
  children,
}: {
  group: MenuGroup;
  children: ReactNode;
}) {
  const title = group.base.title.trim();
  const headingId = `${groupAnchorId(group)}-naslov`;
  return (
    <section
      id={groupAnchorId(group)}
      className={styles.group}
      data-menu-group={group.shape}
      data-menu-daypart={group.base.daypartKey || undefined}
      aria-labelledby={title ? headingId : undefined}
    >
      {title ? (
        <h2 id={headingId} className={styles.groupTitle}>
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
