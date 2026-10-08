# Jovan backend delta — 9. oktobar 2026.: admin alati na sajmu

> Poslednje ažuriranje: **9. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Prethodno: [`JOVAN-DELTA-2026-10-08b.md`](./JOVAN-DELTA-2026-10-08b.md)

## Pregled

Aleksa je tražio (9. 10.) da admini mogu da testiraju sajam na produkciji, a da to ne kvari brojke izlagača. Sve što prijavljeni ScanMe admin uradi na javnim stranicama sajma (pečati, ocene, glasovi, anketa, omiljeni, leadovi, sponzorisano, deljenje) **čuva se, ali se ne broji**. Ne ulazi u analitiku, izveštaje, brojače ni izvoz. To važi dodatno uz pre-event granicu.

Ponovo je iskorišćen postojeći mehanizam za skenove (B2). Nema drugog, paralelnog flaga:

- **Ko je admin:** odlučuje samo Convex, iz Convex Auth sesije: `fairSessionAdminUserId(ctx)` (`convex/lib/fairScans.ts`). Argument iz zahteva se nikad ne prihvata.
- **Oznaka:** isto ime i isto značenje kao kod skena: `isAdminExcluded`.

## 1. Šema

Dodato je `isAdminExcluded: v.optional(v.boolean())` u 9 tabela:

- `fairRatings`, `fairAudienceVotes`, `fairBrandFavoriteVotes`, `fairSurveyResponses`;
- `fairPassportStamps`, `fairSponsoredEvents`, `fairTrafficEvents`, `fairShareCollections`;
- `fairLeads`.

Polje je opciono, pa je izmena kompatibilna unazad. Nema novih tabela ni indeksa. `fairScanEvents.isAdminExcluded` je ostao kakav je bio.

## 2. Ko upisuje

**Sesija ide uz poziv.** Next gateway sada šalje sesiju uz svaki upis sajma, isto kao `/r` za sken. To radi `fairMutationWithSession` u `lib/fair-server/convex-session.ts`, za:

- `upsertRating`, `upsertAudienceVote`, `submitSurvey`, `upsertBrandFavorite`;
- `recordSponsoredAction`, `submitLead`, `createShareCollection`, `recordTraffic`.

Posetilac nema kolačić sesije, pa je njegov poziv isti kao ranije. Kad token ne prođe proveru, poziv se ponavlja anonimno. Greška sajma (`ConvexError`) se nikad ne ponavlja, jer bi anonimni ponovni pokušaj brojao admina kao posetioca.

**Admin red** dobija `isAdminExcluded: true` i ne pomera nijedan brojač (`bumpFairCount`):

- **Ocena:** da li se red broji, određuje se pri nastanku reda. Izmena admin ocene ne pomera brojač.
- **Glas i omiljeni:** promena opcije pomera brojač samo za red koji se broji.
- **Admin lead:**
  - čuva se i dobija e-mail potvrde, da bi tok mogao da se testira;
  - ne dobija follow-up.

## 3. Ko čita (isključeno uz pre-event granicu)

| Mesto | Šta |
|---|---|
| `fairLeadsInbox.listEventLeads` | Bez `includePreEvent: true` nema admin leadova |
| `fairLeadsInbox` predaja po izlagaču | Admin lead se nikad ne predaje |
| `fairLeadsAdmin.exportLeads`, `fairReports.leadsExportPage` | Ne izvozi se |
| `fairAdminStats.getLeadCounts`, `fairDashboard` | Ne broji se |
| `fairAnalytics` (`leadCounts`, `surveyAggregates`, `organizerParticipationLeads`) | Nije u izveštaju |
| `fairFollowUps.estimateFollowUps` | Nije u proceni |

Ocene, glasovi, omiljeni, sponzorisano i skenovi u analitici se čitaju iz brojača, a admin ih ne pomera.

`fairPreEvent.removePreEventRow` (sada izvezen) ne oduzima ništa iz brojača za `isAdminExcluded` red, isto kao za admin sken.

## 4. Nove funkcije: `convex/fairAdminDev.ts`

Svaka funkcija traži dve stvari:

- `requireAdmin`, kao admin funkcija;
- `FAIR_GATEWAY_SECRET` i `visitorHash` iz kolačića, kao funkcija posetioca.

Dira samo redove posetioca sa tim hešom, odnosno adminov sopstveni telefon. Funkcije su klasifikovane u `fairAuthz.test.ts`.

| Funkcija | Vrsta | Šta radi |
|---|---|---|
| `devState({ eventId, eventModelId? })` | query | Pasoš posetioca (`fairPassportState`), 5 objavljenih modela za garažu, pitanje Glasa publike za model |
| `grantStamps({ eventId, eventModelIds })` | mutation | Pečati „kao da je skenirao“, sa `isAdminExcluded: true` |
| `simulateScan({ eventId, eventModelId })` | mutation | Audit red `fairScanEvents` (`isAdminExcluded`, `adminUserId`) i pečat. Bez jedinstvenog skena i bez brojača |
| `resetMine({ eventId, scope })` | mutation | Briše moje redove na događaju po opsegu: `passport` (pečati, omiljeni), `answers` (ankete, ocene, glasovi) ili `all` (to plus leadovi sa `fairEmailDeliveries` i sponzorisano). Red koji je ranije brojan oduzima se tačno. Audit `fair_admin_dev_reset` |

Next ruta je `POST /api/fair/admin-dev` (`lib/fair-server/admin-dev.ts`):

- bez sesije vraća **401**;
- sesija koja nije admin vraća **403**;
- „Otvori Glas publike“ poziva postojeći `fairInteractionsAdmin.openAudienceQuestionNow`.

Testovi:

- nov `convex/fairAdminDev.test.ts`;
- nov `lib/fair-server/admin-dev.test.ts`;
- dopunjen `fairAuthz.test.ts`;
- svi `convex/fair*`, `lib/fair*` i `components/fair` testovi prolaze.

Deploy: DEV `perfect-ant-98` (`npx convex dev --once`).

## 5. Nacrti saglasnosti (DEV, nisu aktivirani)

Na DEV-u `elektromobilnost-2026` postoje nacrti v1 za `interest` i `test_drive` (`saveConsentDraft`), sa istim tekstom:

> Saglasan/na sam da {izlagac} koristi moje ime i kontakt podatke da me kontaktira u vezi sa ovim modelom. Saglasnost mogu da povučem u svakom trenutku, kako je opisano u Politici privatnosti.

- Model nije placeholder. Forma ga već prikazuje, a Aleksa je izabrao da ne bude u tekstu.
- Ispod teksta forma prikazuje link „Politika privatnosti“ ka `/sajam/privatnost`.
- Ništa nije aktivirano. Aktivacija na PROD-u ide kroz admin „Leadovi → Podešavanja“ (pravno odobrenje i `FAIR_LEADS_ENABLED`).
