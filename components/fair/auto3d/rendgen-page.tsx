// Stranica /sajam/3d (server): sajamski okvir, naslov, studio sa posterom i panel sa grupama, listom
// i karticom. Početno stanje dolazi iz URL-a (E10), pa server renderuje karticu za `?deo=` i listu
// za `?grupa=`. Ispod scene je sekcija paketa (A11). `?kiosk=1` (A10) je ceo ekran bez zaglavlja i bez paketa.

import manifestJson from "@/public/3d/auto3d/limuzina.manifest.json";
import { PARTS, SYSTEMS } from "@/lib/auto3d/catalog";
import { parseManifest } from "@/lib/auto3d/manifest";
import type { UrlState } from "@/lib/auto3d/url-state";
import { fmt } from "@/lib/i18n/format";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { PackagesSection } from "./packages-section";
import { Poster } from "./poster";
import { RendgenApp } from "./rendgen-app";
import styles from "./auto3d.module.css";

const manifest = parseManifest(manifestJson);

export function RendgenPage({ url }: { url: UrlState }) {
  const posters = manifest.files.posters;
  // Kiosk (A10): ceo ekran je studio, bez zaglavlja i uvoda; naslov ostaje za čitače ekrana.
  const kiosk = url.kiosk;
  return (
    <div className={`fair-event fair-event--auto-moto ${styles.page}${kiosk ? ` ${styles.kioskPage}` : ""}`} data-reveal="off">
      {kiosk ? null : (
        <header className="fair-shell">
          <div className={`fair-shell__inner ${styles.shellInner}`}>
            <div className="fair-event-lockup" aria-label={t.lockupLabel}>
              <span className="fair-event-lockup__mark" aria-hidden="true" />
              <span>
                <strong>{t.lockupTitle}</strong>
                <small>{t.lockupEvent}</small>
              </span>
            </div>
          </div>
        </header>
      )}
      <main className={styles.main}>
        {kiosk ? <h1 className="sr-only">{t.title}</h1> : null}
        <RendgenApp
          initialUrl={url}
          intro={
            <>
              <h1>{t.title}</h1>
              <p>{t.lead}</p>
              <p className={styles.summary}>{fmt(t.summary, { parts: PARTS.length, groups: SYSTEMS.length })}</p>
            </>
          }
          models={{
            desktop: { url: manifest.files.desktop.url, bytes: manifest.files.desktop.bytes },
            lite: { url: manifest.files.lite.url, bytes: manifest.files.lite.bytes },
          }}
          poster={<Poster desktop={posters["sklopljen-desktop"]} telefon={posters["sklopljen-telefon"]} alt={t.posterAlt} />}
          posterExploded={<Poster desktop={posters["rasklopljen-desktop"]} telefon={posters["rasklopljen-telefon"]} alt="" priority={false} />}
        />
        {kiosk ? null : <PackagesSection />}
      </main>
    </div>
  );
}
