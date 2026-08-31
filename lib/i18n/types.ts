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
  galleryCarouselAria: string; // the keyboard-scrollable carousel region
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
  // reservation zones + request semantics (TASK-43). The disclaimer keeps the
  // hard rule visible to the guest: a submission is a REQUEST the owner
  // confirms, never a booking the software promises.
  fieldZone: string;
  fieldDesiredAt: string;
  reservationZoneFullSuffix: string; // appended to a full zone's option label
  reservationAllFull: string; // replaces the form when every zone is full
  reservationDisclaimer: string;
  // reservation backend errors (ConvexError data shown on the public form).
  reservationUnavailable: string;
  reservationClosed: string;
  reservationDeadlinePassed: string;
  reservationFull: string;
  reservationZoneRequired: string;
  reservationZoneInvalid: string;
  reservationZoneFull: string;
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
  scheduleLimitReached: string; // "… {max} …" — the Basic active-event ceiling
  liveConflict: string;
  blockNotAllowed: string;
  // TASK-43 — owner-side reservation-workflow errors (venueReservations.ts).
  resRequestNotFound: string;
  resConfirmFull: string;
  archiveNotEnded: string;
  archiveAssetInvalid: string;
  archiveOverCap: string; // "… {max} …" — same cap as memories.archiveOverCap
  endNotLive: string;
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
  // TASK-43 — plan gating in the palette: blocks outside the plan's allow-list
  // are NOT offered; this one-liner says why the palette is shorter.
  blocksPremiumNote: string;
  blockPremiumChip: string; // chip on an existing block the plan no longer allows
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
  // --- TASK-12: block property panels + page panels --------------------------
  // Shared field chrome.
  pxValue: string; // "{value} px"
  inheritOption: string;
  contentSectionHeading: string;
  headingLabel: string;
  headingPlaceholder: string; // "… {fallback}"
  // Shared base section (all twelve panels).
  baseSectionHeading: string;
  baseVisibleLabel: string;
  baseResponsiveMobile: string;
  baseResponsiveDesktop: string;
  baseSizeLabel: string;
  sizeFull: string;
  sizeWide: string;
  sizeNarrow: string;
  baseAlignmentLabel: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  baseSpacingTop: string;
  baseSpacingBottom: string;
  baseRadiusLabel: string;
  baseBorderWidth: string;
  baseBorderColor: string;
  baseShadowLabel: string;
  shadowXLabel: string;
  shadowYLabel: string;
  shadowBlurLabel: string;
  shadowOpacityLabel: string;
  shadowColorLabel: string;
  baseSurfaceLabel: string;
  surfaceNone: string;
  surfaceCard: string;
  surfaceCustom: string;
  surfaceCustomColor: string;
  baseColorsHeading: string;
  colorTitleLabel: string;
  colorBodyLabel: string;
  colorAccentLabel: string;
  baseTypographyHeading: string;
  typoFontLabel: string;
  typoHeadingWeight: string;
  typoBodyWeight: string;
  typoScaleLabel: string;
  scaleSmall: string;
  scaleMedium: string;
  scaleLarge: string;
  weight400: string;
  weight500: string;
  weight600: string;
  weight700: string;
  baseAnimationLabel: string;
  animationNone: string;
  animationFadeUp: string;
  animationReveal: string;
  // Item lists (gallery, programme, price list, profiles).
  itemCapCount: string; // "{count} / {max}"
  itemCapReached: string; // "… ({max}) …"
  itemRemoveAria: string; // "… {name}"
  itemDragAria: string; // "… {name}"
  itemUntitled: string;
  requiredFieldError: string;
  // Media upload.
  uploadImageAction: string;
  uploadReplaceAction: string;
  uploadRemoveAction: string;
  uploadVideoAction: string;
  uploadProgress: string; // "… {percent}%"
  uploadFailed: string;
  uploadRetryAction: string;
  uploadInvalidImage: string;
  uploadInvalidVideo: string;
  uploadTooLarge: string; // "… {max} MB"
  // countdown panel.
  countdownTargetLabel: string;
  countdownTargetEvent: string;
  countdownTargetCustom: string;
  countdownCustomTimeLabel: string;
  countdownUnitsLabel: string;
  unitDays: string;
  unitHours: string;
  unitMinutes: string;
  unitSeconds: string;
  countdownStyleLabel: string;
  countdownStyleDigits: string;
  countdownStyleCards: string;
  countdownStyleMinimal: string;
  countdownDoneLabel: string;
  countdownDoneHide: string;
  countdownDoneMessage: string;
  countdownMessageLabel: string;
  // eventDateTime panel.
  dtStartLabel: string;
  dtEndLabel: string;
  dtInheritNote: string;
  dtVenueNameLabel: string;
  dtAddressLabel: string;
  dtShowCalendarLabel: string;
  dtGoogleLabel: string;
  dtIcsLabel: string;
  dtOrderError: string;
  // programTimeline panel.
  programLayoutLabel: string;
  programLayoutTimeline: string;
  programLayoutList: string;
  programLayoutGrid: string;
  programShowTimes: string;
  programItemsHeading: string;
  programAddItem: string;
  programItemTitleLabel: string;
  programItemSubtitleLabel: string;
  programItemTimeLabel: string;
  // map panel.
  mapKindLabel: string;
  mapKindAddress: string;
  mapKindCoords: string;
  mapAddressLabel: string;
  mapLatLabel: string;
  mapLngLabel: string;
  mapZoomLabel: string;
  mapPinLabel: string;
  mapDisplayLabel: string;
  mapDisplayStatic: string;
  mapDisplayEmbed: string;
  // gallery panel.
  galleryLayoutLabel: string;
  galleryLayoutGrid: string;
  galleryLayoutMasonry: string;
  galleryLayoutCarousel: string;
  galleryColumnsLabel: string;
  galleryGapLabel: string;
  galleryAspectLabel: string;
  aspectOriginal: string;
  aspectSquare: string;
  aspectLandscape: string;
  galleryLightboxLabel: string;
  galleryItemsHeading: string;
  galleryAddImage: string;
  galleryAltLabel: string;
  galleryCaptionLabel: string;
  // profileCards panel.
  profileLayoutLabel: string;
  profileLayoutGrid: string;
  profileLayoutList: string;
  profileColumnsLabel: string;
  profileItemsHeading: string;
  profileAddItem: string;
  profileNameLabel: string;
  profileRoleLabel: string;
  profileLinkLabel: string;
  profileLinkError: string;
  // priceList panel.
  priceCurrencyLabel: string;
  priceSectionsHeading: string;
  priceAddSection: string;
  priceSectionTitleLabel: string;
  priceAddItem: string;
  priceItemNameLabel: string;
  priceItemDescriptionLabel: string;
  priceItemPriceLabel: string;
  priceTotalCount: string; // "{count} / {max} …"
  // reservation panel.
  resFieldsHeading: string;
  resFieldName: string;
  resFieldPhone: string;
  resFieldEmail: string;
  resFieldPartySize: string;
  resFieldNote: string;
  // TASK-43 — zones editor: areas with a unit count, never numbered tables.
  resZonesHeading: string;
  resZonesNote: string; // explains zones + the 2h soft hold to the owner
  resZoneNameLabel: string;
  resZoneCapacityLabel: string;
  resZoneAdd: string;
  resZoneRemoveAria: string; // "… „{name}“"
  resZoneNamePlaceholder: string;
  resCapacityToggle: string;
  resCapacityLabel: string;
  resDeadlineToggle: string;
  resDeadlineLabel: string;
  resConfirmationLabel: string;
  // share panel.
  shareChannelsHeading: string;
  channelWhatsapp: string;
  channelViber: string;
  channelFacebook: string;
  channelX: string;
  channelCopy: string;
  shareMessageLabel: string;
  // pastEvents panel.
  pastLayoutLabel: string;
  pastLayoutGrid: string;
  pastLayoutList: string;
  pastLimitLabel: string;
  // richText panel.
  richTextLabel: string;
  richTextHint: string;
  // spacer panel.
  spacerHeightLabel: string;
  spacerDividerLabel: string;
  // event page panel.
  eventDisplayNameLabel: string;
  eventDisplayNameHint: string;
  eventScheduleLabel: string;
  eventNoSchedule: string;
  // style page panel.
  styleSpacingLabel: string;
  styleLineHeightLabel: string;
  styleEffectsHeading: string;
  styleTextShadow: string;
  styleLogoShadow: string;
  // background page panel.
  bgCategoryLabel: string;
  bgCatFlat: string;
  bgCatGradient: string;
  bgCatPattern: string;
  bgCatTexture: string;
  bgCatMedia: string;
  bgCatAnimation: string;
  bgFlatColor: string;
  bgGradientVariant: string;
  gradientLinear: string;
  gradientRadial: string;
  bgGradientStart: string;
  bgGradientEnd: string;
  bgGradientAngle: string;
  bgGradientCenterX: string;
  bgGradientCenterY: string;
  bgPatternVariant: string;
  patternGrid: string;
  patternChecker: string;
  patternDots: string;
  patternWaves: string;
  bgPatternBase: string;
  bgPatternColor: string;
  bgPatternScale: string;
  bgPatternOpacity: string;
  bgTextureVariant: string;
  texturePaper: string;
  textureLinen: string;
  textureWood: string;
  textureMetal: string;
  bgTextureBase: string;
  bgTextureTint: string;
  bgTextureIntensity: string;
  bgMediaTypeLabel: string;
  mediaImage: string;
  mediaVideo: string;
  bgMediaFit: string;
  fitCover: string;
  fitContain: string;
  bgMediaZoom: string;
  bgMediaPosX: string;
  bgMediaPosY: string;
  bgOverlayColor: string;
  bgOverlayOpacity: string;
  bgMediaMissing: string;
  bgAnimationVariant: string;
  bgAnimationAurora: string;
  bgAnimationSoftWaves: string;
  bgAnimationBase: string;
  bgAnimationAccent: string;
  bgAnimationSpeed: string;
  bgAnimationIntensity: string;
  bgAnimationRenderNote: string;
  // text page panel.
  textFontLabel: string;
  textHeadingWeight: string;
  textBodyWeight: string;
  textScaleLabel: string;
  textAlignmentLabel: string;
  // colour page panel.
  colorBrandNote: string;
  colorModeLabel: string;
  modeLight: string;
  modeDark: string;
  colorSchemeLabel: string;
  schemeComplementary: string;
  schemeAnalogous: string;
  schemeMonochromatic: string;
  schemeTriadic: string;
  schemeSplitComplementary: string;
  colorVariantLabel: string;
  variantContent: string;
  variantTonalSpot: string;
  variantVibrant: string;
  colorApplyAction: string;
  colorResetAction: string;
  colorPreviewHeading: string;
  rolePage: string;
  roleSurface: string;
  roleTitle: string;
  roleBody: string;
  roleAccent: string;
  roleBorder: string;
  roleFocus: string;
  roleIcon: string;
  // settings page panel.
  settingsPublicHeading: string;
  settingsOpenPublic: string;
  settingsLogoHeading: string;
  settingsLogoHint: string;
}

