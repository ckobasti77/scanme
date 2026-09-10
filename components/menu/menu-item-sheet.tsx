"use client";

// The Menu item bottom-sheet (RFC-003 §2.3, §2.5 — TASK-53):
// Opens on tap/click or keyboard activation (Enter/Space) of an item in the list.
// Displays the full item detail:
//   1. Video (Premium): plays ONLY in this sheet, strictly inert in the list (no
//      <video> element, no preload, no network calls while closed);
//   2. Full photo or category accent tile (the no-empty-frame rule, §2.4);
//   3. Name, "nema više" status, top-level price, and full description;
//   4. Variants table with labels and formatted prices;
//   5. "Ide uz" pairings: read from item.pairings (mapped through lib/menu-rows.ts),
//      allowing one-tap inspection of paired items.
//
// Accessibility contract:
//   - role="dialog", aria-modal="true", aria-labelledby linking to the title;
//   - Focus trap: Tab cycles between focusable elements within the sheet;
//   - Escape key dismisses the sheet;
//   - On close (Escape, close button, or backdrop click), focus returns directly
//     to the trigger element that opened the sheet.

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { menuSr as dict } from "@/lib/i18n/sr/menu";
import type { MenuItem } from "@/lib/menu-blocks";
import { MenuItemIconTile } from "./item-icon-tile";
import { formatRsd, menuStorageUrl } from "./menu-view";
import styles from "./menu-item-sheet.module.css";

export function MenuItemSheet({
  item,
  itemsById,
  onClose,
  onSelectItem,
}: {
  item: MenuItem;
  itemsById: Map<string, MenuItem>;
  onClose: () => void;
  onSelectItem: (itemId: string) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sendInquiry = useAction(api.menuInquiryEmails.sendItemInquiry);
  const [inquiryState, setInquiryState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  // "Upit" (§2.10): sends exactly one email to the local's owner through the
  // existing mail seam. Menu is not a shop — this is the ONLY action here,
  // there is no cart and no total anywhere in this sheet.
  const handleInquiry = async () => {
    setInquiryState("sending");
    try {
      await sendInquiry({ itemId: item.id as Id<"menuItems"> });
      setInquiryState("sent");
    } catch {
      setInquiryState("error");
    }
  };

  // Focus trap, Escape dismiss, scroll lock, and return of focus to the opener.
  useEffect(() => {
    const previous = document.activeElement;
    closeButtonRef.current?.focus();

    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !sheetRef.current) return;

      const focusables = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), video[controls]',
        ),
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!(active instanceof HTMLElement) || !focusables.includes(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [onClose]);

  const videoUrl = menuStorageUrl(item.videoStorageId);
  const photoUrl = menuStorageUrl(item.photoStorageId);

  // "Ide uz" pairings: read through lib/menu-rows.ts mapped item.pairings
  const pairedItems = useMemo(() => {
    return item.pairings
      .map((pairing) => itemsById.get(pairing.pairedItemId))
      .filter((paired): paired is MenuItem => paired !== undefined);
  }, [item.pairings, itemsById]);

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-sheet-title"
      >
        <div className={styles.handle} aria-hidden="true" />

        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="menu-item-sheet-title" className={styles.title}>
              <span>{item.name}</span>
              {!item.available ? (
                <span className={styles.unavailableBadge}>
                  {dict.unavailableBadge}
                </span>
              ) : null}
            </h2>
            {item.priceRsd !== undefined ? (
              <p className={styles.price}>
                {fmt(dict.priceRsd, { price: formatRsd(item.priceRsd) })}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            ref={closeButtonRef}
            className={styles.closeButton}
            onClick={onClose}
            aria-label={dict.sheetClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* "Upit" (§2.10): the sheet's only action. No cart, no total. */}
        <div className={styles.inquiryRow}>
          <button
            type="button"
            className={styles.inquiryButton}
            onClick={handleInquiry}
            disabled={inquiryState === "sending" || inquiryState === "sent"}
            aria-label={fmt(dict.inquiryAria, { name: item.name })}
          >
            {dict.inquiryAction}
          </button>
          <p className={styles.inquiryStatus} aria-live="polite">
            {inquiryState === "sent" ? dict.inquirySuccess : null}
            {inquiryState === "error" ? dict.inquiryError : null}
          </p>
        </div>

        {/* Media slot: video (when present, inert in list), photo, or category tile */}
        <div className={styles.mediaContainer}>
          {videoUrl ? (
            <video
              className={styles.videoElement}
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              poster={photoUrl ?? undefined}
              aria-label={fmt(dict.videoAria, { name: item.name })}
            />
          ) : photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.photoElement}
              src={photoUrl}
              alt={item.name}
              loading="lazy"
            />
          ) : (
            <div className={styles.tileFrame}>
              <MenuItemIconTile
                productType={item.productType}
                iconKey={item.iconKey}
              />
            </div>
          )}
        </div>

        {item.description ? (
          <p className={styles.description}>{item.description}</p>
        ) : null}

        {/* Variants table */}
        {item.variants.length > 0 ? (
          <section
            className={styles.section}
            aria-label={fmt(dict.variantsAria, { name: item.name })}
          >
            <h3 className={styles.sectionHeading}>
              {fmt(dict.variantsAria, { name: item.name })}
            </h3>
            <table className={styles.variantsTable}>
              <tbody>
                {item.variants.map((variant) => (
                  <tr key={variant.id} className={styles.variantRow}>
                    <th scope="row" className={styles.variantLabel}>
                      {variant.label}
                    </th>
                    <td className={styles.variantPrice}>
                      {fmt(dict.priceRsd, {
                        price: formatRsd(variant.priceRsd),
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* "Ide uz" pairings */}
        {pairedItems.length > 0 ? (
          <section className={styles.section} aria-label={dict.pairingsTitle}>
            <h3 className={styles.sectionHeading}>{dict.pairingsTitle}</h3>
            <ul className={styles.pairingsList}>
              {pairedItems.map((paired) => {
                const pairedPhoto = menuStorageUrl(paired.photoStorageId);
                return (
                  <li key={paired.id}>
                    <button
                      type="button"
                      className={styles.pairingCard}
                      onClick={() => onSelectItem(paired.id)}
                      aria-label={fmt(dict.pairItemAria, { name: paired.name })}
                    >
                      <div className={styles.pairingMedia}>
                        {pairedPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pairedPhoto}
                            alt=""
                            className={styles.pairingImg}
                            loading="lazy"
                          />
                        ) : (
                          <MenuItemIconTile
                            productType={paired.productType}
                            iconKey={paired.iconKey}
                          />
                        )}
                      </div>
                      <div className={styles.pairingBody}>
                        <span className={styles.pairingName}>{paired.name}</span>
                        {paired.priceRsd !== undefined ? (
                          <span className={styles.pairingPrice}>
                            {fmt(dict.priceRsd, {
                              price: formatRsd(paired.priceRsd),
                            })}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
