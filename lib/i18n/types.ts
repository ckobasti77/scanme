// Typed dictionary system (RFC-001 §2.12). Deliberately NOT a library: with `sr`
// as the sole locale and no locale prefix in URLs, next-intl's value (routing,
// negotiation, ICU) is entirely unused. This is plain data + one pure formatter
// (./format.ts) — no React provider, no context, no runtime dependency. It works
// identically in server components, client components, and route handlers.
//
// One `Dict` shape per surface. The `as const satisfies XDict` pattern in each
// sr/* module makes a MISSING key a type error, so `npm run check` catches an
// incomplete dictionary. Empty-but-typed (Record<string, never>) is the correct
// output for a surface whose UI does not exist yet: no copy is invented; the
// interface grows when the screen is built.

export type Locale = "sr";

// venue — the public venue page (/[slug]/venue*, TASK-09). Everything a guest
// can read: route metadata, the three lifecycle states, the twelve block
// renderers' chrome (labels, aria, empty/error states), and the ConvexError
// messages submitReservation raises (they surface on the public form, so they
// live on this surface, not venue-editor). `{...}` placeholders go through fmt().
export interface VenueDict {
  // Route metadata (OpenGraph/Twitter previews included).
  metaEventTitle: string; // "{title} · {name}"
  metaVenueTitle: string; // "{name} · ..."
  metaDescription: string;
  metaArchiveTitle: string; // "... · {name}"
  metaArchiveDescription: string;
  // Segment 404.
  notFoundTitle: string;
  notFoundBody: string;
  // Lifecycle states + template chrome.
  liveBadge: string;
  beforeBadge: string;
  endedBadge: string;
  beforeEmptyTitle: string;
  beforeEmptyBody: string;
  afterTitle: string;
  afterBody: string;
  inactiveTitle: string;
  inactiveBody: string;
  poweredBy: string;
  archiveLink: string;
  currentEventLink: string;
  eventPageEndedNote: string;
  // countdown block.
  countdownAria: string;
  countdownDays: string;
  countdownHours: string;
  countdownMinutes: string;
  countdownSeconds: string;
  countdownDone: string;
  // eventDateTime block.
  whenLabel: string;
  whereLabel: string;
  addToCalendarLabel: string;
  googleCalendarLink: string;
  icsDownloadLink: string;
  // program block.
  programHeading: string;
  // map block.
  mapOpenLink: string;
  mapLoadButton: string;
  mapPrivacyNote: string;
  mapIframeTitle: string;
  // gallery block.
  galleryImageAlt: string; // "… {index}"
  lightboxOpenAria: string; // "… {index} …"
  lightboxLabel: string; // "{index} / {count}"
  lightboxClose: string;
  lightboxPrev: string;
  lightboxNext: string;
  // profileCards block. Neutral fallback — the heading must read naturally for
  // a club lineup AND a salon/gym team (six blocks accept an owner-typed
  // heading; this is only what she sees first).
  profileCardsHeading: string;
  // priceList block. Deliberately not "menu" — ScanMe Menu is a planned
  // separate product (RFC-001 §2.5).
  priceListHeading: string;
  // reservation block — form chrome.
  reservationHeading: string;
  fieldName: string;
  fieldPhone: string;
  fieldEmail: string;
  fieldPartySize: string;
  fieldNote: string;
  optionalSuffix: string;
  reservationSubmit: string;
  reservationSubmitting: string;
  reservationSuccessDefault: string;
  reservationErrorGeneric: string;
  reservationDeadlineNote: string; // "… {date}"
  // reservation backend errors (ConvexError data shown on the public form).
  reservationUnavailable: string;
  reservationClosed: string;
  reservationDeadlinePassed: string;
  reservationFull: string;
  reservationRateLimited: string;
  reservationNameRequired: string;
  reservationPartySizeInvalid: string;
  // share block.
  shareHeading: string;
  shareCopy: string;
  shareCopied: string;
  shareWhatsapp: string;
  shareViber: string;
  shareFacebook: string;
  shareX: string;
  shareDefaultMessage: string; // "… {title}"
  // pastEvents block + archive page.
  pastEventsHeading: string;
  pastEventsEmpty: string;
  archiveTitle: string;
  archiveEmpty: string;
  archivePhotoCount: string; // "{count} …"
}