// venue-admin — the admin Venue provisioning screen (components/admin/venue-admin.tsx,
// app/admin/venue, TASK-11). Everything the operator sees while granting Venue to a
// business, choosing its plan tier, deactivating it, and jumping to the editor / public
// page. Separate surface from `venue-editor`: that is the owner-facing editor; this is
// the internal admin console. `{...}` placeholders go through fmt().
export interface VenueAdminDict {
  eyebrow: string;
  title: string;
  listLabel: string;
  listCount: string; // "Lokali ({count})"
  listEmpty: string;
  selectPrompt: string;
  loadError: string;
  // Venue state on a business.
  venueActive: string;
  venueInactive: string;
  venueNone: string;
  planLabel: string;
  planPickerLabel: string;
  planBasic: string;
  planPremium: string;
  // Current event summary.
  currentEventLabel: string;
  noEventYet: string;
  statusDraft: string;
  statusScheduled: string;
  statusLive: string;
  statusEnded: string;
  statusArchived: string;
  // Actions.
  grantAction: string;
  grantActionExisting: string; // reactivate an existing (inactive) Venue
  deactivateAction: string;
  openEditor: string;
  openPublic: string;
  // Toasts.
  grantSuccess: string;
  grantSuccessExisting: string;
  grantError: string;
  deactivateSuccess: string;
  deactivateError: string;
  // Deactivation confirm dialog.
  deactivateDialogTitle: string;
  deactivateDialogBody: string;
  deactivateConfirm: string;
  deactivateCancel: string;
}

