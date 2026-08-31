# Deploy runbook — Venue + Memories na produkciju

Pisano za osobu koja ovo radi u 23:00 uveče pred žurku i koja ovo nije
gradila. Svaki korak je proverljiv; nijedan nije podrazumevan. Redosled je
bitan — idi odozgo nadole.

**Najvažnije pravilo (naučeno na incidentu):** Convex backend i Vercel
frontend se deploy-uju ZAJEDNO, jednom komandom. Frontend koji stigne pre
šeme zove funkcije koje ne postoje.

```bash
npx convex deploy --cmd "npm run build"
```

Ta komanda: push-uje šemu + funkcije + cron-ove na prod Convex, builduje
Next.js sa prod `NEXT_PUBLIC_CONVEX_URL`, i tek onda pušta frontend. Na
Vercel-u ista komanda stoji kao Build Command projekta (sa
`CONVEX_DEPLOY_KEY` u Vercel env) — `package.json` namerno NEMA deploy
skriptu, a `vercel.json` ne postoji.

---

## 0. Pre svega: šta ovaj deploy prvi put donosi

Prod trenutno vrti samo ScanMe Links (poslednji deploy iz ere Links
šablona). Ovaj deploy prvi put donosi:

- **21 novu tabelu i ~49 novih indeksa** (events, venueEventConfigs,
  eventArchiveItems, memoriesSpaces/Sessions/Guests/Photos/CountShards,
  mediaAssets, cards + cardTargets + cardScanEvents + dailyCardMetrics,
  quotaAdjustments, photoReports, entitlements, venueReservations,
  celebrations, partnerships, memoriesExports + memoriesExportEntries).
  Sve nove tabele kreću PRAZNE — nema staged backfill-a, deploy ne blokira.
- **Nijedan indeks na starim tabelama nije menjan** (provereno diff-om šeme
  против c7a2119) — Links podaci se ne diraju.
- **Rate-limiter komponentu** (`@convex-dev/rate-limiter` u
  `convex/convex.config.ts`) — prvi deploy je instalira sa njenim tabelama.
- **Svih 7 cron-ova** (dole) — `convex/crons.ts` na prodi do sada nije
  postojao.

## 1. Environment promenljive, po površini

Postavljanje: Vercel → project settings → Environment Variables; Convex →
`npx convex env set IME vrednost --prod` (ili dashboard → Settings →
Environment Variables).

### Vercel (Next.js)

