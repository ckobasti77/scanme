"use client";

// Click-to-load facade for the Google Maps embed. The frame reserves the exact
// aspect-ratio box up front (zero layout shift), and the third-party iframe is
// only created after an explicit tap — no request leaves for Google until the
// guest asks for the map.

import { useState } from "react";
import { MapPin } from "lucide-react";
import styles from "../venue-template.module.css";

export function MapEmbedClient({
  embedSrc,
  openUrl,
  label,
  loadLabel,
  privacyNote,
  iframeTitle,
  openLabel,
}: {
  embedSrc: string;
  openUrl: string;
  label: string;
  loadLabel: string;
  privacyNote: string;
  iframeTitle: string;
  openLabel: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div>
      <div className={styles.mapEmbedFrame}>
        {loaded ? (
          <iframe
            src={embedSrc}
            title={iframeTitle}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className={styles.mapEmbedFacade}>
            <p className={styles.mapPinRow}>
              <MapPin aria-hidden="true" />
              <span>{label}</span>
            </p>
            <button
              type="button"
              className={`${styles.action} ${styles.actionPrimary}`}
              onClick={() => setLoaded(true)}
            >
              {loadLabel}
            </button>
            <p className={styles.mapPrivacyNote}>{privacyNote}</p>
          </div>
        )}
      </div>
      <div className={styles.mapActions} style={{ marginTop: "0.6rem" }}>
        <a
          className={styles.action}
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {openLabel}
        </a>
      </div>
    </div>
  );
}
