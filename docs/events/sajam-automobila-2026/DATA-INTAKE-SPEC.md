# Sajam automobila 2026 — paket za prikupljanje podataka

> **Status:** spremno za operativnu upotrebu
>
> **Poslednje ažuriranje:** 1. oktobar 2026.
> **Vlasnik odluka:** Aleksa
> **Produktni kontekst:** [MASTER-KONTEKST.md](./MASTER-KONTEKST.md)
> **Tehnički ugovor:** [BACKEND-HANDOFF.md](./BACKEND-HANDOFF.md)

`MASTER-KONTEKST.md` definiše proizvod i poslovna pravila. `BACKEND-HANDOFF.md` definiše tehničku implementaciju. Ovaj dokument definiše kako ScanMe prikuplja, proverava i predaje stvarne podatke za unos. Kontradikcije se ne rešavaju pretpostavkom, već se vraćaju u komandni centar.

## 1. Svrha

Ovaj paket omogućava da Teodora i Aleksa prikupe podatke telefonom, emailom ili iz materijala izlagača, bez rada izlagača u ScanMe sistemu. Podaci se unose u jednostavne CSV tabele, interno proveravaju i tek zatim normalizuju u verzionisani JSON import iz `BACKEND-HANDOFF.md`.

CSV fajlovi nisu direktan produkcijski import i ne smeju automatski da menjaju bazu. Jovanov import prvo mora da izvrši `dryRun`, prikaže greške i upozorenja, a zatim zahteva odvojenu potvrdu za `commit`.

## 2. Fiksne vrednosti

### Događaji

| `event_code` | Naziv | Datumi |
|---|---|---|
| `elektromobilnost-2026` | Sajam elektromobilnosti | 9–11. oktobar 2026. |
| `auto-moto-fest-2026` | Sajam auto brendova / Auto Moto Fest | 30. oktobar–1. novembar 2026. |

### Paketi

| Vrednost u tabeli | Poslovni naziv |
|---|---|
| `included` | Za sve izlagače |
| `starter` | Starter — 3.000 RSD po modelu |
| `advanced` | Napredni — 5.000 RSD po modelu |

Paket pripada jednom izloženom modelu na jednom događaju. Isti komercijalni model na oba događaja ima dva odvojena reda. Dozvoljena je samo nadogradnja `included → starter → advanced`.

### Da/ne vrednosti

U svim tabelama koristiti isključivo `yes` ili `no`. Prazno polje znači „nije još poznato”, ne „ne”.

### Datumi i vreme

- `event_day` koristi `YYYY-MM-DD`.
- `package_active_from`, `assigned_at` i `verified_at` koriste ISO 8601 datum i vreme sa vremenskom zonom, na primer `2026-10-09T09:00:00+02:00`.
- Tačno vreme aktivacije paketa je obavezno jer nadogradnja tokom sajma važi od trenutka aktivacije.

## 3. Fajlovi i vlasništvo

| Fajl | Sadržaj | Primarno popunjava | Finalno proverava |
|---|---|---|---|
| `01-exhibitors.csv` | izlagač, kontakt i isporuka | Teodora | Aleksa |
| `02-brands-stands.csv` | brend, štand i mapa | Teodora / Aleksa | Aleksa |
| `03-models.csv` | modeli, cene, paketi i fotografije | Teodora | Aleksa |
| `04-specifications.csv` | uređene specifikacije modela | Teodora / Aleksa | Aleksa |
| `05-audience-questions.csv` | pitanja Glasa publike | Teodora | Aleksa |
| `06-surveys.csv` | Napredna anketa | Teodora | Aleksa |
| `07-follow-up-email.csv` | jedan Napredni follow-up email | Teodora | Aleksa |
| `08-qr-assignments.csv` | štampani kod i dodela modelu | Aleksa / Jovan | druga osoba fizičkim skenom |

Šabloni se nalaze u [`templates`](./templates/README.md) direktorijumu.

## 4. Stabilni ključevi