// venue-panel — the owner's Venue section inside /[slug]/client-panel (TASK-13).
// The weekly workflow surface: see the current event and its lifecycle, know at
// a glance whether visitors see the latest published design, and run the
// lifecycle (create / duplicate / schedule / publish / end / archive). Separate
// from `venue-editor` (which edits ONE event's design) and from `venue-admin`
// (the internal operator console). Every action calls a convex/venue.ts mutation;
// server refusals surface as the venue-editor ConvexError strings, so this dict
// carries only the panel's own chrome + the plain-Serbian legibility copy.
// `{...}` placeholders go through fmt().
export interface VenuePanelDict {
  tabLabel: string;
  eyebrow: string;
  signOut: string;
  loadError: string;
  // Lifecycle status, plain Serbian (never a raw token).
  statusDraft: string;
  statusScheduled: string;
  statusLive: string;
  statusEnded: string;
  statusArchived: string;
  // The state banner (STEP 3 — is the public page showing the latest work?).
  // Each state = a one-line headline + a sentence naming what to press.
  bannerLiveCurrentTitle: string;
  bannerLiveCurrentBody: string;
  bannerLiveStaleTitle: string;
  bannerLiveStaleBody: string;
  bannerScheduledTitle: string; // "… {date}"
  bannerScheduledBody: string;
  bannerScheduledStaleTitle: string;
  bannerScheduledStaleBody: string;
  bannerPublishedUnscheduledTitle: string;
  bannerPublishedUnscheduledBody: string;
  bannerDraftTitle: string;
  bannerDraftBody: string;
  bannerEndedTitle: string;
  bannerEndedBody: string;
  // Compact visibility chip next to the event.
  chipVisible: string;
  chipHidden: string;
  chipUnpublished: string;
  // The current-event card.
  currentEventHeading: string;
  goesLiveLabel: string;
  endsLabel: string;
  ranLabel: string; // past window: "Održano"
  notScheduledLabel: string;
  unpublishedTag: string;
  // Actions.
  editAction: string;
  openPublicAction: string;
  publishAction: string;
  scheduleAction: string;
  rescheduleAction: string;
  endNowAction: string;
  archiveAction: string;
  createEventAction: string;
  duplicateAction: string;
  duplicateNamedAction: string; // "… {title}"
  // Empty state (owns Venue, no event yet).
  emptyTitle: string;
  emptyBody: string;
  // Needs-archive prompt.
  needsArchiveTitle: string;
  needsArchiveBody: string;
  // Past events list.
  pastEventsHeading: string;
  pastEventsEmpty: string;
  pastEventViewAction: string;
  pastEventArchivedOn: string; // "… {date}"
  // Create-event dialog.
  createDialogTitle: string;
  createDialogBody: string;
  createTitleLabel: string;
  createTitlePlaceholder: string;
  createSlugLabel: string;
  createSlugHint: string; // "… /{slug}"
  createSlugEmptyError: string;
  createConfirm: string;
  createCancel: string;
  createSuccess: string;
  createError: string;
  // Duplicate-event dialog.
  duplicateDialogTitle: string;
  duplicateDialogBody: string; // "… {title}"
  duplicateNoSource: string;
  duplicateSuccess: string;
  duplicateError: string;
  // Schedule dialog.
  scheduleDialogTitle: string;
  scheduleDialogBody: string;
  scheduleStartLabel: string;
  scheduleEndLabel: string;
  scheduleTimezoneNote: string;
  scheduleMissingTimes: string;
  scheduleConfirm: string;
  scheduleCancel: string;
  scheduleSuccess: string;
  scheduleError: string;
  // Publish confirm + revision conflict.
  publishDialogTitle: string;
  publishDialogBody: string;
  publishConfirm: string;
  publishSuccess: string;
  publishError: string;
  publishConflictTitle: string;
  publishConflictBody: string;
  publishConflictReload: string;
  // End-now dialog (destructive; explains the public page).
  endDialogTitle: string;
  endDialogBody: string;
  endConfirm: string;
  endCancel: string;
  endSuccess: string;
  endError: string;
  // Archive dialog (destructive; explains the public page + the photos note).
  archiveDialogTitle: string;
  archiveDialogBody: string;
  archivePhotosNote: string;
  archiveConfirm: string;
  archiveCancel: string;
  archiveSuccess: string;
  archiveError: string;
  // --- TASK-43: the reservations card ---------------------------------------
  // The owner decides — the card's copy must read as a request inbox, never as
  // a booking system's admin. Confirm opens a PREPARED WhatsApp/Viber message.
  resCardHeading: string;
  resCardEmpty: string;
  resCardNote: string; // the 2h-hold + owner-decides explainer
  resZoneUsage: string; // "{name}: {used}/{capacity}"
  resStatusPending: string;
  resStatusConfirmed: string;
  resStatusDeclined: string;
  resStatusExpired: string;
  resPartyLabel: string; // "{count} os."
  resReceivedAt: string; // "… {date}"
  resDesiredAt: string; // "… {date}"
  resConfirmAction: string;
  resDeclineAction: string;
  resWhatsappAction: string;
  resViberAction: string;
  // The prepared message the owner sends after confirming — never sent by the
  // software itself. Placeholders: {name}, {event}, {details} (zone/party/time
  // joined client-side, empty parts dropped).
  resMessageTemplate: string;
  resMessageNoZone: string; // {details} fallback when the request carries none
  resActionError: string;
  // --- TASK-43: the analytics card ------------------------------------------
  anaCardHeading: string;
  anaLockedNote: string; // Basic upsell — the read is Premium-gated on the server
  anaPageViews: string;
  anaReservationSubmits: string;
  anaRangeLabel7d: string;
  anaRangeLabel30d: string;
  anaBlocksHeading: string;
  anaBlocksEmpty: string;
  anaReservationsHeading: string;
  anaEmptyNote: string;
}

