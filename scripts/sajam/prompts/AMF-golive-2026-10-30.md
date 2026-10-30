# AMF 2026 — go-live: exhibitor data import, QR linking, leads, map update and UI changes

Auto Moto Fest 2026 (event slug `auto-moto-fest-2026`, Hala Čair, Niš) opens TODAY, 30 Oct 2026 at 10:00. Aleksa (product owner, final go/no-go) is sticking QR stickers in the morning. Work fast, but production safety comes before speed.

## Ground rules

- Work in the existing ScanMe project folder on a new branch, `amf-2026-golive`. Do not create a git worktree or a new folder.
- Ask Aleksa every question in Serbian (Latin script). Keep questions short, and only ask when the answer cannot be found in the repo, the database or the files below.
- DEV first (Convex `perfect-ant-98` plus a preview deployment), then PROD (`adamant-warbler-746` plus the Vercel production deploy).
- PROD runs AUTOMATICALLY: as soon as a step passes on DEV, apply it to PROD yourself. Do not wait for an OK from Aleksa and do not ask for one.
- Report every PROD action to Aleksa one by one, in Serbian, right after it is done: what changed, where, and how you verified it. If a PROD step fails, stop that step, roll it back if it left a partial state, and report.
- The only exception is the map: it changes only after Aleksa confirms the difference table (see the map section).
- Never print secrets, tokens, env values or personal data (lead data) to the chat or to logs.
- Read `MASTER-KONTEKST.md`, `DATA-INTAKE-SPEC.md`, `RUNBOOK-EVENT-SETUP.md` and `PROD-GO-CHECKLIST.md` first. Where this prompt conflicts with them, this prompt wins: these are owner decisions from 30 Oct 2026.
- Save a copy of this prompt into the repo's prompts folder, in the same place earlier prompts were stored.

## Source data

All source data is in `C:\Users\admin\Desktop\Sajam '26 (specifikacije)`:

- **`AMF-unos/amf-2026-unos-podaci.json`.** The normalized intake: 4 exhibitors and 18 models, with stickers, packages, prices, links, photo paths, specs for the scanned PDFs, Glas publike questions with schedules, surveys and lead requirements. This is the source of truth for everything it contains.
- **`AMF-unos/AMF-2026-QR-nalepnice.pdf`.** The sticker → model table Aleksa uses for sticking (SA26-016…SA26-033).
- **Exhibitor subfolders** (`Skoda/`, `Dongfeng/`, `Grand Motors, ford, etc/`, `SWM/`) holding the original emails (.eml), spec/price PDFs and photos.
  - For text PDFs, extract the technical-data section as ordered label–value spec pairs, verbatim.
  - The JSON already contains transcriptions for the scanned Dongfeng PDFs and the SWM G01 Pro specs.
  - The MG price lists are scanned images: read them visually.
  - Never invent a spec. If the exhibited trim or engine is ambiguous (e.g. Ford Kuga ST-Line at 28.490 €), show only specs that are true for every variant of that trim and list it in the report.

## P0 — must be live in PROD before 10:00

### 1. Exhibitors, brands, models

Convert the JSON into the importer's format (DATA-INTAKE-SPEC / the JSON import in `fair-setup-run.mjs`). Then run `importDryRun` on DEV, fix any errors (report the warnings), run `importCommit`, and `publishEventModels`. Then repeat on PROD automatically and report.

**Exhibitors and packages**

| Exhibitor | Brands | Stand | Models and packages |
|---|---|---|---|
| AutoČačak Promet | Škoda | `hala-10` | 6, all Napredni |
| Nikom | Dongfeng + Fiat | `hala-8` | M-HERO 817 Napredni; BOX, Forthing T5 HEV, Fiat Grande Panda Starter |
| Grand Motors | MG + Ford + Ineos | `hala-3` | 7, all Starter |
| SWM | SWM | `ispred-s6` | G01 Pro only, Napredni |

