# ScanMe × Sajam automobila 2026 — implementation gap audit

> **Status:** provereno prema stanju grane 1. oktobra 2026.
>
> **Opseg:** postojeće stanje repozitorijuma; bez izmene funkcionalnog koda, Convex deploy-a ili seedovanja.
> **Produktni ugovor:** [MASTER-KONTEKST.md](./MASTER-KONTEKST.md)
> **Tehnički ugovor:** [BACKEND-HANDOFF.md](./BACKEND-HANDOFF.md)

## Sažetak

Sajamski backend/frontend ugovor iz `MASTER-KONTEKST.md` i `BACKEND-HANDOFF.md` još nema implementacionu površinu. Pretraga je našla samo DEV mapu (`app/dev/sajam-cair/**`); nema `fair*` modula, fair tabela, typed fair ugovora, fair ruta ili sajamskih admin ekrana. Postojeći sistemi daju korisne temelje, ali nisu zamena za event-model:

- reuse: stabilni `/r/[cardCode]` resolver i card/scan audit, postojeći `accounts`/`businesses`/`accountContacts`/`brands`, admin auth/navigation, storage URL obrazac, `convex-test`, rate limiter i email/outbox infrastruktura;
- aditivno: fair target na postojećem QR-u, server-derived visitor identitet, event-specific agregati i admin projekcije/import/report seam;
- novo: event participation/katalog model, entitlements, ocene/glas/ankete/pasoš, fair leadovi/consent, sponsored snapshot, retention purge, report lifecycle i javne model stranice.

Najveći blokatori su odsustvo B0 ugovora/šeme i činjenica da trenutni `/r/[cardCode]` beleži samo generički `cardScanEvents`/`dailyCardMetrics`, uz bot suppression i bez event-model/unique-visitor projekcije. Lead i email postoje za druge proizvode, ali nemaju sajamski consent, tier gating, test-drive ili follow-up semantiku.

## Evidence i klasifikacija

Oznake: **REUSE** = direktno može da se koristi; **ADITIVNO** = postojeći kod se proširuje bez paralelnog sistema; **NOVO** = zahtev nema odgovarajući postojeći simbol/tabelu/rutu.

