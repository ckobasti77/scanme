# ScanMe Menu V1 — rečnik i pravila teksta

> Važi za svaki tekst koji korisnik vidi u ScanMe Menu: panel, editor, javni meni, konobarski panel, gost.
> Tekst živi u `lib/i18n/sr/menu*.ts` i `ordering*.ts` (UX standard §11); ovaj dokument kaže kojim izrazima.
> Proverava ga `lib/menu/recnik.test.ts` (zabranjene varijante u rečnicima) i `lib/menu-naslovi.test.ts` (naslovi stranica).

## 1. Ustaljeni izrazi

| Pojam | Piše se | Ne piše se (u tekstu koji korisnik vidi) |
|---|---|---|
| Podela menija | **Stranice menija** (jedna: „stranica“) | odredišta, destinacije, ekrani menija |
| Podela stranice | **Sekcija** | kategorija (osim alergena i „Kategorije“ kao naziv layouta), grupa |
| Jelo ili piće | **Artikal** (mn. „artikli“) | stavka, proizvod, jelo (osim u primeru) |
| Poseban modul | **Posebne usluge** (grupa), **Room service** (naziv) | Sobna usluga, Posluživanje u sobi |
| Podrazumevana stranica | **Kompletan meni** — samo u editoru | „Kompletan meni“ u javnom meniju i panelu |
| Zahtev gosta | **Poziv konobara**, **Zahtev za račun**, **Porudžbina**, **Rezervacija** | Narudžbina, Narudžba, Booking, Račun zahtev |
| Radni prostor osoblja | **Konobarski panel** | Panel konobara, Waiter |
| Lista zahteva | **Radni red** | Tiket, Zadaci |
| Raspored mesta | **Sala** | Mapa, Plan sale |
| Konobar preuzima | **Preuzmi** (status „Prihvaćen“) | Prihvati (kao dugme) |
| Konobar zatvara | **Završi** (status „Završen“) | Zatvori, Gotovo |
| Zahtev se poništava | **Otkaži** (status „Otkazan“) | Odustani, Poništi |
| Artikal je tu, ali se ne može poručiti | **Privremeno nedostupno** | Nema na stanju, Rasprodato, Nedostupno |
| Artikal nije prikazan | **Sakrij** | Skloni |
| Artikal van stranice | **Ukloni sa ove stranice** | Izbaci, Obriši sa stranice |
| Artikal zauvek | **Obriši artikal** | Izbriši, Ukloni artikal |
| Javna verzija | **Objavi** → „Objavljeno“ | Publikuj, Pošalji uživo |
| Radna verzija | **Nacrt** | Draft, Skica |
| Pogled na meni pre objave | **Pregled** | Preview, Prikaz uživo |
| Vraćanje | **Vrati ovu verziju** (pravi novi nacrt) | Restore, Poništi objavu |
| Jezik tekstova | srpski, latinica, bez engleskih reči | Draft, Publish, Save, Cancel, Delete, Error, Loading, Dashboard |

Uloge: **Vlasnik**, **Menadžer**, **Urednik**, **Osoblje**. Režim: „ScanMe Menu · Ugostiteljstvo“.
„Poručivanje“ je dozvoljeno kao ime radnje gosta ili starog proizvoda; zahtev koji nastaje zove se **Porudžbina**.

## 2. Obraćanje i ton

- Rečenice: „Vi“ (Vaš, Vama); dugmad: kratki glagoli u imperativu („Objavi“, „Pokušaj ponovo“, „Sačuvaj“). Interni admin alat koristi „ti“.
- Jedna radnja ima jedno ime kroz ceo tok („Objavi“ → „Objavljeno“).
- Bez programerskog jezika: nikad „mutation failed“, „null“, „undefined“, „ID“, „token“ (kaže se „link“), „server“ (kaže se „nismo uspeli da…“).
- Gost čita kratko i toplo; konobar čita najkraće (reč, ne rečenicu); vlasnik dobija i razlog.

## 3. Velika slova i dijakritika