// memories — the Memories backend + guest surfaces (/m/[code]*). TASK-14 adds
// the ConvexError messages raised by convex/memories.ts and convex/cards.ts:
// guest-facing refusals surface on the /m upload UI (TASK-17), host-facing ones
// in the card/quota management UI. TASK-17 adds the guest screens' own chrome:
// the landing/upload flow, the guest's photos, and the public gallery. The new
// chrome is deliberately in the ti-form (a guest at a party, per the TASK-17
// brief's own copy — "možeš da dodaš još 2 slike"); the TASK-14 refusal strings
// keep their original Vi-form because convex/memories.ts raises them by value
// and the existing suites assert them. `{...}` placeholders go through fmt().
export interface MemoriesDict {
  // Guest-facing refusals (reserveUpload / myPhotos / deleteMyPhoto).
  spaceNotFound: string;
  spaceNotActive: string;
  notActivated: string; // no active entitlement resolves for the space
  windowNotOpen: string; // one_off: before windowStartAt
  windowClosed: string; // one_off: after windowEndAt
  sessionMissing: string; // one_off: no session (space never activated)
  sessionClosed: string;
  guestNotFound: string; // unknown guestKey — "scan the card again"
  quotaReached: string; // "… {limit} …"
  rateLimited: string;
  photoNotFound: string;
  // TASK-16 — the reservation retry/release contract + the client pipeline
  // (lib/memories-client). The client module surfaces these on upload items;
  // TASK-17 renders them on the guest screens.
  releaseUnavailable: string; // releaseReservation/renew on a non-releasable row
  notAnImage: string; // content sniffing rejected the picked file
  decodeFailed: string; // a sniffed-as-image file the decoder cannot read
  uploadFailed: string; // transient failure, auto-retries exhausted — retry available
  uploadRejected: string; // definitive server refusal — the slot was released
  // Host-facing refusals (grantQuota / createCard / retargetCard).
  grantInvalid: string;
  grantScopeMismatch: string;
  cardNotFound: string;
  cardTargetInvalid: string;
  cardUrlUnsafe: string;
  cardCodeGenerationFailed: string;
  cardBusinessMismatch: string;
  cardMintCountInvalid: string; // TASK-18 batch mint: count outside 1–50
  // TASK-18 host space controls (convex/memoriesHost.ts).
  spaceNotOneOff: string; // window controls on a recurring space
  spaceWindowInvalid: string; // new end not after the window start / now
  spaceStatusInvalid: string; // pause/resume on a closed/archived space
  // TASK-23 archive pinning (convex/memoriesArchive.ts).
  archiveEventNotFound: string; // the target event is missing
  archiveCrossTenant: string; // a photo's space is a different business
  archiveOverCap: string; // "… {max} …" — over ARCHIVE_MAX_ITEMS in one event
  archiveReorderMismatch: string; // reorder list is not a permutation
  // --- TASK-17: the guest screens (/m/[code], /moje, /galerija) --------------
  // Route metadata.
  metaLandingTitle: string; // "… {name}"
  metaMyPhotosTitle: string; // "… {name}"
  metaGalleryTitle: string; // "… {name}"
  // Landing hero (the open state).
  heroTagline: string;
  // Social proof — one line, a count of tonight's photos, never whose. Serbian
  // plural forms picked via srPluralCategory (lib/i18n/format.ts).
  socialProofZero: string;
  socialProofOne: string;
  socialProofFew: string; // "… {count} …"
  socialProofMany: string; // "… {count} …"
  // Remaining quota — in words, before the guest picks. Never a bar/fraction.
  quotaRemainingOne: string;
  quotaRemainingFew: string; // "… {count} …"
  quotaRemainingMany: string; // "… {count} …"
  // The one big control.
  addPhotosAction: string;
  addPhotoActionOne: string; // when exactly one slot remains
  // Per-item upload states, rendered honestly from the TASK-16 machine.
  itemQueued: string;
  itemPreparing: string;
  itemUploading: string; // "… {percent}%"
  itemUploadingAnnounce: string; // live-region variant, no percent stream
  itemProcessing: string;
  itemSaved: string; // shown ONLY when the server commit confirmed (state "ready")
  itemWaitingNetwork: string;
  itemRetrying: string;
  itemRetryAction: string;
  itemRemoveAction: string;
  itemPreviewAlt: string;
  // Deleting a saved photo (destructive → confirm).
  itemDeleteAction: string;
  deleteDialogTitle: string;
  deleteDialogBody: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleteError: string;
  actionError: string;
  sheetClose: string;
  sheetAria: string;
  // Per-photo visibility choice (only when the space allows it).
  visibilityEveryone: string;
  visibilityHostOnly: string;
  visibilityToggleAria: string;
  visibilityLocked: string; // setMyPhotoVisibility on a space without the choice
  // The seven designed states (Step 3).
  stateBeforeTitle: string;
  stateBeforeBody: string; // "… {date} … {time} …"
  stateBeforeBodyNoDate: string;
  stateClosedTitle: string;
  stateClosedBody: string;
  statePausedTitle: string;
  statePausedBody: string;
  stateNotActivatedTitle: string;
  stateNotActivatedBody: string;
  stateQuotaTitle: string;
  stateQuotaBody: string;
  stateNoIdentityTitle: string;
  stateNoIdentityBody: string;
  offlineBanner: string;
  // The guest's photos.
  tonightHeading: string;
  myPhotosTitle: string;
  myPhotosEmpty: string;
  myPhotosLink: string;
  photoAlt: string; // "… {index}"
  photoPendingLabel: string;
  // The shared gallery.
  galleryTitle: string;
  galleryLink: string;
  galleryEmpty: string;
  galleryLoading: string; // STEP 0: first page loading
  galleryLoadMore: string; // STEP 0: cursor "load more"
  backToUploadLink: string;
  // Footer.
  footerBrand: string;
  // --- TASK-20: retention window + the guest's own erasure (STEP 3/4) --------
  // Retention window, in plain words, on /moje (STEP 4 — visible to the guest,
  // not buried). "{days}" via fmt().
  retentionNoteMy: string;
  privacyLink: string; // link to the policy page (STEP 5)
  // "Obriši sve moje slike" (STEP 3) — destructive, so a confirm dialog that
  // spells out that it reaches the event archive too.
  wipeAllAction: string;
  wipeDialogTitle: string;
  wipeDialogBody: string;
  wipeConfirm: string;
  wipeCancel: string;
  wipeSuccess: string;
  wipeError: string;
  // STEP 1 — a small marker on the always-present consent notice when the
  // guest has not yet accepted the CURRENT version (the notice is "re-shown").
  consentUpdatedBadge: string;
}

