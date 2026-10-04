# ADMIN-11 — additive migracija porudžbina

Ova migracija nije automatska, nije pokretana i ne menja postojeći
`priceSnapshot`, `physicalSelection`, cenu stavke ili istorijski status
porudžbine.

## Funkcija

`internal.adminOrderMigrations.migrateOne`

Ulaz je jedna eksplicitna `orderId`, stvarni admin `assigneeId` i `dryRun`.
Funkcija ima limit od 100 stavki i idempotentna je po `orderId`.

## Redosled bezbednog rada

1. Pozvati za jednu porudžbinu sa `dryRun: true`.
2. Ako rezultat sadrži `blocked`, ispraviti navedeni legacy problem ručno na
   izvoru; ne izmišljati nedostajući proizvod, količinu, dizajn, vezanu uslugu
   ili SML pripadnost.
3. Ponoviti dry run dok rezultat ne bude `ready`.
4. Tek uz posebno odobrenje za ciljano okruženje pozvati istu porudžbinu sa
   `dryRun: false`.
5. Proveriti SMP kod, broj operativnih stavki i ADMIN audit zapis.

## Widen ugovor

- Legacy redovi ostaju validni jer je `orders.smpCode` opcion.
- Nove admin/checkout porudžbine čuvaju `createdByUserId`; legacy porudžbina bez
  tog podatka ostaje bez izmišljenog kreatora.
- Novi operativni podaci žive u povezanim ADMIN-11 tabelama.
- `orderItems.physicalSelection` se dekodira i validira na adapter granici;
  novi `configSnapshot` sadrži samo strogo normalizovana polja kanonskog
  konfiguratora i ne prenosi legacy `any` ili nepoznata polja.
- Nedostajući ili nevažeći snapshot pravi `orderMigrationIssues` zapis.
- Legacy `paid`, `provisioned`, `refunded` ili postojeća uplata blokiraju
  automatsko usvajanje dok se ne obezbedi eksplicitna alokacija na fizičku
  porudžbinu; legacy otkazivanje bez actor/time dokaza takođe ostaje problem za
  ručni pregled.
- Kada se izvorni problem ispravi i usvajanje uspe, prethodni migration problem
  dobija `resolvedAt`; istorijski zapis se ne briše.
- Dodela ADMIN-11 SMF referenci prihvata samo reference stvarno vraćene iz
  budućeg ADMIN-12 toka, u grupama do 100; ADMIN-11 ne generiše SMF, QR, NFC ili
  kanal.
- Ponovni poziv ne pravi drugi operativni zapis, provisioning zahtev, event ili
  action item.

## Rollback

Pre ADMIN-12 nema destruktivnog narrow koraka. Ako se operativni prikaz mora
isključiti, aplikacija može prestati da čita nove tabele; istorijski order i
price snapshot ostaju netaknuti. Brisanje novih operativnih redova nije deo
ove faze i zahtevalo bi zasebnu, eksplicitno odobrenu proceduru.
