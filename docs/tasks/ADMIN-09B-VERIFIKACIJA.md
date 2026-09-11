# ADMIN-09B — Zoho Mail adapter foundation

Status: lokalna, inertna osnova. Nema aktivne Zoho konekcije, OAuth grant-a,
scheduler-a, čitanja poruka ili slanja.

## Implementirana granica

- `EmailProviderTransport` odvaja Zoho DTO oblike od ADMIN-08 domena i pokriva
  account/folder discovery, bounded listu poruka, headere, content, attachment
  metadata/download, send, reply i ograničenu Sent reconciliation pretragu.
- `ZohoMailTransport` koristi native `fetch`, prihvata samo
  `https://mail.zoho.eu/api`, samo jedan unapred dozvoljeni `accountId` i za
  sync koristi isključivo GET endpoint-e. Parseri fail-closed odbijaju nepoznat
  payload.
- `runIncrementalEmailSync` je čista, testabilna orchestration granica. Radi sa
  page size 50, najviše 3 stranice/150 poruka, continuation cursor-om, lease-om,
  vremenskim i 100-message overlap-om, jednim 401 refresh pokušajem i bounded
  429/5xx backoff-om.
- ADMIN-08 ostaje provider-neutralan. Provider poruka se mapira na postojeći
  aktivni kontakt samo kada je normalizovana sender adresa jedinstvena.
  Unknown/ambiguous poruke ostaju u provider staging-u; ne kreiraju se klijenti,
  kontakti, nalozi ili lokali.
- HTML content se ne prosleđuje ADMIN-08 niti renderuje. Poruka ostaje u
  `poisoned` staging stanju sa bezbednim kodom
  `email_html_requires_sanitizer`. Remote slike/tracking time ostaju blokirani.
- Attachment metadata i binarni download su odvojeni. Download zahteva pozivni
  MIME allowlist i maksimalnu veličinu, a neuspeh ima sopstveno retry stanje.
- Outbox je lokalni command store. `pending` nije dokaz slanja; neizvestan POST
  prelazi iz `sending` u `needs_reconciliation`, bez slepog resend-a.

## Aditivne tabele i indeksi

| Tabela | Namena | Ključni indeksi |
| --- | --- | --- |
| `emailProviderConnections` | provider/account/folder identitet bez secreta, flagovi i operativno stanje | provider, operational state |
| `emailProviderFolderCheckpoints` | watermark, continuation i retry stanje po folderu | connection + folder |
| `emailProviderSyncLeases` | jedan aktivan run po konekciji | connection |
| `emailProviderMessages` | primarni provider idempotency ključ, thread/header signali i staging | provider + account + message; connection + message/thread/RFC id; mapping state |
| `emailProviderAttachments` | metadata i odvojeno download/storage stanje | local provider message + attachment id |
| `emailProviderOutbox` | stabilan `sendCommandId`, payload i send/reconciliation stanje | connection + command; state; conversation |
| `emailProviderAudit` | bezbedni operativni događaji bez body-ja, binarnog sadržaja i credentials | connection/event + time |

## Konfiguracija i feature flagovi

Placeholder-i su deklarisani u `.env.example` i Convex server env inventaru.
Sve vrednosti ostaju prazne u repozitorijumu:

- `ZOHO_MAIL_API_BASE_URL`
- `ZOHO_ACCOUNTS_BASE_URL`
- `ZOHO_MAIL_CLIENT_ID`
- `ZOHO_MAIL_CLIENT_SECRET`
- `ZOHO_MAIL_REFRESH_TOKEN`
- `ZOHO_MAIL_ACCOUNT_ID`
- `ZOHO_MAIL_FROM_ADDRESS`
- `ZOHO_MAIL_INBOX_FOLDER_ID`
- `ZOHO_MAIL_SENT_FOLDER_ID`
- `ZOHO_MAIL_SYNC_ENABLED`
- `ZOHO_MAIL_OUTBOUND_ENABLED`
- `ZOHO_MAIL_GROUP_SEND_AS_VERIFIED`
- `ZOHO_MAIL_POLL_INTERVAL_SECONDS`

