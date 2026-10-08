# Sajam elektromobilnosti 2026 — beleške uz unos podataka

**Status:** pripremljeno za validaciju; nije importovano  
**Događaj:** `elektromobilnost-2026`  
**Datum obrade:** 8. oktobar 2026.  
**Izvor istine:** materijali izlagača u `Sajam Automobila '26/Izlagaci`, uz javne stranice Ferum/Yudo i BENTU samo tamo gde izlagač nije dostavio katalog.

## Obuhvat

| Izlagač | Brend | Model | `model_external_key` | Zaključani javni slug | Paket | Fotografija | Pasoš |
|---|---|---|---|---|---|---|---|
| CUBI / JMEV | JMEV | EV3 | `elektromobilnost-2026-jmev-ev3` | `jmev-ev3` | Advanced | da | da |
| CUBI / JMEV | JMEV | YI | `elektromobilnost-2026-jmev-yi` | `jmev-yi` | Advanced | da | da |
| CUBI / JMEV | JMEV | EWIND | `elektromobilnost-2026-jmev-ewind` | `jmev-ewind` | Advanced | da | da |
| Grand Motors | Mazda | CX-5 Homura | `elektromobilnost-2026-mazda-cx-5` | `mazda-cx-5` | Free (`included`) | da | ne |
| Grand Motors | Mazda | CX-60 Homura Plus | `elektromobilnost-2026-mazda-cx-60` | `mazda-cx-60` | Free (`included`) | da | ne |
| Grand Motors | Mazda | CX-6e Takumi Plus | `elektromobilnost-2026-mazda-cx-6e` | `mazda-cx-6e` | Free (`included`) | da | ne |
| Grand Motors | Chery | Arrizo 8 PHEV | `elektromobilnost-2026-chery-arrizo-8-phev` | `chery-arrizo-8-phev` | Free (`included`) | da | ne |
| Grand Motors | Chery | Tiggo 4 Pro HEV | `elektromobilnost-2026-chery-tiggo-4-pro-hev` | `chery-tiggo-4-pro-hev` | Free (`included`) | da | ne |
| Grand Motors | Chery | Tiggo 9 PHEV | `elektromobilnost-2026-chery-tiggo-9-phev` | `chery-tiggo-9-phev` | Free (`included`) | da | ne |
| Auto Mig | Foton | eTunland | `elektromobilnost-2026-foton-etunland` | `foton-etunland` | Free (`included`) | da | ne |
| Auto Mig | Foton | eView | `elektromobilnost-2026-foton-eview` | `foton-eview` | Free (`included`) | da | ne |
| Auto Mig | Foton | eView Grand | `elektromobilnost-2026-foton-eview-grand` | `foton-eview-grand` | Free (`included`) | da | ne |
| Auto Mig | Foton | Cavan C1 Plus | `elektromobilnost-2026-foton-cavan-c1-plus` | `foton-cavan-c1-plus` | Free (`included`) | da | ne |
| Ferum | Yudo | Air Ultra | `elektromobilnost-2026-yudo-air` | `yudo-air` | Starter | da | ne |
| Bentu | BENTU | Mango L7e-CU | `elektromobilnost-2026-bentu-mango` | `bentu-mango` | Free (`included`) | da | ne |

JMEV jedini trenutno ispunjava uslov za brend pasoš: ima najmanje dva modela i sva tri modela imaju najmanje Starter paket.

## Fotografije

Nove optimizovane fotografije pripadaju isključivo događaju i nalaze se u `public/fair/elektromobilnost-2026/`:

- `chery-arrizo-8-phev.webp`
- `chery-tiggo-4-pro-hev.webp`
- `chery-tiggo-9-phev.webp`
- `mazda-cx-5-homura.webp`
- `mazda-cx-60-homura-plus.webp`
- `mazda-cx-6e-takumi-plus.webp`
- `foton-cavan-c1-plus.webp`
- `foton-etunland.webp`
- `foton-eview.webp`
- `foton-eview-grand.webp`
- `yudo-air-ultra.webp`
- `bentu-mango.webp`

Postojeće JMEV fotografije nisu menjane. Za Ferum/Yudo i BENTU korišćene su fotografije modela sa njihovih zvaničnih javnih stranica, prema izričitom zahtevu vlasnika proizvoda.

## JMEV — zaključane promene iz poslednjeg maila

- Model koji je ranije u TEST fixture-u bio prikazan kao `eLight` sada se u realnim podacima vodi kao **YI**, sa stabilnim external key-em `elektromobilnost-2026-jmev-yi` i javnim slugom `jmev-yi`.
- TEST fixture i njegov slug se ne brišu i ne preimenuju.
- Cene: EV3 — `Cena na upit`; YI — `31.000 EUR`; EWIND — `32.000 EUR`.
- Sva tri modela su Advanced.
- Zahtev za probnu vožnju ostaje u postojećem lead toku aplikacije; izlagač želi telefon ili email i naknadno dogovaranje termina.
- Predlog izlagača da se u okviru Glasa publike prikupljaju ime, telefon ili email nije unet. Glas publike ne menja postojeću funkcionalnost lead formi.

