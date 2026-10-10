# Jutarnji izveštaj noćnog lanca — 8. 10. 2026.

> **Novije stanje (posle sync-a i dorade, 8. 10. popodne):** [`IZVESTAJ-SYNC-2026-10-08.md`](./IZVESTAJ-SYNC-2026-10-08.md).

> Grana `codex/jovan-sajam-noc-2026-10-08` (osnova `6f246b9`), HEAD `1278638`, DEV `dev:expert-pelican-136`.
> Izvori: `jovan-status/N1.md`–`N6.md`, `scripts/tasks/logs/sajam-v2/SAJAM-IZVESTAJ.md`, `scripts/tasks/logs/sajam-v2/RN-IZVESTAJ.md`, gate logovi runnera (`N*-gate-*.log`).

## 1. Presuda RN

**TREBA DORADA** (`RN-IZVESTAJ.md`).

Sve provere runnera su zelene, a backend QR-a, skenova i authz-a je ispravan. Pre produkcije ipak treba kratka dorada koda: fotografija pravog automobila se u produkciji ne prikazuje (RN N1), a uz nju idu četiri srednja nalaza (§7). IZN kod ne menja (uputstvo IZN), pa dorada ostaje otvorena.

## 2. Koraci

| Korak | Šta je urađeno | Commit | Testovi (runner / status) |
|---|---|---|---|
| N1 | QR backend za nalepnice. Normalizator broja (`7` → `SA26-007`), traženje po oznaci preko indeksa, zaštite (panel, povučen model). Nove funkcije `linkSticker`, `undoLink` (15 min) i `listRecentLinks`. Admin prečica u resolveru bez upisa skena. `bulkRetarget` ne gazi vezanu nalepnicu. | `b8d518b` | fair 48 fajlova / 454 testa; `npm test`: samo stari pad (`N1.md` §3) |
| N2 | Ekran „Poveži nalepnicu“ na telefonu (`/admin/dogadjaji/<slug>/povezi`). Stanje „Panel“ u QR listi. Polja od 16 px. Potvrda, „Poništi“ i „Sledeća“. | `ee85707` | fair 454; admin 308 (`N2.md` §3) |
| N3 | Nove mape organizatora (hala, ispred hale, zadnji deo). Svih 38 izlagača sa kategorijom. Deljeni štandovi. ScanMe na `ispred-14`. `placeSiteExhibitors` (internal). `getEventMap` vraća sve izlagače. | `0fdac53` | fair 475; DEV: 39 štandova, Markus Pro bez mesta (`N3.md` §3) |
| N4 | Mapa v2 po uzoru na test mapu: pretraga, filteri sa brojem, +/−/ceo prikaz, vektorski štandovi sa logotipima, bottom sheet, lista izlagača, dubinski link `?stand=` i displej `?prikaz=ekran`. Bez ruta i bez „Vi ste ovde“. | `109696f` | fair 510; `map-guards` proverava zabrane (`N4.md` §3–4) |
| N5 | Leadovi i mejl: normalizacija imena, mejla i telefona; jedan lead po posetiocu, modelu i vrsti; meko (10/h) i tvrdo (30/h) ograničenje po adresi; limit po IP adresi; cron koji svakih 5 min ponovo zakazuje zaglavljena slanja; mejl potvrde sa štandom i redom o privatnosti. | `6e6541a` | fair 526; nijedan stvarni mejl (`N5.md` §3) |
| N6 | F3: prava stranica automobila iz `getModelBySlug`. Forme „Zainteresovan sam“ i „Probna vožnja“ povezane sa `/api/fair/lead`, sa saglasnošću Prihvatam/Odbijam. Ocena i Glas publike su sakriveni na pravim modelima. | `1278638` | fair 555; build OK (`N6.md` §3) |
| RN | Nezavisni pregled (samo čitanje): presuda TREBA DORADA. | — (bez commita) | — |

**Konačni gejtovi runnera** (N6, `N6-N6-a1-gate-*.log`):
- `build` OK;
- `tsc` 35 grešaka, isto kao osnova;
- `npm test` 2 stara pada (`adminProducts` 500 venues i `memoriesHost`), isti kao osnova;
- fair 56 fajlova / 555 testova;
- `lint` 0 grešaka;
- `namespace` i `harness` OK.

Preskočenih koraka nema (N6 je išao jer je `stranicaAutomobila: true`).

## 3. Probaj na telefonu (Jovanov DEV, `npm run dev`, http://localhost:3150 ili LAN adresa)

