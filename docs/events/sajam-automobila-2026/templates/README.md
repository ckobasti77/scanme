# CSV šabloni za Sajam automobila 2026

Ovi fajlovi služe za interni unos i proveru. Nisu direktan produkcijski import.

## Upotreba

1. Napraviti radnu kopiju šablona za konkretno prikupljanje.
2. Sačuvati fajl kao UTF-8 CSV sa zarezom kao separatorom.
3. Tekst koji sadrži zarez, navodnik ili novi red staviti pod dvostruke navodnike.
4. Ne menjati nazive kolona bez usaglašavanja sa `DATA-INTAKE-SPEC.md` i backend importom.
5. Prazno znači „nije poznato”; za logička polja koristiti samo `yes` ili `no`.
6. Pre backend unosa uraditi internu proveru i `dryRun`.

Šabloni namerno nemaju primer-redove kako primer ne bi slučajno završio u importu. Dozvoljene vrednosti i pravila su u [DATA-INTAKE-SPEC.md](../DATA-INTAKE-SPEC.md).

## Redosled popunjavanja

1. `01-exhibitors.csv`
2. `02-brands-stands.csv`
3. `03-models.csv`
4. `04-specifications.csv`
5. `05-audience-questions.csv`
6. `06-surveys.csv`
7. `07-follow-up-email.csv`
8. `08-qr-assignments.csv`

## Lokalna validacija

Pre predaje backendu pokrenuti validator nad direktorijumom koji sadrži svih
osam radnih kopija:

```powershell
node scripts/events/validate-csv-intake.mjs C:\putanja\do\radne-kopije
```

Ako se putanja izostavi, proveravaju se ovi prazni šabloni. Validator proverava
zaglavlja, event kodove/datume, poznate enum-e i `yes/no` vrednosti, stabilne
ključeve, veze između tabela, package limite za Glas publike/anketu/follow-up,
duple ključeve i QR dodelu. Ovo je lokalna priprema za backend `dryRun`; ne
upisuje niti menja produkciju.

CSV fajlovi sadrže samo prikupljene/operativne podatke. Backend ih normalizuje u verzionisani JSON ugovor i povezuje sa postojećim account, business, contact, brand i QR zapisima.