| Zahtev | Postojeće evidence | Klasifikacija | Gap / rizik |
|---|---|---|---|
| Stabilan štampani QR i retarget | `app/r/[cardCode]/route.ts:GET`; `convex/cards.ts:resolveAndRecord`; `cards`, `cardTargets`, `cardScanEvents`, `dailyCardMetrics` u `convex/schema.ts` | REUSE + ADITIVNO | Resolver cilja postojeće vrste (`venue`, `event`, `service_page`, `url`, `splitter`, `menu`, `table_ordering`), nema `fair_model`. Potrebno je sačuvati server-generated `requestId` i jedan fizički scan; ne praviti drugi resolver. |
| Fair scan total/unique, 24/7 i server admin exclusion | `convex/cards.ts:resolveAndRecord`; `convex/cards.test.ts` testovi idempotencije; `convex/lib/rateLimits.ts` | ADITIVNO | Trenutni resolver botove ne broji, povećava card/channel totals i dnevni card rollup, ali nema visitor hash, event-model, unique definiciju ili derived admin exclusion. Uvođenje fair hook-a mora biti atomsko i bez duplog upisa. |
| Account/business/contact/brand link | `convex/schema.ts:accounts`, `businesses`, `accountContacts`, `businessContacts`, `brands`; `convex/adminClientProfiles.ts`; `components/admin/admin-client-profile.tsx` | REUSE + ADITIVNO | Modeli su account-scoped, brand pripada accountu, business ima `accountId`/`brandId`; nema event participation zapisa, `event_only` klasifikacije ni konverzije bez kopiranja. Rizik je mešanje tenant scope-a i pravljenje `fairExhibitors` duplikata. |
| Event/day/stand/model katalog | `convex/schema.ts:events`, `venueEventConfigs`, `eventArchiveItems`; `convex/venueAdmin.ts`, `convex/venue.ts` | NOVO (reuse lifecycle samo za venue) | Postojeći `events` je business venue event i nema izlagač/štand/model/paket/specifikacije/QR assignment entitete. Ne pretpostaviti da `venueEventConfigs` može da nosi katalog. |
| Centralna prava paketa i upgrade | `convex/entitlements.ts`, `convex/lib/entitlements.ts` (ScanMe plan/service entitlement); pricing u `lib/pricing/**` | NOVO / odvojeno | Nema Starter/Advanced po automobilu, rating replacement, 1/5 pitanja, immediate upgrade i non-retroactive paid interaction ugovora. Potreban `lib/fair-entitlements.ts` i testovi pre UI-ja. |
| Javna model stranica, garaža, poređenje | javne venue rute `app/[slug]/venue/**`, Memories `app/m/[code]/**`; nema fair route | NOVO | Nijedna postojeća ruta ne prima fair model slug niti vraća `FairPublicModel`/capabilities. Visitor-specific state ne sme ići kroz URL ili javni kontakt query. |
| Ratings, Glas publike, anketa | nema fair simbola; postoje venue reservations (`convex/venueReservations.ts`) i generičke validacije | NOVO | Potrebne source + bounded projection tabele, unique upsert i entitlement/rate-limit provere. Poseban rizik: Advanced ima tri dimenzije, bez overall ocene. |
| Lead interest/test-drive, consent i confirmation | `convex/leads.ts:create`, tabela `leads`; `convex/activationRequestEmails.ts` + data module | ADITIVNO / NOVO domen | `leads` je prelaunch lead bez event/model/visitor/consent snapshot/tier; nema test-drive ili fair email outbox. Ne proširivati generički lead tako da se PII i retention pravila pomešaju. |
| Resend i follow-up | `convex/activationRequestEmails.ts`, `invitationEmails.ts`, `menuInquiryEmails.ts`; `convex/convex.config.ts` env; Resend `Idempotency-Key` | REUSE seam + NOVO fair workflow | Postoji Node internal action + mark sent/failed obrazac, ali nema fair recipient policy, immediate/follow-up dedupe, suppression ni approved consent/copy. Produkcijski lead je blokiran otvorenim odlukama u handoff-u. |
| Admin CRUD/import/QR/publish | `app/admin/**`; `lib/admin-v1/navigation.ts`; `convex/admin*.ts`; `requireAdmin` u `convex/lib/access.ts` | REUSE auth + NOVO fair surfaces | Admin ima clients, QR, services, finance, inbox, tasks, venue; nema Događaji/izlagači/katalog/report ekran. `ADMIN_NAV_ITEMS` je centralna navigacija i mora dobiti fair child tek kada backend ugovor postoji. |
| Reporting/export/review/send | Memories ZIP (`convex/memoriesExport*.ts`, `lib/memories-export/**`), Menu PDF/XLSX (`convex/menuExport.ts`, `lib/menu-export/**`), bounded admin reads | REUSE writer/bounded patterns + NOVO dataset | Nema fair daily dataset, Starter/Advanced projection, per-exhibitor isolation, report status `pending_review`/`approved`, PDF/XLSX template ili send gate. Ne koristiti postojeće exporte kao da nose fair PII policy. |
| Browser storage / anonymous identity | `lib/memories-guest-cookie.ts`, `components/memories/guest-identity-server.ts`, `components/memories/memories-landing.tsx` localStorage mirror; `lib/offer-logo-session.ts` sessionStorage; `app/layout.tsx` theme localStorage | REUSE obrazac, ADITIVNO fair gateway | Cookie + localStorage je vezan za Memories code/path; fair handoff zahteva hash gateway i visitor-specific POST, bez identiteta u URL/cache ključu. Ne deliti Memories cookie bez nove fair scope odluke. |
| Test infrastruktura | `package.json`: `vitest`, `convex-test`, `npm run check`; `convex/*test.ts`, `components/**/*.test.tsx`; `convex/cards.test.ts` | REUSE | Evidence: 128 test/spec fajlova pod `convex`, `components` i `lib` u trenutku audita. Nema `fair*.test.ts`, fair fixtures ili oba-event seed. Potrebni B0 schema/entitlement testovi i fazni testovi prema handoff §12. |
| DEV mapa | `app/dev/sajam-cair/page.tsx`, `cair-map.tsx`, `cair-map.module.css` | REUSE samo vizuelno / NOVO data seam | DEV-only `notFound()` u production, hard-coded `BOOTHS`, brand/category/path/entrance i lokalni state; nema Convex mapLocationId, sponsored rotation, model deep-links ili display epoch. Ne koristiti fixture podatke kao import/production seed. |