// memories-admin — the admin Memories provisioning console
// (components/admin/venue-admin.tsx's sibling, app/admin/memories, TASK-18).
// Two provisioning channels: granting a venue subscription to an existing
// business, and creating a celebration (its own tenant). Plus the spaces list,
// deactivation, the partner referral view, and the partnership setup. The
// backend ConvexError messages raised by convex/memoriesAdmin.ts live here too
// (operator-facing prose). `{...}` placeholders go through fmt().
export interface MemoriesAdminDict {
  // Backend refusals (convex/memoriesAdmin.ts).
  businessNotFound: string;
  businessArchived: string;
  businessNotABusiness: string; // grant Memories only to kind:"business"
  unknownPlan: string;
  profileNotFound: string; // deactivate on a tenant with no Memories
  celebrationTitleRequired: string;
  celebrationContactRequired: string;
  celebrationDateRequired: string;
  windowOrderInvalid: string; // windowStartAt >= windowEndAt
  partnerRequired: string; // channel "partner" but no partner chosen
  partnershipNotFound: string; // partner has no active partnership
  partnershipScopeMismatch: string; // partnership doesn't cover Memories
  partnerAlreadyExists: string; // one active partnership per partner
  commissionInvalid: string; // percent outside 0–100
  // Screen chrome.
  eyebrow: string;
  title: string;
  loadError: string;
  tabSpaces: string;
  tabPartners: string;
  // Plan tiers.
  planBasic: string;
  planStandard: string;
  planPremium: string;
  // Modes / status / kinds — plain Serbian, never a raw token.
  modeRecurring: string;
  modeOneOff: string;
  statusActive: string;
  statusPaused: string;
  statusClosed: string;
  statusArchived: string;
  tenantBusiness: string; // "Lokal"
  tenantCelebration: string; // "Proslava"
  celebrationSvadba: string;
  celebrationRodjendan: string;
  celebrationKrstenje: string;
  celebrationVeridba: string;
  celebrationIspracaj: string;
  celebrationMaturska: string;
  celebrationGodisnjica: string;
  celebrationOther: string;
  channelDirect: string;
  channelPartner: string;
  channelAds: string;
  channelOther: string;
  // Grant-to-business card.
  grantHeading: string;
  grantBody: string;
  grantBusinessLabel: string;
  grantBusinessPlaceholder: string;
  grantNoBusinesses: string;
  grantNameLabel: string;
  grantNameHint: string;
  grantPlanLabel: string;
  grantAction: string;
  grantSuccess: string;
  grantSuccessExisting: string;
  grantError: string;
  // Create-celebration card.
  celebrationHeading: string;
  celebrationBody: string;
  celebrationKindLabel: string;
  celebrationTitleLabel: string;
  celebrationTitlePlaceholder: string;
  celebrationNamesLabel: string;
  celebrationNamesPlaceholder: string;
  celebrationDateLabel: string;
  celebrationWindowStartLabel: string;
  celebrationWindowEndLabel: string;
  celebrationWindowHint: string;
  celebrationVenueNameLabel: string;
  celebrationContactNameLabel: string;
  celebrationContactPhoneLabel: string;
  celebrationContactEmailLabel: string;
  celebrationChannelLabel: string;
  celebrationPartnerLabel: string;
  celebrationPartnerPlaceholder: string;
  celebrationPartnerNone: string;
  celebrationCommissionPreview: string; // "Provizija: {percent}%"
  celebrationPlanLabel: string;
  celebrationCreateAction: string;
  celebrationSuccess: string; // "… {code}"
  celebrationError: string;
  optionalSuffix: string;
  timezoneNote: string;
  // Spaces list.
  spacesHeading: string;
  spacesCount: string; // "Prostori ({count})"
  spacesEmpty: string;
  colName: string;
  colKind: string;
  colMode: string;
  colStatus: string;
  colPlan: string;
  colCode: string;
  colChannel: string;
  colPartner: string;
  colCommission: string;
  openGuestPage: string; // link to /m/{code}
  copyCodeAria: string;
  deactivateAction: string;
  deactivateSuccess: string;
  deactivateError: string;
  deactivateDialogTitle: string;
  deactivateDialogBody: string;
  deactivateConfirm: string;
  deactivateCancel: string;
  reactivateHint: string; // shown on an inactive tenant
  // Partners tab.
  partnersHeading: string;
  partnersCount: string; // "Partneri ({count})"
  partnersEmpty: string;
  addPartnerHeading: string;
  addPartnerBody: string;
  partnerBusinessLabel: string;
  partnerBusinessPlaceholder: string;
  partnerCommissionLabel: string;
  partnerNotesLabel: string;
  addPartnerAction: string;
  addPartnerSuccess: string;
  addPartnerError: string;
  partnerTermsLabel: string; // "Provizija {percent}% · od {date}"
  partnerReferralsHeading: string; // "Prodate proslave"
  partnerReferralsEmpty: string;
  partnerOwedLabel: string; // "Ukupno za isplatu"
  referralCommissionColumn: string;
  referralSnapshotNote: string;
}

