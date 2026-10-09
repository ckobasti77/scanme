# Frontend delta — 9. oktobar 2026.

Detalji i razlozi su u [`JOVAN-DELTA-2026-10-09.md`](./JOVAN-DELTA-2026-10-09.md).

## Admin alati

Komponente su u `components/fair/admin/`:

- `FairAdminTools` je serverska kapija. `FairAdminDevSheet` je panel.
- Ulaze kroz novi opcioni prop `adminTools` na `FairEventShell`, `FairModelPage` i `FairGarage`.
- Mapa, model, pasoši i garaža ih šalju. Za posetioca je vrednost `null`, pa im se klijentski kod ne šalje.

Admin se proverava na serveru preko `lib/fair-server/admin-session.ts`:

- `fairIsAdminRequest()`: Convex Auth token, pa `api.admin.me`;
- `fairAdminPreview()`: čita HttpOnly kolačić `scanme_fair_admin_preview`, samo posle provere admina;
- `fairPreviewCapabilities()`: na stranici modela menja samo prikaz.

Nova ruta: `POST /api/fair/admin-dev`. Akcije su `state`, `stamps`, `scan`, `reset`, `openQuestion` i `preview`.

## „dev“ u footeru

- Link „dev“ je uklonjen iz footera modela i garaže. U garaži nije radio ništa.
- Na stranici modela `?dev=1` radi samo u `next dev`.
- Footer modela, garaže, pasoša i Glasa publike sada ima link „Privatnost“ ka `/sajam/privatnost`.
- Footer pasoša se sada uvek prikazuje. Link „dev“ u njemu ostaje samo lokalno.

## Privatnost i saglasnost

- Nova stranica `app/sajam/privatnost/page.tsx` i konstanta `FAIR_PRIVACY_PATH` u `lib/fair-contract.ts`.
- `ContactBlock` ispod teksta saglasnosti prikazuje link „Politika privatnosti“, koji se otvara u novom tabu.
- `surveyFinalBodyContact` sada glasi „Ako ostavite kontakt, {exhibitor} može da vam pošalje ponudu. Nije obavezno.“

## i18n

- Nove površine: `fair-admin-dev` i `fair-privacy`.
- `privacyLink` je dodat u model, garažu i pasoš. `consentPrivacyLink` je dodat u model.
- `devLink` je uklonjen iz garaže.

## Dopuna (9. 10., mejlovi posetiocu i DEV panel na pasošima)

- `POST /api/fair/lead` prima opciono `origin: "survey"`. Lead ostavljen u poslednjem koraku ankete šalje ga sam (`model-interactions.tsx`), pa posetilac dobija mejl ankete umesto mejla „Zainteresovan sam“.
- `fairLeads.origin?: "survey"` je novo opciono polje u šemi.
- `fairAdminDev.devState` sada vraća i `models` (objavljeni modeli: id, slug, naziv, brend) za birače u DEV panelu.
- Poruke na ekranu (`fair-model.ts`):
  - `interestSent`: „Poslato! {brand} tim će vam se javiti.“
  - `testDriveSent`: „Zahtev je poslat. {brand} tim će vas kontaktirati za termin.“ (sada sa `{brand}`)
  - `surveySentToast`: „Hvala! Odgovori su poslati {brand} timu.“