## Detaljniji nalazi po traženim površinama

### Resolver i QR

`app/r/[cardCode]/route.ts` generiše `crypto.randomUUID()` na serveru, poziva `api.cards.resolveAndRecord`, zatim 302-uje prema postojećem targetu. `convex/cards.ts:resolveAndRecord` deduplira `cardScanEvents` preko `by_requestId`, upisuje target kind/device category, botove ne uključuje u totals i ažurira `dailyCardMetrics`. To je dobar zajednički ulaz, ali nije fair analytics: nema `eventModelId`, `visitorIdHash`, unique projekcije, `dateKey`/`hourKey` fair dataset-a, niti server-derived admin exclusion. Fair implementacija treba minimalni hook u isti mutation i `fair_model` target, uz test da jedan request daje najviše jedan generički i jedan fair zapis.

### Tenant, klijenti i admin

`accounts` su plan/billing sloj; `businesses` su tenant/location; `accountContacts` su account-scoped kontakt zapisi; `businessContacts` je stariji business-scoped model sa migracionom vezom; `brands` su account-scoped. `adminClientProfiles.getProfile`, `createContact`, `updateContact`, `setDefaultContact` i `setContactStatus` pokazuju postojeći admin access pattern. Ovo podržava linkovanje sajamskog učešća na postojeći zapis, ali ne daje event-only segment, participation history ni event-specific report recipient. Admin route/layout je već zaštićen (`requireAdmin` i `AdminGuard`), ali nema `Događaji` namespace.

### Email/Resend

`activationRequestEmails.ts` je najbliži reusable obrazac: Node action, env provera, `fetch("https://api.resend.com/emails")`, Resend idempotency key i internal `markEmailSent/markEmailFailed`. `emailProvider*` je provider-neutral Zoho inbox/outbox foundation, ne fair outbound workflow. Zato fair email treba sopstveni consent snapshot/outbox/dedupe/suppression contract, a postojeće Resend slanje može biti adapter. Finalni consent/copy/recipients ostaju otvoreni i blokiraju produkcijske leadove.

### Reporting i eksport

Postoje provereni writeri za Memories ZIP i Menu PDF/XLSX, ali nema fair report run lifecycle-a. Handoff eksplicitno zahteva bounded dataset po eventu/izlagaču, review/approve/send, correction/resend i PII export izolaciju. Rizici: per-row join petlje, neograničeni `.collect()`, slanje pre `approved` i mešanje izlagača. Reuse može biti samo writer/batch obrazac, ne postojeći schema ili pravo pristupa.

### Browser storage

Memories identity koristi HttpOnly cookie plus localStorage mirror (`memories-landing.tsx`), dok offer logo koristi sessionStorage token. To dokazuje da storage može biti kompatibilan sa mobilnim webom, ali fair zahtev namerno traži server gateway i visitor hash koji se ne pojavljuje u URL-u/analytics/cache ključu. Potrebno je definisati novi fair cookie/storage scope i purge ponašanje; nikakav postojeći token ne treba preuzeti implicitno.