Nothing else is in a package. The SWM PDF also contains the G03F models; they are not in the package and are not imported.

**Logos and photos**

- Use **brand** logos (Škoda, Dongfeng, Fiat, MG, Ford, Ineos, SWM), never exhibitor or dealer logos. Reuse the map's existing brand assets where they exist. Ineos needs a new official brand logo for its model page (it is not added to the map).
- Photos come from the paths in the JSON:
  - Convert to the app's image format and size. The Fabia file is 12 MB.
  - Detect the format of `Skoda/Skoda Fotke/karoq`, which has no file extension.
  - For SWM G01 Pro, use the car image from page 3 of the SWM PDF if its quality is good enough, otherwise the consistent brand placeholder.
  - Pick the best landscape shot for each model folder.
  - Never use an invented or AI-generated photo.

**Prices**

- Show `price_text` exactly as given: "73.890 € + PDV" for the Raptor, "Cena na upit" for the Ineos Grenadier.
- Show `price_secondary` for Škoda ("Osnovni model od …").

**Links**

- Model links come from the JSON. The MG S5 link already has the preview token stripped.
- The map stand click goes to the exhibitor website: Škoda → `https://www.autocacak-promet.rs/`, as Teodora promised. If Grand Motors, Nikom or SWM already have a website on the map, keep it.

**Passports and ratings**

- Passport-eligible brands are those with at least 2 models, all at least Starter: Škoda, Dongfeng, MG, Ford. Fiat, Ineos and SWM have 1 model each, so no passport.
- Ratings follow the package rules: Starter gets 1 overall rating, Napredni gets 3.

### 2. Glas publike

- **Rule change.** Questions may have MORE than 5 options. Keep every option the exhibitor gave. Long lists scroll and use the new scroll indicator (P1 item 9).
- **Škoda.** All 5 questions every day on all 6 models. Q2 is the sponsored-rotation question.
- **Nikom.**
  - M-HERO 817: all 5 questions every day; Q1 is the sponsored-rotation question.
  - BOX, T5 HEV and Grande Panda (Starter): one question per day — 30.10 → Q1, 31.10 → Q2, 1.11 → Q3.
- **Grand Motors (all 7) and SWM G01 Pro.** The neutral question every day: "Da li biste razmotrili kupovinu ovog modela?" — Da / Možda / Ne. SWM did not send questions.

### 3. Surveys (Anketa)

- **Škoda: all 6 models, 5 questions.**
  - Q1 "Koji brend vozila trenutno vozite?" is FREE TEXT. Add a new `answer_type` `free_text`, with validation, a length limit, and safe storage and export.
  - Q2 keeps all 5 choices, plus a last write-in option "Drugo – upiši sam". UX is in P1 item 10.
  - Q5 "Drugo" stays a plain option, as the exhibitor wrote it.
- **Nikom: the survey applies to ALL 4 models, Starter included.** This is an owner override of the "survey = Napredni only" rule, scoped to this exhibitor. Use 5 questions, all options kept (Q5 has 6).
- Grand Motors and SWM: no survey.

### 4. Lead forms (Zainteresovan sam / Probna vožnja)

**Turn leads ON in PROD.**

- Find out why `FAIR_LEADS_ENABLED` (and `FAIR_FOLLOWUP_ENABLED` if it is relevant) is off in PROD. Aleksa says it was supposed to be on and he tested it. Check the Vercel env and the Convex env.
- Tell Aleksa where the flag is and why it was off. Set it to on, redeploy if needed, and confirm in the live UI.

**Where leads go**

- All leads go to ScanMe only (the existing internal lead inbox/export); ScanMe forwards them to exhibitors manually.
- Never send a lead directly to an exhibitor, and do not configure exhibitor emails as lead recipients. The exhibitor contacts in the JSON are reference only.

**Required contact fields**

- Škoda test drive: phone AND email required.
- Grand Motors: collect phone and email; phone required.
- Others: current default.

