# Stranica brenda — šta je gotovo, šta čeka odobrenje

Frontend je završen i testiran (vitest kolocirani testovi); backend Convex se u ovoj seriji kartica NIJE dirao.
Kartice: 01–11 (mapa koda: [`MAPA-KODA.md`](./MAPA-KODA.md)). Poslednja provera: 25.11.2026.

## 1. Šta je urađeno

### Ruta `/sajam/<eventSlug>/brend/<brandSlug>`

- `app/sajam/[eventSlug]/brend/[brandSlug]/page.tsx` — server komponenta, `dynamic = "force-dynamic"` (ista svežina kao `pasosi/[brandSlug]`: podaci se menjaju bez deploy-a); `generateMetadata` sa naslovom "{brand} | {event}" (`fairModelSr.metaTitle`), `robots: index:false`.
- `not-found.tsx` — nepoznat brend/događaj: `fair-not-found` kopija model stranice.
- Demo ruta `app/sajam/demo-auto-moto-fest-2026/[[...screen]]/page.tsx` section `brend`: ista projekcija na fixture podacima, sa istim demo formama kao demo stranica modela (`demoLeadForm`); slanje ide kroz `postFair`, koji `demo-model-*` id-jeve odgovara lokalno (`lib/fair-client/demo-api.ts`) — nijedan POST na `/api/fair/lead`, nijedan pravi lead.
- Podaci: `lib/fair-server/brand-page.ts` → `loadFairBrandPage` koristi `loadFairPassportPage` (postojeće `fairPublic.getPassportCatalog` + `getModelsByIds`), pa po modelu `fetchQuery(fairPublic.getLeadForm, kind: interest|test_drive)`; neuspešno čitanje forme skriva samo tu akciju (`orNull`), stranica i dalje radi.
- Šta prikazuje (`components/fair/brand/brand-page.tsx`, `getDict("fair-brand")`):
  - hero (`brand-hero.tsx`): eyebrow "Brend · Štand <oznaka>" (oznaka štanda izlagača sa mape događaja, `fairMapLocationById`; bez numerisanog štanda samo "Brend"), brend + broj modela + dugmad "Probna vožnja" i "Zainteresovan sam"; pečat-pasoš se prikazuje SAMO kad brend ima pasoš (`hasPassport`), link na `/sajam/<event>/pasosi/<brand>`;
  - red "MODELI NA ŠTANDU" sa brojačem (plural pravac `srPluralCategory`);
  - po jedan red po modelu (`brand-model-row.tsx`): slika preko modelove pipeline (`fairPhotoUnoptimized` + `fairVehiclePhotoStyle`), `priceText` doslovno, pil "Probna vožnja" otvara formu sa tim modelom (ne otvara model stranicu), posle slanja zeleni "Prijavljeno"; ceo red linkuje na `/sajam/<event>/model/<model>`.
- Sve ide kroz postojeće primitive: `FairEventShell`, `FairSheet`, `.fair-*` tokeni u `app/sajam/fair-event.css`; `components/ui/*` se ne koristi na javnoj stranici.

### Prijava za više modela (više poziva postojeće mutacije)

- Jedna forma (`brand-lead-sheet.tsx`) za ceo brend: biraju se samo modeli sa `open` formom za tu vrstu; pravilo kontakta i saglasnost dolaze od PRVOG otvorenog modela (jedan izlagač = jedno pravilo), a svaki model šalje svoj `consent.version`.
- Slanje (`submit-brand-leads.ts`): jedan POST `/api/fair/lead` po izabranom modelu, redom kojim ih posetilac izabrao, SEQUENCERno (nikad `Promise.all` — gateway je single-threaded po posetiocu i `RATE_LIMITED` je realan odgovor); svaki poziv ide na postojeći put `app/api/fair/lead` → `handleFairLead` → `submitLead`, bez novih backend poziva.
- Idempotentnost: `submissionIds` je uporni map `modelId → client UUID` (isti objekat se ponovo prosleđuje na retry), pa retry šalje SAMO modele koji su padali i server vidi isti ključ, ne drugi lead.
- Delimičan uspeh: neuspeli modeli ostaju izabrani u formi sa `.fair-inline-error` ("Prijava za <model(i)> nije poslata. Pokušajte ponovo."); uspešno poslati se odmah označavaju "Prijavljeno" na stranici (`onPartialSent`), i kad posetilac zatvori formu. Kad retry prođe, `onSent` dobija SVE modele poslate iz tog otvaranja forme → `FairBrandLeadSuccess` (`brand-lead-success.tsx`) zamenjuje hero + listu potvrdom (vrsta, modeli, kontakt linija) do izlaska ili "prijavi još".
- `requestedIds` u `brand-page.tsx` pamti poslane modele u sesiji (SPA state — bez localStorage reload-a).

### Pamćenje kontakta

- `ContactBlock` (`components/fair/contact-block.tsx`, deljeno sa model stranicom) prikazuje sačuvani kontakt sa `readSavedContact` + "Koristi"/"Zaboravi"; checkbox "Zapamti" je u `ContactDraft.remember`.
- Upis se dešava SAMO kad je posetilac štiklirao "Zapamti" I sve prijave prošle (`brand-lead-sheet.tsx: if (draft.remember) saveContact(...)`); `lib/fair-client/contact-store.ts` (postojeći, ključ `scanme:fair-contact:v1`) čuva ime + email/telefon, nikad saglasnost ni token.

### Linkovi

