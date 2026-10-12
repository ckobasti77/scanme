# Rečnik admina (ADMIN v2, X5)

Pravilo: operater u adminu ne čita programerski jezik. Tekst koji korisnik vidi kaže **šta se dešava** i **šta da uradi**. Tehnički detalj ide u `title` (tooltip) ili u admin debug (`/admin/debug`), ne u naslov, opis, prazno stanje ni poruku greške.

Rečnik važi za sav tekst u `lib/i18n/sr/admin*.ts`, `*-admin.ts`, `posta.ts` i `fair-admin-dev.ts`, i za tekst napisan direktno u `components/admin/**`. Test `lib/admin-v2/text-vocabulary.test.ts` čita rečnike i javlja svaki zabranjen izraz iz kolone „Izraz“.

Ostaju poslovni izrazi koje operater koristi i bez prevoda: Dashboard, Inbox, QR, NFC, lead, follow-up, email, CSV, SaaS, nazivi paketa (Free, Starter, Advanced, Premium, Founders, Enterprise), šifre proizvoda (SMK, SML, SMF, SMQ, SMP) i nazivi sekcija. Šifre se ne tumače u svakoj rečenici, već jednom (placeholder pretrage ili tooltip kolone).

## 1. Izrazi koji se ne smeju pojaviti u vidljivom tekstu

| Izraz (programerski) | Jasan srpski za operatera | Gde se pojavljivao |
|---|---|---|
| read model, operativni / finansijski read model, „Inbox dobije svoj read model“ | „podaci o klijentima“, „pregled finansija“, „pregled poruka“. Rečenica kaže kada stiže sadržaj: „Klijenti će se pojaviti čim se u sistemu pojavi prvi nalog.“ | Klijenti (prazno stanje), Profil klijenta (proizvodi, finansije, komunikacija, nije pronađen) |
| materijalizovani service profili | „pripremljeni profili usluga“; prazno stanje: „Nema lokala sa ovom uslugom. Lokali se pojavljuju čim im se uključi usluga.“ | Usluge (prazno stanje) |
| Legacy porudžbine … eksplicitna ADMIN-11 migracija | „Porudžbine iz starog sistema se prikazuju tek kad se prenesu, jedna po jedna.“ Šta da uradi: „Nove porudžbine se pojavljuju same.“ | Porudžbine (prazno stanje) |
| ograničena Dashboard projekcija; projekcija | „ukupan zbir“, „brojevi na početnoj strani“: „Zbir se još obračunava. Prikazujemo samo ono što je sigurno, bez izmišljenih nula.“ | Dashboard (prazno stanje, mali widgeti) |
| Lokalni SMF sufiks radi samo u eksplicitnom kontekstu | „Kratka šifra proizvoda (samo poslednji deo) traži se samo unutar izabranog klijenta ili lokala.“ | Pretraga (napomena) |
| Health (kolona, filter) | **Ispravnost** (kolona), „Stanje i ispravnost“ (filter); vrednosti Ispravno / Neprovereno / Neispravno ostaju | QR kodovi |
| ADMIN-nn (ADMIN-05, -06, -07, -10, -11, -12, -13, -15, -17, ADMIN-V1) | nikad u tekstu. Reč o „modulu“ zameni opis šta korisnik vidi: „Čeka dodelu SMF šifara“ | opisi probnih prikaza, Porudžbine, Proizvodi, Podešavanja |
| fixture, Dev fixture, neprodukcijski podaci, Demo prikaz, DEV pregled, Razvojni prikaz | **Probni podaci**; značka: „Probni prikaz · nisu stvarni podaci“ | značke i opisi u probnim prikazima |
| Sintetički podaci / radni red za vizuelnu proveru … interfejsa | „Probni podaci za pregled izgleda.“ | Zadaci, Tim |
| provider, provajder, provider-neutral, outbox | „usluga za slanje poruka“, „slanje poruka još nije povezano“ | Dashboard (Inbox), Usluge (slanje naloga), Podešavanja (komunikacija) |
| Mailbox, OAuth, Inbound | „sanduče“, „prijava na nalog pošte“, „prijem poruka“ | Podešavanja (komunikacija), Pošta |
| snapshot, „period snapshot-e“ | „sačuvana verzija“; „Odobrena verzija za štampu“ | Porudžbine, Podešavanja, Memories |
| audit, auditovan, audit trag/zapis | „istorija izmena“, „zapisano u istoriji izmena“ | Finansije, Događaji (saglasnost) |
| ledger | „knjiga uplata“ | Podešavanja |
| actor, Akter, „Svi akteri“, „Spoljni akter“ | „Ko je uradio“, „Svi“, „Spoljna strana“ | Pretraga (aktivnost), Finansije |
| Backend (trošak, kategorija) | „Server i baza“ (trošak za servere i bazu podataka) | Finansije |
| waiver | „oslobađanje od naplate“ | Podešavanja |
| target (pretplata, polje importa) | „pretplata“; „kolona u tabeli“ | Podešavanja, Događaji (import) |
| externalKey, resolver kod | „šifra modela iz kataloga“, „kratki kod sa nalepnice“ | Događaji (QR, import) |
| Slug | „adresa (deo linka)“ | Događaji |
| fallback fotografija | „zamenska fotografija“ | Događaji |
| „serverski prekidači … u Convex okruženju“ | „uključuje ih tehnički tim (Aleksa ili Jovan)“; ime Convex se ne piše | Događaji (saglasnost) |
| „ID klijenta / porudžbine / štamparije“ (polja za unos) | „Šifra klijenta“, „Šifra porudžbine“… uz „interna oznaka iz admina“ kao pomoć | Finansije (unos troška) |
| support kontekst, klijentski kontekst, Otvori kontekst | „prikaz podrške“, „stanje klijenta“, „Otvori prikaz podrške“ | Debug, Profil klijenta |
| token(i) u poruci o prekidu veze | „pristupni podaci“ | Pošta |
| browser | „pregledač“ | Pošta |
| payload, query, cache, sync, webhook, slug, feature flag | opiši šta korisnik vidi („osvežavanje“, „poslednji podaci“) | nigde nije dozvoljeno |
| preview (u vidljivom tekstu) | „probni prikaz“, „pregled“ | Porudžbine, Pošta |
| eksplicitan / eksplicitno (kao poslovni izraz) | „izričit“, „ručno unet“, ili izostavi | Podešavanja, Finansije |