`external_key` vrednosti su interni stabilni identifikatori. Pišu se malim slovima, bez dijakritike i razmaka, sa crticama, na primer:

- učešće: `elektromobilnost-2026-enigma-motors`;
- brend: `volta` (postojeći stabilni ključ brenda, nezavisan od događaja);
- štand: `elektromobilnost-2026-stand-a12`;
- model: `elektromobilnost-2026-volta-x1-premium`;
- pitanje: `elektromobilnost-2026-volta-x1-q1-d1`.

Ključ se ne menja kada se ispravi naziv, cena, paket ili tekst. Promena ključa nakon QR dodele zahteva eksplicitnu internu proveru.

`account_external_key`, `business_external_key` i postojeći `brand_external_key` dopunjava ScanMe/Jovan nakon povezivanja sa postojećim zapisima. Teodora ih ne izmišlja tokom razgovora sa izlagačem.

## 5. Obavezni minimum pre objave modela

Model je spreman za objavu tek kada postoje:

1. validan `event_code`;
2. izlagač i učešće povezani sa postojećim account/business zapisima;
3. brend i štand;
4. `model_external_key`, naziv i varijanta ako postoji;
5. cena ili eksplicitno potvrđen fallback `Cena na upit`;
6. najmanje jedna proverena specifikacija;
7. aktivni paket;
8. slobodan postojeći `/r/[cardCode]` resolver kod dodeljen modelu;
9. potvrda drugog člana tima fizičkim skenom da QR otvara tačan model.

Fotografija nije obavezna za stranicu modela. Za garažu i sponzorisanu rotaciju koristi se dostavljena fotografija, a bez nje dosledan logo/neutralni placeholder — nikada izmišljena fotografija.

## 6. Pravila po tabelama

### 6.1 Izlagači

- Jedan red predstavlja učešće jednog izlagača na jednom događaju.
- `client_segment` je `event_only` za klijenta koji je uveden samo zbog sajma ili `standard` za postojećeg redovnog ScanMe klijenta.
- `report_email` je adresa za agregatne izveštaje.
- PII primalac i bezbedan kanal moraju biti dogovoreni pre prvog izvoza leadova. Prazna polja blokiraju PII isporuku, ali ne blokiraju unos javnog modela.
- Izlagač nema nalog ni dashboard.

### 6.2 Brendovi i štandovi

- Jedan izlagač može imati više brendova, a brend se vezuje za konkretnu lokaciju štanda na konkretnom događaju.
- `map_location_id` mora da postoji u finalnom ugovoru mape pre objave.
- Naziv brenda i logo se ne pretpostavljaju; koriste se materijali izlagača ili potvrđeni zvanični izvori.

### 6.3 Modeli

- Jedan fizički izloženi automobil/model dobija jedan red i jedan QR.
- `price_text` čuva prikaz spreman za javni UI. Ako cena nedostaje, upisuje se `Cena na upit` i `price_confirmed=no`.
- `package_tier` koristi samo `included`, `starter` ili `advanced`.
- Napredni model može navesti da probna vožnja zahteva `email`, `phone`, `both` ili `any`.
- `passport_eligible=yes` je samo kandidatura. Pasoš se objavljuje tek kada brend ima najmanje dva modela i svi zaključani modeli imaju najmanje Starter.
- `publication_status` koristi `draft`, `ready`, `published` ili `withdrawn`.

### 6.4 Specifikacije

- Specifikacije su uređeni parovi `label–value`; različita vozila ne moraju imati ista polja.
- `display_order` je pozitivan ceo broj, jedinstven unutar jednog modela.
- Ne dopisivati tehničke podatke na osnovu pretpostavke.

### 6.5 Glas publike

- Starter: najviše jedno pitanje po sajamskom danu.
- Napredni: najviše pet pitanja po sajamskom danu.
- Svako pitanje ima najmanje dve, a najviše pet ponuđenih opcija.
- Samo jedno objavljeno pitanje po Naprednom modelu može biti označeno sa `use_in_sponsored_rotation=yes`.
- Pitanja formuliše izlagač; ScanMe ih proverava radi jasnoće i unosi bez promene značenja.

