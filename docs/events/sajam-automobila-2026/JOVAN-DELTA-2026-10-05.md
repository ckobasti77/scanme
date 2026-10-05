# Jovan backend delta - 5. oktobar 2026.

> Status: **OBAVEZNO PRE TRAFFIC/SHARE IMPLEMENTACIJE**
>
> Poslednje ažuriranje: **5. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
>
> Tehnički ugovor: [`BACKEND-HANDOFF.md`](./BACKEND-HANDOFF.md)

`MASTER-KONTEKST.md` definiše proizvod, a `BACKEND-HANDOFF.md` tehničku implementaciju. Ova delta dodaje Garaža selection/share tok i preciznu atribuciju. Kontradikcije se ne rešavaju pretpostavkom, već vraćanjem komandnom centru.

## 1. Ne menjati postojeći QR ugovor

- Sto štampanih dinamičkih kodova i dalje koristi postojeći `/r/[cardCode]`.
- `cards.resolveAndRecord` je jedini izvor generičkog i fair scan događaja.
- Isti resolver request ID idempotentno piše oba događaja.
- Model stranica, Garaža, deljena kolekcija i sponzorisana kartica nikada ne proizvode scan.

## 2. QR naspram direktnog ulaza

- `/r/[cardCode]` pre 302 postavlja kratkotrajni potpisani HttpOnly entry marker sa `eventModelId`, scan `requestId`, izvorom `qr` i vremenom izdavanja.
- Marker ne ide u URL, ne sadrži visitor hash i važi najviše 120 sekundi samo za odgovarajuću sajamsku putanju.
- Model-view gateway ga verifikuje i idempotentno potroši. QR landing nije `direct_view`.
- Model URL bez važećeg QR/share markera beleži `direct_view` i ne dodiruje scan brojače.

## 3. Deljenje

- Jedan model deli svoj kanonski URL.
- Dva do pet modela istog događaja kreiraju javnu read-only kolekciju `/sajam/deli/[shareCode]`.
- `shareCode` je nepredvidiv opaque token; u bazi se čuva hash.
- Kolekcija čuva samo event/model reference, redosled, vreme i status. Nema kontakta ili social destination-a.
- Javni prikaz koristi postojeće public model projekcije, ima `noindex` i prestaje da radi 16. novembra 2026.
- Preview prikazuje do tri modela i `+N`; fotografija ima isti fallback kao Garaža.
- Na podržanom telefonu frontend direktno otvara sistemski share sheet, bez posrednog aplikacijskog prozora. Tako platforma može da ponudi česte kontakte i instalirane aplikacije. Ako Web Share API nije dostupan ili odbije poziv, prikazuje se aplikacijski fallback sa WhatsApp/Viber izlazima i eksplicitnim kopiranjem linka; fallback nikada ne sme neprimetno da kopira link.

## 4. Analitika

Dodati zasebne događaje koji nikad ne ulaze u `fairScanEvents` ili `fairSponsoredActions`:

- `direct_view` - običan kanonski ulaz bez QR/share markera;
- `share_action` - uspešno završen native share promise, izbor WhatsApp/Viber izlaza ili uspešno kopiranje linka; kanal `native | whatsapp | viber | copy`, model count 1-5;
- `share_open` - otvaranje važeće javne kolekcije.

Otkazan native share nije uspeh. Backend i izveštaj ne smeju tvrditi da je poruka stvarno poslata. Visitor identitet služi samo kao prolazni rate-limit ključ; raw traffic red ne čuva `visitorId`. Raw redovi brišu se 16. novembra, a ostaju samo anonimni agregati.

## 5. Minimalni API ugovor za frontend

- `POST /api/fair/share-collection` sa uređenih 1-5 `eventModelId` vrednosti vraća `{ shareCode, url }`.
- `GET /sajam/deli/[shareCode]` čita bounded javnu projekciju kolekcije ili vraća expired/not-found stanje.
- `POST /api/fair/traffic` prihvata samo dozvoljene `direct_view | share_action`; visitor se izvodi iz HttpOnly cookie-ja, nikada iz tela.
- `share_open` se beleži server-side prilikom čitanja kolekcije, sa zasebnim request ID-em.
- Svi write-ovi su same-origin, no-store, bounded, rate-limited i idempotentni po `requestId`.

## 6. Acceptance

- QR scan + 302 ne povećava `direct_view`.
- Direktan model URL povećava samo `direct_view`.
- Deljenje ne povećava scan ili sponsored metrike.
- Otkazan native share ne povećava `share_action`.
- Izbor WhatsApp/Viber izlaza i uspešno kopiranje linka beleže odgovarajući kanal, bez tvrdnje da je poruka zaista poslata ili primljena.
- Jedna kolekcija ima 1-5 objavljenih modela istog događaja i čuva redosled.
- Istekla/nepoznata kolekcija ne otkriva da li su model ID-evi ikada postojali.
- Retry istog `requestId` ne pravi duplikat.
