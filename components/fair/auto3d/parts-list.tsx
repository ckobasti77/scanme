"use client";

// Lista delova sa pretragom (A03 §5, PLAN §6: tekstualni ekvivalent scene). Bez upita delovi su po
// grupama; sa upitom je jedna lista, najbolji pogodak prvi. Izabrana grupa filtrira i listu.
// Red je `submit` GET forme (`?deo=` radi i bez JS-a); sa JS-om klik bira deo i fokus ide na
// karticu. Strelice gore i dole idu kroz redove, a lista ima jedno mesto u redosledu tabova.

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { SYSTEMS, type PartId } from "@/lib/auto3d/catalog";
import { partDef, SYSTEM_COLOR } from "@/lib/auto3d/groups";
import { queryTokens } from "@/lib/auto3d/search";
import { fmt } from "@/lib/i18n/format";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { listParts, partsCount } from "./copy";
import { useAuto3d, useAuto3dStore } from "./store";
import { CARD_TITLE_ID, listKeys, SEARCH_ID, UrlHidden, useHydrated } from "./ui-bits";
import styles from "./auto3d.module.css";

export function PartsList() {
  const store = useAuto3dStore();
  const query = useAuto3d((s) => s.query);
  const group = useAuto3d((s) => s.group);
  const part = useAuto3d((s) => s.part);
  const mode = useAuto3d((s) => s.mode);
  const hydrated = useHydrated();
  const [focused, setFocused] = useState<PartId | null>(null);

  const searching = queryTokens(query).length > 0;
  const ids = useMemo(() => listParts(query, group), [query, group]);

  // Jedno mesto u redosledu tabova: red sa fokusom, pa izabrani deo, pa prvi red.
  const roving = focused && ids.includes(focused) ? focused : part && ids.includes(part) ? part : ids[0];

  const pick = (id: PartId) => {
    store.dispatch({ type: "select", part: id, origin: "list" });
    // Fokus na naslov kartice; na telefonu strana dovede karticu u vidno polje.
    requestAnimationFrame(() => document.getElementById(CARD_TITLE_ID)?.focus());
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "Enter") return;
    const first = document.querySelector<HTMLElement>("[data-part-row]");
    if (!first) return;
    e.preventDefault();
    first.focus();
  };

  const row = (id: PartId) => {
    const def = partDef(id);
    return (
      <li key={id}>
        <button
          type="submit"
          name="deo"
          value={id}
          className={styles.row}
          data-part-row={id}
          aria-current={id === part ? "true" : undefined}
          tabIndex={hydrated && id !== roving ? -1 : 0}
          style={{ "--a3-dot": SYSTEM_COLOR[def.system] } as CSSProperties}
          onClick={(e) => {
            e.preventDefault();
            pick(id);
          }}
          onFocus={() => {
            setFocused(id);
            store.dispatch({ type: "hover", part: id });
          }}
          onBlur={() => store.dispatch({ type: "hover", part: null })}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") store.dispatch({ type: "hover", part: id });
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") store.dispatch({ type: "hover", part: null });
          }}
        >
          <span className={styles.rowDot} aria-hidden="true" />
          <span className={styles.rowText}>
            <span className={styles.rowName}>{delovi.parts[id].name}</span>
            {searching ? <span className={styles.rowSystem}>{delovi.systems[def.system].name}</span> : null}
          </span>
          {def.instances.length === 2 ? (
            <span className={styles.rowBadge}>
              <span aria-hidden="true">{t.instancesTwo}</span>
              <span className="sr-only">{t.instancesTwoLong}</span>
            </span>
          ) : null}
          <ChevronRight className={styles.rowChevron} aria-hidden="true" />
        </button>
      </li>
    );
  };

  const sections = SYSTEMS.filter((s) => !group || s.id === group)
    .map((s) => ({ id: s.id, ids: ids.filter((id) => partDef(id).system === s.id) }))
    .filter((s) => s.ids.length > 0);

  return (
    <div className={styles.list}>
      <div className={styles.listTop}>
        <div className={styles.search}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <label htmlFor={SEARCH_ID} className="sr-only">
            {t.searchLabel}
          </label>
          <input
            id={SEARCH_ID}
            type="search"
            className={styles.searchInput}
            value={query}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-controls={ids.length ? "a3-parts" : undefined}
            onChange={(e) => store.dispatch({ type: "query", query: e.currentTarget.value })}
            onKeyDown={onSearchKey}
          />
          {query ? (
            <button type="button" className={styles.searchClear} onClick={() => store.dispatch({ type: "query", query: "" })}>
              <X aria-hidden="true" />
              <span className="sr-only">{t.searchClear}</span>
            </button>
          ) : null}
        </div>
        <div className={styles.listStatus}>
          {group ? (
            <span className={styles.groupChip} style={{ "--a3-dot": SYSTEM_COLOR[group] } as CSSProperties}>
              <span className={styles.rowDot} aria-hidden="true" />
              {fmt(t.groupActive, { name: delovi.systems[group].name })}
              <button type="button" className={styles.chipButton} onClick={() => store.dispatch({ type: "group", group: null })}>
                {t.groupShowAll}
              </button>
            </span>
          ) : null}
          <span className={styles.listCount}>{partsCount(ids.length)}</span>
        </div>
      </div>

      {ids.length === 0 ? (
        <div className={styles.empty}>
          <p>{fmt(t.searchEmpty, { query: query.trim() })}</p>
          <button
            type="button"
            className={styles.lightButton}
            onClick={() => {
              store.dispatch({ type: "query", query: "" });
              document.getElementById(SEARCH_ID)?.focus();
            }}
          >
            {t.searchClear}
          </button>
        </div>
      ) : (
        <form id="a3-parts" action="/sajam/3d" method="get" className={styles.listForm} aria-label={t.listLabel} onSubmit={(e) => e.preventDefault()}>
          <UrlHidden group={group} mode={mode} />
          <div onKeyDown={(e) => listKeys(e, "[data-part-row]")}>
            {searching ? (
              <ul className={styles.rows}>{ids.map(row)}</ul>
            ) : (
              sections.map((s) => (
                <section key={s.id} className={styles.section} aria-labelledby={`a3-sec-${s.id}`}>
                  <h2 id={`a3-sec-${s.id}`} className={styles.sectionHead} style={{ "--a3-dot": SYSTEM_COLOR[s.id] } as CSSProperties}>
                    <span className={styles.rowDot} aria-hidden="true" />
                    {delovi.systems[s.id].name}
                    <span className={styles.sectionCount}>{s.ids.length}</span>
                  </h2>
                  <ul className={styles.rows}>{s.ids.map(row)}</ul>
                </section>
              ))
            )}
          </div>
        </form>
      )}
    </div>
  );
}