// memories-panel — the host's Memories section inside /[slug]/client-panel
// (venue-panel-section.tsx's sibling, TASK-18 STEP 4). Where the host RUNS a
// space: sees tonight's / the celebration's counts, flips the two visibility
// switches (each with a plain sentence saying what turning it on does), extends
// or closes a one_off window, pauses/resumes, mints and manages the table
// cards, and reads the plan's real limits in words. Every action calls a
// convex mutation; server refusals surface as their Serbian ConvexError
// strings. `{...}` placeholders go through fmt().
export interface MemoriesPanelDict {
  tabLabel: string;
  eyebrow: string;
  signOut: string;
  loadError: string;
  // Mode / status labels.
  modeRecurring: string;
  modeOneOff: string;
  statusActive: string;
  statusPaused: string;
  statusClosed: string;
  statusArchived: string;
  // Space header + the paused/closed/expired banners.
  spaceStatusActiveTitle: string;
  spaceStatusActiveBody: string;
  spaceStatusPausedTitle: string;
  spaceStatusPausedBody: string;
  spaceStatusClosedTitle: string;
  spaceStatusClosedBody: string;
  expiredTitle: string;
  expiredBody: string; // what stops working when the plan expires
  // Current session (tonight / the celebration window).
  sessionHeadingRecurring: string; // "Večeras"
  sessionHeadingOneOff: string; // "Ova proslava"
  sessionPhotoCount: string; // "{count} slika"
  sessionGuestCount: string; // "{count} gostiju"
  sessionNoneRecurring: string; // no open session yet tonight
  sessionNoneOneOff: string;
  photosLabel: string;
  guestsLabel: string;
  // Upload window (one_off).
  windowHeading: string;
  windowOpensLabel: string;
  windowClosesLabel: string;
  windowOpenNow: string;
  windowClosedNote: string;
  extendWindowAction: string;
  closeWindowAction: string;
  extendDialogTitle: string;
  extendDialogBody: string;
  extendNewEndLabel: string;
  extendConfirm: string;
  extendSuccess: string;
  extendError: string;
  closeDialogTitle: string;
  closeDialogBody: string;
  closeConfirm: string;
  closeCancel: string;
  closeSuccess: string;
  closeError: string;
  timezoneNote: string;
  // Pause / resume the space.
  pauseAction: string;
  resumeAction: string;
  pauseSuccess: string;
  resumeSuccess: string;
  pauseError: string;
  pauseDialogTitle: string;
  pauseDialogBody: string;
  pauseConfirm: string;
  pauseCancel: string;
  // The two visibility switches — each a one-sentence explanation of what
  // turning it ON actually does (the host decides who sees guests' photos).
  visibilityHeading: string;
  publicGalleryLabel: string;
  publicGalleryExplain: string;
  publicGalleryLinkLabel: string; // link to /m/{code}/galerija
  wallLabel: string;
  wallExplain: string;
  wallOpenLink: string; // opens /zid/{code} on the room's screen
  wallOpenHint: string; // one line on how to project it
  // TASK-22 STEP 4 — the "nervous host" sub-switch, shown under the wall switch
  // once the wall is on. When on, a photo waits for the host's approval before
  // it can appear on the wall.
  wallApprovalLabel: string;
  wallApprovalExplain: string;
  visibilitySaveError: string;
  visibilityOn: string;
  visibilityOff: string;
  // Guest-choice note (read-only here — the host set it at provisioning).
  guestChoiceOn: string;
  guestChoiceOff: string;
  // Past nights (recurring).
  pastNightsHeading: string;
  pastNightsEmpty: string;
  nightPhotoCount: string; // "{count} slika"
  nightGuestCount: string; // "{count} gostiju"
  nightOpen: string; // badge for the still-open night
  // Plan legibility (STEP 5).
  planHeading: string;
  planTierLabel: string; // "Plan: {plan}"
  planPhotosPerGuest: string; // "{count} slika po gostu"
  planRetention: string; // "Čuvanje {days} dana"
  planResolution: string; // "Rezolucija do {px} px"
  planActiveNote: string;
  // TASK-20 STEP 4 — the retention window made concrete for the host.
  retentionHeading: string;
  retentionWindow: string; // "Slike se automatski brišu {days} dana od dodavanja."
  retentionOldest: string; // "Najstarija slika se briše {date}."
  retentionNoPhotos: string; // no live photos yet
  // TASK-20 STEP 0 — the host night gallery grid (paginated).
  galleryHeading: string;
  galleryEmpty: string;
  galleryLoadMore: string;
  galleryPhotoAlt: string; // "… {index}"
  galleryHostOnlyBadge: string; // a host_only photo, shown to the host
  // TASK-22 STEP 4 — per-photo wall approval in the host gallery, shown only
  // when the space runs approve-before-wall on an enabled wall.
  wallApproveAction: string; // release this photo to the wall
  wallUnapproveAction: string; // take it back off the wall
  wallPendingBadge: string; // committed but not yet approved for the wall
  wallOnBadge: string; // currently showing on the wall
  wallApproveError: string;
  photoDeleteAction: string;
  photoDeleteDialogTitle: string;
  photoDeleteDialogBody: string;
  photoDeleteConfirm: string;
  photoDeleteCancel: string;
  photoDeleteSuccess: string;
  photoDeleteError: string;
  // TASK-23 — the archive picker inside the host gallery: the host selects
  // photos of a night and they become permanent picks on the venue's public
  // page (the pastEvents block).
  archiveHint: string; // what selecting does; the first photo is the cover
  archiveSelectAction: string; // enter selection mode
  archiveSelectCancel: string; // leave selection mode
  archiveSelectedCount: string; // "{count} izabrano"
  archivePinAction: string; // "Prikaži na stranici"
  archiveEventLabel: string; // the target-event select label
  archiveEventsTruncated: string; // "… {max} …" — older events cut from the picker
  archiveNoEvents: string; // no events exist for this business yet
  archivePrivateReason: string; // why a host_only tile is not selectable
  archivePinnedBadge: string; // this photo is already on the page
  archiveUnpinAction: string; // remove it from the page
  archiveUnpinError: string;
  archiveCoverBadge: string; // "Naslovna" — the order-0 pick
  archiveSetCoverAction: string; // make this the cover (reorder to front)
  archiveReorderError: string;
  archiveCapNote: string; // "{count}/{max} na stranici"
  archivePinSuccess: string; // "{count} … «{event}»"
  archivePinError: string;
  archiveOpenPageLink: string; // open the event's public venue page
  archiveStripHeading: string; // "Na stranici lokala"
  archiveStripEmpty: string; // nothing pinned to this event yet
  // The table cards (STEP 3).
  cardsHeading: string;
  cardsBody: string;
  cardsEmpty: string;
  cardsCount: string; // "Kartice ({count})"
  cardLabelColumn: string;
  cardCodeColumn: string;
  cardScansColumn: string;
  cardGuestsColumn: string;
  cardScansValue: string; // "{count}"
  cardStatusDisabled: string;
  cardMostActive: string; // "Najaktivniji sto"
  openCardLink: string; // /r/{cardCode}
  mintHeading: string;
  mintCountLabel: string;
  mintStartLabel: string;
  mintPrefixLabel: string;
  mintPrefixPlaceholder: string;
  mintAction: string;
  mintSuccess: string; // "… {count} …"
  mintError: string;
  disableCardAction: string;
  disableCardSuccess: string;
  disableCardError: string;
  disableCardDialogTitle: string;
  disableCardDialogBody: string;
  disableCardConfirm: string;
  disableCardCancel: string;
  copyAria: string;
  copied: string;
  // Links out.
  guestPageLink: string; // open /m/{code}
  galleryLinkDisabled: string; // gallery link before TASK-19
  // Empty state — active profile but no space (shouldn't happen post-provision).
  noSpaceTitle: string;
  noSpaceBody: string;
  // TASK-21 — the ZIP export ("the couple's keepsake"). Trigger, live progress,
  // the download link and its lifetime, past exports, and the error-code map.
  exportHeading: string;
  exportBody: string;
  exportButton: string; // "Preuzmi sve (ZIP)"
  exportEmpty: string; // no ready photos to export yet
  exportQueued: string; // job accepted, work about to start
  exportBuilding: string; // "Priprema… {count} slika" (encoded so far)
  exportReady: string;
  exportDownload: string; // download the finished archive
  exportRebuild: string; // build a fresh archive
  exportRetry: string; // retry a failed job
  exportExpiresAt: string; // "Link važi do {date}"
  exportExpired: string; // link lifetime elapsed, archive purged
  exportPhotoCount: string; // "{count} slika u arhivi"
  exportSize: string; // "{size}" already-formatted human size
  exportInProgressNote: string; // only one export builds at a time
  exportLifetimeNote: string; // how long the link lives + what happens after
  exportPastHeading: string;
  exportOtherFolder: string; // archive folder for cardless photos ("Ostalo")
  exportStartError: string; // toast when the trigger mutation refuses
  // Failed-job machine codes → Serbian sentences (stored code, localized here).
  exportFailedPrefix: string; // "Priprema nije uspela: {reason}"
  exportErrorNoPhotos: string;
  exportErrorBuildFailed: string;
  exportErrorStorageFailed: string;
}

