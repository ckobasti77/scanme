# Release readiness — presuda (TASK-25)

Dvadeset četiri taska su napravila proizvod. Ovo je odgovor na jedino
preostalo pitanje: **sme li se ovo dati pravom vlasniku kafića i punoj sali
gostiju, bez nekoga ko stoji iza toga?**

## Presuda

**DA za kafić i standardnu proslavu — uz dva zapisana ograničenja. NE za
obećanje „pun premium izvoz" dok se finalize ne popravi.**

Konkretno:

- **Recurring lokal (kafić/klub), basic ili standard plan: spreman.** Sken →
  upload → vidljivost → zid → pin → javna stranica je ceo put dokazan
  merenjima i testovima; klijentski timeout (poslednji poznati guest-visible
  defekt) je zatvoren u ovom tasku; pristupačnost tri dodirne površine je
  auditirana i popravljena na AA.
- **Jednokratna proslava (svadba) na premium planu: uslovno.** Noć sama
  radi — upload, kvota 10/gost, zid — ali **ZIP izvoz cele premium noći će
  pasti** (finalize drži celu arhivu u memoriji; deployed plafon ≈ 40–80
  premium fotografija, izmereno i izračunato u
  `docs/perf/memories-export.md`). Domaćinu se premium prodaje bez obećanja
  „sve slike jednim klikom" dok streaming finalize ne stigne.
- **Prvi prod deploy je sam po sebi najveći rizik** — proizvod nikada nije
  bio na prodi; runbook (`docs/deploy/README.md`) sa smoke listom je
  obavezan deo primopredaje, ne opcija.

---

## Step 0 — knjiga odluka (svaka stavka zatvorena)

1. **Reserve/renew bez timeout-a — POPRAVLJENO.**
   `lib/memories-client/backend.ts`: svaka Convex mutacija se trka protiv
   `MUTATION_TIMEOUT_MS = 20 s` i baca klasifikovan retryable
   `mutation_timeout` koji postojeći retry/offline-hold put obrađuje; uz to
   `skipQueue: true` na sve tri mutacije — bez toga jedan mrtav socket na
   fire-and-forget release-u zauvek blokira klijentov interni FIFO i svaki
   sledeći reserve. Dokazano sa 4 nova testa (`backend.test.ts`).

2. **Scan burst iza jednog NAT-a — POPRAVLJENO, broj izabran namerno.**
   `convex/lib/rateLimits.ts`: cardResolve i guestCreate sada
   `rate 300/min, capacity 300` (bilo 120/60 i 60/30). Aritmetika u
   komentaru pored brojeva: jedan memories sken troši OBA bucket-a, svaki
   sken kuje novog gosta (path-scoped cookie je nevidljiv resolveru), a
   burst je trenutan — kartice padnu na stolove i cela sala skenira u prvom
   minutu. Kapacitet mora da pokrije celu salu (~300); rate 5/s i dalje
   zaustavlja skriptovane poplave. Lažljivi „deliberately generous"
   komentar je uklonjen.

3. **`venue.archiveEvent` bez cap-a — POPRAVLJENO.** Ista semantika kao
   host-curated pin put: broji postojeće redove, nastavlja `order` iza njih,
   preskače već pin-ovane asset-e, i preko `ARCHIVE_MAX_ITEMS` (60) baca
   tvrdu grešku (novi dict string `archiveOverCap` u venue-editor rečniku).
   Test: „archiveEvent refuses to push an event past ARCHIVE_MAX_ITEMS".

4. **`archiveTargets .take(100)` tiho seče — POPRAVLJENO.** Imenovana
   granica `ARCHIVE_TARGETS_CAP = 100`, query čita cap+1 i vraća
   `truncated`; picker prikazuje „Prikazano je poslednjih 100 događaja —
   stariji nisu na spisku." Tiha klasa greške (GALLERY_READ_CAP lekcija)
   ubijena signalom, ne povećanjem broja.