## 2. Oblik poruka

**Prazno stanje** (`AdminEmptyState`): naslov kaže šta je prazno („Nema porudžbina“), opis kaže zašto i **šta je sledeće** („Nove porudžbine se pojavljuju čim klijent poruči.“). Gde postoji prirodna akcija, dobija dugme ili link (`action`). Prazno stanje posle filtriranja: „Nema rezultata za izabrane filtere“ + „Ukloni neki filter ili promeni pretragu.“ + akcija „Očisti filtere“. Naslov prazne liste nije naziv stranice.

**Greška** (`AdminErrorState`): naslov kaže šta nije uspelo („Porudžbine nisu učitane“), opis kaže šta da uradi („Pokušaj ponovo. Ako se ponovi, javi se timu.“), a dugme „Pokušaj ponovo“ postoji kad ponavljanje ima smisla. Bez šifara grešaka i imena sistema.

**Učitavanje** (`AdminLoadingState`): skeleton po obliku sadržaja; sr-only oznaka „Učitavanje: <šta>“.

**H1 stranice** je uvek naziv stranice (Dashboard, Klijenti, Zadaci…), nikad poruka, broj ni greška. Stanje ide u traku signala ili u opis.

**`<title>` stranice**: „Naziv | ScanMe Admin“. Prijava je „Prijava | ScanMe Admin“.

## 3. Primena po stranicama

Beleška `docs/admin/v2/X5.md` navodi za svaku stranicu šta je promenjeno.