// memories-wall — the live wall projected in the room (/zid/[code], TASK-22).
// Deliberately tiny: the wall is furniture, not an app, so it carries almost no
// text — only what must be read from across a room, all ti-form (a party). The
// arrival label, the QR recruit line, the empty/waiting states, and one live
// count. `{...}` placeholders go through fmt().
export interface MemoriesWallDict {
  metaTitle: string; // "Zid uspomena · {name}" (noindex)
  liveLabel: string; // the live-dot label, e.g. "UŽIVO"
  newMoment: string; // the arrival label a just-uploaded photo gets
  // The persistent QR recruit — one short line beside the code.
  joinLine: string;
  // Empty/waiting states (nothing on the wall yet), shown large.
  waitingTitle: string;
  waitingBody: string; // default: the first photo appears here
  waitingApprovalBody: string; // approve-before-wall: nothing released yet
  // One live count line — Serbian plural via srPluralCategory.
  countOne: string; // "{count} uspomena večeras"
  countFew: string; // "{count} uspomene večeras"
  countMany: string; // "{count} uspomena večeras"
  photoAlt: string; // alt text for a wall photo
}

// resolver — the /r/nevazeca "card not active" page (TASK-14).
export interface ResolverDict {
  metaTitle: string;
  title: string;
  body: string;
  hint: string;
}

// consent — the versioned upload-consent notice (§2.10, TASK-17). Rendered
// ABOVE the upload control on the first screen of /m/[code]: uploading is the
// affirmative act that gives consent, so the notice must be read BEFORE the
// act. The version constant lives beside the copy (CONSENT_VERSION in
// sr/consent.ts) and is stamped onto memoriesGuests.consentVersion by
// reserveUpload — bump it whenever the meaning of this text changes.
// `{...}` placeholders go through fmt().
export interface ConsentDict {
  // The inline notice: who sees the photo, the archive right, retention.
  inlineWho: string;
  inlineArchive: string;
  inlineRetention: string; // "… {days} …"
  inlineAct: string; // names the affirmative act: uploading is the consent
  // The full policy, one tap away (a disclosure, never a modal).
  moreLabel: string;
  fullWho: string;
  fullVisibility: string;
  fullArchive: string;
  fullRetention: string; // "… {days} …"
  fullDelete: string;
  fullCookie: string;
}