5. **Praznina ispod profile-cards — VERIFIKOVANO NA STVARNOM RENDERU: nema
   je.** DOM merenje na `/dev/venue-preview`: gap ispod bloka tačno 32 px
   (standardni razmak). Koren je zatvoren još u TASK-12
   (`venueStorageUrl` → `null` za opaque id, slika se ne renderuje).

6. **Premium izvoz — IZMEREN; plafon zapisan.** 400 slika @ 4096 px:
   20,0 min, peak RSS 2248 MiB, arhiva 1886 MiB — lokalno prolazi, ali
   deployed `"use node"` action ima 512 MiB, pa je finalize plafon
   ≈ 200–400 MiB arhive ⇒ ~40–80 premium slika (i ~170–330 basic — čak ni
   izmereni basic scenario od 400 slika nije deploy-dokazan). Šta se kaže
   domaćinu i koja je poznata popravka: `docs/perf/memories-export.md`.

7. **Dupli lossy lanac — ODLUČENO: JPEG ostaje.** JPEG jeste veći i lošiji
   od WebP izvora na oba tier-a (basic 1055→1209 KiB, premium
   4232→4828 KiB) — to je očekivano ponašanje slabijeg kodeka, ne bug.
   Obećanje izvoza je „spremne za štampu": JPEG prima svaka štamparija,
   WebP je kocka. Okidači za preokret zapisani u perf dokumentu.

8. **`memoriesCountShards` se nikad ne čisti — PRIHVAĆENO, ostaje.**
   Redovi nose samo anonimne agregate (GDPR-čisto — brojka noći sme da
   preživi brisanje slika), čitanja su per-key ograničena (≤16 redova,
   cap 32), akrecija je najviše ~112 redova nedeljno po prometnom
   recurring prostoru (~5.800/god) — trošak je veličina tabele, ne
   korektnost. Okidač za popravku: ako se ikada uvede hard-delete sesija
   (shard redovi bi postali siročići — cleanup ide u taj isti put), ili
   ako tabela postane primetna stavka troška skladišta.

**Ne dirati (zapisano, kod ostavljen):** pre-postojeći ScanMe Links bug —
`normalizeEditorDesign` tiho ispušta per-element text-shadow pri
normalizaciji editor dizajna. Links je zamrznut; bug je postojao pre ovog
rada i ostaje dokumentovan ovde umesto popravljen.

---

## Urađeno i DOKAZANO (sa merenjem koje to dokazuje)

- **Backend pod opterećenjem prave noći** — TASK-24, 200 telefona protiv
  dev deployment-a: sharded rollups obaraju OCC greške 163→4 na 300
  commit-ova, p95 0,4–0,7 s, ~30 slika/s, drift-free posle 841 commit-a;
  kvota TAČNA pod napadom (40 gostiju × 8 paralelnih reserve-ova na limitu
  3 → tačno 3 svakome, nula curenja). `docs/perf/memories-load.md`.
- **Zid uživo** — preko ~2.900 commit-ova nikad nije ostao prazan;
  commit→zid p50 0,35–0,8 s, p99 ~1,2 s.
- **Klijentski upload put** — queue mašina (sekvencijalnost, reserve-once,
  offline-hold, stale-transfer abort) pod vitest fake-ovima; od danas i
  transportni deadline + FIFO bypass (4 nova testa).
- **Izvoz basic ≤ ~200 MiB** — bench nad pravim pipeline varijantama:
  277 s / 400 slika, arhiva se otvara na Windows-u, JPEG validan.
- **Pristupačnost tri površine** — auditirana na AA, popravke primenjene i
  proverene na stvarnim izračunatim bojama u obe teme (tabela kontrasta u
  `docs/qa/accessibility.md`); 501/502 testova zeleno posle svih izmena.
- **Konsent granica** — `host_only` nikad na javnu površinu: indeksom
  garantovano na zidu, tvrdim gate-om na pin putu, testovima imenovanim po
  padu.