- Iz stranice brenda: pasoš `pasosi/<brand>` (pečat, samo `hasPassport`), model stranica `model/<slug>` (svaki red), dugmad otvaraju forme na istoj stranici.
- Ka stranici brenda: `fair-model-page.tsx` (eyebrow sa imenom brenda), `fair-passport.tsx` (dugme "Svi modeli i probna vožnja"), i QR na A4 posteru (see ispod) — svi koriste isti slug `fairPassportBrandSlug(brandName)`. Link na model stranici i dugme na pasošu postoje SAMO kad stranica brenda postoji (brend u katalogu pasoša sa bar jednim modelom u paketu — `lib/fair-brand-page.ts` `fairBrandPageModels`, isto pravilo kao `projectFairBrandPage`); inače ostaje običan tekst.

### Stranica za štampu (A4 QR poster po brendu)

- `components/admin/brand-qr-poster.tsx` (kartica 11): poster je običan DOM u milimetrima (`brand-qr-poster.module.css`: 210×297mm, `@media print` skriva ostatak stranice, `print-color-adjust`), QR je SVG path preko vendorovanog `lib/qr/qrcodegen` (`qrMatrix(url, "HIGH")`, quiet zone 4) — bez QR biblioteke, bez canvasa; preview na ekranu i odštampani list imaju identičan raspored.
- `components/admin/events/sections/brendovi-qr-section.tsx`: board jednog lista po brendu koji ima model u plaćenom paketu (`brandQrPosterRows(catalog.models, eventSlug)`), "Štampaj sve" (`window.print()`), `data-brand-qr-print-root`.
- Sekcija je registrovana u `lib/admin-v1/event-sections.ts` (`brendovi-qr`, grupa katalog) i renderuje se u `/admin/dogadjaji/<event>/brendovi-qr` (`components/admin/events/event-section.tsx`) i u `/dev/admin-events-preview/brendovi-qr` (`components/admin/admin-events-preview.tsx`).
- QR sadrži `https://www.scanme.rs/sajam/<event>/brend/<brand>` (`brandQrPosterUrl`).

## Čeka odobrenje (backend)

Nijedna od stavke ispod NIJE urađena; frontend je napravio pretpostavke. Aleksa/Jovan odobre pa backend radi.

1. **Analitika otvaranja stranice brenda + izvor `qr-brend`.** Danas se mere samo skenovi/posete pasoša (`recordPassportView`/`getPassportState`); otvaranje `/brend/<brand>` se ne meri, a poster QR nema svoj izvor — treba nov counter sa izvorom `qr-brend` da se razlikuje od QR pasoša.
2. **Slanje prijave izlagaču odmah mejlom.** `submitLead` danas samo upisuje `fairLeads`; MASTER drži ručno odobravanje slanja. Ako se odluci instant-mejl po leadu, menja se `convex/fairLeads.ts` — frontend ne dirati.
3. **Jedna prijava sa više modela = jedan zapis.** Frontend šalje N leadova (jedan po modelu) jer mutacija i `fairLeads` imaju `eventModelId` po redu. Spajanje u jedan zapis sa listom modela traži promenu šeme + `submitLead` i `FairLeadSubmitResult`, pa onda i `submit-brand-leads.ts` (jedan poziv umesto pet) — zato čeka odobrenje.
4. **Pasoš kad nisu svi modeli u paketu.** `lib/fair-entitlements.ts` traži SVE izložene modele u našoj usluzi (`no_exhibited_models`); brend čiji QR poster postoji (ima plaćeni model) može ostati bez pasoša, i hero tada ne prikazuje pečat — Jovanova old SWM situacija. Potvrda: da li pasoš ostaje strogo, ili se "brend sa delimičnim paketom" prikazuje drugačije i na posteru i na pasošu.

## Novi fajlovi

```
app/sajam/[eventSlug]/brend/[brandSlug]/page.tsx
app/sajam/[eventSlug]/brend/[brandSlug]/not-found.tsx
components/fair/brand/brand-page.tsx / brand-page.module.css
components/fair/brand/brand-hero.tsx / brand-hero.module.css
components/fair/brand/brand-model-row.tsx / brand-model-row.module.css
components/fair/brand/brand-model-picker.tsx / brand-model-picker.module.css
components/fair/brand/brand-lead-sheet.tsx
components/fair/brand/brand-lead-success.tsx / brand-lead-success.module.css
components/fair/brand/submit-brand-leads.ts + submit-brand-leads.test.ts
lib/fair-server/brand-page.ts + brand-page.test.ts
lib/i18n/sr/fair-brand.ts + fair-brand.test.ts
components/admin/brand-qr-poster.tsx / brand-qr-poster.module.css
components/admin/events/sections/brendovi-qr-section.tsx
```

## Izmenjeni fajlovi

```
app/sajam/demo-auto-moto-fest-2026/[[...screen]]/page.tsx   (section "brend", demo projekcija)
app/sajam/fair-event.css                                     (.fair-* klase stranice brenda)
components/fair/fair-model-page.tsx                          (link na brend stranicu)
components/fair/passport/fair-passport.tsx + fair-passport.module.css (link ka brendu)
lib/i18n/types.ts                                            (FairBrandDict :945 + "fair-brand" ključ)
lib/i18n/index.ts                                            (registracija "fair-brand": fairBrandSr)
lib/i18n/sr/admin-events.ts                                  (kopija za brendovi-qr sekciju)
components/admin/events/event-section.tsx                    (case "brendovi-qr")
components/admin/admin-events-preview.tsx                    (preview board za "brendovi-qr")
lib/admin-v1/event-sections.ts                               (sekcija "brendovi-qr")
```

Nije dirano: `convex/*`, `lib/fair-client/contact-store.ts` i `contact-block.tsx` (postojeći, samo korišćeni), `docs/events/sajam-automobila-2026/*` osim dopune MASTER dnevnika.
