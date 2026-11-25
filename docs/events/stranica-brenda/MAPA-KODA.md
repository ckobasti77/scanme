# Mapa koda — stranica brenda (pasoš + model + forma)

Sve putnje su relativne na /workspace/webdev/scanme. Linije su iz provjera 2026-11-25.

## 1. Stranica pasoša jednog brenda

- URL: `/sajam/<eventSlug>/pasosi/<brandSlug>`
- Ruta: `app/sajam/[eventSlug]/pasosi/[brandSlug]/page.tsx` (server komponenta, `revalidate = 60`, `generateStaticParams`; renderuje `FairEventShell` + `FairPassportExperience`; `dict` = `lib/i18n/sr/fair-passport.ts`).
- Spisak svih izlagača: `app/sajam/[eventSlug]/pasosi/(lista)/page.tsx`.
- Podaci: `lib/fair-server/passport-page.ts` → `fairFunctionWithSession` (POST ruta `app/api/fair/passport/route.ts`, `convex/lib/fairGateway.ts`):
  - `convex/fairPublic.ts:619` `getPassportCatalog` → `FairPublicBrandCatalog` (lib/fair-contract.ts), ulaz:
    `FairPassportCatalogEntryView` = `brandId, brandName, slug, logoUrl, website, businessId, standIds, mapLocationId, phone?, email?, models[]`
    (`convex/lib/fairValidators.ts:498` i `:1351`).
  - `convex/fairPublic.ts:652` `getModelsByIds` → `modelsById` (svi model refi).
- Projekcija modela = `convex/fairPublic.ts:30` `fairPublicModelView`: `slug, displayName, priceText, photoId?, visual (color|photo|placeholder), packageTier ("starter"|"advanced"), passportEligible, published, externalKey` — cijena je string `priceText` ("4.990.000 RSD"), ne number; fotografija po `photoId` (`lib/fair-photo.ts`).
- `passportEligible` je polje na dokumentu `fairEventModels` (`convex/fairAdmin.ts:169`, `convex/fairInteractions.ts:190` ga filtrira).
- Posjetilac: HMAC HttpOnly cookie `lib/fair-server/visitor-cookie.ts`; stamp/posete: `convex/fairInteractions.ts` `recordPassportView` + `getPassportState` (nema javne `fairPassports` mutacije).
- Komponenta: `components/fair/passport/fair-passport.tsx` (`FairPassportExperience`); kartica modela linkuje na `/sajam/<eventSlug>/model/<modelSlug>` (`:346`), štand link preko `standIds`.

## 2. Kako stranica modela šalje "Zainteresovan sam" i "Probna vožnja"