Secret-i se kasnije unose samo kao server-side deployment env vrednosti, nikada
u Convex dokument, frontend env, log ili ovaj dokument. Trenutna osnova nema
OAuth callback/refresh action niti scheduler i zato nijedan env flag sam po sebi
ne može pokrenuti mrežni saobraćaj. Nova konekcija se inicijalizuje sa ugašenim
`syncEnabled`, `outboundEnabled` i `groupSendAsVerified` vrednostima.

## Šta ADMIN-09C mora da uradi

1. Dobiti eksplicitno owner odobrenje za Zoho promene iz ADMIN-09A preflight-a.
2. Kreirati namenski četvrti Zoho korisnički mailbox i dodati ga kao člana
   postojeće `Office` Distribution List, bez menjanja ličnih mailbox-a.
3. Napraviti EU server-side Authorization Code OAuth flow sa offline pristupom.
   Za inbound su potrebni najmanji dokumentovani READ scope-ovi za accounts,
   folders i messages; `ZohoMail.messages.CREATE` dodati tek pred odobrenu
   outbound probu.
4. Discovery pozivom potvrditi tačno jedan dozvoljeni `accountId` i stvarne
   Inbox/Sent `folderId` vrednosti; ništa od toga ne hardkodovati u izvor.
5. Dodati server action adapter koji vezuje postojeći engine i internal storage
   funkcije, zatim scheduler uključiti tek kada je controlled inbound test zelen.
6. Controlled test porukom dokazati prijem, thread/RFC mapiranje, attachment
   granice, 401/429/5xx ponašanje i rollback.
7. Tek posle ograničenog group send-as odobrenja i realnog API send/reply dokaza
   uključiti outbound flagove. Neizvestan rezultat mora prvo proći bounded Sent
   reconciliation.
8. Nakon što se ukloni postojeća predugačka `actionItems` index oznaka koja
   blokira Convex codegen, ponovo generisati lokalne tipove pre povezivanja novog
   modula sa scheduler-om/UI-jem.

## Još nije realno dokazano

- stvarni tenant plan, namenski mailbox, account/folder identifikatori i OAuth
  consent rezultat;
- prijem spoljne `office@scanme.rs` poruke kroz stvarnu group moderation politiku;
- da Zoho REST prihvata `office@scanme.rs` kao `fromAddress` namenskog člana;
- produkcioni MIME/size odgovori, attachment download i Sent reconciliation;
- end-to-end latency, rate-limit prag i polling interval;
- stvarni send/reply rezultat.

## Test, cutover i rollback redosled

1. Lokalno: pokrenuti targeted Vitest/convex-test, Convex TypeScript proveru i
   `npm.cmd run check` bez mrežne konekcije.
2. Tenant priprema: izvršiti samo unapred odobrene Zoho korake i zabeležiti
   potvrđene identifikatore, bez menjanja postojeća tri lična mailbox-a.
3. Controlled inbound: flags prvo ostaju ugašeni, OAuth/discovery se proveravaju,
   zatim se privremeno uključuje samo sync za jednu namensku test poruku.
4. Observability: proveriti jedan local message/event, tačan unread, staging,
   checkpoint, lease, retry i secret-free audit.
5. Outbound: ostaje ugašen dok group send-as i realna send/reply proba nisu
   posebno odobreni i uspešni.
6. Cutover: uključiti bounded scheduler sa malim polling intervalom tek posle
   zelenog controlled testa; nadzirati degraded/auth_required i rate limit.
7. Rollback: prvo isključiti sync/outbound flagove i scheduler, zatim po potrebi
   opozvati OAuth grant. Ne brisati importovane ADMIN-08 poruke niti menjati
   Distribution List ili lične mailbox-e.

## Lokalna verifikacija ADMIN-09B

- `npx.cmd vitest run convex/zohoMailProvider.test.ts convex/emailSyncEngine.test.ts convex/emailProviderFoundation.test.ts`
  — 3 fajla, 21 test, prolaz.
- `npx.cmd tsc -p convex/tsconfig.json --noEmit` — prolaz.
- `npm.cmd run check` — prolaz (lint bez grešaka uz 2 prethodno postojeća
  warning-a; production build, namespace gate i 177 golden slučajeva na 2
  viewport-a prolaze).

Browser QA nije potreban: ADMIN-09B nema korisnički vidljivu UI promenu.