// venue-editor — the venue editor shell + panels (TASK-06+). `editorAccessDisabled`
// is the shared editor-access denial raised by requireServiceEditorAccess
// (convex/lib/access.ts); it is editor-access copy, so it lives on the editor
// surface even though the Links/Memories guards raise it too. The remaining keys
// are the ConvexError messages raised by the Venue write backend (convex/venue.ts,
// TASK-08): every one is prose the business owner sees in the editor, so per
// CLAUDE.md's i18n rule they live here rather than inline. `{product}`, `{slug}`,
// and `{block}` are interpolated via fmt().
export interface VenueEditorDict {
  // Block palette labels (components/venue/blocks/registry.tsx). Rendered in
  // the TASK-10 editor; defined with the registry so the shape ships complete.
  blockLabelCountdown: string;
  blockLabelEventDateTime: string;
  blockLabelProgramTimeline: string;
  blockLabelMap: string;
  blockLabelGallery: string;
  blockLabelProfileCards: string;
  blockLabelPriceList: string;
  blockLabelReservation: string;
  blockLabelShare: string;
  blockLabelPastEvents: string;
  blockLabelRichText: string;
  blockLabelSpacer: string;
  editorAccessDisabled: string;
  eventNotFound: string;
  configNotFound: string;
  eventSlugReserved: string;
  eventSlugTaken: string;
  draftChanged: string;
  scheduleTimesRequired: string;
  scheduleTimesOrder: string;
  schedulePublishRequired: string;
  scheduleOverlap: string;
  scheduleWrongStatus: string;
  liveConflict: string;
  blockNotAllowed: string;
  archiveNotEnded: string;
  archiveAssetInvalid: string;
  // --- TASK-10: the editor shell (components/venue/editor/**) ---------------
  // Route metadata.
  metaEditorTitle: string;
  // Loader / access screens.
  editorLoading: string;
  signInTitle: string;
  signInBody: string;
  signInAction: string;
  unavailableTitle: string;
  unavailableBody: string;
  noEventTitle: string;
  noEventBody: string;
  // Top bar + history + save state.
  backAria: string;
  historyGroupAria: string;
  undoAria: string;
  redoAria: string;
  undoTooltip: string;
  redoTooltip: string;
  saveDraftAction: string;
  saveActionAria: string; // "… (trenutno: {state})"
  publishAction: string;
  saveStateSaved: string;
  saveStateSaving: string;
  saveStateError: string;
  saveRetryHint: string;
  saveErrorFallback: string;
  savedToast: string;
  // Publish dialog + revision conflict.
  publishDialogTitle: string;
  publishDialogBody: string;
  publishConfirm: string;
  publishCancel: string;
  publishSuccess: string;
  publishErrorFallback: string;
  publishConflictTitle: string;
  publishConflictBody: string;
  publishConflictReload: string;
  // Panel chrome.
  toolsAria: string;
  closePanelAria: string;
  panelComingSoon: string;
  panelBlocksTitle: string;
  panelBlocksDescription: string;
  panelEventTitle: string;
  panelEventDescription: string;
  panelStyleTitle: string;
  panelStyleDescription: string;
  panelBackgroundTitle: string;
  panelBackgroundDescription: string;
  panelTextTitle: string;
  panelTextDescription: string;
  panelColorTitle: string;
  panelColorDescription: string;
  panelSettingsTitle: string;
  panelSettingsDescription: string;
  panelAnalyticsTitle: string;
  panelAnalyticsDescription: string;
  panelHelpTitle: string;
  panelHelpDescription: string;
  // The blocks panel (palette).
  blocksListHeading: string;
  blocksAddHeading: string;
  blockCount: string; // "{count} / {max}"
  blocksCapReached: string; // "… ({max}) …"
  blocksEmpty: string;
  addBlockAria: string; // "… „{block}“"
  blockItemAria: string; // "… „{block}“ …"
  dragHandleAria: string; // "… „{block}“"
  duplicateAria: string; // "… „{block}“"
  deleteAria: string; // "… „{block}“"
  deleteDialogTitle: string; // "… „{block}“?"
  deleteDialogBody: string;
  deleteConfirm: string;
  deleteCancel: string;
  blockDeletedToast: string;
  // The selected-block placeholder panel (per-block controls are TASK-11).
  blockPanelTitle: string; // "… {block}"
  blockPanelPlaceholder: string;
  blockPanelBack: string;
  // The event panel (read-only summary until TASK-11+).
  eventTitleLabel: string;
  eventPathLabel: string;
  eventStatusLabel: string;
  statusDraft: string;
  statusScheduled: string;
  statusLive: string;
  statusEnded: string;
  statusArchived: string;
  // The help panel.
  helpAddTitle: string;
  helpAddBody: string;
  helpReorderTitle: string;
  helpReorderBody: string;
  helpUndoTitle: string;
  helpUndoBody: string;
  helpPublishTitle: string;
  helpPublishBody: string;
  // The preview.
  previewAria: string; // "… {name}"
  deviceGroupAria: string;
  devicePhoneAria: string;
  deviceDesktopAria: string;
  zoomAria: string;
  previewBlockAria: string; // "{block}. …"
  previewEmptyBlock: string; // "… „{block}“ …"
  previewScrollAria: string;
}

// memories — the guest upload/gallery surfaces (/m/[code]*). No UI exists yet.
export type MemoriesDict = Record<string, never>;

// resolver — the /r/nevazeca "card not active" page. No route exists yet.
export type ResolverDict = Record<string, never>;

// consent — the versioned upload-consent notice (§2.10). No screen exists yet.
export type ConsentDict = Record<string, never>;

export interface DictBySurface {
  venue: VenueDict;
  "venue-editor": VenueEditorDict;
  memories: MemoriesDict;
  resolver: ResolverDict;
  consent: ConsentDict;
}

export type Surface = keyof DictBySurface;
