import { FairMapOverlay } from "@/components/fair/map/fair-map-overlay";
import { FAIR_MAP_GEOMETRIES } from "@/lib/fair-map";
import { fmt } from "@/lib/i18n/format";
import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";

// M0 — DEV overlay check of the map geometry for both events and both zones.
// Shown under Kodeks's prototype; nothing here is the public map.

const dateFormat = new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });

export function MapOverlayPreview() {
  return (
    <section aria-labelledby="sajam-preklop" className="bg-white px-4 py-10 text-neutral-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <h2 id="sajam-preklop" className="text-2xl font-semibold">
          {dict.overlayTitle}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-600">{dict.overlayIntro}</p>
        {Object.values(FAIR_MAP_GEOMETRIES).map((geometry) => (
          <section key={geometry.key} aria-labelledby={`preklop-${geometry.key}`} className="mt-10">
            <h3 id={`preklop-${geometry.key}`} className="text-lg font-semibold">
              {dict.events[geometry.key]}{" "}
              <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-900">
                {dict.overlayDraft}
              </span>
            </h3>
            <div className="mt-4 grid gap-8 lg:grid-cols-2">
              {geometry.zones.map((zone) => (
                <figure key={zone.id} className="min-w-0">
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <FairMapOverlay
                      zone={zone}
                      label={fmt(dict.overlayAria, { event: dict.events[geometry.key], zone: dict.zones[zone.id] })}
                    />
                  </div>
                  <figcaption className="mt-2 text-sm text-neutral-600">
                    {fmt(dict.overlayCaption, {
                      zone: dict.zones[zone.id],
                      count: zone.locations.length,
                      file: zone.image.organizerFile,
                      date: dateFormat.format(Date.parse(geometry.capturedOn)),
                    })}
                  </figcaption>
                  <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {zone.locations.map((location) => (
                      <li key={location.id} className="rounded border border-neutral-300 px-1.5 py-0.5 font-mono">
                        {location.id}
                        {location.placement === "placeholder" ? ` (${dict.overlayPlaceholder})` : null}
                      </li>
                    ))}
                  </ul>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