**New field in the test drive form, for ALL exhibitors: model selector**

- It defaults to the scanned model.
- A small chevron opens a dropdown listing every published model of the SAME EXHIBITOR across all of its brands (a scanned MG can switch to a Ford or the Ineos).
- The selected model is stored on the lead, and the lead is attributed to that model's exhibitor.

**Nikom only, in "Zainteresovan sam"**

Add the fields from the JSON (`interested_form_extra_fields`):

- the same model selector;
- "Kada planirate kupovinu?" — Odmah / U naredna 3 meseca / Za 3–6 meseci / Samo istražujem;
- "Kako planirate da finansirate kupovinu?" — Gotovina / Kredit / Lizing / Još nisam odlučio/la.

These are optional fields. Include them in lead export and email.

**Test leads** must be clearly marked as test (or deleted after the test) so they are never forwarded to exhibitors.

### 5. QR stickers

Use the existing `/r/[cardCode]` resolver and the existing inventory `SML-SAJAM-26-QR` only. Do not create a new QR system.

1. **Link stickers to models.** Link SA26-016…SA26-033 exactly as in the JSON / sticker PDF, using `linkEventQrInventory` or the admin `/admin/dogadjaji/auto-moto-fest-2026/povezi`.
2. **Confirm the URLs.** Verify the exact public URL format each printed code resolves through, and confirm every one of the 18 codes opens the correct published model on PROD.
3. **Retire the old exhibitor codes.** SA26-001…015 were used at the Sajam elektromobilnosti. Per MASTER §22.4 they are retired for AMF. Before deactivating anything, list their current status and destinations.
4. **Panel codes.** The panel QR codes from the Sajam elektromobilnosti are reused for AMF. The MAIN panel code was redirected to the garage when the map was off. It must now point to the AMF map (`/sajam/auto-moto-fest-2026`), which is the app's start screen.
   - Identify the panel codes in the DB, and make sure none of them is accidentally inside the SA26-001…015 retirement.
   - Apply the change and report a table of each panel code with its old and new destination.

### 6. Pre-event gate

PROD `/sajam/auto-moto-fest-2026` currently shows "Vidimo se uskoro … postaje aktivna sa početkom sajma 30. oktobra".

- Find the exact opening time and report it.
- Aleksa must be able to scan and test stickers in the morning before 10:00. Scans before 08:00 count as test per the analytics cutoff.
- Open the gate on PROD as soon as P0 is live and verified on PROD, and report the time it opened.

## Map update — STOP AND CONFIRM BEFORE CHANGING ANYTHING

The current map (see `https://www.scanme.rs/sajam/demo-auto-moto-fest-2026/mapa`, tabs Hala and Ulaz) was correct and must only be updated to match the organizer's latest maps on `https://sajamautomobila.com/ucesnici-2026/`:

- Hala: `https://sajamautomobila.com/wp-content/uploads/2026/10/mapa-2026-2110.jpg` (version 21.10).
- Ulazni deo / ispred hale: `https://sajamautomobila.com/wp-content/uploads/2026/10/mapa-popunjena-ispred-1610.jpg` (version 16.10).
- Zadnji deo: `https://sajamautomobila.com/wp-content/uploads/2026/06/mapa-zadnji-deo-3010.jpg` (it is empty).

A first comparison found these differences:

1. Hala: **Jetour** is missing from the lower stand with Vespa, Aprilia, Piaggio and Honda moto.
2. Ulaz: **Moto Revolution** at the main entrance (Glavni ulaz) is missing.
3. Ulaz, stand 16: there is a second small logo next to Kostić rent a car on the organizer map that our map does not have. It is unreadable at web resolution: zoom the original image and identify it.

Do NOT add Ineos to the map: the map shows only what the organizer's map shows. The Ineos Grenadier model page still belongs to Grand Motors at stand 3.