| Promenljiva | Šta se lomi ako fali |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` (prod URL!) | CELA aplikacija — client provider baca na module-level. |
| `CONVEX_DEPLOY_KEY` | `npx convex deploy` iz build-a ne gađa prod. |
| `SCANME_GUEST_SECRET` | Sken kartice i dalje redirect-uje, ali cookie se ne postavlja i svi guest endpointi vraćaju 503 ⇒ **Memories upload mrtav**. |
| `SCANME_PIPELINE_SECRET` | `/api/m/[code]/process` vraća 503 ⇒ nijedna slika se ne obrađuje. **Ista vrednost mora i na Convex.** |
| `SCANME_PREVIEW_PASSKEY` (tačno 32 znaka) | `/` zauvek prikazuje „Coming soon". `/ponuda*`, `/m/*`, `/r/*`, `/admin/*` rade i bez njega. |

### Convex (prod deployment)

| Promenljiva | Šta se lomi ako fali |
|---|---|
| `SCANME_ADMIN_EMAILS` | Niko nije admin — ceo `/admin` i svako provisioning odbija. |
| `SCANME_ADMIN_SETUP_SECRET` (≥16) | Novi admin nalog ne može da se bootstrap-uje. |
| `SCANME_PIPELINE_SECRET` | Pipeline commit odbija (mora = Vercel vrednosti). |
| `SCANME_GUEST_SECRET` | Deklarisan radi inventara (Convex kod ga ne čita). |
| `SCANME_INVITE_SECRET` | Pozivnice klijenata se lome. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SCANME_SITE_URL` | Mejlovi pozivnica / zahteva za aktivaciju padaju. |
| `SCANME_DEMO_SETUP_KEY`, `SCANME_VENUE_DEMO_SETUP_KEY` | **Namerno NE postavljati na prod** — javne seed mutacije tada odbijaju sve, što i želimo. |

Provera posle postavljanja:

```bash
npx convex env list --prod
```

## 2. Deploy

```bash
npx convex deploy --cmd "npm run build"
```

Pre toga lokalno mora da prođe:

```bash
npm run check
```

(lint + build + harness:namespace + harness:check — golden diff znači da se
zamrznuti Links render put pomerio: STOP, ne deploy-uj.)

## 3. Cron-ovi — potvrdi da POSTOJE i da se VRTE

Convex dashboard (prod) → Schedules/Crons. Mora ih biti tačno 7:

| Cron | Interval | Zašto je bitan |
|---|---|---|
| `expire entitlements` | 24 h | istekli planovi se gase |
| `reconcile event lifecycle` | 15 min | zaostali live/scheduled eventi |
| `close stale memories sessions` | 15 min | noć se zatvara i bez schedulera |
| `purge stale upload reservations` | 1 h | reaper: siročići rezervacija >24 h |
| `memories retention sweep` | 24 h | **GDPR sat** — tombstone po planu |
| `memories purge deleted photos` | 24 h | **jedino mesto gde bajtovi stvarno umiru** |
| `memories purge expired exports` | 24 h | ZIP linkovi umiru posle 14 dana |

**Retention cron koji tiho nije registrovan je GDPR pad bez ijednog
simptoma** — niko se neće žaliti što tuđe slike žive duže od obećanog. Zato
posle prvog deploy-a otvori dashboard i prebroji ih: 7. Sledeći dan proveri
da im „last run" nije prazan.

## 4. Seed moduli — NIKAD na prod sa stvarnim podacima

- `memoriesDevSeed` (`seed` / `configureSpace` / `seedCelebration`) i
  `memoriesLoadSeed` (`seed` / `reset` / `verify`) su **internal-only** —
  zovu se jedino deploy key-em preko `npx convex run`. To je ispravno
  stanje; ne menjaj im registraciju.
- **`memoriesLoadSeed:reset` HARD-BRIŠE fotografije** (blobove originala,
  sve tri varijante, asset dokumente, redove) u batch-ovima dok ne očisti.
  Scope-ovan je na `memories-load-test` biznis, ali pravilo je apsolutno:
  **nijedan seed se nikad ne pokreće na deployment-u sa stvarnim
  podacima.** Ako ti prst zaigra ka `npx convex run memoriesLoadSeed:reset`
  sa `--prod` u istoj liniji — stani.
- `demo:seed` i `venueDevSeed:seed` su javne mutacije čuvane setup
  ključevima; na prodi ključeve ne postavljamo, pa odbijaju sve.

## 5. Provisioning pravog klijenta, od nule do kartica na stolovima

Redom; U = ima UI, K = samo konzola (`npx convex run --prod`).

1. **Biznis** (U): `/admin/scanme-links` → novi biznis
   (`api.admin.createBusiness`). Slug postaje deo svih URL-ova — biraj
   trezveno, ne menja se lako.
2. **Venue entitlement** (U): `/admin/venue` → grant
   (`api.venueAdmin.grantVenue {businessId, planKey}`). Venue ima samo
   `basic` plan. Pravi `{slug}-venue` profil + prvi draft event.
3. **Memories entitlement** (U): `/admin/memories` → grant
   (`api.memoriesAdmin.grantMemories {businessId, planKey}`), planovi
   `basic|standard|premium` (3/5/10 slika po gostu, 2048/2560/4096 px,
   30/90/365 dana retencije). Pravi `{slug}-memories` profil + jedan
   `recurring` prostor.
4. **Proslava (svadba itd.)** (U): `/admin/memories` → nova proslava
   (`api.memoriesAdmin.createCelebration`) — jedan poziv pravi tenant,
   celebration red, profil, entitlement, `one_off` prostor sa prozorom
   (default: dan događaja + 48 h) i otvorenu sesiju.
5. **Pozivnica vlasniku** (U): `/admin/scanme-links` → invite (mejl ide
   preko Resend-a; zahteva `SCANME_INVITE_SECRET` + Resend env).
6. **Kartice za stolove** (U — ali u KLIJENTSKOM panelu, ne u adminu):
   vlasnik (ili ti kao admin) u client panelu → Memories sekcija → mint
   (`api.cards.mintCardsForSpace {spaceId, count ≤50, labelPrefix}`).
   Štampa QR-ova sa `/r/{cardCode}` URL-ovima je ručni korak van proizvoda.
7. **Konzola-only** (K): `api.cards.createCard` (kartica ka proizvoljnoj
   meti), `api.cards.retargetCard` (prebacivanje mete), korekcije kvote
   (`quotaAdjustments`). Vlasnik za ovo dolazi kod tebe.

## 6. Plaćanja — NISU povezana

Da niko ne pretpostavi suprotno: `/ponuda` tok se završava kontaktom
(„Online plaćanje još nije uključeno"), ne naplatom. Ne postoji payment
provider, webhook, checkout, niti išta što piše `source: "billing"` u
entitlements — svaki entitlement na prodi je `manual`, upisan adminskim
grant-om. Naplata je van proizvoda: račun/uplatnica pa ručni grant.

## 7. Rollback — deploy je loš, žurka počinje za sat

Convex šema je aditivna (nove tabele, stari indeksi netaknuti), pa je stari
frontend kompatibilan sa novim backendom. To znači:

1. **Prvo vrati frontend**: Vercel → Deployments → poslednji dobar →
   „Promote to Production". Links (jedino što je do sada živelo na prodi)
   nastavlja da radi — njegov render put je zamrznut i ovaj deploy ga nije
   menjao.
2. Convex funkcije se NE vraćaju same. Ako je pokvaren backend deo:
   `git checkout` poslednji dobar commit pa ponovo
   `npx convex deploy --cmd "npm run build"` sa njega. Nove prazne tabele
   slobodno ostaju — ne smetaju starom kodu.
3. Ako je pokvaren samo Venue/Memories a žurka je Links/review klijent:
   promote starog frontenda je dovoljan — ne diraj backend u panici.
4. Cron-ovi iz novog deploy-a bezopasni su za stare podatke (rade nad
   praznim tabelama), ne moraju se gasiti pri rollback-u.

## 8. Pre-flight smoke lista (pravi telefon, ~10 minuta)

Redom, na produkciji, sa telefonom na mobilnoj mreži (ne na WiFi-ju
lokala):

1. **Sken kartice**: QR sa `/r/{cardCode}` → 302 na `/m/{code}`, stranica
   se otvara, ime prostora tačno.
2. **Upload**: dodaj sliku → progres → „Sačuvano". (Ovo dokazuje
   `SCANME_GUEST_SECRET` + `SCANME_PIPELINE_SECRET` na obe strane.)
3. **Vidljivost**: u „Moje slike" otvori sliku → prebaci na „Samo ja i
   domaćin" → proveri da je NEMA u javnoj galeriji (`/m/{code}/galerija`).
4. **Zid**: `/zid/{code}` (uključi zid u panelu ako je isključen) → slika
   se pojavi ≤ par sekundi po commit-u.
5. **Pin na događaj**: u host galeriji izaberi sliku → „Prikaži na
   stranici" → otvori javnu Venue stranicu događaja i vidi je.
6. **Venue stranica**: `/{slug}/venue` u obe teme telefona (svetla/tamna),
   proveri da nema horizontalnog skrola i da je tekst čitak.
7. **Export**: pokreni ZIP export sa male noći (≤ 50 slika), sačekaj mejl…
   ne — link u panelu; skini, otvori, proveri da fotografije otvaraju kao
   JPEG. **Ne testiraj export na noći od 400 slika** — vidi
   `docs/perf/memories-export.md`: finalize preko ~200 MiB arhive na
   deployed runtime-u nije dokazan.

Ako bilo koja od tačaka 1–4 padne, žurka NEMA Memories — vrati se na
sekciju 1 (env promenljive) pre bilo čega drugog.
