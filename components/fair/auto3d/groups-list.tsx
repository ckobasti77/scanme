"use client";

// Grupe delova (A03 §5.1–§5.2): „Sve grupe“ i 10 sistema, sa tačkom boje i brojem delova. Ista lista
// je tamna traka u studiju (desktop) i jezičak „Grupe“ na telefonu. Dugme je `submit` GET forme, pa
// `?grupa=` radi i bez JS-a; sa JS-om klik menja store. Ponovni klik na izabranu grupu je briše.
// A12: lista ima jedno mesto u redosledu tabova (kao lista delova), a strelice idu kroz grupe.

import { useState, type CSSProperties, type MouseEvent } from "react";
import { PARTS, SYSTEMS, type SystemId } from "@/lib/auto3d/catalog";
import { SYSTEM_PART_COUNT } from "@/lib/auto3d/groups";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { useAuto3d, useAuto3dStore } from "./store";
import { listKeys, UrlHidden, useHydrated } from "./ui-bits";
import styles from "./auto3d.module.css";

type Item = { id: SystemId | null; name: string; count: number; color: string | null };

const ITEMS: Item[] = [
  { id: null, name: t.groupsAll, count: PARTS.length, color: null },
  ...SYSTEMS.map((s) => ({ id: s.id, name: delovi.systems[s.id].name, count: SYSTEM_PART_COUNT[s.id], color: s.color })),
];

export function GroupsList({ variant }: { variant: "rail" | "sheet" }) {
  const store = useAuto3dStore();
  const group = useAuto3d((s) => s.group);
  const mode = useAuto3d((s) => s.mode);
  const hydrated = useHydrated();
  // Jedno mesto u redosledu tabova: grupa sa poslednjim fokusom, a pre toga izabrana grupa.
  const [focused, setFocused] = useState<SystemId | null | undefined>(undefined);
  const roving = focused === undefined ? group : focused;

  const choose = (id: SystemId | null) => (e: MouseEvent) => {
    e.preventDefault();
    const next = id !== null && id === group ? null : id;
    store.dispatch({ type: "group", group: next, openList: variant === "rail" && next !== null });
  };

  return (
    <form action="/sajam/3d" method="get" className={variant === "rail" ? styles.groupsRail : undefined} onSubmit={(e) => e.preventDefault()}>
      <UrlHidden mode={mode} />
      {variant === "rail" ? (
        <p className={styles.railTitle} aria-hidden="true">
          {t.groupsTitle}
        </p>
      ) : null}
      <ul className={styles.groups} aria-label={t.groupsLabel} onKeyDown={(e) => listKeys(e)}>
        {ITEMS.map((item) => (
          <li key={item.id ?? "sve"}>
            <button
              type="submit"
              name={item.id ? "grupa" : undefined}
              value={item.id ?? undefined}
              className={styles.groupButton}
              aria-pressed={group === item.id}
              tabIndex={hydrated && item.id !== roving ? -1 : 0}
              onFocus={() => setFocused(item.id)}
              style={item.color ? ({ "--a3-dot": item.color } as CSSProperties) : undefined}
              onClick={choose(item.id)}
            >
              <span className={styles.groupDot} data-all={item.id ? undefined : ""} aria-hidden="true" />
              <span className={styles.groupName}>{item.name}</span>
              <span className={styles.groupCount}>{item.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}