| URL | Šta dodirneš | Šta treba da vidiš |
|---|---|---|
| `/sajam/elektromobilnost-2026` | Ništa, samo otvori stranicu. | Kartica „Mapa sajma“, pretraga, Hala / Ispred hale / Zadnji deo, filteri „Sve 40“ (na DEV-u su uz 38 izlagača i 2 TEST izlagača). Mapa je u prvom ekranu. |
|  | „Pronađi ScanMe“ | Zona „Ispred hale“, zeleni štand 14 i sheet „ScanMe i Enigma IT“. |
|  | Štand 2 u hali | Sheet „Štand 2 · Hala · 490 m²“ sa 6 izlagača i „Sajt izlagača“. Prevuci ručku nadole da zatvoriš. |
|  | Pretraga „toyota“ i filter „Moto“ | Rezultat sa mestom; štandovi koji ne odgovaraju su zatamnjeni. |
|  | Lista „Izlagači po kategorijama“ | Markus Pro: „Ispred hale — tačno mesto još nije na mapi organizatora“. |
| `/sajam/elektromobilnost-2026?prikaz=ekran` (računar ili TV, 1920×1080) | Ništa. | Hala i deo ispred hale jedno pored drugog, zadnji deo kao umetak, legenda i rotacija. Bez pretrage i bez +/−. |
| `/sajam/elektromobilnost-2026?stand=hala-2` | Ništa. | Odmah otvoren štand 2. |
| `/dev/sajam-mapa` | Isto kao gore. | Pravi izlagači na pravoj geometriji, uz TEST modele (sa obaveštenjem). |
| `/dev/sajam-forma` i `?stanje=uspeh`, `?stanje=greska`, `?vrsta=probna` | Polja, pa „Prihvatam“ / „Odbijam“. | Polja od 16 px. Slanje je zaključano do „Prihvatam“. Probna vožnja nema datum. Ništa se ne šalje. |
| `/dev/admin-events-preview/povezi` | Ukucaj `40`, izaberi izlagača, pa automobil. | Kartica „Slobodna“, traka „SA26-040 → …“, „Poveži“, potvrda, „Poništi“ i „Sledeća: SA26-041“ (lokalno, bez upisa). |
| `/admin/dogadjaji/test-elektromobilnost-2026/povezi` (prijavljen kao admin) | Isto, ali stvarno na DEV-u. | Veza se stvarno upisuje na DEV; lista „Poslednje veze“ nudi „Poništi“. |
| `/sajam/test-elektromobilnost-2026/model/test-volta-x1-test-premium` i `…/model/test-om-z1` | „Sačuvaj u garažu“ | TEST podaci, tonalna površina bez fotografije. Dugmadi za forme nema, jer na DEV-u `FAIR_LEADS_ENABLED` nije postavljen (`N6.md` §1). |

## 4. Teren — lepljenje nalepnica (Aleksa)

1. Prijavi se kao admin na telefonu.
2. Zalepi nalepnicu SA26-0xx na automobil. Skeniraj je kamerom: otvara se „Poveži nalepnicu“ sa tom nalepnicom. Drugi put: Događaji → događaj → „Poveži nalepnicu“, pa ukucaj **samo broj** (npr. `7`).
3. Kartica mora da kaže **„Slobodna“** ili gde nalepnica sada vodi. „Panel“ se ne vezuje za automobil.
4. Dodirni izlagača (lista je poređana po štandu), pa automobil.
5. Pročitaj traku na dnu („SA26-007 → model · brend · štand“) i dodirni glavno dugme. Upozorenja znače:
   - **nacrt:** sken vodi na „kartica nije aktivna“ dok se model ne objavi;
   - **premeštanje:** nalepnica prelazi sa drugog automobila;
   - **zamena:** stara nalepnica automobila se oslobađa.
6. Zeleno „Povezano“. Pogrešno? Dodirni **„Poništi“**; radi 15 minuta, i iz „Poslednje veze“.
7. Proveri: skeniraj nalepnicu u privatnom prozoru (kao posetilac). Objavljen automobil otvara svoju stranicu.
8. Za sledeći automobil istog izlagača dodirni „Sledeća: SA26-008“.

Ako ekran javi „Nalepnica je u međuvremenu promenila automobil“, neko drugi je menjao istu nalepnicu. Pročitaj novo stanje i potvrdi ponovo. Ne radite istovremeno na istom automobilu (RN nalaz N3). Izvor: `N2.md` „Kratko uputstvo za teren“.

## 5. Produkcija danas, redom