Everything else matched: ScanMe at stand 14 (ScanMe green), SWM at S6 in front of the hall, Kia S5, ODES S1/S2, Xtreme Motors S3, Auto Happy S4 and stand 19, etc.

**Procedure**

1. Do your own full side-by-side check of every stand, label and position.
2. Show Aleksa the final difference table: what changes, where, and how.
3. WAIT for his explicit OK. Do not touch anything that is already correct.
4. Apply the changes and verify on mobile, desktop and the fair display.
5. Confirm `FAIR_PUBLIC_MAP_ENABLED` is on for PROD per MASTER §10.3.
6. Paid exhibitors keep the heat map; unpaid stands stay grey.

## P1 — UI changes (implement right after P0, same branch, verify on DEV, then ship to PROD automatically and report)

Every interaction must be smooth and consistent with the existing app style, with no snapping anywhere. Use the existing motion tokens and easing, and respect `prefers-reduced-motion`.

### 7. Garage

Tapping the model image in the garage opens that model's page, the same as "Pogledaj". Keep the "Pogledaj" button working.

### 8. Model selector

The model selector described in P0 item 4 must use the app's existing select/sheet style: a small chevron that rotates smoothly when opened, and a smooth open and close of the list.

### 9. App-wide scroll indicator (new reusable component)

Use it anywhere content overflows its container: long Glas publike option lists, surveys, bottom sheets, lead forms, the spec list, etc.

- A small round arrow sits at the bottom edge of the scroll area, only when there is more content below.
- Tapping it smoothly scrolls to the bottom.
- When the user reaches the bottom (by tap or by their own scroll), the arrow smoothly rotates 180° to point up. Tapping it then smoothly scrolls back to the top, and it rotates back down.
- The rotation is one continuous animation (no icon swap or flicker). The arrow fades in and out when overflow appears or disappears.
- It must not cover tappable content; add bottom padding where needed.
- Apply it consistently everywhere, not only in Glas publike.

### 10. Free text in surveys

- A `free_text` question renders as a text field in the app's input style.
- A write-in option renders as the LAST option button, "Drugo – upiši sam".
  - Tapping it smoothly morphs the button into a text input, with no layout jump.
  - The input is focused immediately so the phone keyboard opens on the same tap, with no second tap. Verify on iOS Safari and Android Chrome.
  - Selecting another option collapses it back smoothly; the typed text is kept if they return.
  - Validation and character limit; the answer is stored as the write-in text.

## Testing (report each item with pass/fail)

1. **DEV.** Import dry-run is clean. Every model page renders with the correct price, specs, photo and logo, the questions for today and the survey where applicable.
2. **Glas publike.** Voting works with more than 5 options plus the scroll indicator. The day schedule is correct (simulate 31.10 and 1.11).
3. **Surveys.** Free text and the "Drugo – upiši sam" option with the keyboard opening on the first tap, on iPhone (Safari) and Android (Chrome). Until now only Android was tested.
4. **Leads.**
   - The test drive model selector switches across an exhibitor's brands.
   - Škoda requires both phone and email; Grand Motors requires phone.
   - Nikom's extra fields arrive in the lead email and export.
   - Leads land only in ScanMe's inbox/export, never with an exhibitor.
5. **PROD.** All 18 stickers resolve to the right model, the main panel code opens the map, and leads are ON.
6. **Garage.** Tapping the image opens the model page.
7. **Map.** Matches the confirmed difference table on mobile, desktop and the display.

## Finish

1. Commit on the branch, with a clear message per logical change.
2. Update `MASTER-KONTEKST.md` with the owner decisions above:
   - more than 5 options allowed;
   - free text and write-in;
   - Nikom survey on Starter;
   - test drive model selector;
   - the scroll indicator component;
   - garage image tap.
3. Give Aleksa a short report in Serbian:
   - what is live;
   - the map difference table, if it is still waiting for his confirmation;
   - every ambiguity you left out instead of guessing.
