# FRONTEND-DELTA 2026-11-27: Auto Expo 2026 izgled

- `lib/fair-theme.ts`: `auto-expo-2026` dobija klasu `fair-event--auto-moto fair-event--auto-expo`. Zadržava papir i pečate AMF-a, a menja akcenat u boje loga Auto Expo-a: akcenat `#d2360f`, traka crvena/narandžasta/žuta (`--fair-expo-*`).
- `components/fair/event-shell.tsx`: za događaje iz `lib/fair-salon.ts` stavka „Mapa“ je zamenjena stavkama Ford i MG (`components/fair/brand-icons.tsx`), koje vode na `/brend/<brend>`. Novi prop `currentBrand`; lockup vodi na `/sajam/<event>`.
- `/sajam/auto-expo-2026` više ne prikazuje mapu, nego dve pločice brendova (`components/fair/salon/salon-entry.tsx`). `?stand=` i `?zona=` se tu ignorišu. Geometrija `lib/fair-map/auto-expo-2026.ts` je netaknuta.
- **Stranica brenda (Auto Expo):** heroj sa CTA dugmadima „Zakaži probnu vožnju“ i „Pošalji upit“, kartice modela i lepljivo dugme na telefonu (`components/fair/brand/brand-showroom.tsx`).
  - `?voznja=1` otvara formu za probnu vožnju.
  - `FairBrandPageModel` je aditivno dobio `priceSecondaryText`, `externalUrl` i `highlights`.
- **Stranica modela (Auto Expo):** slider fotografija (`components/fair/gallery/model-slider.tsx`, `lib/fair-gallery`). Prvi automatski prelaz je posle 12 s, zatim na svakih 7 s, a postoji i pauza.
  - Slike su u `public/fair/auto-expo-2026/slider/`, iz `scripts/fair/auto-expo-slider-assets.mjs`.
  - Izvor je `tmp/auto-expo-fotografije`; slike su fotografije proizvođača i dao ih je vlasnik.