| # | Korak | Ko | Ako izostane |
|---|---|---|---|
| 0 | **Dorada RN N1–N5** (§7) u novom kratkom koraku, uz runner proveru | Jovan | Fotografija pravog automobila je prazna; ostali nalazi ostaju. |
| 1 | Merge grane ili `git am` patch-eva `scripts/tasks/logs/sajam-v2/patches/0039…0044` (N1–N6) na zajedničku granu | Aleksa | Ništa od noći ne ide u produkciju. |
| 2 | Convex prod deploy, pa Vercel deploy. Šema je aditivna: 3 indeksa i cron „fair email outbox sweep“. Na Vercelu moraju biti `NEXT_PUBLIC_CONVEX_URL`, `FAIR_VISITOR_HASH_SECRET` i `FAIR_GATEWAY_SECRET` | Aleksa | `/sajam` stranice ne postoje na scanme.rs; nalepnice vode u 404 ili na nevažeću stranicu. |
| 3 | Proveriti kod i slug događaja, pa redom: `npx convex run --prod fairExhibitorImport:linkEventQrInventory '{"ownerEmail":…,"eventCode":…,"inventorySmlCode":"SML-SAJAM-26-QR"}'` → `…:importSiteExhibitors '{…,"list":"elektromobilnost-2026"}'` → `…:placeSiteExhibitors '{…,"list":"elektromobilnost-2026"}'`. Očekivano: 39 štandova, 38 učešća, preskočen Markus Pro (`N3.md` §8). | Aleksa | Prazna mapa; ScanMe 14 nije zelen; „Poveži nalepnicu“ ne nalazi nalepnice ni izlagače. |
| 3a | U adminu proveriti validaciju događaja: nema `FAIR_MAP_LOCATION_INVALID` (uklonjene lokacije S1–S5, 20/21/22, 12/13/15); događaj nije nacrt; `venueName` = „Hala Čair, Niš“; nijedan TEST događaj nije vezan za SA26 inventar | Aleksa | Modeli na starim lokacijama se ne objavljuju; mejl navodi pogrešno mesto; prečica može da izabere TEST događaj. |
| 4 | Convex env (samo imena): `FAIR_GATEWAY_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FAIR_EMAIL_REPLY_TO`. `FAIR_LEADS_ENABLED` se postavlja **tek posle 5–6**, a `FAIR_FOLLOWUP_ENABLED` po želji (`N5.md` §8) | Aleksa / Jovan | Bez ovoga forme ostaju zatvorene (bezbedno); dugmadi na stranici automobila nema. |
| 5 | Aktivacija saglasnosti: Leadovi → Saglasnost → stručno proveren tekst → „Aktiviraj verziju N“ | Aleksa (pravna provera) | Forme ostaju zatvorene (`consent_not_configured`). |
| 6 | Forme po izlagaču: Interakcije → Forme → uključiti, pravilo kontakta, „Primeni na sve modele“ (probna vožnja samo za Napredne) | Aleksa | Nema dugmeta za tog izlagača. |
| 7 | Objava automobila (Modeli → Objavi), sa štandom | Aleksa | Sken nalepnice vodi na `/r/nevazeca`; admin dobija prečicu za povezivanje. |
| 8 | Provera: skenirati jednu pravu nalepnicu (admin, pa privatni prozor) i glavni panel; otvoriti mapu na telefonu i proveriti da je štand 14 zelen | Aleksa | Greška se otkriva tek na sajmu. |

## 6. Odluke za Aleksin pregled

| Novo prema starijem planu | Gde je opisano |
|---|---|
| Na mapi su svi izlagači (38), i bez automobila | NOC §1.2; `N3.md` §6; `N4.md` §6; `FAIR-BACKEND-CONTRACT.md` §14, §38 |
| Deljeni štandovi (O4): „taken“ važi samo za isto učešće | NOC §1.3; `N3.md` §2 „Deljene lokacije“ i §6 |
| ScanMe se javno crta na štandu 14, jedini u zelenoj | NOC §1.4; `N3.md` §6; `N4.md` §2 |
| Izgled test mape bez ruta, „Vi ste ovde“ i ulaza | NOC §1.1; `N4.md` §7 (preuzeto / namerno nije preuzeto / 6 pitanja) |
| F3 (stranica automobila) urađen u Jovanovom lancu | NOC §1.7; `N6.md` §2, §6; `BLOCKED.md` „SAJAM v2 — N6“ |
| Leadovi: meko ograničenje upisuje lead; duplikat ne pravi drugi lead | `N5.md` §6, §7 |

## 7. Otvoreno i poznati problemi (RN, nerešeno)

| Nalaz RN | Ozbiljnost | Šta |
|---|---|---|
| N1 | visoko | `fair-model-page.tsx:225-233`: spoljni `photoUrl` ide kroz `next/image`, a dozvoljen je samo `*.convex.cloud`. U produkciji fotografija ostaje prazna. Rešenje: `unoptimized`. |
| N2 | srednje | Kod duplikata forma piše „Potvrdu šaljemo na {nova adresa}“, iako se ništa ne šalje. |
| N3 | srednje | `linkSticker` sa `replaceModelSticker` može osloboditi nalepnicu koju admin nije video, ako je drugi admin istovremeno menjao isti automobil. |
| N4 | srednje | `getEventMap` javno prikazuje učešća i štandove u nacrtu. |
| N5 | srednje | ScanMe zelena zavisi od toga da li je štand 14 zauzet, a hover na telefonu je gazi. |
| N6 | srednje (podaci) | Postojeći prod štandovi na uklonjenim lokacijama blokiraju objavu. |
| N7 | srednje (UX) | Štandovi na mapi su pri punom prikazu na telefonu manji od 44 px; ublaženo zumom, pretragom i listom. |
| ostalo | nisko | AMF placeholder, širok „Poništi“, `linkDigital`, varijante unosa, aliasi adresa, ime „J.Petrovic“, `stalled` retry, Tab iz sheet-a, „3 m²“, preklop na štandu 12, runner snima bez 360/412 (`RN-IZVESTAJ.md`, tabela nalaza). |

Iz statusa koraka ostaje i:
- konačan tekst mejla potvrde i forme (P1);
- ocena, Glas publike i `direct_view` na pravom modelu;
- tačno mesto Markus Pro;
- podela 20/21/22.

Izvori: `N5.md` §7, `N6.md` §7, `N3.md` §7.