- Model stranica: `app/sajam/[eventSlug]/model/[modelSlug]/page.tsx` → `components/fair/fair-model-page.tsx`; akcije `:193-203` (`kind "interest"|"testDrive"`, `label` = `dict.submitInterest` = "Zainteresovan sam", `dict.requestTestDrive` = "Probna vožnja" — `lib/i18n/sr/fair-model.ts:14-15`).
- CTA/interakcije: `components/fair/model-actions-checkpoint.tsx`; state i toast: `components/fair/model-interactions.tsx` (`FairModelInteractionsProvider`, `useFairModelInteractions`, `useFairToast` — `FairToast` montovan `:299`).
- Forma: `components/fair/lead-sheet.tsx` (`LeadSheet`, odozdo `FairSheet`).
- Slanje: `lib/fair-client/fair-api.ts` `postFair("/api/fair/lead")` → `app/api/fair/lead/route.ts:34-42` → `lib/fair-server/leads.ts` `handleFairLead` → `lib/fair-server/gateway.ts` `fairMutationWithSession` → `convex/fairLeads.ts:83` `export const submitLead` (mutacija; klijent je ne zove direktno, sve ide preko gateway-a `FAIR_GATEWAY_SECRET`).
- Argumenti (`convex/fairLeads.ts:84-104`): `gatewaySecret?, ipHash?, visitorHash, eventModelId, kind ("interest"|"test_drive"), submissionId (idempotency UUID, newFairSubmissionId), contactName, email?, phone?, consentAccepted, consentVersion, origin?, selectedModelId?, purchaseTiming?, financing?`; rezultat `FairLeadSubmitResult` (`lib/fair-contract.ts` `fairLeadSubmitResultView`).
- Obavezna polja po izlagaču: server u `convex/fairPublic.ts:762` `getLeadForm` → `FairLeadFormView.contactRequirement` = `"one_of"|"email"|"phone"|"both"` + `preferredContact` + `collectOptionalEmail` (pravi stand/participacija pretpostavke); klijent provjerava `lib/fair-client/contact-form.ts` `contactFormState` + `lib/fair-contract.ts` `fairContactRequirementProblem` (~417), UI `.fair-field-problem`.
- Saglasnost: tekst dolazi od servera (`getLeadForm` → `form.consent { text, version, activeVersion, changed }`); `components/fair/lead-sheet.tsx` renderuje `form.consent.text` i šalje `consentVersion`; osnovna kopija `lib/i18n/sr/consent.ts` + `docs/events/sajam-automobila-2026/CONSENT.md`.
- Uspeh: `outcome "sent"` → sheet se zatvara + `showToast(fairLeadSentText(kind, brand))` (`lib/fair-client/lead-result.ts`; sr `interestSent`/`testDriveSent` `lib/i18n/sr/fair-model.ts:141-142`), `FairToast` = `components/fair/fair-toast.tsx`.
- Greška: `status "error"` + `errorCode` + `field` → `.fair-inline-error` (`role="alert"`, `lead-sheet.tsx` footer) + `fairErrorText` (`lib/fair-client/fair-errors.ts`); kodovi `LEADS_DISABLED`, `TOO_MANY_LEADS*`, `INVALID_CONSENT`, `INVALID_INPUT`.

## 3. Selektor modela u formi za probnu vožnju (AMF, 30.10.2026)

- UI: `components/fair/lead-sheet.tsx` (`:~145-160`, `FairSelect` kad `open.modelChoices` postoji, label `dict.leadModelLabel`); sam komponenta `components/fair/fair-select.tsx`.
- Opcije: `convex/fairPublic.ts:762` `getLeadForm` → `modelChoices` (isti izlagač + objavljeni modeli, `brandName` kao detail; odsutan kad je model jedan); ugovor `FairLeadFormView.modelChoices` (`lib/fair-contract.ts`, AMF komentar ~756-762); uključen i za "interest" ako izlagač ima `leadInterestExtraFields` (`lib/fair-client/lead-extra-answers.ts` `fairLeadExtraFieldsEnabled`).
- Šalje se kao `submitLead.args.selectedModelId` (`convex/fairLeads.ts` komentar 30.10.2026) i upisuje u `fairLeads` dokument.

## 4. i18n

- Tekstovi: `lib/i18n/sr/fair-model.ts` (437 lin., model stranica), `fair-passport.ts`, `fair-events.ts`, `fair-map.ts`, `fair-garage.ts`, `fair-admin.ts`, `fair-auth.ts`, `consent.ts`; obrazac `export const fairModelSr = { ... } as const satisfies FairModelDict`.
- Tip: interface u `lib/i18n/types.ts` (`FairModelDict :257`, `FairPassportDict :800`); novi ključ = types.ts + sr + `lib/i18n/en/*.ts` (en implementira isti interface, `as const satisfies XDict`).
- Kako komponenta dobija `dict`: server komponenta (`page.tsx`) importuje sr dict i proslijeđuje kao prop `dict={fairModelSr}`; klijentske komponente `import { getDict } from "@/lib/i18n"` → `getDict("fair-model")` (jezik po req/cookie `lib/i18n/resolver.ts`); helperi `lib/i18n/format.ts`, `lib/i18n/plural.ts`.

## 5. Boje / tokeni / fontovi / komponente