### 6.6 Anketa

- Dostupna je samo Naprednom modelu.
- Najviše pet kratkih pitanja po modelu.
- `answer_type` je `yes_no` ili `single_choice`.
- Pitanje može biti opciono; za slanje cele ankete korisnik ipak mora odgovoriti na najmanje jedno pitanje.
- Objavljena struktura sa odgovorima ne menja se u mestu; izmena zahteva novu verziju.

### 6.7 Follow-up email

- Dostupan je samo Naprednom modelu.
- Postoji tačno jedan follow-up email, planiran 24–48 sati nakon završetka relevantnog događaja.
- Izlagač može dostaviti naslov i tekst, ali ScanMe proverava identitet pošiljaoca, saglasnost, suppression i finalnu verziju pre slanja.
- Ako tekst još nije dostavljen, polje ostaje prazno; ne izmišljati ponudu.

### 6.8 QR dodela

- Koristi se isključivo postojeći ScanMe resolver `/r/[cardCode]`.
- Kod mora već postojati u internom event QR inventaru; ova tabela ne generiše novi QR sistem.
- Jedan aktivni kod može pripadati najviše jednom modelu, a jedan model može imati najviše jednu aktivnu dodelu.
- `verification_status=verified` zahteva stvarni sken druge osobe i potvrdu da se otvorio tačan objavljeni model.
- Promena paketa, naziva ili sadržaja ne menja štampani resolver kod.

## 7. Operativni tok

1. **Prikupljeno** — Teodora/Aleksa unose samo dobijene podatke i beleže izvor i otvorene nedoumice.
2. **Normalizovano** — ScanMe dodaje stabilne ključeve, povezuje postojeće klijente/brendove i sređuje format bez izmišljanja sadržaja.
3. **Interno provereno** — Aleksa proverava model, cenu, paket, pitanja i prava funkcija.
4. **Dry-run** — backend validira veze, duplikate, limite paketa, map lokaciju i QR dostupnost bez upisa.
5. **Commit** — odobrena verzija se idempotentno upisuje.
6. **QR verifikacija** — druga osoba fizički skenira nalepnicu i potvrđuje destinaciju.
7. **Objava** — Aleksa daje finalni go/no-go za javni model.

Naknadna ispravka menja sadržaj kontrolisano i ostavlja isti QR identitet. Starter se tokom sajma može ručno nadograditi na Napredni od trenutka aktivacije; ranija skeniranja ostaju u analitici.

## 8. Kontrolna lista pre predaje backendu

- nema duplih `external_key` vrednosti unutar događaja;
- svaki model pripada tačno jednom događaju, učešću, brendu i štandu;
- cena je potvrđena ili jasno označena kao `Cena na upit`;
- redosled specifikacija nema duplikate;
- broj pitanja odgovara paketu i danu;
- anketa i follow-up postoje samo za Napredni;
- samo jedan sponsored rezultat je izabran po Naprednom modelu;
- QR kod postoji u inventaru i nije aktivno dodeljen drugom modelu;
- mapa poznaje `map_location_id`;
- primalac PII i kanal dostave su poznati pre izvoza leadova;
- otvorene nedoumice nisu pretvorene u pretpostavljene vrednosti.

## 9. Otvorene stavke koje ne blokiraju prikupljanje

- finalni pravni tekst saglasnosti i politike privatnosti;
- tačan bezbedan kanal za PII isporuku po izlagaču;
- finalni primaoci i termini slanja izveštaja;
- finalni vizuelni template dnevnog PDF/XLSX izveštaja;
- finalna mapa i njeni `map_location_id` identifikatori;
- stvarni spisak modela, paketa, pitanja i fotografija.

Ova polja se prikupljaju čim postanu dostupna. Njihov nedostatak ne opravdava izmišljanje podataka.
