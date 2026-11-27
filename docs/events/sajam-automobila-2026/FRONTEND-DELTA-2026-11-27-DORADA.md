# FRONTEND-DELTA 2026-11-27 (dorada): Auto Expo bez početne stranice

Grana `auto-expo-dorada`. Važi samo za događaje iz `lib/fair-salon.ts` (`auto-expo-2026` i DEV `test-auto-expo-2026`); AMF, Elektromobilnost i demo su nepromenjeni.

- **`/sajam/auto-expo-2026` je 404** (isti prikaz kao nepostojeći sajam, `app/sajam/[eventSlug]/not-found.tsx`), i sa `?stand=` / `?zona=`. Događaj se ne čita iz Convex-a. `loading.tsx` za taj URL ne prikazuje zaglavlje.
- **`/sajam`** (aktivni sajam) za Auto Expo vodi na `/sajam/auto-expo-2026/pasosi` (307).
- Novi helperi u `lib/fair-salon.ts`: `fairEventHomeHidden(slug)`, `fairEventEntryPath(slug)` i `fairPublicMapEnabled(slug)` (`FAIR_PUBLIC_MAP_ENABLED` i događaj ima početnu stranicu).
- **Linkovi ka početnoj stranici su uklonjeni:**
  - lockup „AUTO EXPO / 2026“ u zaglavlju više nije link (kao na AMF-u i Elektro-u);
  - prazna garaža prikazuje tekst bez mape (`emptyBodyNoMap`);
  - pasoš: „Pronađi na mapi“ postaje „zaključano“ (`stampLockedHint`), kartice zaključanih modela nisu linkovi;
  - stranica modela: čip „Hala“ ostaje kao oznaka, bez linka.
- **Tip:** `FairModelStand.href` je sada `string | null` (null = oznaka bez linka). `StampPassport` prop `mapHref` je `string | null`.
- `FairSalonCutout` je dobio obavezno polje `ground` (gde točak dodiruje pod, deo visine slike). `FairBrandVector` (`kind: "path"`) ima opciono `box` (viewBox nacrtanog dela); Ford ga koristi.
- `components/fair/salon/salon-entry.tsx` se više ne koristi (ulazna stranica je ugašena). Fajl je ostavljen dok vlasnik ne potvrdi da početna stranica ostaje ugašena.
