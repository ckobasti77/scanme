# ADMIN-09A — Zoho Mail integracioni preflight

- Datum provere: 2026-09-11
- Status: arhitektonska odluka spremna za odobrenje; ADMIN-09 nije započet
- Opseg: read-only provera Zoho Admin konzole, zvanične Zoho dokumentacije i postojećeg ADMIN-08 komunikacionog jezgra

## Izvršna odluka

Za V1 treba koristiti **jedan namenski Zoho korisnički mailbox kao integracioni nalog**, dodat kao član postojeće grupe `office@scanme.rs`. ScanMe sinhronizuje isključivo taj jedan `accountId`; ne sinhronizuje lična sandučeta Alekse, Jovana i Teodore. Tako postojeći ljudski tok ostaje netaknut, dok aplikacija dobija jedno stabilno mesto za inkrementalno čitanje poruka, priloga i thread identifikatora preko dokumentovanog User Mail API-ja.

Postojeća `office@scanme.rs` grupa ne može biti kanonski centralni inbox: ona je Distribution List koja kopije prosleđuje članovima, a dokumentovani Groups API čita samo poruke zadržane radi moderacije. Shared Mailbox trenutno nije prihvatljiva osnova: organizacija koristi Mail Free, Shared Mailbox je plaćena funkcija, a u pregledanom zvaničnom REST API indeksu nema dokumentovanog Shared Mailbox message/thread/attachment interfejsa potrebnog za ADMIN-09. Slanje kao `office@scanme.rs` mora ostati isključeno u aplikaciji dok vlasnik ne odobri ograničeni group send-as za integracionog korisnika i dok realan OAuth API test ne potvrdi da Zoho REST prihvata grupnu adresu kao `fromAddress` tog naloga.

## Granice ove provere

- Nije promenjeno nijedno Zoho podešavanje, članstvo, dozvola ili mailbox.
- Nije kreiran OAuth client, token ni secret i nije izvršen nijedan API poziv sa kredencijalima.
- Nije poslat test email niti je otvoren sadržaj postojećih privatnih poruka.
- Nijedna poruka nije označena kao pročitana.
- Nije menjan ADMIN-08 kod, Convex schema, deployment ni podaci.
- Zaključci označeni kao „nije potvrđeno” ostaju uslov za budući ADMIN-09.

## Potvrđeno trenutno stanje

Read-only pregled postojeće Zoho Admin konzole potvrdio je:

- organizacija je `ScanMe`, EU data-centar;
- plan je **Mail Free**;
- koriste se 3 od 5 korisničkih licenci;
- postoji jedna grupa, `Office` / `office@scanme.rs`;
- grupa je prikazana kao **Groups — Distribution List**, nije korisnički mailbox niti Shared Mailbox;
- Streams je uključen;
- članovi su Aleksa Djordjevic, Jovan Milojevic i Teodora Djordjevic;
- sva tri člana su aktivni moderatori;
- za svakog člana je `Send using group email address` postavljeno na `Not allowed`;
- globalna dozvola `Allow members to send emails using group email address as From address` nije uključena;
- `Who can send emails to the group?` je `Organization Members`;
- email drugih pošiljalaca se prema prikazanom pravilu zadržava radi moderatorovog odobrenja;
- `Deliver email only if group address is in To or Cc` nije uključeno.

Praktična posledica trenutne konfiguracije: normalno prihvaćena grupna poruka završava kao zasebna kopija u mailbox-u svakog člana, dok spoljna poruka po sadašnjem pravilu ne ulazi automatski u taj tok već čeka moderaciju. Nije proveravano da li postoje dodatni pojedinačni izuzeci/allowlist pravila, pa se ta poslednja tvrdnja odnosi na prikazana grupna pravila.

## Zvanični izvori

Svi tehnički zaključci o Zoho mogućnostima zasnovani su samo na zvaničnim Zoho izvorima:

- [Zoho Mail REST API — Getting Started](https://www.zoho.com/mail/help/api/getting-started-with-api.html)
- [Zoho Mail REST API — kompletan indeks](https://www.zoho.com/mail/help/api/)
- [OAuth 2.0 za Zoho Mail API](https://www.zoho.com/mail/help/api/using-oauth-2.html)
- [Zoho Accounts — multi-DC autorizacija](https://www.zoho.com/accounts/protocol/oauth/multi-dc/client-authorization.html)
- [Accounts API](https://www.zoho.com/mail/help/api/account-api.html)
- [Get User Account Details](https://www.zoho.com/mail/help/api/get-user-account-details.html)
- [Folders API](https://www.zoho.com/mail/help/api/folders-api.html)
- [Email Messages API](https://www.zoho.com/mail/help/api/email-api.html)
- [List Emails](https://www.zoho.com/mail/help/api/get-emails-list.html)
- [Get Email Content](https://www.zoho.com/mail/help/api/get-email-content.html)
- [Threads API](https://www.zoho.com/mail/help/api/threads-api.html)
- [Get Attachment Content](https://www.zoho.com/mail/help/api/get-attachment-content.html)
- [Upload Attachments](https://www.zoho.com/mail/help/api/post-upload-attachments.html)
- [Send Email](https://www.zoho.com/mail/help/api/post-send-an-email.html)
- [Reply to Email](https://www.zoho.com/mail/help/api/post-reply-to-an-email.html)
- [Groups API](https://www.zoho.com/mail/help/api/group-api.html)
- [Get Moderation Emails](https://www.zoho.com/mail/help/api/get-moderation-emails.html)
- [Creating Groups — Distribution List naspram Shared Mailbox-a](https://www.zoho.com/mail/help/adminconsole/creating-groups.html)
- [Group Settings](https://www.zoho.com/mail/help/adminconsole/group-settings.html)
- [Advanced Group Settings](https://www.zoho.com/mail/help/adminconsole/advanced-group-settings.html)
- [Group send-as dozvola](https://help.zoho.com/portal/en/kb/mail/adminconsole/articles/can-i-allow-members-to-send-emails-using-the-group-email-id)
- [Shared Mailbox / Collaborative Inbox](https://www.zoho.com/mail/help/collaborative-inbox.html)
- [Shared Mailbox Admin Settings](https://www.zoho.com/mail/help/adminconsole/collaborative-inbox-settings.html)
- [Zoho Mail planovi](https://www.zoho.com/mail/zohomail-pricing.html?src=float)
- [Zoho Mail rate limits](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html)
- [Zoho Mail Developer Platform događaji](https://www.zoho.com/mail/help/api/dev-api.html)

Repo izvori domena i prihvaćenog ponašanja:

- [`docs/SCANME-ADMIN-V1-IMPLEMENTACIJA.md`](../SCANME-ADMIN-V1-IMPLEMENTACIJA.md), §8.3, §9.4, ADMIN-08 i ADMIN-09;
- [`docs/tasks/ADMIN-01-TEST-MATRICA.md`](./ADMIN-01-TEST-MATRICA.md), I07;
- postojeći `conversations`, `conversationMessages` i `conversationEvents` model u `convex/schema.ts`;
- postojeće ADMIN-08 granice u `convex/adminCommunications.ts`, `convex/clientCommunications.ts` i `convex/lib/adminCommunicationValidators.ts`.

## API capability matrica

| Potreba ADMIN-09 | Dokumentovani User Mail API | Dokumentovani Groups API | Postojeća `office@` grupa | Zaključak |
| --- | --- | --- | --- | --- |
| Listanje primljenih poruka | `GET /api/accounts/{accountId}/messages/view`; folder, status, `start`, `limit` 1–200, datum/messageId sort | Nema opšti grupni inbox endpoint | Kopije postoje u mailbox-ima članova | Sinhronizovati jedan namenski korisnički `accountId` |
| Sadržaj poruke | `GET /api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/content` | Dostupan samo sadržaj poruke zadržane za moderaciju | Grupa sama nije mailbox | User Mail API je potreban |
| Thread identitet | List Emails vraća `threadId`; Threads API upravlja threadovima korisničkog naloga | Nema dokumentovano čitanje normalnog grupnog threada | Svaki član ima sopstvenu kopiju/thread stanje | Provider `threadId` je pomoćni ključ unutar jednog integracionog naloga |
| Read/unread filter | List Emails podržava `status=read/unread/all`; mutation endpoint postoji, ali ga sync ne koristi | Nema centralno unread stanje normalne grupne pošte | Svaki član ima sopstveni read/unread | ScanMe admin unread mora biti nezavisan od tri mailbox stanja |
| Prilozi | Dokumentovani info, download i upload endpointi | Nema za normalno isporučene grupne poruke | Prilog postoji u kopiji člana | Čitati metapodatke/binarni sadržaj samo iz integracionog mailbox-a |
| Normalno primljene grupne poruke | Vidljive u mailbox-u člana koji prima kopiju | Nije dokumentovano | Distribution List dostavlja kopije članovima | Groups API nije inbox adapter |
| Poruke zadržane za moderaciju | Nije primarni put | `GET /api/organization/{zoid}/groups/{zgid}/messages`, najviše 50 | Da, samo moderation queue | Ne koristiti kao kanonski inbox |
| Slanje | `POST /api/accounts/{accountId}/messages`; `fromAddress` mora pripadati autentifikovanom nalogu | Nema opšti send endpoint | Group send-as se može administrativno dozvoliti članu | Mora se dokazati realnim API testom posle eksplicitnog odobrenja |
| Reply | `POST /api/accounts/{accountId}/messages/{messageId}` uz isti `fromAddress` uslov | Nema opšti reply endpoint | Reply se veže za kopiju u mailbox-u člana | Moguće tek kada integracioni nalog i group send-as prođu test |
| Push/webhook za novu poruku | Nije pronađen u zvaničnom Mail REST API indeksu | Nije pronađen | Nije dokazano | Koristiti bounded incremental polling; ne izmišljati webhook |
| Shared Mailbox | Poseban REST message API nije naveden u pregledanom indeksu | Nije Groups API | Trenutno ne postoji | Mail Free ga ne nudi; nije dokaziva V1 osnova |

### Direktni odgovori na pitanja 1–3

1. **Ne**, postojeća grupa ne može biti kanonski centralni inbox za normalno listanje, sadržaj, threadove, jedno unread stanje i priloge. Distribution List dostavlja kopije članovima. Administrativni send-as postoji, ali REST ponašanje `fromAddress=office@scanme.rs` za grupnu adresu nije dokazano bez realnog testa.
2. Dokumentovani Groups API daje pristup **porukama zadržanim radi moderacije**, ne svim normalno primljenim i članovima isporučenim porukama.
3. **Ne na osnovu trenutno potvrđenog stanja.** Shared Mailbox je dostupan plaćenim organizacijama, a ScanMe je na Mail Free planu; dodatno, pregledani REST API indeks ne dokumentuje Shared Mailbox message/thread/attachment površinu potrebnu za ADMIN-09. Ni prelazak na plaćeni plan sam po sebi ne bi bio dovoljan dokaz API podobnosti.

## Preporučena V1 arhitektura

### Jedan namenski integracioni korisnički mailbox

Vlasnik kasnije kreira četvrtog Zoho korisnika namenjenog isključivo integraciji i dodaje ga u postojeću `Office` Distribution List. Konačnu adresu tog korisnika vlasnik bira; ovaj dokument je namerno ne izmišlja. ScanMe OAuth veza pripada samo tom korisniku i sinhronizuje samo njegov Zoho `accountId`.

Tok:

1. Spoljna poruka stigne na `office@scanme.rs`.
2. Distribution List isporuči po jednu kopiju postojećim članovima i jednu kopiju integracionom korisniku.
3. Aleksa, Jovan i Teodora nastavljaju da koriste Zoho kao do sada.
4. ADMIN-09 čita samo integracioni Inbox, normalizuje jednu kopiju i upisuje je kroz provider adapter u postojeće ADMIN-08 jezgro.
5. ScanMe ne čita niti menja read/unread stanje tri ljudska mailbox-a.
6. Admin odgovor kroz ScanMe postaje dostupan tek kada ograničeni send-as i realni API send/reply test prođu; do tada je adapter inbound-only.

### Zašto je ovo najbolja V1 opcija

- koristi dokumentovane Accounts, Folders, Messages i Attachments API-je za korisnički nalog;
- ne zahteva preuzimanje adrese `office@scanme.rs` od postojeće grupe;
- ne prekida postojeću dostavu niti pomera postojeću istoriju;
- uvodi samo jedan provider unread/checkpoint i jedan izvor za ingest;
- lako se gasi i vraća bez migracije istorije tri korisnika;
- trenutna organizacija ima kapacitet za četvrtog korisnika (3 od 5), iako dostupnost Mail API-ja na Mail Free planu još mora praktično da se potvrdi;
- ne oslanja se na nedokumentovani Shared Mailbox API niti na moderation queue kao inbox.

### Zašto ne menjati `office@` odmah u zaseban mailbox

Pretvaranje postojeće grupne adrese u korisničku adresu zahtevalo bi oslobađanje/renamovanje adrese grupe i promenilo bi postojeću distribuciju. To otvara rizik prekida prijema, send-as ponašanja i operativnog kontinuiteta, bez potrebe za V1. Namenski član grupe donosi centralni tehnički mailbox bez preuzimanja javne adrese.

### Zašto ne Shared Mailbox sada

- ScanMe koristi Mail Free, dok zvanična Shared Mailbox dokumentacija navodi plaćeni plan kao uslov.
- Zvanični Mail REST API indeks koji je pregledan nema posebne Shared Mailbox message/thread/attachment endpoint-e.
- Shared Mailbox ne podržava Streams, dok postojeća grupa ima Streams; prelazak bi promenio postojeće ponašanje.
- Pre bilo kakvog kasnijeg razmatranja potrebni su potvrda Zoho podrške o API-ju, plan/cena i kontrolisana migraciona proba.

## Sprečavanje duplikata i razdvajanje unread stanja

Distribuciona lista će i dalje proizvesti više Zoho kopija; to nije moguće ukloniti bez promene tipa poslovnog toka. ScanMe sprečava višestruki ingest ovako:

- dozvoljen je tačno jedan sinhronizovani `providerAccountId` — integracioni mailbox;
- mailbox-i Alekse, Jovana i Teodore nikada se ne registruju kao ingest izvori;
- primarni idempotency ključ je `(provider="zoho", providerAccountId, providerMessageId)`;
- normalizovani RFC `Message-ID` je sekundarni dedupe ključ i trag za otkrivanje ponovne isporuke/kopije;
- `In-Reply-To` i `References` se čuvaju kao threading signali, ne kao zamena za primarni provider ključ;
- svaki import je transakcioni upsert; ponovljen poll ne povećava unread niti ponovo emituje događaj;
- ScanMe `adminUnreadCount` nastaje iz novih, prvi put importovanih `client_to_admin` poruka i nije ogledalo Zoho read/unread zastavice;
- sync koristi samo GET operacije i nikada ne označava Zoho poruku pročitanom.

Time ljudski korisnici mogu nezavisno da čitaju svoje Zoho kopije bez menjanja ScanMe stanja, a dva administratora u ScanMe-u dele jedan aplikacioni unread/status tok.

## Bounded incremental sync plan

U pregledanom zvaničnom Zoho Mail REST API indeksu nije dokumentovan server-to-server webhook za novu poruku. Događaji u Zoho Mail Developer Platform dokumentaciji odnose se na događaje ekstenzije/widget-a u Mail klijentu, ne na pouzdanu backend isporuku nove poruke. Zbog toga je V1 plan polling.

### Ritam i granice

- Početni interval: **120 sekundi**. To je dovoljno brzo za poslovni Inbox, a ostavlja veliku rezervu ispod zvanično navedenih 30 API zahteva/minut.
- Jedan aktivan sync lease po provider konekciji; preklapajući cron se završava bez rada.
- Listanje je newest-first, `limit=50`, samo za potvrđeni Inbox `folderId`.
- Po jednom run-u najviše 3 stranice, odnosno 150 listanih poruka.
- Ako backlog ostane, upisuje se bounded continuation i sledeći run nastavlja od checkpoint-a; nema neograničene petlje.
- Za sadržaj i attachment metapodatke pozivi se prave samo za poruke koje primarni idempotency ključ još ne poznaje.

Zoho dozvoljava `limit` do 200, ali namerno biramo 50 kako bi run imao predvidljiv broj naknadnih content/attachment zahteva i mogao bezbedno da stane pre limita.

### Checkpoint i overlap

Za svaki `(providerConnectionId, folderId)` čuvaju se:

- poslednji potpuno potvrđen `receivedAt`/Zoho datum;
- poslednji obrađen `providerMessageId` na toj granici;
- `lastSuccessfulSyncAt`;
- trenutni `start` samo za ograničenu backlog continuation fazu;
- poslednja greška, broj pokušaja i sledeće dozvoljeno vreme pokušaja.

Svaki redovni poll ponovo pregleda najmanje poslednjih **10 minuta** ili poslednjih **100 poruka**, šta je šire u okviru hard cap-a. Overlap štiti od poruke koja kasni, jednakih timestamp-ova i delimično uspešnog prethodnog run-a; idempotency upsert sprečava duplikate. Checkpoint se pomera tek kada su sve poruke do nove granice trajno upisane ili eksplicitno evidentirane kao izolovana greška koja zahteva ponovni pokušaj.

### Threading

Redosled povezivanja poruke u thread:

1. postojeća provider mapa za isti Zoho `threadId` u istom integracionom nalogu;
2. normalizovani `In-Reply-To`/`References` prema prethodno sačuvanom RFC `Message-ID`;
3. za outbound reply — eksplicitna veza sa lokalnom porukom na koju se odgovara;
4. samo kao poslednji, niskopouzdani signal: normalizovan subject + učesnici u kratkom vremenskom prozoru.

Poslednji fallback ne sme automatski spojiti dve poslovno različite konverzacije ako nema jednog od pouzdanih identifikatora; poruka ostaje za ručno povezivanje. Zoho `threadId` nije globalni identitet van konkretnog `providerAccountId`.

### Retry i rate limit

- `429` i prolazni `5xx`: eksponencijalni backoff sa jitter-om; koristiti `Retry-After` kada je prisutan.
- Mrežna greška na GET-u: bezbedan retry jer je ingest idempotentan.
- `401`: jedan kontrolisan refresh access tokena, zatim stop i `auth_required` stanje; nema beskonačne petlje.
- Ostali `4xx`: bez automatskog retry-a dok se konfiguracija ili payload ne isprave.
- Jedna neispravna poruka ne sme pomeriti njen checkpoint niti blokirati beleženje dijagnostike; čuva se bounded „poison message” zapis bez tajni i privatnog body-ja u logu.
- Logovi ne sadrže OAuth vrednosti, kompletan body poruke, cookies ni attachment binarni sadržaj.

### Outbound idempotency

Pre svakog send/reply poziva nastaje lokalni outbox zapis sa jedinstvenim `sendCommandId`. Stanja su najmanje `pending`, `sending`, `sent`, `failed` i `needs_reconciliation`.

- Ako POST vrati potvrđen Zoho `messageId`, mapiranje se trajno upisuje pre označavanja lokalne poruke kao poslate.
- Ako je odgovor izgubljen posle mogućeg prijema POST-a, zahtev se ne šalje naslepo ponovo; prvo se pretražuje Sent/history u ograničenom prozoru pomoću sačuvanog command/tracking identiteta i RFC headera, ako ga API prihvati.
- Tek dokazano neizvršen pokušaj može ponovo poslati isti command.
- `admin_reply_sent` event nastaje samo jednom, po potvrđenom provider rezultatu.

## Prilozi i sadržaj

- Lista poruka daje samo envelope/metapodatke potrebne za izbor novih poruka.
- Content endpoint se poziva samo za novu poruku; čuvaju se originalni provider sadržaj u kontrolisanoj zoni i očišćen tekst/preview za ADMIN-08 prikaz.
- HTML se sanitizuje pre prikaza; udaljene slike i tracking pikseli se ne učitavaju automatski.
- Attachment metadata se importuje prvo. Binarni sadržaj se preuzima on-demand ili kroz ograničen worker, sa dozvoljenim MIME tipovima, maksimalnom veličinom i proverom pre trajnog skladištenja.
- Neuspešan attachment ne duplira samu poruku; ima sopstveno retry stanje.
- Originalni MIME može se koristiti za dijagnostiku/threading samo pod strogo ograničenim admin pristupom i retention pravilom definisanim pre implementacije.

## OAuth, endpoint-i i konfiguracija

### EU endpoint-i

- OAuth authorization/token host: `https://accounts.zoho.eu`
- token endpoint: `https://accounts.zoho.eu/oauth/v2/token`
- Zoho Mail API resource base: `https://mail.zoho.eu/api`

OAuth klijent treba da koristi Authorization Code flow sa offline pristupom kako bi dobio refresh token. Access token je kratkotrajan; zvanična dokumentacija navodi uobičajeno trajanje od 3.600 sekundi. Redirect treba da ostane na odobrenom ScanMe backend endpoint-u i nikada na klijentskoj strani koja bi izložila credential.

### Minimalni runtime scope-ovi

- `ZohoMail.accounts.READ` — pronalazak/potvrda integracionog `accountId`;
- `ZohoMail.folders.READ` — pronalazak Inbox i Sent `folderId` vrednosti;
- `ZohoMail.messages.READ` — listanje, sadržaj, headeri i prilozi;
- `ZohoMail.messages.CREATE` — send/reply i upload priloga, ali tek kada outbound bude odobren i dokazan.

Runtime token ne treba `ZohoMail.organization.groups.READ`: članstvo i send-as se menjaju ručno u Admin konzoli, a ADMIN-09 ne treba da administrira grupu. Ako se želi strogo fazno najmanje ovlašćenje, prvi inbound-only rollout može izostaviti `ZohoMail.messages.CREATE` i dodati ga novom consent autorizacijom tek pred outbound probu.

### Potrebne identifikacione vrednosti

- `accountId`: isključivo ID namenskog integracionog korisničkog mailbox-a, dobijen kroz Accounts API;
- `fromAddress`: `office@scanme.rs` tek nakon dozvole i uspešne realne API probe; integraciona adresa se ne sme tiho koristiti kao javni From;
- folderi: stvarni Inbox i Sent folder IDs dobijeni kroz Folders API, bez hardkodovanih numeričkih vrednosti;
- provider: stabilna interna vrednost `zoho`;
- data-centar: `eu`.

### Nazivi env var-ova — bez vrednosti

```text
ZOHO_MAIL_API_BASE_URL
ZOHO_ACCOUNTS_BASE_URL
ZOHO_MAIL_CLIENT_ID
ZOHO_MAIL_CLIENT_SECRET
ZOHO_MAIL_REFRESH_TOKEN
ZOHO_MAIL_ACCOUNT_ID
ZOHO_MAIL_FROM_ADDRESS
ZOHO_MAIL_INBOX_FOLDER_ID
ZOHO_MAIL_SENT_FOLDER_ID
ZOHO_MAIL_SYNC_ENABLED
ZOHO_MAIL_POLL_INTERVAL_SECONDS
```

Secret vrednosti pripadaju isključivo deployment secret store-u. Ne smeju biti u git-u, client bundle-u, admin UI-ju, logovima, dokumentaciji ili Convex dokumentima dostupnim klijentu.

## Tačne Zoho promene koje zahtevaju vlasnikovo odobrenje

Nijedna stavka nije izvršena ovim preflight-om.

1. **Kreirati jednog namenskog Zoho korisnika za integraciju.** Uticaj: koristi četvrtu od pet trenutnih Mail Free licenci; ostaje jedna slobodna. Pre kreiranja potvrditi da Mail REST API radi za taj plan ili dobiti pisanu potvrdu Zoho podrške.
2. **Dodati tog korisnika kao člana grupe Office.** Uticaj: svaka normalno isporučena grupna poruka dobija još jednu kopiju u integracionom mailbox-u; postojeća tri člana i njihove kopije ostaju nepromenjeni.
3. **Promeniti `Who can send emails to the group?` sa `Organization Members` na `Everyone`** ako je poslovna namera da email spoljnih klijenata stiže automatski. Uticaj: uklanja sadašnji moderation hold za spoljne pošiljaoce i povećava direktnu isporuku/spam površinu. Ako vlasnik želi moderaciju, ova promena se ne radi, ali ADMIN-09 ne može obećati automatski prijem dok moderator ne odobri poruku.
4. **Dozvoliti `Send using group email address` samo integracionom korisniku**, ne globalno svim članovima. Uticaj: postojeće dozvole Alekse, Jovana i Teodore ostaju `Not allowed`; integracioni nalog dobija potencijal da šalje kao `office@scanme.rs`.
5. **Kreirati EU server-based OAuth client i autorizovati samo integracioni nalog sa minimalnim scope-ovima.** Uticaj: ScanMe dobija ograničen API pristup tom mailbox-u. Client secret i refresh token idu samo u secret store.
6. **Odobriti kontrolisanu realnu inbound i send/reply probu bez privatnog sadržaja.** Uticaj: jedna namenski napravljena test poruka potvrđuje plan/API, folder IDs, thread IDs, group send-as i reply. Bez te probe outbound ostaje ugašen.

Nisu preporučene promene forwarding-a, retention-a, postojećih članova, njihovih send-as dozvola niti preuzimanje/brisanje grupe.

## Uticaj, rizici i rollback

### Da li promena može prekinuti postojeći tok?

Preporučena aditivna varijanta sama po sebi ne bi trebalo da prekine prijem, slanje ili istoriju postojeća tri člana: grupa i javna adresa ostaju na mestu, a novi korisnik samo prima dodatnu kopiju. Ipak, rizik postoji ako se pogrešno oslobodi/pretvori adresa grupe, ukloni član, globalno promeni send-as ili promeni external-sender politika bez dogovora. Zato se te operacije ne kombinuju sa prvim sync rollout-om.

Promena external-sender politike menja trenutak isporuke spoljnih poruka: `Everyone` znači direktnu isporuku umesto moderation hold-a. Group send-as menja izlazni identitet samo za integracioni nalog; bez uspešne API probe ne uključuje se ScanMe slanje.

### Glavni rizici

- Mail REST API možda ima ograničenje na Mail Free planu koje pregledana javna dokumentacija ne navodi eksplicitno.
- Zoho REST možda neće prihvatiti grupnu adresu kao `fromAddress` iako je članu dozvoljen group send-as u UI-ju.
- External sender promena može povećati spam i zaobići željenu moderatorsku kontrolu.
- Distribution List i dalje pravi više Zoho kopija; zaštita od duplikata važi samo u ScanMe ingest-u.
- Provider thread grupisanje se može razlikovati od RFC reply lanca; zato se čuvaju oba signala.
- Veliki/štetni HTML i prilozi zahtevaju sanitizaciju, size limit i kontrolisano skladištenje.
- Polling donosi očekivano kašnjenje do približno dve minute i mora poštovati rate limit/backoff.

### Rollback redosled

1. Postaviti `ZOHO_MAIL_SYNC_ENABLED` na isključeno i zaustaviti scheduler bez brisanja importovanih zapisa.
2. Opozvati refresh token/OAuth grant integracionog korisnika.
3. Vratiti njegov `Send using group email address` na `Not allowed`.
4. Ukloniti integracionog korisnika iz grupe Office.
5. Ako je menjana politika spoljnog slanja, vratiti `Organization Members` + moderation hold.
6. Tek posle retention odluke deaktivirati/obrisati integracioni korisnički nalog; ne brisati ga dok je potreban rollback dokaz.

Postojeća tri mailbox-a i njihove istorije ostaju izvor kontinuiteta. Importovane ScanMe poruke ne brišu se automatski pri rollback-u; označavaju se provider konekcijom i zadržavaju za audit prema budućem retention pravilu.

## Mapiranje na ADMIN-08 bez promene domenskog jezgra

ADMIN-08 ostaje provider-neutralan. Zoho detalji pripadaju adapter sloju i provider mapama, ne postojećim statusima ili UI jeziku.

| Zoho zapis | ADMIN-08 projekcija |
| --- | --- |
| nova inbound poruka poznatog kontakta | `conversationMessages`: `channel=email`, `direction=client_to_admin`, `authorKind=client` |
| potvrđen outbound odgovor | `channel=email`, `direction=admin_to_client`, plus jedan `admin_reply_sent` event |
| prvi uspešan import | jedan `client_message_received` event i inkrement `adminUnreadCount` |
| provider thread | provider mapa ka postojećem `conversationId`; nije novi status |
| sender adresa | normalizovano povezivanje na `accountContacts.normalizedEmail` uz eksplicitno account/business razrešenje |
| Zoho read/unread | ne prepisuje ADMIN-08 unread; služi samo kao provider metapodatak ako je potreban za dijagnostiku |
| `office@` To/Cc | envelope metapodatak; ne određuje sam klijenta niti account |
| attachment | adapter metadata + bezbedno skladište, povezano sa lokalnom porukom |
| delivery/retry rezultat | provider outbox/audit; postojeći ADMIN-08 status konverzacije ostaje odvojen |

Postojeći statusi ostaju: `new`, `needs_reply`, `in_progress`, `waiting_client`, `completed`. Nova inbound email poruka postavlja/reotvara razgovor prema već prihvaćenom ADMIN-08 pravilu: nova poruka ide u `new`/`needs_reply`, a klijentov odgovor na završen razgovor ga ponovo otvara. Zoho provider stanje ne postaje novi korisnički status.

Provider-specifični zapisi treba aditivno da pokriju:

- konekciju i bezbednu referencu na secret konfiguraciju;
- folder checkpoint/lease/retry stanje;
- provider message mapu i originalne ID/header signale;
- attachment metapodatke i storage stanje;
- outbound command, provider rezultat i reconciliation stanje;
- audit bez body-ja/secreta u logovima.

Za nepoznatog ili dvosmislenog pošiljaoca adapter prvo čuva bounded staging zapis sa `unmatched`/`ambiguous` stanjem. Ne izmišlja klijenta, account, venue ili kontakt da bi zadovoljio obavezna polja postojećih tabela. Inbox može u budućem ADMIN-09 prikazati kontrolisani fallback „Nepoznat pošiljalac” i akciju ručnog povezivanja; tek potvrđena veza materijalizuje poruku u `conversations`/`conversationMessages`.

## Precizan obim budućeg ADMIN-09

ADMIN-09 može početi tek posle vlasnikove odluke o gore navedenim Zoho promenama. Njegov tehnički obim treba ograničiti na:

1. provider-neutralnu adapter granicu sa Zoho implementacijom;
2. additive provider connection/checkpoint/message/attachment/outbox/audit tabele i indekse;
3. OAuth callback/refresh na EU endpoint-ima, bez tajni u bazi dostupnoj klijentu;
4. Accounts/Folders discovery i eksplicitnu validaciju tačno jednog dozvoljenog `accountId`;
5. bounded Inbox polling sa lease-om, checkpoint-om, overlap-om, cap-om i backoff-om;
6. sanitizaciju content-a, attachment metadata i kontrolisani download;
7. idempotentni import u ADMIN-08 i provider/thread mapiranje;
8. poznat/ambiguous/unmatched sender matching bez izmišljenih zapisa;
9. outbound outbox, send/reply, reconciliation i audit — iza feature flag-a dok realna proba ne prođe;
10. testove za ponovljen poll, jednak timestamp, kasnu poruku, partial failure, 429/5xx, token expiry, duplikat, thread reply, unknown sender i attachment failure;
11. operativna stanja `healthy`, `syncing`, `degraded`, `auth_required`, `disabled`, bez prikazivanja tajni;
12. dokumentovan cutover i rollback, bez promene postojećeg ADMIN-08 domenskog jezgra.

Van ADMIN-09 ostaju: zamena email providera, Shared Mailbox migracija, promene planova/licenci, automatizovana administracija Zoho grupa, masovno preuzimanje istorije bez zasebne odluke i brisanje/retention migracije.

## Šta može da se implementira pre credentials/config promene

- adapter interfejs i čisti Zoho response parser-i nad sanitizovanim fixture-ima;
- provider tabele, indeksi i server-only authz granice;
- checkpoint, lease, overlap, idempotency i retry state machine;
- matching pravila i `unmatched`/`ambiguous` tok;
- HTML sanitizacija i attachment policy;
- outbox/reconciliation model sa slanjem ugašenim;
- feature flags i operativni statusi;
- unit/`convex-test` testovi sa lažnim provider transportom;
- ADMIN-08 mapiranje i dedupe testovi;
- runbook za autorizaciju, probu, cutover i rollback.

Ovo ne daje dozvolu da se te stavke implementiraju u ADMIN-09A; samo definiše budući obim.

## Šta se ne može iskreno verifikovati bez realnog naloga i odobrene konfiguracije

- da li Mail REST API radi na konkretnom ScanMe Mail Free tenant-u;
- stvarni integracioni `accountId`, Inbox/Sent `folderId` vrednosti i OAuth consent rezultat;
- da li REST send/reply prihvata `office@scanme.rs` kao `fromAddress` integracionog člana sa group send-as dozvolom;
- realni payload polja, headeri, provider `threadId` stabilnost i ponašanje kroz inbound/reply/forward tok;
- da li spoljne poruke posle odobrene promene stižu bez moderacije i u kom roku;
- attachment veličine, MIME ponašanje i ograničenja konkretnog naloga;
- ponašanje rate limita za konkretan tenant i odgovor `Retry-After`;
- Shared Mailbox API podobnost, čak i posle eventualnog prelaska na plaćeni plan;
- uspešan end-to-end send/reply i Sent reconciliation;
- rollback u realnom tenant-u.

## Odluke potrebne pre ADMIN-09

Vlasnik treba eksplicitno da potvrdi:

1. namenski integracioni korisnički mailbox kao V1 arhitekturu;
2. korišćenje četvrte Mail Free licence, uz prethodnu proveru API podobnosti plana;
3. da li spoljni pošiljaoci treba automatski da prolaze (`Everyone`) ili ostaju u moderation hold-u;
4. ograničeni group send-as samo za integracionog korisnika;
5. EU OAuth client i četiri navedena scope-a, odnosno inbound-only početak bez `messages.CREATE`;
6. kontrolisanu test poruku i send/reply probu pre uključivanja outbound-a;
7. polling interval od 120 sekundi i predložene bounded granice;
8. retention i maksimalnu veličinu priloga pre čuvanja realnog sadržaja.

Do tih potvrda ADMIN-09 ostaje blokiran za realnu konekciju, kredencijale, tenant promene i end-to-end verifikaciju. Dokumentovanje i testiranje provider adaptera bez kredencijala može se planirati, ali nije deo ovog ADMIN-09A commita.