## Preporučeni mali redosled taskova

1. **B0.1 — ugovor i entitlement testovi:** dodati `lib/fair-contract.ts`, `lib/fair-entitlements.ts`, stabilne error code unije i testove za sva tri nivoa, Advanced rating replacement, 1/5 pitanja, upgrade i zabranu downgrade-a. Evidence: `convex/_generated/ai/guidelines.md`, `BACKEND-HANDOFF.md §6, §12`.
2. **B0.2 — aditivna šema:** dodati fair tabele/indekse i validatore za event day/participation/stand/brand-model/package/QR assignment, bez seeda. Explicit link na `accounts`/`businesses`/`accountContacts`/`brands`; `clientSegment` i idempotentni external keys.
3. **B0.3 — QR target seam:** proširiti card target union i `cards.resolveAndRecord` minimalnim fair hook-om; testirati retarget, invalid/published target i no-duplicate invariant.
4. **B1.1 — admin katalog/import:** `fairAdmin` CRUD, event-only filter/convert, dry-run/commit import, validation issues i QR inventory assign/release; tek potom admin navigation/screen.
5. **B2 — anonymous gateway + analytics:** visitor hash, cookie/POST gateway, scan projections, server-derived admin exclusion, `dateKey`/`hourKey`, passport stamp.
6. **B3 — interactions:** ratings/votes/survey/favorites uz bounded public reads, source/projection transakciju i rate limits.
7. **B4 — leads/email:** fair consent snapshot, interest/test-drive gating, outbox, Resend DEV proof; follow-up tek nakon legal/copy/suppression odluka.
8. **B5 — map/sponsored:** iz DEV hard-coded mape izvući map contract i `mapLocationId`; immutable Advanced snapshot, round-robin epoch/slot, display/map/garage events.
9. **B6 — reports:** bounded aggregates/dataset, report build/review/approve/send, PDF/XLSX adapter i exhibitor isolation testovi.
10. **B7 — retention/hardening:** retry-safe batch purge, authz/read-limit audit i oba-event integracioni seed/test na Android/iPhone/display rezolucijama.

Svaki task treba zaseban mali checkpoint i ciljane testove; ne nastavljati fazu dok prethodna nema prolazne testove, u skladu sa handoff §11.

## Najvažniji blokatori i rizici

- **B0 nije implementiran:** bez typed contract/entitlement/validacionog ugovora frontend i backend bi mogli nezavisno da izmišljaju paketna prava.
- **Ne postoji fair katalog ili participation model:** ne može se bezbedno linkovati event-only izlagač, model, paket i stabilni QR.
- **Resolver analytics semantika nije dovoljna:** postojeći bot suppression se razlikuje od fair 24/7 pravila; unique/admin exclusion i event granica nedostaju.
- **PII/legal blokada:** konačan consent tekst, recipient channel i email copy nisu u kodu ni zaključani u handoff-u; produkcijski lead/follow-up ne sme da se uključi.
- **Mapa je statički DEV prototip:** `BOOTHS` i brendovi su hard-coded; nema published modela, mapLocationId, sponsored snapshot-a ni display sync-a.
- **Report surface ne postoji:** postoje writeri, ali ne i fair dataset/isolation/review gate/retention ugovor.
- **Tenant i indeksni rizik:** postoje account/business/contact/brand migracioni slojevi; fair queryji moraju biti indexed, paginated i bounded, bez paralelnog `fairExhibitors` klijenta.

## Audit granice i proverene činjenice

Read-only pretrage su pronašle `package.json` skripte `npm run check`, `npm test`, `vitest`, `convex-test`; nisu pokretane Convex deployment komande. Nisu menjani kod, PDF/DOCX ili postojeći untracked artefakti. Ovaj dokument je jedini novi fajl.
