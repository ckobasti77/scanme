// map — server wrapper. "static" is a zero-request address card with a deep
// link out to the maps app (no third-party request at all, no layout shift).
// "embed" reserves the iframe's exact box and defers loading to an explicit
// tap (privacy: no Google request until the guest asks) via the client facade.

import { MapPin, ExternalLink } from "lucide-react";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { MapProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";
import { MapEmbedClient } from "./map-embed-client";

function mapQuery(location: MapProps["location"]): string {
  return location.kind === "address"
    ? location.address
    : `${location.lat},${location.lng}`;
}

export function MapBlock({ props }: { props: MapProps }) {
  const query = mapQuery(props.location).trim();
  if (!query) return null;

  const label =
    props.pinLabel ||
    (props.location.kind === "address" ? props.location.address : query);
  const openUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${props.zoom}&hl=sr&output=embed`;

  if (props.display === "embed") {
    return (
      <MapEmbedClient
        embedSrc={embedSrc}
        openUrl={openUrl}
        label={label}
        loadLabel={dict.mapLoadButton}
        privacyNote={dict.mapPrivacyNote}
        iframeTitle={dict.mapIframeTitle}
        openLabel={dict.mapOpenLink}
      />
    );
  }

  return (
    <div className={styles.mapCard}>
      <p className={styles.mapPinRow}>
        <MapPin aria-hidden="true" />
        <span>{label}</span>
      </p>
      <div className={styles.mapActions}>
        <a
          className={styles.action}
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className={styles.actionIcon} aria-hidden="true" />
          {dict.mapOpenLink}
        </a>
      </div>
    </div>
  );
}
