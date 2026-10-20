# AMF entrance readability and selection — 19 October 2026

Checkout `scanme-amf-pasos`, branch `feature/amf-pasos-markice`. Preserved all existing uncommitted map, sponsor, demo and offer work. No commit/push/deployment or backend data changes.

- Latest owner instruction supersedes the earlier request for colored entrance marks: **all exhibitor logos stay monochrome**. Grayscale keeps image detail instead of turning transparent artwork into solid black shapes. Current site `BrandLogo` replaces the legacy ScanMe asset; both mask layers use map ink. ScanMe's existing green booth background is unchanged; its logo is monochrome. Lukač uses the plan's italic name instead of the black crest.
- Entrance is a visitor diagram, not a scale floor plan. Widened indoor booths and adjusted the wall/central stairs to keep them inside the foyer. The right wing remains. Fits the available map height, like the hall, while marks retain their aspect ratio. Caption overflow is checked; long formal names retain their full accessible title/pop-up and use short typed captions from `FairMapDict.entranceCaptions` / `sr/fair-map.ts`.
- Indoor booths remain flat rectangles without heat. Outdoor AODES, Xtreme, Auto Happy, SWM and Kia remain right of the entrance, now with six organic contours each and no rectangular outline or contour clipping to stand polygons. Kia/Xtreme footprint ratio follows 100/96 m²; other sizes keep their relative order with a readability floor. No new mapLocationIds; SWM's previously documented null location remains.
- Selection ellipse measures actual rendered logo/caption bounds with ResizeObserver, then converts screen bounds back to map coordinates. It updates on layout/font changes, not each heat frame. Dash pattern is permanent across hover, focus, selection and deselection; the solid orange hover outline is removed. Pan/zoom, pop-up, website access and existing heat eligibility are preserved.
- Entrance caption/arrow uses transparent HTML/SVG chrome, avoiding the dark block across the old SVG entrance text.

## Validation

- 44 targeted tests: entrance geometry, whole booths inside the foyer wall, outdoor ratio, heat/catalog and actual AMF markup.
- Final `npm run build` passes; TypeScript and targeted ESLint pass. `npm run check` passes lint (two existing warnings), build and namespace; its standard harness cannot start another Next dev instance alongside the owner's running port-3000 server. The unchanged comparator run against that server passes 177 cases × 2 viewports byte-for-byte.
- `amf-topographic.browser.mjs` passes on 360×640, 375×812, 390×844, 430×932, 1280×900, 844×390: both zones, all critical entrance selections, original website links, contour/rectangle distinction, logo/caption enclosure in selection ellipses, no text overflow, no solid hover/deselection stroke, canonical ScanMe mask, no scroll/runtime errors/unexpected POSTs. Final output: `C:/Users/user/AppData/Local/Temp/scanme-amf-topography-YDOUQO`.
- Actual local route inspected at 390×844 and 1280×900; Benni pop-up/close and full monochrome entrance checked. Screenshots: `output/amf-mapa/ulaz-citljiv-2026-10-19.jpg`, `ulaz-selekcija-2026-10-19.jpg`, `ulaz-desktop-2026-10-19.jpg`.

Local entry: `http://localhost:3000/sajam/auto-moto-fest-2026?zona=ispred`. Existing server retained. PDF/export and production publication were not changed in this correction.
