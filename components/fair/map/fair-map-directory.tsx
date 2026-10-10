import { ChevronDown } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import type { FairMapDirectoryGroup, FairMapExhibitorEntry, FairMapFilter } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";
import { FAIR_MAP_CATEGORY_ICONS, FairMapLogoBox, fairMapCategoryLabel } from "./fair-map-logo";
import { fairMapPlaceText } from "./fair-map-text";
import styles from "./fair-event-map.module.css";

// N4 — the exhibitor list by category: short (collapsed groups), the map
// stays the main thing. Each row: logo, name and the stand badge
// ("Štand 2 · Hala"); a tap selects the stand and focuses it on the map.
// An exhibitor on several stands (Venera Bike) gets one badge per place.
// A group opens and closes with the grid trick (0fr → 1fr); its rows cascade
// in only the first time it opens (≤ 200 ms in all).

type DirectoryProps = {
  groups: FairMapDirectoryGroup[];
  filter: FairMapFilter;
  selectedParticipationId: string | null;
  unlocatedText: (entry: FairMapExhibitorEntry) => string;
  onSelectPlace: (locationId: string, participationId: string) => void;
  onSelectUnlocated: (participationId: string) => void;
};

/** Rows past the fifth start together: the cascade never takes longer than 5 × 40 ms. */
const CASCADE_STEPS = 5;

function DirectoryGroup({
  group,
  defaultOpen,
  selectedParticipationId,
  unlocatedText,
  onSelectPlace,
  onSelectUnlocated,
}: Omit<DirectoryProps, "groups" | "filter"> & { group: FairMapDirectoryGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  // The cascade belongs to the first showing only; an open-by-default group is already on screen.
  const [cascade, setCascade] = useState(false);
  const [shown, setShown] = useState(defaultOpen);
  const bodyId = useId();
  const Icon = FAIR_MAP_CATEGORY_ICONS[group.key];
  const toggle = () => {
    if (open) {
      setCascade(false);
      setOpen(false);
      return;
    }
    if (!shown) {
      setShown(true);
      setCascade(true);
    }
    setOpen(true);
  };
  return (
    <div className={styles.group} data-open={open}>
      <h3 className={styles.groupHeading}>
        <button type="button" className={styles.groupSummary} aria-expanded={open} aria-controls={bodyId} onClick={toggle} data-fair-map-group="">
          <Icon aria-hidden="true" />
          <span>{fairMapCategoryLabel(group.key)}</span>
          <span className={styles.count}>{group.entries.length}</span>
          <ChevronDown className={styles.groupChevron} aria-hidden="true" />
        </button>
      </h3>
      <div id={bodyId} className={styles.groupBody} inert={!open}>
        <div className={styles.groupInner}>
          <ul className={styles.entries} data-cascade={cascade ? "on" : undefined}>
            {group.entries.map((entry, index) => {
              const [firstPlace, ...more] = entry.places;
              const firstText = firstPlace ? fairMapPlaceText(firstPlace.location, firstPlace.zoneId) : unlocatedText(entry);
              return (
                <li key={entry.participationId} className={styles.entry} style={{ "--fair-map-cascade": Math.min(index, CASCADE_STEPS) } as CSSProperties}>
                  <button
                    type="button"
                    className={styles.entryButton}
                    aria-pressed={entry.participationId === selectedParticipationId}
                    onClick={() => (firstPlace ? onSelectPlace(firstPlace.location.id, entry.participationId) : onSelectUnlocated(entry.participationId))}
                  >
                    <FairMapLogoBox logoUrl={entry.logoUrl} name={entry.exhibitorName} size="sm" />
                    <span className={styles.entryText}>
                      <span className={styles.entryName}>{entry.exhibitorName}</span>
                      <span className={styles.placeBadge} data-unlocated={!firstPlace}>
                        {firstText}
                      </span>
                    </span>
                  </button>
                  {more.length ? (
                    <div className={styles.morePlaces}>
                      {more.map((place) => {
                        const text = fairMapPlaceText(place.location, place.zoneId);
                        return (
                          <button
                            key={place.stand.standId}
                            type="button"
                            className={styles.placeChip}
                            aria-label={fmt(dict.placeButtonAria, { exhibitor: entry.exhibitorName, place: text })}
                            onClick={() => onSelectPlace(place.location.id, entry.participationId)}
                          >
                            {text}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function FairMapDirectory({ groups, filter, ...rest }: DirectoryProps) {
  if (!groups.length) return null;
  return (
    <section className={styles.directory} aria-labelledby="fair-map-directory-title">
      <div className={styles.directoryHead}>
        <h2 id="fair-map-directory-title" className={styles.directoryTitle}>
          {dict.directoryTitle}
        </h2>
        <p className={styles.directoryHint}>{dict.directoryHint}</p>
      </div>
      <div className={styles.groups}>
        {groups.map((group) => (
          // A new filter starts the list over: one category opens, "Sve" starts collapsed.
          <DirectoryGroup key={`${group.key}-${filter}`} group={group} defaultOpen={filter !== "sve"} {...rest} />
        ))}
      </div>
    </section>
  );
}
