// ScanMe Menu V1 (K13, plan K12-16) — the analytics seam of the public menu.
// The renderer reports what a guest did; until K29 builds the events, the
// sessions and the consent point (P8), this does nothing and sends nothing.
// Seeing an article while scrolling is NOT an event (master §14): only
// opening its detail is.

export type JavniDogadjaj =
  | { vrsta: "menu_open"; slug: string }
  | { vrsta: "splitter_open"; slug: string }
  | { vrsta: "page_open"; slug: string; pageKey: string }
  | { vrsta: "article_detail_open"; slug: string; pageKey: string; articleKey: string };

/** No effect until K29. */
export function trackJavni(dogadjaj: JavniDogadjaj): void {
  void dogadjaj;
}
