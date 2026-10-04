# Jovan backend delta - 2. oktobar 2026.

> Status: **OBAVEZNO PRE NASTAVKA B0/B3/B5**
>
> Poslednje ažuriranje: **2. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
>
> Tehnički ugovor: [`BACKEND-HANDOFF.md`](./BACKEND-HANDOFF.md)

`MASTER-KONTEKST.md` definiše proizvod, a `BACKEND-HANDOFF.md` tehničku implementaciju. Ovaj dokument je hitna delta napomena koja uklanja dva zastarela ugovora pre daljeg backend rada. Kontradikcije se ne rešavaju pretpostavkom, već se vraćaju komandnom centru.

## 1. Ocene

- Starter i dalje prima jednu ukupnu ocenu 1-5.
- Advanced i dalje prima tri opcione ocene: izgled, specifikacije i cena. Nema četvrte ukupne ocene.
- Posetilac javno dobija samo svoje ocene za dati model.
- Javni endpoint ne vraća prosek, broj ocena, sum ili threshold stanje ocena.
- Count/sum/prosek postoje samo u admin/report projekcijama za izlagača.
- Glas publike i favorite glasanje zadržavaju prag od pet glasova; ova promena se odnosi samo na model rating.

## 2. Sponzorisana rotacija

- Ne upisivati pasivne impression događaje ni na mapi/displeju ni u garaži.
- Mapa/displej samo čita objavljeni snapshot i prikazuje 12-sekundnu rotaciju. Nema sponsored event write.
- Garaža meri samo dve eksplicitne akcije:
  - `open_model` za `Pogledaj`;
  - `garage_add` za `Dodaj u garažu`.
- Ove akcije nisu QR scan i ne smeju prolaziti kroz scan pipeline.
- Ne praviti impression kolone, agregate, report metrike ili testove.

## 3. Specifikacije i pasoš

- Public model ugovor mora vratiti grupisane i uređene specifikacije.
- Najviše četiri specifikacije imaju `isHighlight: true`.
- Passport projekcija mora podržati model, garažu i mapu: katalog aktivnih pasoša, eligible modele, lični `N/M` progres, kompletirano stanje i promenljiv favorit.
- Digitalni passport badge čuva se lokalno u browser garaži; nije novi backend entitlement niti PII zapis.

## 4. Prihvatanje delte

Pre nastavka rada proveriti da B0/B3/B5 ugovor i testovi više ne sadrže:

- javni rating prosek ili rating threshold;
- `impression` sponsored event;
- map/display sponsored write;
- negrupisanu specifikaciju bez reda/highlight oznake.

Ako je nešto od toga već implementirano, ne skrivati odstupanje. Prijaviti tačne fajlove i napraviti malu korektivnu izmenu pre širenja funkcionalnosti.