// privacy — the Memories privacy policy page (/m/[code]/privatnost, TASK-20
// STEP 5). Plain-Serbian PRODUCT COPY, linked from the consent notice: lawful
// basis per data category, that guest photos are consent-based, that the cookie
// is strictly necessary, retention per tier, how to delete, and that the host
// is the controller while ScanMe is the processor. NOT legal advice — it needs
// a lawyer's review before launch. `{...}` placeholders go through fmt().
export interface PrivacyDict {
  metaTitle: string; // "… {name}"
  title: string;
  intro: string; // host = controller, ScanMe = processor
  lawfulHeading: string;
  photosHeading: string;
  photosBody: string; // consent, Art. 6(1)(a) — the act of uploading
  visibilityBody: string; // per-photo visibility is the consent granularity
  archiveBody: string; // the host may include shared photos in the event archive
  cookieHeading: string;
  cookieBody: string; // strictly necessary; only a random key
  analyticsHeading: string;
  analyticsBody: string; // legitimate interest; no IP, device category only
  retentionHeading: string;
  retentionBody: string; // "… {days} …"
  retentionTiers: string; // the 30/90/365 tiers named
  deleteHeading: string;
  deleteBody: string;
  deleteKeyNote: string; // key possession is the identity-verification story
  controllerHeading: string;
  controllerBody: string; // host controller, ScanMe processor, in plain words
  updatedLabel: string; // "… {version}"
  backLink: string;
}

export interface OfferDict {
  metaTitle: string;
  metaDescription: string;
  reviewMetaTitle: string;
  reviewMetaDescription: string;
  skipConfigurator: string;
  skipReview: string;
  eyebrow: string;
  title: string;
  intro: string;
  productsHeading: string;
  productsIntro: string;
  activeProduct: string;
  addProduct: string;
  selectedProduct: string;
  removeProduct: string;
  useCase: string;
  priceFrom: string;
  quantity: string;
  quantityMinusFive: string;
  quantityMinusOne: string;
  quantityPlusOne: string;
  quantityPlusFive: string;
  quantityInput: string;
  previewHeading: string;
  previewProduct: string;
  previewAlt: string;
  previewCustom: string;
  previewCustomBody: string;
  previewLogoNote: string;
  saasPickerLabel: string;
  saasService: string;
  saasTier: string;
  saasPeriod: string;
  orientationHeading: string;
  shapeHeading: string;
  backgroundHeading: string;
  finishHeading: string;
  materialHeading: string;
  woodTypeHeading: string;
  dimensionsHeading: string;
  designHeading: string;
  logoHeading: string;
  collapseControls: string;
  expandControls: string;
  portrait: string;
  landscape: string;
  compactBlackExtra: string;
  compactBlackReason: string;
  exactDimension: string;
  priceVatIncluded: string;
  basicReviewEyebrow: string;
  basicReviewTitle: string;
  basicReviewInstruction: string;
  templateIncluded: string;
  customDesign: string;
  customPrice: string;
  customBody: string;
  customBriefLabel: string;
  customBriefHint: string;
  logoFree: string;
  logoBody: string;
  logoChoose: string;
  logoReplace: string;
  logoRemove: string;
  logoFileHint: string;
  logoUploading: string;
  logoReady: string;
  logoError: string;
  calculation: string;
  summary: string;
  oneTime: string;
  subscription: string;
  productsSubtotal: string;
  saasSubscription: string;
  firstMonth: string;
  annual: string;
  totalNow: string;
  subtotalWithoutCustom: string;
  renewal: string;
  renewalAnnual: string;
  renewalMonthly: string;
  renewalNote: string;
  discount: string;
  confirm: string;
  sendInquiry: string;
  mobileCalculation: string;
  reviewTitle: string;
  reviewIntro: string;
  yourSelection: string;
  physicalProducts: string;
  service: string;
  tier: string;
  billingPeriod: string;
  design: string;
  logo: string;
  logoAdded: string;
  logoNotAdded: string;
  nextStep: string;
  nextStepBody: string;
  backToEdit: string;
  continueToContact: string;
  temporaryPrices: string;
  templateNames: Record<
    "basic" | "template-1" | "template-2" | "template-3" | "template-4" | "template-5",
    string
  >;
  serviceNames: Record<"review" | "links", string>;
  tierNames: Record<"starter" | "premium", string>;
  periodNames: Record<"monthly" | "annual", string>;
  dimensionNames: Record<"a4" | "a5" | "a6" | "small" | "medium" | "large", string>;
  shapeNames: Record<"square" | "rectangle" | "circle", string>;
  backgroundNames: Record<"white" | "black" | "transparent", string>;
  finishNames: Record<"matte" | "gloss", string>;
  materialNames: Record<"plastic" | "acrylic" | "metal", string>;
  materialDescriptions: Record<"plastic" | "acrylic" | "metal", string>;
  woodTypeNames: Record<"oak" | "walnut" | "beech", string>;
  products: Record<
    | "stickers"
    | "window-film"
    | "two-piece-stand"
    | "compact-stand"
    | "premium-engraved-stand",
    { name: string; subtitle: string; useCase: string }
  >;
}

export interface DictBySurface {
  venue: VenueDict;
  "venue-editor": VenueEditorDict;
  "venue-admin": VenueAdminDict;
  "venue-panel": VenuePanelDict;
  memories: MemoriesDict;
  "memories-admin": MemoriesAdminDict;
  "memories-panel": MemoriesPanelDict;
  "memories-wall": MemoriesWallDict;
  resolver: ResolverDict;
  consent: ConsentDict;
  privacy: PrivacyDict;
  offer: OfferDict;
}

export type Surface = keyof DictBySurface;
