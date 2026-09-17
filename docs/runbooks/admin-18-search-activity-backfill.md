# ADMIN-18 search and activity projection backfill

This runbook is intentionally not an execution record. ADMIN-18 development and
verification must not run either backfill against a real Convex deployment.

## Safety boundary

1. Classify the target deployment and obtain fresh production approval before
   any production run.
2. Start with `dryRun: true`, `cursor: null`, and `limit: 20`.
3. Store the returned `continueCursor` after every page. Resume with that exact
   cursor; never restart merely because a terminal session ended.
4. A page is complete only when `isDone` is `true`.
5. Do not run seed, reset, or a second writer while investigating a failure.

## Contact search projection

Call internal function `adminGlobalSearch:backfillContacts` one page at a time.
The dry run reads the same bounded source page but writes nothing. A real replay
upserts by canonical `contactId`, so retrying the same page does not create a
second search row.

Call `adminGlobalSearch:backfillProductSuffixes` with the same procedure before
enabling account/location-scoped suffix lookup. It only derives the final SMF
segment on the existing product read model; replay leaves already-correct rows
unchanged.

## Unified activity projection

Call internal function `adminActivity:backfill` separately for these sources:

1. `admin_audit`
2. `conversation`
3. `action_item`
4. `task`
5. `order`
6. `access_channel`
7. `subscription`

Use the same dry-run/cursor/limit procedure for each source and keep an
independent cursor for each one. Activity rows upsert by stable
`<source-table>:<source-id>` keys and compare a deterministic fingerprint, so a
replay updates a changed projection without duplicating the historical event.

The backfill materializes only safe identification fields, action, actor,
business reason when explicitly present, and the canonical source link. It does
not copy message bodies, raw emails, attachments, tokens, cookies, financial
references, login/logout data, session/device data, IP addresses, or presence
timestamps. Missing authors stay `unknown`, `system`, `external`, or
`shared_mailbox`; the procedure never guesses an admin.

## Verification after an approved run

- Compare `examined` with the source page size and retain every returned cursor.
- Replay the final processed page and confirm `written` is `0`.
- Confirm search exact-code and contact results against known canonical rows.
- Confirm activity order, account/business/category/actor filters, and source
  links in `/admin/pretraga?view=activity`.
- Record the target deployment, operator, time, source cursors, and counts in
  the operational change record. Do not place customer PII in that record.
