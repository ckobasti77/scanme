"use client";

// ScanMe Menu V1 — the device frame of the editor preview (K17; master §15.2
// "preview na telefonu i desktopu"). The public renderer lays itself out by
// the WINDOW width (media queries, components/menu/javni/javni.module.css),
// so drawn straight into a narrow column it showed its desktop layout inside
// the phone frame. Here the same renderer is drawn into a same-origin iframe
// exactly as wide as the device (390, 768 or 1280 px), so its own rules for
// that width apply, then scaled down to fit the column. The page's styles
// and self-hosted faces are mirrored into the frame (and kept in step while
// the editor runs).
//
// The frame is a picture: inert, hidden from assistive technology, nothing
// in it is focusable (the same content is edited and announced in the work
// area). Its height follows its content; the column scrolls. Until the frame
// is ready (and on the server) the content is drawn in place, so the first
// paint and the render tests see it.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type StudioUredjaj = "telefon" | "tablet" | "desktop";

export const SIRINA_UREDJAJA: Record<StudioUredjaj, number> = { telefon: 390, tablet: 768, desktop: 1280 };

/** The page's style sheets, copied into the frame (link and style elements). */
function kopirajStilove(izvor: Document, cilj: Document) {
  for (const cvor of Array.from(izvor.head.querySelectorAll('link[rel="stylesheet"], style'))) {
    cilj.head.appendChild(cvor.cloneNode(true));
  }
}

export function OkvirUredjaja({ uredjaj, children }: { uredjaj: StudioUredjaj; children: ReactNode }) {
  const omotac = useRef<HTMLDivElement>(null);
  const okvir = useRef<HTMLIFrameElement>(null);
  const [telo, setTelo] = useState<HTMLElement | null>(null);
  const [sirinaKolone, setSirinaKolone] = useState(0);
  const [visina, setVisina] = useState(0);
  const sirina = SIRINA_UREDJAJA[uredjaj];
  const razmera = sirinaKolone > 0 ? Math.min(1, sirinaKolone / sirina) : 1;

  // The column width decides the scale.
  useLayoutEffect(() => {
    const element = omotac.current;
    if (!element) return;
    const meri = () => setSirinaKolone(element.clientWidth);
    meri();
    const posmatrac = new ResizeObserver(meri);
    posmatrac.observe(element);
    return () => posmatrac.disconnect();
  }, []);

  // The frame document: the page's styles, then a body to draw into.
  useEffect(() => {
    const iframe = okvir.current;
    const dokument = iframe?.contentDocument;
    if (!iframe || !dokument) return;
    dokument.open();
    dokument.write('<!doctype html><html lang="sr-Latn"><head><meta charset="utf-8"></head><body></body></html>');
    dokument.close();
    kopirajStilove(document, dokument);
    dokument.documentElement.style.background = "transparent";
    dokument.body.style.margin = "0";
    dokument.body.style.background = "transparent";
    // Styles added later (a lazily loaded chunk, a dev reload) follow into the frame.
    const posmatrac = new MutationObserver((promene) => {
      for (const promena of promene) {
        for (const cvor of Array.from(promena.addedNodes)) {
          if (cvor instanceof HTMLStyleElement || (cvor instanceof HTMLLinkElement && cvor.rel === "stylesheet")) {
            dokument.head.appendChild(cvor.cloneNode(true));
          }
        }
      }
    });
    posmatrac.observe(document.head, { childList: true });
    setTelo(dokument.body);
    return () => {
      posmatrac.disconnect();
      setTelo(null);
    };
  }, []);

  // The frame is as tall as its content (the column scrolls, the picture does not).
  useEffect(() => {
    if (!telo) return;
    const prozor = telo.ownerDocument.defaultView;
    const Posmatrac = prozor?.ResizeObserver ?? ResizeObserver;
    const meri = () => setVisina(telo.scrollHeight);
    meri();
    const posmatrac = new Posmatrac(meri);
    posmatrac.observe(telo);
    return () => posmatrac.disconnect();
  }, [telo, uredjaj]);

  const spremno = telo !== null && sirinaKolone > 0;
  return (
    <div ref={omotac} data-okvir-uredjaja={uredjaj} data-spremno={spremno ? "" : undefined} className="w-full">
      {spremno ? null : children}
      <div
        aria-hidden="true"
        className="relative overflow-hidden"
        style={spremno ? { width: Math.round(sirina * razmera), height: Math.max(1, Math.round(visina * razmera)), margin: "0 auto" } : { height: 0 }}
      >
        <iframe
          ref={okvir}
          title=""
          tabIndex={-1}
          inert
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 block border-0"
          style={{ width: sirina, height: Math.max(1, visina), transform: `scale(${razmera})`, transformOrigin: "0 0" }}
        />
      </div>
      {spremno && telo ? createPortal(children, telo) : null}
    </div>
  );
}