## Urađeno ali NEDOKAZANO (sagrađeno, uverljivo, nikad voženo u besu)

- **Prod deployment sam** — nijedan deo Venue/Memories nikada nije bio na
  produkcionom Convex-u/Vercel-u; sve gore je dokazano na dev deployment-u
  ili lokalno. Prvi deploy + smoke lista su prava proba.
- **Zid na stvarnom TV-u/projektoru** — 6 sati u pravom baru: autoplay
  politika TV browsera, wake-lock, HDMI sleep. Lokalni harness ≠ kafanska
  Smart TV kutija.
- **iOS/Android zoologija** — lock/unlock oporavak je inženjerisan po
  dokumentovanom ponašanju i testiran fake-ovima, ne na floti pravih
  starih telefona u sali sa lošim signalom.
- **Scan burst na novim limitima** — 300/300 je aritmetika, ne merenje;
  niko nije pustio 300 stvarnih skenova kroz jedan NAT.
- **Deployed izvoz iznad ~200 MiB** — poznato-neprovereno, sada sa
  zapisanim plafonom umesto nade.

## Svesno NEDOSTAJE

- **Plaćanja** — stub; tok se završava kontaktom, svi entitlements su
  ručni. Niko ne sme da pretpostavi da naplata postoji.
- **ScanMe Menu** — planiran proizvod, ne postoji.
- **Digitalna pozivnica** za proslave — ne postoji.
- **Links↔Venue navigaciona sprega** — blokirana zamrzavanjem Links-a;
  gost na Links stranici ne zna da Venue stranica postoji i obrnuto.
- **Streaming/multi-part finalize izvoza** — prva inženjerska stavka ako
  Memories premium krene da se prodaje.

## Ako kafić pusti pravu žurku sledeće subote — šta najverovatnije pukne?

Rangirano, i ovo je poenta ovog fajla:

1. **Prod okruženje, ne kod.** Proizvod nikad nije bio na prodi, a dve
   tajne (`SCANME_GUEST_SECRET`, `SCANME_PIPELINE_SECRET`) moraju stajati
   na DVE strane sa istim vrednostima; promašaj znači „sken radi, upload
   mrtav" — totalni pad sa zdravim kodom. Zato smoke lista u runbook-u
   nije ceremonija nego uslov primopredaje.
2. **Radio, ne server.** Backend drži 96-way konkurentnost, ali 150
   telefona na jednoj pristupnoj tački gura upload u minute. Queue sada
   pada ČASNO (deadline → retry → offline-hold → ručni retry umesto večnog
   spinnera), ali deo gostiju će ipak odustati pre nego što slika legne —
   to je fizika sale, i osoblje treba da zna da kaže „sačekaj, stići će".
3. **Televizor.** Zid je softverski žilav, ali kafanska Smart TV kutija ume
   da uspava browser, blokira autoplay ili ubije tab posle sat vremena.
   Provera na LICU MESTA sat pre žurke (tačka 4 smoke liste) je jedina
   odbrana koja postoji.
4. **Izvoz sutradan, ne večeras.** Vlasnik velike noći klikne „preuzmi
   sve" i job padne bez izlaza (plafon iz perf dokumenta). Slike su
   bezbedne u galeriji — ali ovo je prvi „proizvod ne radi" utisak posle
   uspešne žurke, i treba ga preduprediti očekivanjima kod primopredaje.
5. **Gost koji izgubi identitet.** Obrisani kolačići / privatni mod →
   „moje slike" prazne iako su slike na serveru (localStorage-mirror
   restore pokriva običan slučaj, ne sve). Retko, ali kad se desi, izgleda
   kao gubitak — osoblje: „slike su u javnoj galeriji, ništa nije
   propalo".

Ništa na ovoj listi nije nepoznata nepoznanica: svaka stavka ima zapisan
mehanizam, simptom i prvu pomoć. To je razlika između „daj im i stoji
pored" i „daj im" — i zato je presuda DA, sa gore navedenim izuzetkom za
premium izvoz.