- Sajamski tokeni: `app/sajam/fair-event.css` — `.fair-event { --fair-canvas #f7f8f8, --fair-surface #fffdf8, --fair-ink #171918, --fair-accent #0b73e0, --fair-accent-strong #075fb9, --fair-line #d8d1c7, --fair-danger #b42332, --fair-header-height 64px, --fair-space-N (4px skala), radius skupa }`; izvor: `docs/events/sajam-automobila-2026/FAIR-DESIGN-DNA.md`.
- Globalni: `app/globals.css` (shadcn `--color-*`/`--radius` oklch); `app/sajam/globals.css`.
- Fontovi: root `app/layout.tsx` preko `@fontsource-variable` paketa (body `font-mono`); sajamske `.fair-*` klase koriste direktno `font-family: "Archivo Variable", ...` stack u `fair-event.css` (next/font se ne koristi).
- Komponente: `components/fair/fair-sheet.tsx` (`FairSheet`, `variant="bottom"|"full"` — klase `fair-sheet__primary/__secondary/__eyebrow`), `components/fair/fair-select.tsx`, `components/fair/fair-toast.tsx` (`FairToast` + `useFairToast`), `components/fair/fair-paper-texture.tsx`, `components/fair/fair-photo.tsx`, `components/fair/event-shell.tsx` (`FairEventShell`); sve preko `.fair-*` klasa.
- `components/ui/*` (shadcn/Radix, npr. `components/ui/sonner.tsx`) koriste se samo u `components/fair/exhibitor-registration.tsx` i admin/dev (`fair-admin/*.tsx`, `components/fair/fair-admin-toast.ts` + `components/fair/fair-admin-sonner-host.tsx`) — javne sajamske strane ih ne koriste.

## 6. package.json: QR i testovi

- QR biblioteka: NE postoji u `package.json` (`qrcode`, `qrcode.react`, `qr-code-styling` odsutni). Generisanje je vendorovano ručno: `lib/qr/qrcodegen.ts` (qrcodegen.js port) + `lib/qr/index.ts` (`qrMatrix`); QR tekst na serveru `lib/fair-qr-label.ts`, generisanje i inventar `convex/fairAdminQr.ts` (`generateStand` `:619`), printanje `app/fair-admin/stamps/qr-print/page.tsx`.
- Test alat: `vitest ^4.1.10` (devDependency), skripta `npm run test` = `vitest run` (+ `test:watch`, `test:coverage`, `harness/vitest-stubs`), `vitest.config.ts`.
- Testovi su kolocirani uz izvor (`*.test.ts`/`*.test.tsx`), npr. `lib/qr/qrcodegen.test.ts`, `components/fair/lead-sheet.test.tsx`, `convex/fairLeads.test.ts`, `app/api/fair/lead/route.test.ts` (43 test fajla).

## Rizici

- `docs/ux-overhaul/PROGRESS.md` i `docs/ux-overhaul/DESIGN_RULES.md` ne postoje u ovom repo-u (postoje u `/workspace/webdev/alati`) — obrasce vezati za `docs/DESIGN_RULES.md` + `docs/events/sajam-automobila-2026/FAIR-DESIGN-DNA.md` + `docs/paper/FAIR-INTERACTION-CRAFT.md`.
- `/workspace/webdev/scanme-brend-run/referenca/stranica-brenda-mockup.html` postoji, ali sam ga čitao samo kao referencu — nisam upoređivao sa trenutnim renderom.
- Postoji mrtva forma `components/fair/lead-form.tsx` + `components/fair/lead-form-model.ts` (N6): nema import-a iz produkcionog koda (samo `app/dev/sajam-forma/form-preview.tsx` i `components/fair/exhibitor-registration.tsx`); živi put je `LeadSheet` (`components/fair/lead-sheet.tsx`) + `FairSelect`.
- Stamp na pasošu ide preko POST `/api/fair/passport` (`app/api/fair/passport/route.ts` → `lib/fair-server/interactions.ts` `handleFairPassport`), ne kao javna Convex mutacija (`convex/fairPassports.ts` je samo internal helper) — nova "stamp brenda" mutacija mora pratiti taj obrazac.
- Cijena modela je string (`priceText`), ne broj — nova lista modela ne sme se pretvarati u number.
- `convex/` ne mijenjam; bilo koja nova polja/mutacije u mapi su postojeći kod, ne predlozi.