- Velikim slovom počinje samo prva reč natpisa i vlastito ime („Moji zahtevi“, „Stranice menija“, „Room service“, „ScanMe Menu“). Ne „Stranice Menija“, ne CELA VELIKA SLOVA (osim kad je skraćenica: PIN, QR, RSD, EUR, CSV).
- Latinica sa punom dijakritikom: č, ć, š, ž, đ (ne „Cevapi“, „sto“ je reč, ne „Sto“ osim ispred broja: „Sto 12“).
- Dugmad nemaju tačku na kraju; rečenice imaju.

## 4. Brojevi, valuta, datumi, vreme

- Cena: cele dinare sa tačkom za hiljade i razmakom pred oznakom: `1.490 RSD`. Nikad „1490 din“, „1,490.00“, „RSD 1.490“.
- EUR je samo informativan, dve decimale, zarez, sa „~“: `~ 12,70 EUR`; prikazuje se samo uz svež kurs.
- Procenat: `17 %` (razmak pred znakom), minus tipografski: `−17 %`.
- Datum: `21. 10. 2026.` (u kratkom prikazu) ili „21. oktobar“; vreme 24 h: `18:20`, uvek po beogradskom vremenu.
- Proteklo vreme: `čeka 08:12` (mm:ss), preko sat vremena `1 h 05 min`; posle praga uz reč „kasni“.
- Jedinica uz broj ima ispravan padež (`srPluralCategory`): „1 artikal“, „2 artikla“, „5 artikala“.

## 5. Prazna stanja i greške — isti oblik

**Prazno:** šta je prazno + zašto (kad pomaže) + sledeći korak (dugme ili rečenica).
> „Još nema zahteva. Kad gost pozove konobara, zahtev će se pojaviti ovde.“

**Greška:** šta nije uspelo + šta da uradite.
> „Meni nije učitan. Proverite vezu i pokušajte ponovo.“ — dugme „Pokušaj ponovo“.

Greška uz polje kaže šta da se upiše, ne šta je pogrešno u sistemu („Upišite cenu veću od 0.“).
Bez veze: „Nema veze sa internetom“, šta čeka i da ništa nije poslato.

## 6. Potvrde destruktivnih radnji

Potvrda kaže **šta nestaje, šta ostaje i da li se može vratiti**; dugme je glagol radnje, ne „Da“ i „U redu“.

| Radnja | Posledica koju tekst mora da kaže |
|---|---|
| Obriši artikal | nestaje sa svih stranica; objavljeni meni se menja tek na „Objavi“ |
| Obriši stranicu | artikli ostaju u meniju; QR vezan za stranicu blokira brisanje |
| Otkaži zahtev | gost u „Moji zahtevi“ vidi da je otkazan |
| Resetuj PIN | stari PIN prestaje da važi; osoba dobija novi |
| Vrati ovu verziju | pravi se novi nacrt, javni meni se ne menja dok ne objavite |

## 7. Pristupačni nazivi

- `aria-label`, opisi i `alt` su na srpskom i kažu šta dugme radi („Obriši artikal Ćevapi“), ne kako izgleda („Kanta“).
- Slika artikla: `alt` je naziv artikla; ukrasna slika ima prazan `alt`.
- Ikonica bez teksta uvek nosi ime radnje.

## 8. Naslovi stranica (`lib/menu-naslovi.ts`)

| Površina | Oblik | Primer |
|---|---|---|
| Panel, editor, konobarski panel | `<Naziv> \| ScanMe Menu` | `Analitika \| ScanMe Menu`, `Konobarski panel · Kafana kod Mike \| ScanMe Menu` |
| Javni meni | `<Naziv lokala> — Meni` | `Kafana kod Mike — Meni` |
| Stranica javnog menija i gost | `<Naziv lokala> — <Stranica>` | `Kafana kod Mike — Doručak` |

Naslov se uvek pravi funkcijama `menuNaslov` i `javniNaslov`, nikad rukom u ruti.

## 9. Gde se menja

Novi tekst: ključ u `Dict` interfejsu (`lib/i18n/types.ts`) i u `lib/i18n/sr/*`, čita se sa `getDict` / `fmt`. ScanMe Links render i Sajam se ne diraju. Pravni radni tekst alergena ostaje tačno kao u masteru (§7.3).
