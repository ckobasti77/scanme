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

export function FairMapDirectory({
  groups,
  filter,
  selectedParticipationId,
  unlocatedText,
  onSelectPlace,
  onSelectUnlocated,
}: {
  groups: FairMapDirectoryGroup[];
  filter: FairMapFilter;
  selectedParticipationId: string | null;
  unlocatedText: (entry: FairMapExhibitorEntry) => string;
  onSelectPlace: (locationId: string, participationId: string) => void;
  onSelectUnlocated: (participationId: string) => void;
}) {
  if (!groups.length) return null;
  return (
    <section className={styles.directory} aria-labelledby="fair-map-directory-title">
      <div className={styles.directoryHead}>
        <h2 id="fair-map-directory-title" className={styles.directoryTitle}>
          {dict.directoryTitle}
        </h2>
        <p className={styles.directoryHint}>{dict.directoryHint}</p>
      </div>
      {groups.map((group) => {
        const Icon = FAIR_MAP_CATEGORY_ICONS[group.key];
        return (
          <details key={`${group.key}-${filter}`} className={styles.group} open={filter !== "sve"}>
            <summary className={styles.groupSummary}>
              <Icon aria-hidden="true" />
              <span>{fairMapCategoryLabel(group.key)}</span>
              <span className={styles.count}>{group.entries.length}</span>
            </summary>
            <ul className={styles.entries}>
              {group.entries.map((entry) => {
                const [firstPlace, ...more] = entry.places;
                const firstText = firstPlace ? fairMapPlaceText(firstPlace.location, firstPlace.zoneId) : unlocatedText(entry);
                return (
                  <li key={entry.participationId} className={styles.entry}>
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
          </details>
        );
      })}
    </section>
  );
}
