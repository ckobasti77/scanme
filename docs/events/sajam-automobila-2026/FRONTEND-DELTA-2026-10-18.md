# AMF offer, public demo and map corrections — 2026-10-18

Checkout: `scanme-amf-pasos`, branch `feature/amf-pasos-markice`.

- Aligned the complete stylized hall drawing to the organizer's plan at https://sajamautomobila.com/ucesnici-2026/ (`mapa-popunjena-3010-2409.jpg`). Larger upper-left Škoda; Mercedes opposite Volkswagen/Audi; Fiat and Dongfeng side by side; Geely, Motogrini and TVS stacked within location 2; Toyota/Citroën side by side; MG above Ford; Dacia left of Renault; compact lower-wing Vespa/Aprilia/Piaggio/Honda motorcycle footprints within shared location 6–7. This is a stylized drawing, not a floor-area survey. Existing location IDs and backend heat aggregation are unchanged.
- Added `FairModelDict.autoMotoEventName` / `fairModelSr.autoMotoEventName` so the AMF navigation header displays `Auto Moto Fest 2026.` even when incoming event data omits the year. Other event headers retain their existing behavior.
- Old `/dev/sajam-mapa` no longer renders the obsolete map: development redirects to the canonical AMF map, production returns notFound.

## Added

- Static `/sajam/demo-auto-moto-fest-2026/[[...screen]]` route: model, `mapa`, `pasosi`, `pasosi/demo-01`, `garaza`, `garaza/poredjenje`, model audience and survey screens. Reuses actual fair components. Nine fictional models, three demo passports, generic SVG logo and generated unbranded showroom vehicle photo. Exact synthetic-ID allowlist in `lib/fair-demo.ts`.
- Demo map heat cycles on every stand locally, including the outside area. Pause/resume, reduced-motion support and hidden-tab suspension. Demo heat and passport data do not use real fair API requests or Convex data. Real heat behavior is unchanged.
- Demo interactions route to `lib/fair-client/demo-api.ts`; contacts are discarded, no confirmation or follow-up emails. Demo garage seeds two synthetic models once, preserves real records, and filters the demo event. Comparisons allow only demo IDs. Sponsor actions/share traffic avoid real API calls in demo mode. The root Convex/Auth providers remain; isolation refers to demo data/actions.
- `/sajam/auto-moto-fest-2026/prijava`: exhibitor form with company, brands, contact, package, vehicles, optional catalogue URL and note. Uses existing `api.leads.create` without schema/backend changes. `offerSelection` JSON source `amf-2026-exhibitor-registration` preserves the selection. Existing idempotency, validation, honeypot and team notification path apply. No live form submission was made; persistence/retry tested in memory, network blocked. Frontend publication still required.
- New typed dictionaries: `FairDemoDict` and `FairExhibitorRegistrationDict`. No frozen Links render-path edits.

## Real dynamic QR records

Created through existing `cardsAdmin.createCard` on production `adamant-warbler-746`, as expressly requested by the owner. Business `sajam-automobila-2026-qr-inventar` (`j575kh721f190h3g6g0xyvmy6x8fs4qq`). No new resolver or backend deployment.

| Purpose | Stable URL | Card ID | Future destination after publishing |
| --- | --- | --- | --- |
| Demo | https://www.scanme.rs/r/S08AJ7H2 | `nn7ds4p31z8pkys1j2z53zzz318gh7yt` | `https://www.scanme.rs/sajam/demo-auto-moto-fest-2026` |
| Registration | https://www.scanme.rs/r/KZ739G7D | `nn7enckx11w6sr4vhb1dpnat8n8ghvv5` | `https://www.scanme.rs/sajam/auto-moto-fest-2026/prijava` |

Both currently redirect to **https://www.scanme.rs/** temporarily, HTTP 302 + no-store verified. Retarget these SAME records via existing card management after the frontend is public; do not replace printed URLs. IDs are also in `output/amf-ponuda/dynamic-qr.json`. The owner requested production demo connection later.

## Offer artifacts

`scripts/fair/build-amf-offer-preview.py` preserves the original PDF. Output `output/pdf/AMF-2026-Ponuda-izlagacima-RADNI-PREGLED.pdf`: six slides, real app screenshots in phone frames, overview + stamped passport pair, enlarged first QR, real registration QR on slide 6, real past report on slide 2. Both QR codes decode from the rendered PDF and are clickable. Standalone vectors: `output/amf-ponuda/qr-demo.svg`, `qr-prijava.svg`.

PDF remains **RADNI PREGLED · NE SLATI**: Teodora's phone/email are placeholders, public destinations still need publication/retargeting. Package/test-drive promises remain as requested; real test-drive entitlements were not changed. Other original offer slides are preserved.

### Screenshot correction and showroom image

The first slide now uses `screens/demo-map.jpg` from the actual demo route, replacing the earlier real-map screenshot with the Audi RS3 sponsor. The complete hall boundary, entrance, legend and demo sponsor are visible. Phone image placement uses contain sizing rather than cover cropping. Screens were refreshed at a 390×872 viewport matching the phone frame proportions.

Built-in image generation produced a fictional unbranded silver vehicle in a warm showroom. Original image is retained at `output/amf-ponuda/generated-vehicle.png`; final prompt at `output/amf-ponuda/generated-vehicle-prompt.txt`. The app uses the compressed, uncropped `public/fair/demo/vehicle-showroom.webp` (148 KB). Model, garage, passport stamps and sponsor all derive their photo from the same demo model record. All five screenshots were refreshed and the first two PDF pages visually inspected; both QR codes still decode to the existing stable URLs.

## Validation

- Six viewport map checks: 360×640, 375×812, 390×844, 430×932, 1280×900, 844×390, including motorcycle popovers, search, pinch/fit, entrance and reduced motion. No overflow/errors/unexpected posts.
- Targeted map/demo/component tests pass; registration test proves one stored lead on retry, all selection fields retained, invalid/honeypot data rejected. No production fixture/PII writes.
- Browser inspection of demo and registration at desktop/mobile widths; form validation exercised without sending fabricated contacts. Demo lead action showed the local no-contact-sent result. Demo map both zones and pause/resume verified.
- `npm run check`: lint has only two existing warnings (venue-admin unused useMemo, purchaseLifecycle test unused price). Build/TypeScript and namespace pass. Standard golden harness cannot acquire a second Next dev lock alongside the owner's port-3000 server. Same golden comparator rerun from a temporary runner against that server: 177 cases × 2 viewports match byte-for-byte. Original harness/goldens unchanged.

## Next production step

Review/integrate this scoped change set, publish the frontend, verify both public pages, then retarget the existing cards. Fill Teodora's contacts and remove the draft stamp after those checks. Local server is already at port 3000 in this checkout. No commit, push or application deploy in this task.
