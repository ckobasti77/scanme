"use client";

// Share actions leaf. Share URLs are built at CLICK time from
// window.location.href, so the server render never guesses an origin and
// hydration stays clean. Copy uses the async clipboard with a brief "copied"
// confirmation; brand glyphs come from simple-icons via react-icons.

import { useEffect, useRef, useState } from "react";
import { SiFacebook, SiViber, SiWhatsapp, SiX } from "react-icons/si";
import { Check, Link as LinkIcon } from "lucide-react";
import type { ShareProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

type Channel = ShareProps["channels"][number];

type Labels = {
  whatsapp: string;
  viber: string;
  facebook: string;
  x: string;
  copy: string;
  copied: string;
};

export function ShareActionsClient({
  channels,
  message,
  labels,
}: {
  channels: Channel[];
  message: string;
  labels: Labels;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  function shareUrlFor(channel: Channel): string | null {
    const url = window.location.href;
    const text = `${message} ${url}`;
    switch (channel) {
      case "whatsapp":
        return `https://wa.me/?text=${encodeURIComponent(text)}`;
      case "viber":
        return `viber://forward?text=${encodeURIComponent(text)}`;
      case "facebook":
        return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
      case "x":
        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`;
      case "copy":
        return null;
    }
  }

  async function handleClick(channel: Channel) {
    if (channel === "copy") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard unavailable (permissions, http) — leave the label as-is.
      }
      return;
    }
    const url = shareUrlFor(channel);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const icon = (channel: Channel) => {
    const props = { className: styles.actionIcon, "aria-hidden": true as const };
    switch (channel) {
      case "whatsapp":
        return <SiWhatsapp {...props} />;
      case "viber":
        return <SiViber {...props} />;
      case "facebook":
        return <SiFacebook {...props} />;
      case "x":
        return <SiX {...props} />;
      case "copy":
        return copied ? <Check {...props} /> : <LinkIcon {...props} />;
    }
  };

  const label = (channel: Channel) => {
    switch (channel) {
      case "whatsapp":
        return labels.whatsapp;
      case "viber":
        return labels.viber;
      case "facebook":
        return labels.facebook;
      case "x":
        return labels.x;
      case "copy":
        return copied ? labels.copied : labels.copy;
    }
  };

  return (
    <div className={styles.shareRow}>
      {channels.map((channel) => (
        <button
          key={channel}
          type="button"
          className={styles.action}
          onClick={() => handleClick(channel)}
        >
          {icon(channel)}
          {label(channel)}
        </button>
      ))}
    </div>
  );
}
