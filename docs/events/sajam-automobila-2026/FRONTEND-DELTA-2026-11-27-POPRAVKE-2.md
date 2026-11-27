# Frontend delta — 27. 11. 2026. (Auto Expo, hitne popravke 2)

## Boje vozila = boje sa štanda
Podrazumevana boja svakog modela je boja auta na štandu, svuda: prva boja slidera, isečak na stranici brenda i fotografija modela (garaža, poređenje, specifikacije).

| Model | Boja | Napomena |
|---|---|---|
| Ford Kuga ST-Line | crna | |
| Ford Puma | bela | Na štandu je svetlosiva/srebrna, ali naša "svetlosiva" (n4jc) je zelenkasta, a "siva" pretamna. Nijedna ne liči na pravi auto, pa je izabrana bela. |
| MG ZS Hybrid+ | crvena | |
| MG HS Hybrid+ | srebrna (Silver) | Najviše liči na auto sa štanda. |
| MG3 | bela | |

- `scripts/fair/auto-expo-slider-assets.mjs`: `STAND_COLOR` stavlja boju sa štanda na prvo mesto (`lib/fair-gallery/auto-expo-2026.ts` je regenerisan, slike slidera su iste).
- `scripts/fair/auto-expo-stand-photos.mjs` (novo) pravi isečke za salon i `public/fair/auto-expo-2026/modeli/<slug>.webp`. Isečci su preimenovani sa bojom u imenu (`ford-kuga-crna.webp`…), da keš slika ne bi vraćao staru boju.
- `lib/fair-salon.ts`: novo `fairStandPhotoUrl(eventSlug, modelSlug, photoUrl)`. Za model iz salona (Auto Expo) vraća `https://scanme.rs/fair/auto-expo-2026/modeli/<slug>.webp`, a za druge događaje ostaje `photoUrl` iz baze. Primenjuje se u `model-view`, `brand-page`, `brand-compare`, `garage-page` i `garage-view`. Razlog: PROD redovi i dalje imaju zajedničke AMF fotografije.
- `b1-payload.json`: photoUrl pokazuje na nove fajlove (MG3 ga sad ima). Cene su Puma "od 18.990 €" i Kuga "od 27.490 €", a `priceSecondaryText` je uklonjen za svih 5 modela (MG ZS: na PROD-u je "od 19.990 €" bez sekundarnog teksta).

## Stranica modela na telefonu (samo Auto Expo)
Redosled je: hero → specifikacije → Probna vožnja → Zainteresovan sam → Oceni model → Sačuvaj u garažu | Uporedi → link izlagača. `ModelActionsCheckpoint` ima novi prop `afterActions`. Kad je zadat, ocena ide odmah ispod akcija, a `afterActions` (garaža) posle nje. Ostali događaji su nepromenjeni.

Hero je 16:9,4, a slika je podignuta za 16 %. Razmaci su 6 px, a CTA, ocena i garaža su visoki 44 px. Izmereno sa PROD podacima: dno reda garaže je na 598 px za 390×844 (vidljivo 700) i na 579 px za 360×780 (vidljivo 636).

DEV je usklađen sa PROD-om uvozom `b1-payload.json` (importDryRun pa importCommit, 5 modela `updated`). Privremena kopija je imala `priceSecondaryText: ""`, jer import zadržava postojeći tekst kad polja nema. QR dodele su izostavljene, jer DEV nema QR inventar.

## Admin
Detalj modela prikazuje "Probna vožnja" prema `getFairEntitlements(tier, event.code)`, pa se poštuje `testDriveEvents`. `EventModelDetailView` ima novi prop `eventCode`.