## Glas publike — nerešene tačke

Četiri validna pitanja su uneta u `05-audience-questions.csv` kao `draft` i privremeno vezana za EV3, jer postojeći ugovor zahteva `model_external_key`, dok je sadržaj formulisan za ceo JMEV brend. Datum `2026-10-09` je privremeni prvi dan događaja; raspored objave mora da se potvrdi pre importa.

1. U drugom pitanju izlagač je poslao opciju **EVEASY**, ali je kao stvarni naziv izloženog modela poslao **YI**. Tekst je sačuvan doslovno; potrebna je potvrda da li opciju promeniti u YI.
2. Sledeće pitanje nije uneto jer ima šest odgovora, a trenutni intake/šema dozvoljava najviše pet:
   - **Pitanje:** „Šta vam je najvažnije pri izboru električnog automobila?”
   - **Odgovori:** Cena; Domet; Oprema i tehnologija; Brzina punjenja; Garancija i servis; Dizajn.
   - Ne skraćivati niti spajati odgovore bez odluke vlasnika proizvoda.

## Blokatori pre B1 dry-run/commit importa

Ovi podaci nisu izmišljeni niti popunjeni placeholder vrednostima:

- DEV trenutno nema realan događaj `elektromobilnost-2026`; postoje samo TEST događaji.
- DEV nema realne klijent/business/brand zapise za CUBI/JMEV, Grand Motors, Auto Mig, Ferum i Bentu.
- Nedostaju postojeći SMK/SML identifikatori koji moraju da se povežu sa realnim klijentima.
- Originalna zvanična mapa jasno potvrđuje JMEV štand 6, Foton štand 7 i Mazda štand 8. Chery, Ferum/Yudo i BENTU nisu jasno označeni, pa su njihovi `stand_code` ostavljeni prazni bez nagađanja. Za sve izlagače još nedostaje interni `map_location_id` iz ugovora sa mapom.
- Nisu dodeljeni QR kodovi modelima; `08-qr-assignments.csv` je namerno prazan.
- Bez ovih referenci nije bezbedno praviti B1 JSON payload niti pokrenuti commit import.

## Rezultat lokalne dry-run validacije

Komanda:

`node scripts/events/validate-csv-intake.mjs docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07`

Rezultat je 7 preostalih grešaka i nema grešaka u parsiranju modela, specifikacija, fotografija ili pitanja:

- 3 puta nedostaje obavezni `stand_code` — za Chery, Ferum/Yudo i BENTU, jer nisu jasno označeni na zvaničnoj mapi;
- 1 prijava duplog štanda, zato što Mazda i Chery dele Grand Motors štand;
- 3 posledične prijave da Mazda modeli nisu vezani za dati brend/učešće, jer CSV validator trenutno ne podržava deljeni `stand_external_key` i pri proveri zadržava samo poslednji brend.

B1 admin `dryRun` nije pokrenut sa nepotpunim/izmišljenim JSON payloadom: realan događaj i vezani SMK/SML/brand/map zapisi još ne postoje u DEV-u, a `fairImport:dryRun` je admin-only i po ugovoru prvo vraća `FAIR_EVENT_NOT_FOUND`. B1 import ostaje blokiran dok event-first priprema i referentni zapisi ne budu napravljeni u dogovorenom backend toku. Nijedan podatak iz ovog intake-a još nije upisan u Convex.

## Ispravke 8. oktobra 2026. (posle pregleda vlasnika proizvoda)

- Štandovi su provereni na zvaničnoj mapi i u geometriji aplikacije (`lib/fair-map/elektromobilnost-2026.ts`): JMEV je štand 9 (`hala-9`), Foton štand 6 (`hala-6`), Mazda i Chery dele jedan štand Grand Motors-a na lokaciji 6 (`hala-6`), Yudo/Ferum je 1A (`hala-1a`), a BENTU 1B (`hala-1b`). Raniji brojevi 6/7/8 su bili pogrešni.
- Foton (AUTO MIG) i Grand Motors dele `hala-6` kao odvojeni izlagači, po odluci vlasnika O4.
- SMK/SML kodovi su dodeljeni (`SMK-SAJAM-26-<KOD>` / `SML-SAJAM-26-<KOD>`), a klijenti su napravljeni kroz `fairSetup:bootstrapEvent` sa placeholder kontaktom („Kontakt <izlagač>“, bez email/telefona). Prave kontakte treba dopuniti.
- `package_active_from` je 2026-10-09T00:00:00+02:00 za sve modele.
- Naziv izlagača je „AUTO MIG d.o.o. Niš“.
- B1 payload: `b1-payload.json`. Importovan je i objavljen na DEV-u 8. 10.; postupak za produkciju je u `RUNBOOK-EVENT-SETUP.md`.
- Glas publike i ankete (05, 06) i dalje su draft i nisu importovani.
