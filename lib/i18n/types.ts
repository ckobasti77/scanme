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

import type { ProductType, ServiceType } from "../admin-v1/catalog";
import type {
  FairAdminIssueCode,
  FairAudienceQuestionStatus,
  FairBrandPassportProblem,
  FairClientSegment,
  FairConsentStatus,
  FairContactRequirement,
  FairDashboardDeadline,
  FairDashboardPhase,
  FairDashboardRule,
  FairDashboardSection,
  FairEmailDeliveryError,
  FairEmailDeliveryStatus,
  FairEventStatus,
  FairFollowUpField,
  FairFollowUpTemplateStatus,
  FairExhibitorCategory,
  FairLeadActivityGroup,
  FairLeadKind,
  FairModelStatus,
  FairPackageTier,
  FairParticipationStatus,
  FairPassportConfigStatus,
  FairPassportEligibleStatus,
  FairPreferredContact,
  FairPreEventCategory,
  FairPurgeCategory,
  FairPurgeCategoryStatus,
  FairPurgeMode,
  FairPurgeRunStatus,
  FairPurgeTrigger,
  FairSponsoredSnapshotStatus,
  FairSponsoredSnapshotTrigger,
  FairReportStatus,
  FairReportFormat,
  FairSurveyQuestionKind,
  FairSurveyStatus,
} from "../fair-contract";
import type { FairMapKey, FairMapZoneId } from "../fair-map/types";

export type Locale = "sr";

// Local interactive hall-map concept (/dev/sajam-cair). The surface is
// deliberately small and static, but its visible copy still follows the same
// typed-dictionary contract as production-facing ScanMe screens.
export interface EventMapDict {
  metaTitle: string;
  metaDescription: string;
  title: string;
  subtitle: string;
  findScanMe: string;
  mapHint: string;
  mapAria: string;
  filterLabel: string;
  filterAll: string;
  filterCars: string;
  filterMoto: string;
  filterFood: string;
  filterScanMe: string;
  entranceLabel: string;
  entranceNorth: string;
  entranceSouth: string;
  youAreHere: string;
  zoomIn: string;
  zoomOut: string;
  fitMap: string;
  boothAria: string;
  standLabel: string;
  selectedStand: string;
  brandsLabel: string;
  showRoute: string;
  hideRoute: string;
  scanMeStandBody: string;
  brandListTitle: string;
  brandListBody: string;
  foodPoint: string;
}

// Sajam 2026 map geometry (M0). Only the DEV overlay check on /dev/sajam-cair
// for now; the public map (M1) grows this surface.
export interface FairMapDict {
  overlayTitle: string;
  overlayIntro: string;
  overlayDraft: string;
  overlayAria: string;
  overlayCaption: string;
  overlayPlaceholder: string;
  events: Record<FairMapKey, string>;
  zones: Record<FairMapZoneId, string>;
  // M1 public map /sajam/[eventSlug]
  umbrellaTitle: string;
  metaTitle: string;
  metaDescription: string;
  notFoundTitle: string;
  notFoundBody: string;
  pageTitle: string;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  zoneSwitchLabel: string;
  mapAria: string;
  mapHint: string;
  zoomIn: string;
  zoomOut: string;
  fitMap: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchClear: string;
  searchEmpty: string;
  searchResultsLabel: string;
  searchEmptyHint: string;
  searchResultsOne: string;
  searchResultsFew: string;
  searchResultsMany: string;
  standAria: string;
  standLocation: string;
  standUnplaced: string;
  panelEmptyTitle: string;
  panelEmptyStepMap: string;
  panelEmptyStepSearch: string;
  panelEmptyStepList: string;
  panelEmptyResult: string;
  scanmeQuickTitle: string;
  closeDetail: string;
  modelsLabel: string;
  modelRowHint: string;
  listTitle: string;
  listEmpty: string;
  passportLabel: string;
  passportProgress: string;
  passportProgressAria: string;
  passportComplete: string;
  passportLoading: string;
  passportUnavailable: string;
  passportHint: string;
  scanmeStand: string;
  // N3: every exhibitor, shared locations, partner points, the rear area
  categories: Record<FairExhibitorCategory, string>;
  partnerLocation: string;
  areaLocation: string;
  locationAria: string;
  locationExhibitors: string;
  withoutLocation: string;
  withoutLocationNoZone: string;
  noModels: string;
  websiteLink: string;
  websiteLinkAria: string;
  // N4 map v2 (test map look, real data)
  introTitle: string;
  findScanMe: string;
  filtersLabel: string;
  filterAll: string;
  filterAria: string;
  exhibitorsOne: string;
  exhibitorsFew: string;
  exhibitorsMany: string;
  mapControlsLabel: string;
  selectedStand: string;
  standSummary: string;
  /** D1: a box of a split stand shows the whole group's area. */
  standSummaryGroup: string;
  scanmeBody: string;
  sheetHandle: string;
  sheetExpand: string;
  sheetCollapse: string;
  directoryTitle: string;
  directoryHint: string;
  uncategorized: string;
  placeButtonAria: string;
  landmarkEntrance: string;
  landmarkParking: string;
  displayHint: string;
  previewTitle: string;
  previewNotice: string;
  // M2 12 s Advanced rotation on the map/display
  rotationLabel: string;
  rotationAria: string;
  rotationWaiting: string;
  rotationPercent: string;
  rotationShowStand: string;
  rotationOpenModel: string;
  rotationStandPin: string;
}

export interface FairModelDict {
  metaTitle: string;
  metaDescription: string;
  mapNav: string;
  passportsNav: string;
  garageNav: string;
  garageCountAria: string;
  modelPhotoAlt: string;
  allSpecifications: string;
  audienceTitle: string;
  audienceBody: string;
  rateModel: string;
  submitInterest: string;
  requestTestDrive: string;
  saveToGarage: string;
  savedToGarage: string;
  garageStorageError: string;
  deferredFlowMessage: string;
  poweredBy: string;
  devLink: string;
  devPanelTitle: string;
  devModeLabel: string;
  devPhotoLabel: string;
  devAlignmentLabel: string;
  fixtureFree: string;
  fixtureStarter: string;
  fixtureAdvanced: string;
  fixtureWithPhoto: string;
  fixtureWithoutPhoto: string;
  alignmentLeft: string;
  alignmentRight: string;
  alignmentBottom: string;
  audienceMetaTitle: string;
  audienceMetaDescription: string;
  audienceBack: string;
  audienceEyebrow: string;
  audienceProgressAria: string;
  audienceQuestionOf: string;
  audienceResultsSoon: string;
  audienceSubmitting: string;
  audienceVoteError: string;
  audienceRetry: string;
  audienceNextQuestion: string;
  audienceBackToModel: string;
  devThresholdLabel: string;
  devResponseLabel: string;
  devQuestionCountLabel: string;
  fixtureBelowThreshold: string;
  fixturePublicResults: string;
  fixtureSuccess: string;
  fixtureError: string;
  fixtureOneQuestion: string;
  fixtureFiveQuestions: string;
  closeSheet: string;
  ratingSheetTitle: string;
  overallRatingLabel: string;
  ratingValueAria: string;
  designRatingLabel: string;
  specificationsRatingLabel: string;
  priceRatingLabel: string;
  saveRating: string;
  saveRatings: string;
  interestSheetTitle: string;
  testDriveSheetTitle: string;
  fullNameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  sendInterest: string;
  sendTestDrive: string;
  notFoundTitle: string;
  notFoundBody: string;
  backToScanMe: string;
  // N6 — the real model page (F3) and the lead forms wired to /api/fair/lead.
  /** Header lockup above the event name ("Sajam automobila"). */
  eventUmbrellaTitle: string;
  /** Alt of a real exhibitor photo (`modelPhotoAlt` describes the DEV demo photo). */
  modelPhotoAltPublic: string;
  unavailableTitle: string;
  unavailableBody: string;
  unavailableRetry: string;
  /** `{model}`, `{exhibitor}`. */
  leadIntroInterest: string;
  leadIntroTestDrive: string;
  leadOptional: string;
  leadEmailHint: string;
  leadPhoneHint: string;
  leadPhonePlaceholder: string;
  leadContactOneOf: string;
  leadContactEmail: string;
  leadContactPhone: string;
  leadContactBoth: string;
  leadConsentLegend: string;
  leadConsentAccept: string;
  leadConsentDecline: string;
  leadConsentDeclined: string;
  leadConsentNeeded: string;
  leadSubmitting: string;
  leadSuccessTitle: string;
  /** `{exhibitor}`. */
  leadSuccessBody: string;
  leadSuccessTestDrive: string;
  /** `{email}`. */
  leadSuccessConfirmation: string;
  leadDuplicateTitle: string;
  /** `{exhibitor}`. */
  leadDuplicateInterest: string;
  leadDuplicateTestDrive: string;
  leadErrorNameEmpty: string;
  leadErrorNameTooLong: string;
  leadErrorNameLink: string;
  leadErrorNameInvisible: string;
  leadErrorNameCharacters: string;
  leadErrorEmailFormat: string;
  leadErrorEmailRequired: string;
  leadErrorPhoneFormat: string;
  leadErrorPhoneRequired: string;
  leadErrorContactOneOf: string;
  leadErrorFields: string;
  /** `{seconds}`. */
  leadErrorRateLimited: string;
  leadErrorConsentChanged: string;
  leadReload: string;
  leadErrorClosed: string;
  leadErrorFailed: string;
  leadRetry: string;
  /** DEV preview page of the form states (/dev/sajam-forma). */
  leadPreviewTitle: string;
  // P3 (Aleksa, 5532038) — the model page actions on the real API, survey bubble, shared contact block.
  ratingSaving: string;
  ratingSaved: string;
  ratingsSaved: string;
  actionRetry: string;
  errorGeneric: string;
  errorRateLimited: string;
  errorEventClosed: string;
  errorUnavailable: string;
  audienceEmptyTitle: string;
  audienceEmptyBody: string;
  interestHeading: string;
  interestBody: string;
  testDriveHeading: string;
  testDriveBody: string;
  leadRequirementOneOf: string;
  leadRequirementEmail: string;
  leadRequirementPhone: string;
  leadRequirementBoth: string;
  leadPreferredEmail: string;
  leadPreferredPhone: string;
  leadSending: string;
  interestSent: string;
  testDriveSent: string;
  /** D1 (RN N2): the server answered `duplicate` — already received, no confirmation promised. */
  interestAlreadySent: string;
  testDriveAlreadySent: string;
  leadUnavailableTitle: string;
  leadUnavailableBody: string;
  contactOneOfLabel: string;
  consentGroupAria: string;
  consentAccept: string;
  consentDecline: string;
  rememberContact: string;
  savedContactUse: string;
  savedContactForget: string;
  savedContactAria: string;
  hintName: string;
  hintContact: string;
  hintEmail: string;
  hintPhone: string;
  hintConsent: string;
  hintDeclined: string;
  surveyHeadAria: string;
  surveyWho: string;
  surveyFreshOne: string;
  surveyFreshFew: string;
  surveyFreshMany: string;
  surveyFreshMeta: string;
  surveyRemainingOne: string;
  surveyRemainingMany: string;
  surveyPartialMeta: string;
  surveyReadyMessage: string;
  surveyReadyMeta: string;
  surveyDismiss: string;
  surveySheetTitle: string;
  surveySheetSubtitle: string;
  surveyProgressAria: string;
  surveyYes: string;
  surveyNo: string;
  surveyBack: string;
  surveySkip: string;
  surveyFinalEyebrow: string;
  surveyFinalTitleContact: string;
  surveyFinalBodyContact: string;
  surveyFinalTitle: string;
  surveyFinalBody: string;
  surveyEmptyEyebrow: string;
  surveyEmptyTitle: string;
  surveyEmptyBody: string;
  surveyBackToQuestions: string;
  surveySend: string;
  surveySendWithContact: string;
  surveySentToast: string;
  surveyContactFailedToast: string;
  surveyAlreadySent: string;
}

export interface FairGarageDict {
  metaTitle: string;
  metaDescription: string;
  umbrellaTitle: string;
  mapNav: string;
  passportsNav: string;
  garageNav: string;
  garageCountAria: string;
  pageTitle: string;
  pageBody: string;
  electromobilityShellTitle: string;
  eventTabsAria: string;
  electromobilityTitle: string;
  electromobilityDates: string;
  autoMotoTitle: string;
  autoMotoDates: string;
  eventUpcoming: string;
  savedCount: string;
  compareSelect: string;
  compareSelected: string;
  compareCount: string;
  compareAction: string;
  compareLimit: string;
  compareHintLongPress: string;
  selectionCount: string;
  selectionClose: string;
  selectionShare: string;
  selectionRemove: string;
  selectionRemoveTitle: string;
  selectionRemoveBody: string;
  selectionRemoveConfirm: string;
  selectionLimit: string;
  shareModelAria: string;
  shareTitle: string;
  shareText: string;
  shareCollectionTitle: string;
  shareCollectionText: string;
  sharePreparing: string;
  shareCopied: string;
  shareFailed: string;
  shareSheetTitle: string;
  shareSystem: string;
  shareWhatsApp: string;
  shareViber: string;
  shareCopy: string;
  sharedCollectionTitle: string;
  sharedCollectionBody: string;
  sharedCollectionExpired: string;
  sharedCollectionBack: string;
  sharedCollectionMore: string;
  sharedCollectionPartner: string;
  viewModel: string;
  removeModel: string;
  removeModelAria: string;
  removeConfirmTitle: string;
  removeConfirmBody: string;
  cancel: string;
  confirmRemove: string;
  emptyTitle: string;
  emptyBody: string;
  emptyAction: string;
  refreshError: string;
  offlineNotice: string;
  retry: string;
  savedSnapshot: string;
  storageNotice: string;
  storageUnavailable: string;
  passportsTitle: string;
  passportsBody: string;
  passportsOpen: string;
  passportProgress: string;
  passportComplete: string;
  passportMissing: string;
  passportFavoriteTitle: string;
  passportFavoriteSaved: string;
  passportFavoriteError: string;
  passportSaving: string;
  passportSaveBadge: string;
  passportBadgeSaved: string;
  passportBadgeError: string;
  savedBadgesTitle: string;
  favoriteLabel: string;
  sponsoredLabel: string;
  sponsoredView: string;
  sponsoredAdd: string;
  sponsoredAdding: string;
  sponsoredAdded: string;
  sponsoredAddError: string;
  sponsoredPhotoAlt: string;
  comparisonMetaTitle: string;
  comparisonTitle: string;
  comparisonBack: string;
  comparisonMissingTitle: string;
  comparisonMissingBody: string;
  comparisonPrice: string;
  comparisonSpecifications: string;
  comparisonLoadingSpecifications: string;
  comparisonUnavailable: string;
  noSpecification: string;
  modelPhotoAlt: string;
  poweredBy: string;
  devLink: string;
}

export interface FairPassportDict {
  metaTitle: string;
  metaDescription: string;
  umbrellaTitle: string;
  overviewTitle: string;
  overviewIntro: string;
  passportsNav: string;
  brandPassportTitle: string;
  openPassport: string;
  newStamp: string;
  progressAria: string;
  emptyTitle: string;
  emptyBody: string;
  loading: string;
  loadError: string;
  retry: string;
  backToPassports: string;
  modelUnlockedAria: string;
  modelLockedAria: string;
  findOnMap: string;
  revealStatus: string;
  completedTitle: string;
  favoriteTitle: string;
  favoriteIntro: string;
  favoriteSelectAria: string;
  favoriteSaved: string;
  favoriteError: string;
  poweredBy: string;
  devLink: string;
  devPanelTitle: string;
  devStampGroup: string;
  devAddStamp: string;
  devRemoveStamp: string;
  progressPendingAria: string;
  holdToUnlock: string;
  holdToUnlockAria: string;
  holdToEnd: string;
  holdHelper: string;
  holdPercent: string;
  unlockedLabel: string;
  unlockedStatus: string;
  finaleTitle: string;
  finaleBody: string;
  finalePickFavorite: string;
  finaleLater: string;
  finaleSealAria: string;
  sealBrandTop: string;
  sealBrandBottom: string;
  sealBrandRibbon: string;
  sealEventTop: string;
  sealEventBottom: string;
  sealEventCenter: string;
  sealEventRibbon: string;
  sealEventAria: string;
  favoriteResultsSoon: string;
  favoriteCrowdPick: string;
  favoritePercentAria: string;
  newStampEyebrow: string;
  newStampTitle: string;
  newStampAction: string;
  newStampAria: string;
  newStampDismiss: string;
  devFavoriteResults: string;
  devFavoriteBelow: string;
  devFavoritePublic: string;
  devNewStampPreview: string;
  devNewStampReplay: string;
}

export interface AdminDomainDict {
  services: Record<ServiceType, string>;
  products: Record<ProductType, string>;
  customDesign: string;
  friendTag: string;
}

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
  // TASK-37 bare splitter (convex/cards.ts, RFC-002 §2.4).
  cardSplitterItemsInvalid: string; // "… {min} … {max} …" — button count out of range
  cardLinksMemoriesBlocked: string; // Memories behind a Links-page splitter: the two-pattern refusal
  cardLinksOrderingBlocked: string; // TASK-63: ordering behind a Links-page splitter: the two-pattern refusal (RFC-004 §2.2, §6)
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

// resolver — the /r/nevazeca "card not active" page (TASK-14) and the bare
// splitter page /r/[cardCode]/izbor (TASK-37).
export interface ResolverDict {
  metaTitle: string;
  title: string;
  body: string;
  hint: string;
  splitterMetaTitle: string; // "… {name}" — the business name
  splitterHint: string; // the one line above the buttons
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
  domesticProduction: string;
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

// Per-location compatibility subpages + location sidebar
// (components/admin/location-admin.tsx, TASK-41, RFC-002 §2.6): drill into one
// location, see only the subpages for its ACTIVE services, and (for a multi-location
// account) a sidebar to jump between the account's locations. `{...}` via fmt().
export interface AdminLocationDict {
  // Chrome / header.
  eyebrow: string; // "Lokal"
  backToCustomers: string; // link back to the customers table
  backToCustomersAria: string;
  notFoundTitle: string; // the location / subpage 404 card
  notFoundBody: string;
  loadError: string;
  // Plan + status (reuse the customers vocabulary).
  planBasic: string;
  planPremium: string;
  planEnterprise: string;
  planNone: string; // account-less location ("—")
  periodMonthly: string;
  periodAnnual: string;
  periodNone: string;
  statusActive: string;
  statusInactive: string;
  // Location sidebar (Enterprise only).
  sidebarHeading: string; // "Lokali u lancu"
  sidebarServiceCount: string; // "{count} usluga"
  sidebarCurrentAria: string; // "{name} — trenutni lokal"
  // Subpage tab nav + bodies. The four per-location subpages.
  subpagesHeading: string; // "Podstranice"
  subpageLinks: string; // "ScanMe Links"
  subpageReview: string; // "Google Review"
  subpageVenue: string; // "ScanMe Venue"
  subpageMenuComing: string; // Page→Menu rename hook, false state: "ScanMe Page"
  subpageMenuLive: string; // Page→Menu rename hook, true state: "Meni"
  noActiveSubpages: string; // location owns no subpage-bearing service
  noActiveSubpagesBody: string;
  overviewHeading: string; // "Aktivne podstranice"
  overviewIntro: string;
  openSubpage: string; // "Otvori"
  // Per-service body: what this subpage is + links out to the real surfaces.
  bodyLinksIntro: string;
  bodyReviewIntro: string;
  bodyVenueIntro: string;
  openPublic: string; // "Otvori javnu stranicu"
  openEditor: string; // "Otvori editor"
  openClientPanel: string; // "Otvori klijentski panel"
  serviceStatusLabel: string; // "Status usluge"
  // A subpage reached for a service that is not active on this location.
  inactiveNoticeTitle: string; // "Usluga nije aktivna"
  inactiveNoticeBody: string;
}

// menu — the public ScanMe Menu page (RFC-003 §2.11; TASK-57). Everything a guest
// can read on the public menu page: route metadata, not-found state, navigation,
// the five group shapes' chrome, item detail bottom-sheet, pricing, and inquiry.
export interface MenuDict {
  // Route metadata (§2.11).
  metaTitle: string; // "{name} · Meni"
  metaDescription: string; // "Pogledajte meni i ponudu lokala {name}."
  // 404 / empty state.
  notFoundTitle: string; // "Meni nije pronađen"
  notFoundBody: string; // "Ovaj lokal još uvek nema objavljen meni ili link nije ispravan."
  emptyMenu: string; // "Meni se priprema."
  emptyGroup: string; // "U ovoj grupi trenutno nema stavki."
  // Navigation & accordion chrome (§2.1, §2.2).
  navAria: string; // the sticky scroll-spy nav's aria-label (§2.2, TASK-52)
  moreItems: string; // "Još {count}" — the caret label for collapsed items (§2.1)
  showLess: string; // the caret label when a group is expanded (§2.1, TASK-52)
  // Item badges & pricing (§2.3, §2.6).
  unavailableBadge: string; // the live "nema više" badge (§2.6)
  priceRsd: string; // "{price} RSD"
  poweredBy: string;
  // Variants & item details (§2.3, §2.5).
  variantsTitle: string; // "Varijante"
  variantsAria: string; // "… {name}"
  itemDetailsAria: string; // "Detalji o stavci {name}" (TASK-53)
  videoAria: string; // "Video za {name}" (TASK-53)
  sheetClose: string; // "Zatvori" (TASK-53)
  // Pairings "Ide uz" (§2.3, §2.5).
  pairingsTitle: string; // "Ide uz" (TASK-53)
  pairItemAria: string; // "Pogledaj stavku {name}" (TASK-53)
  // In-sheet inquiry action (§2.10, TASK-59 readiness).
  inquiryAction: string; // "Pošaljite upit"
  inquiryAria: string; // "Pošaljite upit za stavku {name}"
  inquirySuccess: string; // "Upit je poslat."
  inquiryError: string; // "Slanje upita nije uspelo."
}

// menu-admin — the admin Menu management and migration surface (RFC-003 §2.9, §2.11).
// Concierge onboarding / migration tracking (primljeno → u izradi → na potvrdi → objavljeno),
// PDF & Excel export actions, manual entitlement grant/deactivation, and
// unsaved-changes publish warning. `{...}` placeholders go through fmt().
export interface MenuAdminDict {
  // Screen chrome & navigation.
  eyebrow: string;
  title: string;
  description: string;
  loadError: string;
  backAction: string;

  // Activation states.
  menuActive: string;
  menuInactive: string;
  menuNone: string;
  menuDraft: string;
  menuPublished: string;

  // Actions.
  grantAction: string;
  grantActionExisting: string;
  deactivateAction: string;
  openEditor: string;
  openPublic: string;

  // Plans & Tiers (§2.7).
  planLabel: string;
  planPickerLabel: string;
  planBasic: string;
  planPremium: string;
  planEnterprise: string;

  // Migration SLA & stages (§2.9).
  migrationHeading: string;
  migrationSlaNote: string;
  stageLabel: string;
  stageReceived: string;
  stageInProgress: string;
  stageReview: string;
  stagePublished: string;
  stageChangeAction: string;
  stageChangeSuccess: string;
  stageChangeError: string;

  // Stats and metrics.
  groupsCount: string;
  itemsCount: string;
  lastPublished: string;
  neverPublished: string;

  // Export action (§2.9 PDF & Excel).
  exportHeading: string;
  exportPdfAction: string;
  exportExcelAction: string;
  exportPdfLoading: string;
  exportExcelLoading: string;
  exportSuccess: string;
  exportError: string;

  // Warnings (TASK-58: waiter "nema više" overwrite risk, §3 Risk 10).
  unsavedChangesWarning: string;
  overwriteAvailabilityConfirm: string;

  // TASK-58 — status block.
  statusLabel: string;
  draftDirtyNote: string;
  receivedLabel: string;
  deadlineLabel: string;
  deadlineOverdue: string;
  stageChangedAt: string;

  // TASK-58 — data entry on the client's behalf (the line import).
  importHeading: string;
  importHelp: string;
  importPlaceholder: string;
  importPreview: string;
  importWarnings: string;
  importAction: string;
  importReplaceConfirm: string;
  importSuccess: string;
  importError: string;
  importTooLarge: string;
  importEmpty: string;

  // TASK-58 — publish on the client's behalf.
  publishForClientAction: string;
  publishForClientSuccess: string;
  publishForClientKept: string;
  publishForClientError: string;

  // TASK-58 — export labels the writers stamp into the files (lib/menu-export).
  exportInternalNote: string;
  exportSubtitle: string;
  exportUnavailable: string;
  exportPageOf: string;
  exportColGroup: string;
  exportColShape: string;
  exportColName: string;
  exportColDescription: string;
  exportColProductType: string;
  exportColPrice: string;
  exportColVariants: string;
  exportColAvailable: string;
  exportColDaypart: string;
  exportYes: string;
  exportNo: string;
  exportSheetName: string;

  // Dialogs & toasts.
  grantSuccess: string;
  grantSuccessExisting: string;
  grantError: string;
  grantSlugConflict: string;
  deactivateSuccess: string;
  deactivateError: string;
  deactivateDialogTitle: string;
  deactivateDialogBody: string;
  deactivateConfirm: string;
  deactivateCancel: string;
}

// menu-editor — the Menu editor shell (components/menu/editor/**, TASK-51),
// FORKED from VenueEditorDict (RFC-003 §1.a). The first keys are the
// ConvexError messages of the Menu write backend (convex/menu.ts); the rest is
// the editor chrome: panels, the groups palette, the group/item/variant/pairing
// editor, dayparts, fields, uploads, preview, and the page-design panels.
// `{group}`, `{shape}`, `{name}`, `{count}`, `{max}`, `{state}`, `{percent}`,
// `{value}` are interpolated via fmt().
export interface MenuEditorDict {
  // convex/menu.ts
  menuNotFound: string;
  businessNotFound: string;
  serviceNotProvisioned: string;
  menuAlreadyExists: string;
  draftChanged: string;
  itemNotFound: string;
  // The five group shapes (components/menu/blocks/registry.tsx).
  shapeLabelLista: string;
  shapeLabelGalerija: string;
  shapeLabelTraka: string;
  shapeLabelIstaknuto: string;
  shapeLabelTabelaVarijanti: string;
  // Route metadata + loader / access screens.
  metaEditorTitle: string;
  editorLoading: string;
  signInTitle: string;
  signInBody: string;
  signInAction: string;
  unavailableTitle: string;
  unavailableBody: string;
  noMenuTitle: string;
  noMenuBody: string;
  createMenuAction: string;
  createMenuErrorFallback: string;
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
  // TASK-58 — the live "nema više" vs draft conflict dialog (RFC-003 §3 Risk 10).
  availabilityConflictTitle: string;
  availabilityConflictBody: string;
  availabilityKeepLive: string;
  availabilityOverwrite: string;
  toolsAria: string;
  closePanelAria: string;
  // Panel chrome.
  panelGroupsTitle: string;
  panelGroupsDescription: string;
  panelStyleTitle: string;
  panelStyleDescription: string;
  panelBackgroundTitle: string;
  panelBackgroundDescription: string;
  panelTextTitle: string;
  panelTextDescription: string;
  panelColorTitle: string;
  panelColorDescription: string;
  panelDaypartsTitle: string;
  panelDaypartsDescription: string;
  panelHelpTitle: string;
  panelHelpDescription: string;
  // The groups panel (palette).
  groupsListHeading: string;
  groupsAddHeading: string;
  groupCount: string; // "{count}"
  groupItemCount: string; // "{count} st."
  groupsEmpty: string;
  addGroupAria: string; // "… „{shape}“"
  groupItemAria: string; // "… „{group}“ …"
  dragHandleAria: string; // "… „{group}“"
  duplicateAria: string; // "… „{group}“"
  deleteAria: string; // "… „{group}“"
  deleteDialogTitle: string; // "… „{group}“?"
  deleteDialogBody: string;
  deleteConfirm: string;
  deleteCancel: string;
  groupDeletedToast: string;
  groupPanelTitle: string; // "… {group}"
  groupPanelPlaceholder: string;
  groupPanelBack: string;
  groupUntitled: string;
  // The group panel: base fields, shape hints, items, variants, pairings.
  groupTitleLabel: string;
  groupShapeLabel: string;
  groupIconLabel: string;
  groupIconInherit: string;
  groupDaypartLabel: string;
  daypartAlways: string;
  visibleCountHint: string; // "… {count} …"
  istaknutoHint: string;
  tabelaHint: string;
  itemsHeading: string;
  itemsAdd: string;
  itemNameLabel: string;
  itemDescriptionLabel: string;
  itemProductTypeLabel: string;
  itemProductTypeHint: string;
  itemProductTypePlaceholder: string;
  itemPriceLabel: string;
  itemPriceHint: string;
  itemIconLabel: string;
  itemIconInherit: string;
  itemAvailableLabel: string;
  itemAvailableHint: string;
  itemPhotoHeading: string;
  itemPhotoHint: string;
  variantsHeading: string;
  variantAdd: string;
  variantLabelLabel: string;
  variantLabelPlaceholder: string;
  variantPriceLabel: string;
  pairingsHeading: string;
  pairingAdd: string;
  pairingPickLabel: string;
  pairingPickPlaceholder: string;
  pairingNone: string;
  pairingRemoveAria: string; // "… „{name}“"
  pairingUnknown: string;
  itemUntitled: string;
  itemCapCount: string; // "{count} / {max}"
  itemCapReached: string; // "… ({max}) …"
  itemRemoveAria: string; // "… {name}"
  itemDragAria: string; // "… {name}"
  requiredFieldError: string;
  contentSectionHeading: string;
  // The dayparts panel.
  daypartsHeading: string;
  daypartsEmptyHint: string;
  daypartAdd: string;
  daypartKeyLabel: string;
  daypartKeyHint: string;
  daypartKeyPlaceholder: string;
  daypartLabelLabel: string;
  daypartLabelPlaceholder: string;
  daypartStartLabel: string;
  daypartEndLabel: string;
  daypartOverrideLabel: string;
  daypartOverrideNone: string;
  daypartOverrideHint: string;
  daypartUntitled: string;
  // Shared field chrome.
  pxValue: string; // "{value} px"
  inheritOption: string;
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
  previewGroupAria: string; // "{group}. …"
  previewEmptyGroup: string; // "… „{group}“ …"
  // Style page panel.
  styleSpacingLabel: string;
  styleLineHeightLabel: string;
  styleEffectsHeading: string;
  styleTextShadow: string;
  styleLogoShadow: string;
  shadowYLabel: string;
  shadowBlurLabel: string;
  shadowOpacityLabel: string;
  shadowColorLabel: string;
  // Background page panel (no media category: the Menu doc stores no page
  // media id — the category is not offered rather than half-built).
  bgCategoryLabel: string;
  bgCatFlat: string;
  bgCatGradient: string;
  bgCatPattern: string;
  bgCatTexture: string;
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
  bgAnimationVariant: string;
  bgAnimationAurora: string;
  bgAnimationSoftWaves: string;
  bgAnimationBase: string;
  bgAnimationAccent: string;
  bgAnimationSpeed: string;
  bgAnimationIntensity: string;
  bgAnimationRenderNote: string;
  // Text page panel.
  textFontLabel: string;
  textHeadingWeight: string;
  textBodyWeight: string;
  textScaleLabel: string;
  textAlignmentLabel: string;
  scaleSmall: string;
  scaleMedium: string;
  scaleLarge: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  weight400: string;
  weight500: string;
  weight600: string;
  weight700: string;
  // Colour page panel.
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
}

// ordering-admin — owner ordering configuration & items surface (RFC-004 §2.12, §2.15, TASK-64).
export interface OrderingAdminDict {
  cardHeading: string;
  cardDescription: string;
  lockedHeading: string;
  lockedNote: string;
  enabledLabel: string;
  enabledDescription: string;
  callWaiterLabel: string;
  callWaiterDescription: string;
  codeLabel: string;
  codeDescription: string;
  copyLink: string;
  linkCopied: string;
  itemsHeading: string;
  itemsDescription: string;
  emptyItems: string;
  addItemAction: string;
  editItemAction: string;
  deleteItemAction: string;
  itemNameLabel: string;
  itemNamePlaceholder: string;
  itemPriceLabel: string;
  itemPricePlaceholder: string;
  itemPriceNote: string;
  availableLabel: string;
  unavailableLabel: string;
  toggleAvailableSuccess: string;
  saveAction: string;
  cancelAction: string;
  dialogAddTitle: string;
  dialogEditTitle: string;
  confirmDeleteTitle: string;
  confirmDeleteDescription: string;
  errorNotEntitled: string;
  itemNotFound: string;
  itemNameRequired: string;
  configSaveSuccess: string;
  configSaveError: string;
  itemAvailabilityError: string;
  itemSaveSuccess: string;
  itemSaveError: string;
  itemDeleteSuccess: string;
  itemDeleteError: string;
}

// ordering — the GUEST ordering surface at /o/[code] (RFC-004 §2.1, §2.6,
// §2.15, TASK-66). Contains the two guest actions' copy and the SINGLE
// unavailable state that both causes of §2.6 render.
export interface OrderingDict {
  metaTitle: string;
  heading: string;
  intro: string;
  unavailableTitle: string;
  unavailableBody: string;
  callHeading: string;
  callAction: string;
  callSending: string;
  callReasonLegend: string;
  callSent: string;
  orderHeading: string;
  orderEmptyItems: string;
  orderNoteLabel: string;
  orderNotePlaceholder: string;
  orderAction: string;
  orderSending: string;
  orderSent: string;
  orderNothingSelected: string;
  itemPrice: string;
  qtyIncrease: string;
  qtyDecrease: string;
  qtyValue: string;
  selectedSummary: string;
  errorNotFound: string;
  errorInvalidGuest: string;
  errorNoTable: string;
  errorRateLimited: string;
  errorInvalidItems: string;
  errorInvalidReason: string;
  errorNoteTooLong: string;
  errorUnknown: string;
  // TASK-67 (RFC-004 §2.6, §2.8) — the live status and the deadline's action.
  statusHeading: string;
  statusKindOrder: string;
  statusKindCall: string;
  statusSent: string;
  statusAccepted: string;
  statusEnroute: string;
  statusCompleted: string;
  statusWithdrawn: string;
  statusLine: string;
  statusReason: string;
  statusNote: string;
  overdueTitle: string;
  overdueBody: string;
  withdrawAction: string;
  withdrawing: string;
  withdrawnNotice: string;
  errorRequestNotFound: string;
  errorNotWithdrawable: string;
}

// ordering-panel — the WAITER panel at /panel/[venueCode] (RFC-004 §2.7,
// §2.10, §2.15, TASK-68): PIN login, shift header, the live queue and the three
// transitions. The stale badge is the only cause-A wording in the product.
export interface OrderingPanelDict {
  metaTitle: string;
  pinHeading: string;
  pinIntro: string;
  pinLabel: string;
  pinSubmit: string;
  pinSubmitting: string;
  errorInvalidPin: string;
  errorLocked: string;
  errorNotFound: string;
  errorUnknown: string;
  signedOutClosed: string;
  signedOutAdopted: string;
  staffLine: string;
  staleBadge: string;
  pausedBadge: string;
  pauseAction: string;
  resumeAction: string;
  closeAction: string;
  closeConfirm: string;
  closeCancel: string;
  closing: string;
  soundBannerBody: string;
  soundBannerAction: string;
  newRequestAnnouncement: string;
  queueHeading: string;
  queueEmpty: string;
  kindCall: string;
  kindOrder: string;
  reasonLine: string;
  noteLine: string;
  line: string;
  statusSent: string;
  statusAccepted: string;
  statusEnroute: string;
  overdueBadge: string;
  acceptAction: string;
  enrouteAction: string;
  completeAction: string;
  working: string;
  errorInvalidTransition: string;
  errorRequestNotFound: string;
}

// TASK-72 — admin console for printed cards (create / batch / retarget / list).
// Chrome strings only; the card refusal sentences (Links→Memories, unsafe URL,
// splitter bounds, …) already live on the `memories` surface and surface verbatim.
export interface CardsAdminDict {
  navLabel: string;
  pageTitle: string;
  pageIntro: string;
  businessLabel: string;
  businessPlaceholder: string;
  businessLoading: string;
  selectBusinessPrompt: string;
  cardsHeading: string;
  cardsCount: string;
  colLabel: string;
  colCode: string;
  colTarget: string;
  colScans: string;
  colStatus: string;
  colActions: string;
  emptyCards: string;
  statusActive: string;
  statusDisabled: string;
  kindMemoriesSpace: string;
  kindVenue: string;
  kindEvent: string;
  kindServicePage: string;
  kindUrl: string;
  kindSplitter: string;
  kindMenu: string;
  kindTableOrdering: string;
  targetBusinessPage: string;
  targetUnset: string;
  splitterButtonsLabel: string;
  createAction: string;
  createTitle: string;
  createDescription: string;
  labelLabel: string;
  labelPlaceholder: string;
  kindLabel: string;
  referenceLabel: string;
  chooseReferencePlaceholder: string;
  urlLabel: string;
  urlPlaceholder: string;
  spacePlaceholder: string;
  eventPlaceholder: string;
  profilePlaceholder: string;
  noReferenceNeeded: string;
  submitCreate: string;
  working: string;
  splitterHeading: string;
  splitterButtonKindLabel: string;
  splitterButtonTextLabel: string;
  splitterButtonTextPlaceholder: string;
  addButton: string;
  removeButton: string;
  splitterHint: string;
  batchAction: string;
  batchTitle: string;
  batchDescription: string;
  batchPrefixLabel: string;
  batchPrefixPlaceholder: string;
  batchCountLabel: string;
  batchStartLabel: string;
  batchKindLabel: string;
  batchPreview: string;
  submitBatch: string;
  batchDefaultPrefix: string;
  retargetAction: string;
  retargetTitle: string;
  retargetDescription: string;
  retargetWarning: string;
  submitRetarget: string;
  disableAction: string;
  disableConfirm: string;
  disabledBadge: string;
  printAction: string;
  printTitle: string;
  urlHeading: string;
  copyLink: string;
  copied: string;
  copyAria: string;
  qrAlt: string;
  orderingMissingHint: string;
  noSpacesHint: string;
  noEventsHint: string;
  noProfilesHint: string;
  createSuccess: string;
  batchSuccess: string;
  retargetSuccess: string;
  disableSuccess: string;
  genericError: string;
  businessNotFound: string;
  batchCountInvalid: string;
}

export interface AdminV1Dict {
  skipToContent: string;
  adminNavigationAria: string;
  adminUtilitiesAria: string;
  mobileNavigationTitle: string;
  mobileNavigationDescription: string;
  openMobileNavigation: string;
  navDashboard: string;
  navClients: string;
  navInbox: string;
  /** Admin UX Z1 — Pošta (each admin's own Zoho mailbox). */
  navMail: string;
  navTasks: string;
  navOperations: string;
  navServices: string;
  navEvents: string;
  navFinance: string;
  navTeam: string;
  navProducts: string;
  navQrCodes: string;
  navOrders: string;
  navLinks: string;
  navReview: string;
  navMenu: string;
  globalSearch: string;
  globalSearchUnavailable: string;
  settings: string;
  notifications: string;
  notificationsEmpty: string;
  currentProfile: string;
  profileFallback: string;
  signOut: string;
  dashboardTitle: string;
  dashboardEmptyTitle: string;
  dashboardEmptyBody: string;
  dashboardCountZero: string;
  dashboardCountOne: string;
  dashboardCountMany: string;
  dashboardCountUnavailable: string;
  dashboardScopeLabel: string;
  dashboardScopeAll: string;
  dashboardScopeMine: string;
  dashboardSignalUrgent: string;
  dashboardSignalToday: string;
  dashboardSignalWaitingClient: string;
  dashboardSignalCalm: string;
  dashboardSignalCalmHelp: string;
  dashboardReactionTitle: string;
  dashboardReactionHint: string;
  dashboardReactionEmptyTitle: string;
  dashboardReactionEmptyBody: string;
  dashboardProjectionUnavailableTitle: string;
  dashboardProjectionUnavailableBody: string;
  dashboardOpenSource: string;
  dashboardResolve: string;
  dashboardSnooze: string;
  dashboardSnoozeTitle: string;
  dashboardSnoozeReason: string;
  dashboardSnoozeReasonPlaceholder: string;
  dashboardSnoozeUntil: string;
  dashboardSnoozeConfirm: string;
  dashboardResolveTitle: string;
  dashboardResolveNote: string;
  dashboardResolveNotePlaceholder: string;
  dashboardResolveConfirm: string;
  dashboardCancel: string;
  dashboardMutationError: string;
  dashboardMoreActions: string;
  dashboardUnassigned: string;
  dashboardCauseSubscription: string;
  dashboardCauseTask: string;
  dashboardCauseOrder: string;
  dashboardCauseQrNfc: string;
  dashboardCauseEmail: string;
  dashboardCauseActivation: string;
  dashboardCauseManual: string;
  dashboardCauseOther: string;
  dashboardSubscriptionsTitle: string;
  dashboardSubscriptionsTotal: string;
  dashboardSubscriptionsActive: string;
  dashboardSubscriptionsGrace: string;
  dashboardSubscriptionsSuspended: string;
  dashboardSubscriptionsInactive: string;
  dashboardSubscriptionsWarning: string;
  dashboardProductsTitle: string;
  dashboardProductsTotal: string;
  dashboardProductsActive: string;
  dashboardProductsInactive: string;
  dashboardProductsProblem: string;
  dashboardProductsQr: string;
  dashboardProductsNfc: string;
  dashboardProductsProblemChannels: string;
  dashboardFinanceTitle: string;
  dashboardFinanceCollected: string;
  dashboardFinanceExpected: string;
  dashboardFinanceProfit: string;
  dashboardFinanceProfitUnavailable: string;
  dashboardFinanceOpen: string;
  dashboardTasksTitle: string;
  dashboardTasksToday: string;
  dashboardTasksOverdue: string;
  dashboardTasksMine: string;
  dashboardTasksEmpty: string;
  dashboardTasksOpen: string;
  dashboardInboxTitle: string;
  dashboardInboxEmpty: string;
  dashboardInboxOpen: string;
  dashboardInboxProviderUnavailable: string;
  dashboardInboxProviderState: string;
  dashboardUnread: string;
  dashboardWidgetErrorTitle: string;
  dashboardWidgetErrorBody: string;
  dashboardFixtureBadge: string;
  dashboardFixtureDescription: string;
  moduleUnavailableTitle: string;
  moduleUnavailableBody: string;
  loadingLabel: string;
  emptyStateTitle: string;
  emptyStateBody: string;
  errorStateTitle: string;
  errorStateBody: string;
  retryAction: string;
  statusActive: string;
  statusWaiting: string;
  statusProblem: string;
  statusNeutral: string;
  summaryProducts: string;
  summaryQr: string;
  summaryNfc: string;
  summaryProblems: string;
  accessLoading: string;
  signInRequiredTitle: string;
  signInRequiredBody: string;
  openSignIn: string;
  adminResetTitle: string;
  adminResetBody: string;
  adminResetAction: string;
  adminResetOpen: string;
  adminResetError: string;
  adminSetupOpen: string;
  adminExistingAccount: string;
  accessDeniedTitle: string;
  accessDeniedBody: string;
  signOutAccount: string;
  fixtureBadge: string;
  fixtureTitle: string;
  fixtureDescription: string;
  fixturePanelStates: string;
  fixtureTableTitle: string;
  fixtureTableColumnState: string;
  fixtureTableColumnPurpose: string;
  fixtureTableActivePurpose: string;
  fixtureTableWaitingPurpose: string;
  fixtureTableProblemPurpose: string;
  fixtureIdentity: string;
  clientsTitle: string;
  clientsSubtitle: string;
  clientsSearchLabel: string;
  clientsSearchPlaceholder: string;
  clientsStatusLabel: string;
  clientsStatusAll: string;
  clientsStatusActive: string;
  clientsStatusArchived: string;
  clientsSortLabel: string;
  clientsSortUrgency: string;
  clientsSortName: string;
  clientsSortRecent: string;
  clientsTableCaption: string;
  clientsColSignal: string;
  clientsColClient: string;
  clientsColContact: string;
  clientsColVenues: string;
  clientsColServices: string;
  clientsColActivity: string;
  clientsColActions: string;
  clientsSignalNone: string;
  clientsSignalBlocking: string;
  clientsSignalWarning: string;
  clientsSignalInformation: string;
  clientsPremiumActive: string;
  clientsPremiumGrace: string;
  clientsEmailLabel: string;
  clientsPhoneLabel: string;
  clientsContactMissing: string;
  clientsMoreVenues: string;
  clientsServiceLinks: string;
  clientsServiceReview: string;
  clientsServiceMenu: string;
  clientsServiceActive: string;
  clientsServiceWarning: string;
  clientsServiceGrace: string;
  clientsServiceSuspended: string;
  clientsServiceInactive: string;
  clientsServiceProblem: string;
  clientsServiceAbsent: string;
  clientsServiceExpand: string;
  clientsServiceCollapse: string;
  clientsServiceDetailsTitle: string;
  clientsActivityNone: string;
  clientsActivityBlocking: string;
  clientsActivityWarning: string;
  clientsActivityInformation: string;
  clientsActions: string;
  clientsOpenPanel: string;
  clientsPanelUnavailable: string;
  clientsOpenProfile: string;
  clientsLoadMore: string;
  clientsLoadingMore: string;
  clientsEmptyTitle: string;
  clientsEmptyBody: string;
  clientsNoResultsTitle: string;
  clientsNoResultsBody: string;
  clientsErrorTitle: string;
  clientsErrorBody: string;
  clientsRetry: string;
  clientsProfilePendingTitle: string;
  clientsProfilePendingBody: string;
  clientsFixtureBadge: string;
  clientsFixtureDescription: string;
  clientProfileBack: string;
  clientProfileSubtitle: string;
  clientProfileVenues: string;
  clientProfileProblems: string;
  clientProfileProblemCountCapped: string;
  clientProfileArchived: string;
  clientProfilePremiumActive: string;
  clientProfilePremiumGrace: string;
  clientProfilePremiumSuspended: string;
  clientProfilePremiumInactive: string;
  clientProfileNoPremium: string;
  clientProfileContacts: string;
  clientProfileContactSelect: string;
  clientProfileDefaultContact: string;
  clientProfileOwnerContact: string;
  clientProfileInactiveContact: string;
  clientProfileSetDefault: string;
  clientProfileAddContact: string;
  clientProfileEditContact: string;
  clientProfileDeactivateContact: string;
  clientProfileReactivateContact: string;
  clientProfileContactFirstName: string;
  clientProfileContactLastName: string;
  clientProfileContactPosition: string;
  clientProfileContactEmail: string;
  clientProfileContactPhone: string;
  clientProfileSaveContact: string;
  clientProfileCancel: string;
  clientProfileWebsite: string;
  clientProfileWebsiteEmpty: string;
  clientProfileWebsiteAdd: string;
  clientProfileWebsiteEdit: string;
  clientProfileWebsiteSave: string;
  clientProfileWebsiteOpen: string;
  clientProfileWebsitePlaceholder: string;
  clientProfileWebsiteInvalid: string;
  clientProfileWebsiteError: string;
  clientProfileConfirmDeactivate: string;
  clientProfileContactRequired: string;
  clientProfileContactInvalidEmail: string;
  clientProfileContactInvalidPhone: string;
  clientProfileMutationError: string;
  clientProfileSectionOverview: string;
  clientProfileSectionVenues: string;
  clientProfileSectionFinance: string;
  clientProfileSectionProducts: string;
  clientProfileSectionCommunication: string;
  clientProfileSectionActivity: string;
  clientProfileUrgentWork: string;
  clientProfileNoUrgentWork: string;
  clientProfileOpenContext: string;
  clientProfileResolve: string;
  clientProfileOrganization: string;
  clientProfileLegalEntities: string;
  clientProfileBrands: string;
  clientProfileVenueGroups: string;
  clientProfileTags: string;
  clientProfileFriendTag: string;
  clientProfileNoOrganizationData: string;
  clientProfileVenueSelect: string;
  clientProfileLoadMoreVenues: string;
  clientProfileVenueDetails: string;
  clientProfileVenueStatus: string;
  clientProfileVenueAddress: string;
  clientProfileVenueContact: string;
  clientProfileVenueContactAccount: string;
  clientProfileVenueContactOverride: string;
  clientProfileServices: string;
  clientProfileSubscription: string;
  clientProfileBillingMonthly: string;
  clientProfileBillingAnnual: string;
  clientProfilePaidThrough: string;
  clientProfileGraceEnds: string;
  clientProfileStartsAt: string;
  clientProfileNoSubscription: string;
  clientProfileProductsAtVenue: string;
  clientProfileColVenue: string;
  clientProfileColProducts: string;
  clientProfileProductsSummary: string;
  clientProfileProductsBody: string;
  clientProfileFinanceEmptyTitle: string;
  clientProfileFinanceEmptyBody: string;
  clientProfileCommunicationEmptyTitle: string;
  clientProfileCommunicationEmptyBody: string;
  clientProfileActivityTitle: string;
  clientProfileActivityEmpty: string;
  clientProfileLoadMore: string;
  clientProfileProblemTitle: string;
  clientProfileProblemHistory: string;
  clientProfileProblemAutomatic: string;
  clientProfileResolutionNote: string;
  clientProfileResolutionNotePlaceholder: string;
  clientProfileResolutionNoteRequired: string;
  clientProfileResolveProblem: string;
  clientProfileNoProblemHistory: string;
  clientProfileNotFoundTitle: string;
  clientProfileNotFoundBody: string;
  clientProfileErrorTitle: string;
  clientProfileErrorBody: string;
  clientProfileFixtureBadge: string;
  clientProfileFixtureDescription: string;
  clientProfileUnknown: string;
  clientProfileOneProblem: string;
  clientProfileTaxId: string;
  clientProfileRegistrationNumber: string;
  clientProfileOpenFinance: string;
  clientProfileOpenProducts: string;
  clientProfileOpenInbox: string;
  clientProfileOpenService: string;
}

export interface AdminSettingsDict {
  title: string; subtitle: string; general: string; subscriptions: string; payments: string; communication: string; pricing: string; referral: string;
  timezone: string; currency: string; policyVersion: string; readOnly: string; monthlyWarning: string; annualWarning: string; monthlyGrace: string; annualGrace: string; days: string; lifecycleNote: string;
  bankTransfer: string; supported: string; card: string; unavailable: string; cash: string; notConfigured: string; paymentNote: string;
  foundation: string; configured: string; inbound: string; needsConfiguration: string; notConnected: string; communicationNote: string;
  premiumReference: string; temporary: string; monthly: string; futurePrice: string; amount: string; validFrom: string; validUntil: string; reason: string; reasonPlaceholder: string; save: string; cancel: string; unsaved: string; saved: string; priceNote: string; agreementNote: string;
  referralNote: string; agreements: string; agreementAccount: string; agreementTarget: string; agreementKind: string; agreementReference: string; agreementPrice: string; agreementCreate: string; agreementEmpty: string; referralRegister: string; referrer: string; referred: string; referralEmpty: string; chooseAccount: string; chooseTarget: string; founders: string; enterprise: string; individual: string; standard: string; pending: string; qualified: string; rewarded: string; cancelled: string; friendWaiver: string; friendTag: string; friendWaiverCreate: string; friendWaiverNote: string; leaveDraftTitle: string; leaveDraftBody: string; leaveDraftStay: string; leaveDraftLeave: string; loading: string; error: string; invalidAmount: string; invalidDate: string; invalidReason: string; conflict: string; saveFailed: string; annual: string; serviceSubscription: string; from: string; until: string; lifetime: string; foundersNote: string; chooseFriend: string; invalidAgreement: string; agreementSaved: string; invalidWaiver: string; waiverSaved: string; invalidReferral: string; referralSaved: string; rewardAgreement: string; rewardNote: string; chooseReferral: string; rewardType: string; percentage: string; fixedAmount: string; basisPoints: string; invalidReward: string; rewardCreate: string; rewardSaved: string; colValidity: string; colPeriod: string; colStatus: string; previewBadge: string; previewDescription: string;
}

export interface AdminTasksDict {
  pageTitle: string;
  pageSubtitle: string;
  createAction: string;
  searchLabel: string;
  searchPlaceholder: string;
  tabAll: string;
  tabToday: string;
  tabOverdue: string;
  tabDeferred: string;
  tabCompleted: string;
  filterAssignee: string;
  filterClient: string;
  filterVenue: string;
  filterSubject: string;
  filterAll: string;
  noVenue: string;
  subjectNone: string;
  subjectAccount: string;
  subjectContact: string;
  subjectVenue: string;
  subjectConversation: string;
  subjectService: string;
  subjectSubscription: string;
  subjectOrder: string;
  subjectOrderLine: string;
  subjectPrintJob: string;
  subjectDelivery: string;
  subjectActionItem: string;
  tableCaption: string;
  colClient: string;
  colTask: string;
  colDue: string;
  colPriority: string;
  colAssignee: string;
  colStatus: string;
  openDetail: string;
  loadMore: string;
  loadingMore: string;
  emptyTitle: string;
  emptyBody: string;
  noResultsTitle: string;
  noResultsBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  statusOpen: string;
  statusInProgress: string;
  statusDeferred: string;
  statusCompleted: string;
  statusCancelled: string;
  priorityLow: string;
  priorityNormal: string;
  priorityHigh: string;
  priorityUrgent: string;
  dueNone: string;
  dueToday: string;
  dueOverdue: string;
  dueDate: string;
  dueInstant: string;
  createTitle: string;
  createDescription: string;
  clientLabel: string;
  contactLabel: string;
  venueLabel: string;
  conversationLabel: string;
  subjectLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  assigneeLabel: string;
  participantsLabel: string;
  priorityLabel: string;
  dueKindLabel: string;
  dueDateLabel: string;
  dueTimeLabel: string;
  cancel: string;
  save: string;
  saving: string;
  selectClient: string;
  selectAssignee: string;
  selectOptional: string;
  detailTitle: string;
  detailDescription: string;
  claim: string;
  saveContent: string;
  saveDue: string;
  addParticipant: string;
  removeParticipant: string;
  deferTitle: string;
  deferUntil: string;
  deferReason: string;
  deferReasonPlaceholder: string;
  deferAction: string;
  resumeAction: string;
  completeAction: string;
  cancelTaskAction: string;
  reopenAction: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  historyTitle: string;
  historyEmpty: string;
  historyLoadMore: string;
  participantCount: string;
  mutationError: string;
  createdSuccess: string;
  updatedSuccess: string;
  previewBadge: string;
  previewDescription: string;
  systemActor: string;
  adminActorFallback: string;
}

export interface AdminOrdersDict {
  pageTitle: string;
  pageSubtitle: string;
  previewBadge: string;
  previewDescription: string;
  tabActive: string;
  tabCompleted: string;
  tabArchived: string;
  searchLabel: string;
  searchPlaceholder: string;
  filterAll: string;
  filterAssignee: string;
  assigneeAll: string;
  filterPayment: string;
  filterDesign: string;
  filterFulfillment: string;
  filterProblems: string;
  sortLabel: string;
  sortNewest: string;
  sortOldest: string;
  sortSearchHint: string;
  tableCaption: string;
  colOrder: string;
  colClient: string;
  colState: string;
  colNext: string;
  colNoteProblem: string;
  colAssignee: string;
  colUpdated: string;
  openDetail: string;
  expandLines: string;
  collapseLines: string;
  linesTitle: string;
  quantityShort: string;
  multipleLocations: string;
  emptyTitle: string;
  emptyBody: string;
  noResultsTitle: string;
  noResultsBody: string;
  errorTitle: string;
  errorBody: string;
  loading: string;
  loadMore: string;
  detailTitle: string;
  detailDescription: string;
  clientSection: string;
  assigneeLabel: string;
  createdByLabel: string;
  axesSection: string;
  paymentSection: string;
  designSection: string;
  productionSection: string;
  qcSection: string;
  deliverySection: string;
  taskSection: string;
  notesSection: string;
  auditSection: string;
  blockedAction: string;
  nextPayment: string;
  nextDesign: string;
  nextProvisioning: string;
  nextPrinter: string;
  nextReceipt: string;
  nextQc: string;
  nextDelivery: string;
  nextDone: string;
  paymentAwaiting: string;
  paymentPaid: string;
  paymentReversed: string;
  designTemplateSelected: string;
  designInProgress: string;
  designAwaitingApproval: string;
  designApproved: string;
  fulfillmentAwaitingConditions: string;
  fulfillmentSmfAssigned: string;
  fulfillmentReadyForPrinter: string;
  fulfillmentAtPrinter: string;
  fulfillmentReceived: string;
  fulfillmentQualityControl: string;
  fulfillmentReadyForDelivery: string;
  fulfillmentInDelivery: string;
  fulfillmentDelivered: string;
  fulfillmentCancelled: string;
  priorityNormal: string;
  priorityHigh: string;
  priorityUrgent: string;
  problems: string;
  noProblems: string;
  lineProgress: string;
  smfPendingAdmin12: string;
  smfReady: string;
  printSnapshot: string;
  printerDestination: string;
  expectedReturn: string;
  printerMissing: string;
  printerNameLabel: string;
  printerNamePlaceholder: string;
  printerContactLabel: string;
  printerContactPlaceholder: string;
  savePrinter: string;
  printDraft: string;
  printSent: string;
  printPartiallyReceived: string;
  printReceived: string;
  printCancelled: string;
  activationSignal: string;
  activationNotPerformed: string;
  courierFeeNote: string;
  personalFeeNote: string;
  deliveryCourier: string;
  deliveryPersonal: string;
  deliveryDraft: string;
  deliveryInDelivery: string;
  deliveryDelivered: string;
  deliveryProblem: string;
  deliveryCancelled: string;
  taskOpen: string;
  taskInProgress: string;
  taskDeferred: string;
  taskCompleted: string;
  taskCancelled: string;
  eventMigrated: string;
  eventAssigned: string;
  eventPaymentRecorded: string;
  eventPaymentReversed: string;
  eventDesignChanged: string;
  eventDesignApproved: string;
  eventProvisioningRequested: string;
  eventSmfAssigned: string;
  eventPrintJobCreated: string;
  eventSentToPrinter: string;
  eventPrinterReceiptRecorded: string;
  eventQualityControlRecorded: string;
  eventDeliveryCreated: string;
  eventDeliveryStarted: string;
  eventDeliveryCompleted: string;
  eventDeliveryProblem: string;
  eventCancelled: string;
  eventArchived: string;
  eventNoteChanged: string;
  migrationVersion: string;
  paymentOf: string;
  paymentReversedAmount: string;
  noRecords: string;
  noNote: string;
  payRemaining: string;
  moveDesign: string;
  approveDesign: string;
  createPrintJob: string;
  sendToPrinter: string;
  receivePrint: string;
  qcPass: string;
  qcProblem: string;
  qcReasonPlaceholder: string;
  deliveryAddressLabel: string;
  deliveryAddressPlaceholder: string;
  deliveryMethodLabel: string;
  courierServiceLabel: string;
  courierServicePlaceholder: string;
  courierReferenceLabel: string;
  courierReferencePlaceholder: string;
  courierFeeLabel: string;
  createDelivery: string;
  startDelivery: string;
  completeDelivery: string;
  saveNote: string;
  saving: string;
  mutationError: string;
  previewApplyAction: string;
  previewMultipleLocations: string;
  previewProblemNote: string;
  previewStandardNote: string;
  previewQcReason: string;
  actionPaymentRequired: string;
  actionDesignRequired: string;
  actionQualityProblem: string;
  actionNextStep: string;
  actionReadyDelivery: string;
  actionPrinterLate: string;
  actionDeliveryProblem: string;
  actionDeliveryResolved: string;
  migrationPaymentAllocationRequired: string;
  migrationCancellationReviewRequired: string;
  migrationVenueInvalid: string;
  migrationBoundServiceMissing: string;
  migrationPhysicalSelectionInvalid: string;
}

export interface AdminFinanceDict {
  pageTitle: string;
  pageSubtitle: string;
  previewBadge: string;
  previewDescription: string;
  tabCollected: string;
  tabExpected: string;
  tabProfit: string;
  actualBadge: string;
  futureBadge: string;
  incompleteBadge: string;
  periodLabel: string;
  periodMonth: string;
  periodNextMonth: string;
  periodThree: string;
  periodSix: string;
  periodYear: string;
  periodAll: string;
  filterLabel: string;
  filterTotal: string;
  filterPhysical: string;
  filterSaas: string;
  filterPremium: string;
  filterLinks: string;
  filterReview: string;
  filterMenu: string;
  summaryCollected: string;
  summaryExpected: string;
  summaryProfit: string;
  summaryCurrentMonth: string;
  summaryNextMonth: string;
  grossReceived: string;
  refunds: string;
  reversals: string;
  directCosts: string;
  chartTitle: string;
  chartDescription: string;
  chartTableCaption: string;
  chartPeriod: string;
  chartAmount: string;
  undated: string;
  overdueKnown: string;
  priceUnavailable: string;
  methodsTitle: string;
  methodsDenominator: string;
  methodBank: string;
  methodCard: string;
  methodCash: string;
  methodOther: string;
  categoriesTitle: string;
  category: string;
  collected: string;
  expected: string;
  costs: string;
  profit: string;
  categoryPhysical: string;
  categorySaas: string;
  categoryPremium: string;
  categoryUnallocated: string;
  missingProduction: string;
  missingHosting: string;
  missingBackend: string;
  missingClassification: string;
  paymentsTitle: string;
  paymentsCaption: string;
  paymentClient: string;
  paymentDate: string;
  paymentMethod: string;
  paymentAllocation: string;
  paymentPeriod: string;
  paymentState: string;
  paymentOpen: string;
  paymentMonthly: string;
  paymentAnnual: string;
  paymentOneTime: string;
  paymentUnallocated: string;
  paymentRefunded: string;
  paymentReversed: string;
  paymentSettled: string;
  paymentReference: string;
  paymentActor: string;
  paymentAudit: string;
  loadMore: string;
  loadingMore: string;
  emptyTitle: string;
  emptyBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  costAction: string;
  costTitle: string;
  costDescription: string;
  costCategory: string;
  costProduction: string;
  costHosting: string;
  costBackend: string;
  costAmount: string;
  costOccurredAt: string;
  costCoveredStart: string;
  costCoveredEnd: string;
  costAccountId: string;
  costOrderId: string;
  costOrderLineId: string;
  costPrintJobId: string;
  costPrinterId: string;
  costSource: string;
  costNote: string;
  save: string;
  saving: string;
  cancel: string;
  mutationSuccess: string;
  mutationError: string;
  detailTitle: string;
  detailDescription: string;
  detailAllocations: string;
  detailAdjustments: string;
  detailNoAdjustments: string;
  refundAction: string;
  refundTitle: string;
  refundDescription: string;
  refundAmount: string;
  refundDate: string;
  refundReason: string;
  refundAllocationAmount: string;
  refundUnbalanced: string;
  profileTitle: string;
  profileDescription: string;
  profileOpenGlobal: string;
  profileObligations: string;
  profileDated: string;
  profileUndated: string;
  profileOverdue: string;
  profileLastPayments: string;
  profileNoPayments: string;
}

export interface AdminTeamDict {
  pageTitle: string;
  pageSubtitle: string;
  tabOverview: string;
  tabTasks: string;
  tabConversations: string;
  openTasks: string;
  overdueTasks: string;
  conversations: string;
  awaitingReaction: string;
  countCapped: string;
  selectMember: string;
  tasksTitle: string;
  conversationsTitle: string;
  openAllTasks: string;
  openAllConversations: string;
  colLatestMessage: string;
  reassign: string;
  claim: string;
  noTasks: string;
  noConversations: string;
  loading: string;
  errorTitle: string;
  errorBody: string;
  previewBadge: string;
  previewDescription: string;
}

export interface AdminProductsDict {
  pageTitle: string;
  pageSubtitle: string;
  venueSearchLabel: string;
  venueSearchPlaceholder: string;
  venueFilterLabel: string;
  venueFilterAll: string;
  venueFilterProblem: string;
  venueFilterActive: string;
  venueSortLabel: string;
  venueSortUrgency: string;
  venueTableCaption: string;
  colClient: string;
  colVenue: string;
  colCity: string;
  colProducts: string;
  colChannels: string;
  colServices: string;
  colStatus: string;
  selectVenue: string;
  premium: string;
  noVenueResultsTitle: string;
  noVenueResultsBody: string;
  venueEmptyTitle: string;
  venueEmptyBody: string;
  loadMore: string;
  loading: string;
  loadingMore: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  backToVenues: string;
  breadcrumb: string;
  smfRoot: string;
  productRange: string;
  products: string;
  qr: string;
  nfc: string;
  problems: string;
  unknownValue: string;
  healthHealthy: string;
  healthUnverified: string;
  healthBroken: string;
  inventorySearchLabel: string;
  inventorySearchPlaceholder: string;
  filterType: string;
  filterDesign: string;
  filterService: string;
  filterStatus: string;
  filterAll: string;
  filterTypeAll: string;
  filterDesignAll: string;
  filterDesignTemplate: string;
  filterDesignCustom: string;
  filterServiceAll: string;
  inventoryTableCaption: string;
  colSelect: string;
  colId: string;
  colProduct: string;
  colPosition: string;
  colQrNfc: string;
  colDestination: string;
  colUpdated: string;
  colActions: string;
  openProduct: string;
  selectProduct: string;
  noProductsTitle: string;
  noProductsBody: string;
  noSearchProductsTitle: string;
  noSearchProductsBody: string;
  productNoQr: string;
  productNoNfc: string;
  stateActive: string;
  stateInactive: string;
  stateProblem: string;
  stateAbsent: string;
  channelQr: string;
  channelNfc: string;
  channelState: string;
  channelReason: string;
  productTypeTwoPiece: string;
  productTypeCompact: string;
  productTypeSticker: string;
  productTypeWindowFilm: string;
  productTypePremiumEngraved: string;
  selectionTitle: string;
  selectedProducts: string;
  editSelection: string;
  clearSelection: string;
  mixedValue: string;
  bulkStatus: string;
  bulkQrState: string;
  bulkNfcState: string;
  bulkDestination: string;
  bulkServices: string;
  bulkPosition: string;
  change: string;
  noApplicableSelection: string;
  bulkLimit: string;
  confirmationTitle: string;
  confirmationBody: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  saveChanges: string;
  saving: string;
  cancel: string;
  changeSaved: string;
  mutationError: string;
  detailTitle: string;
  detailDescription: string;
  productIdentity: string;
  productDesign: string;
  productServices: string;
  productDestination: string;
  serviceLinks: string;
  serviceReview: string;
  serviceMenu: string;
  destinationService: string;
  destinationLinksSplitter: string;
  destinationGenericSplitter: string;
  destinationDynamicUrl: string;
  destinationLegacy: string;
  destinationHistory: string;
  channelHistory: string;
  placementHistory: string;
  scanAttribution: string;
  auditUpdated: string;
  noHistory: string;
  qrModuleTitle: string;
  qrModuleSubtitle: string;
  channelSearchLabel: string;
  channelSearchPlaceholder: string;
  bindingFilter: string;
  bindingAll: string;
  bindingDigital: string;
  bindingPhysical: string;
  kindFilter: string;
  kindAll: string;
  healthFilter: string;
  channelTableCaption: string;
  colCode: string;
  colKind: string;
  colContext: string;
  colHealth: string;
  technicalDetail: string;
  noChannelsTitle: string;
  noChannelsBody: string;
  previewBadge: string;
  previewDescription: string;
  fixtureIdentity: string;
}

export interface AdminSearchDict {
  pageTitle: string;
  pageSubtitle: string;
  searchView: string;
  activityView: string;
  searchLabel: string;
  searchPlaceholder: string;
  commandTitle: string;
  commandDescription: string;
  commandEmpty: string;
  commandOpenPage: string;
  groupClients: string;
  groupVenues: string;
  groupContacts: string;
  groupProducts: string;
  groupChannels: string;
  groupOrders: string;
  statusActive: string;
  statusArchived: string;
  statusInactive: string;
  statusCompleted: string;
  statusProblem: string;
  unknownAdmin: string;
  sharedMailboxEvent: string;
  subscriptionLabel: string;
  channelQr: string;
  channelNfc: string;
  resultOpen: string;
  resultsCaption: string;
  colResult: string;
  colGroup: string;
  colStatus: string;
  colDetails: string;
  emptyTitle: string;
  emptyBody: string;
  initialTitle: string;
  initialBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  loadMore: string;
  loadingMore: string;
  loading: string;
  scopeSuffixNote: string;
  scopePlaceholder: string;
  activityTitle: string;
  activitySubtitle: string;
  activityAllCategories: string;
  activityAllActors: string;
  activityClient: string;
  activityCommunication: string;
  activityTask: string;
  activityOrder: string;
  activityFinance: string;
  activitySubscription: string;
  activityProblem: string;
  activityProduct: string;
  activityService: string;
  activitySupport: string;
  actorAdmin: string;
  actorSystem: string;
  actorSharedMailbox: string;
  actorExternal: string;
  actorUnknown: string;
  activityEmptyTitle: string;
  activityEmptyBody: string;
  activityReason: string;
  activityOpenSource: string;
  debugOpen: string;
  debugStarting: string;
  debugStartError: string;
  debugMode: string;
  debugBannerLabel: string;
  debugExit: string;
  debugExiting: string;
  debugReadOnly: string;
  debugOverviewTitle: string;
  debugOwner: string;
  debugContact: string;
  debugVenues: string;
  debugProducts: string;
  debugChannels: string;
  debugEndedTitle: string;
  debugEndedBody: string;
}

export interface CommunicationsDict {
  inboxTitle: string;
  inboxSubtitle: string;
  searchLabel: string;
  searchPlaceholder: string;
  statusFilter: string;
  channelFilter: string;
  assigneeFilter: string;
  filterAll: string;
  assigneeMine: string;
  assigneeUnassigned: string;
  conversationList: string;
  conversationDetail: string;
  noConversationsTitle: string;
  noConversationsBody: string;
  noFilteredTitle: string;
  noFilteredBody: string;
  selectConversationTitle: string;
  selectConversationBody: string;
  loadMore: string;
  loadingMore: string;
  retry: string;
  errorTitle: string;
  errorBody: string;
  unreadLabel: string;
  venueLabel: string;
  contactLabel: string;
  assigneeLabel: string;
  noAssignee: string;
  assignToMe: string;
  removeAssignee: string;
  statusLabel: string;
  channelPanelChat: string;
  channelEmail: string;
  channelPhone: string;
  channelInPerson: string;
  channelCopiedMessage: string;
  statusNew: string;
  statusNeedsReply: string;
  statusInProgress: string;
  statusWaitingClient: string;
  statusCompleted: string;
  replyLabel: string;
  replyPlaceholder: string;
  sendReply: string;
  replyUnavailable: string;
  mutationError: string;
  adminAuthorFallback: string;
  messagesCapped: string;
  sentReceipt: string;
  deliveredReceipt: string;
  readReceipt: string;
  manualOpen: string;
  manualTitle: string;
  manualDescription: string;
  manualChannel: string;
  manualNote: string;
  manualPlaceholder: string;
  manualSave: string;
  cancel: string;
  profileScope: string;
  profileOpenInbox: string;
  clientTitle: string;
  clientSubtitle: string;
  clientOpen: string;
  clientClose: string;
  clientEmpty: string;
  clientMessageLabel: string;
  clientMessagePlaceholder: string;
  clientSend: string;
  clientSending: string;
  clientError: string;
  clientYou: string;
  clientScanMe: string;
  clientHistoryCapped: string;
  previewBadge: string;
  previewClientMessage: string;
  previewAdminMessage: string;
}

export interface AdminServicesDict {
  titleLinks: string;
  titleReview: string;
  titleMenu: string;
  subtitle: string;
  tabLinks: string;
  tabReview: string;
  tabMenu: string;
  filterAll: string;
  filterActive: string;
  filterGrace: string;
  filterPaused: string;
  filterProblem: string;
  searchLabel: string;
  searchPlaceholder: string;
  sortLabel: string;
  sortUrgency: string;
  sortName: string;
  sortRecent: string;
  tableCaption: string;
  colVenue: string;
  colStatus: string;
  colSubscription: string;
  colConfiguration: string;
  colChannels: string;
  colActivity: string;
  colActions: string;
  statusActive: string;
  statusGrace: string;
  statusSuspended: string;
  statusInactive: string;
  statusWarning: string;
  statusProblem: string;
  configurationPublished: string;
  configurationDraft: string;
  configurationConfigured: string;
  configurationUnconfigured: string;
  configurationInactive: string;
  subscriptionPaidThrough: string;
  subscriptionGraceEnds: string;
  subscriptionMissing: string;
  channelsUnavailable: string;
  channelsSummary: string;
  selectedVenue: string;
  selectVenueTitle: string;
  selectVenueBody: string;
  openEditor: string;
  openPublic: string;
  openClient: string;
  openProducts: string;
  openQr: string;
  googleDestination: string;
  noGoogleDestination: string;
  actionItems: string;
  noActionItems: string;
  actionsMenu: string;
  suspend: string;
  reactivate: string;
  actionReason: string;
  actionReasonPlaceholder: string;
  actionConfirmSuspend: string;
  actionConfirmReactivate: string;
  cancel: string;
  changeFailed: string;
  sendUnavailable: string;
  loadMore: string;
  loadingMore: string;
  emptyTitle: string;
  emptyBody: string;
  emptyFilteredTitle: string;
  emptyFilteredBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  noData: string;
  mobileDetails: string;
  closeDetails: string;
  previewBadge: string;
  previewDescription: string;
}

// admin-events — the admin `Događaji` tab (Sajam 2026 B1A,
// components/admin/admin-events*.tsx, app/admin/dogadjaji). Backend errors
// arrive as stable codes (FAIR_ADMIN_ISSUE_CODES) and are mapped here.
export type AdminEventsResolveProblem =
  | "code_invalid"
  | "code_unknown"
  | "card_disabled"
  | "redirect_disabled"
  | "channel_inactive"
  | "channel_problem"
  | "destination_missing"
  | "destination_fair_unassigned"
  | "destination_fair_model_missing"
  | "fair_model_not_published";

export interface AdminEventsDict {
  pageTitle: string;
  eventLabel: string;
  eventOption: string;
  noEventsTitle: string;
  noEventsBody: string;
  sectionsAria: string;
  /** Admin UX A2 — navigation label of every section route (lib/admin-v1/event-sections.ts). */
  sectionLabels: {
    pregled: string;
    /** N2 — „Poveži nalepnicu“. */
    povezi: string;
    modeli: string;
    qr: string;
    izlagaci: string;
    import: string;
    interakcije: string;
    sponzorisano: string;
    leadovi: string;
    "leadovi/follow-up": string;
    "leadovi/podesavanja": string;
    izvestaji: string;
    brisanje: string;
  };
  navGroups: { katalog: string; sajam: string; posle: string };
  navInteractions: string;
  navLeads: string;
  detailModelTitle: string;
  detailQrTitle: string;
  detailExhibitorTitle: string;
  interactionSections: { glasPublike: string; ankete: string; pasos: string; forme: string };
  eventNotFoundTitle: string;
  eventNotFoundBody: string;
  backToEvents: string;
  sectionNotFoundTitle: string;
  sectionNotFoundBody: string;
  backToOverview: string;
  backToList: string;
  modelNotFoundBody: string;
  openDetail: string;
  interactionExhibitors: {
    subtitle: string;
    filterLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    searchChip: string;
    facetPackage: string;
    packages: { interakcije: string; svi: string; napredni: string; starter: string; "za-sve": string };
    passportChip: string;
    count: string;
    colExhibitor: string;
    colModels: string;
    colQuestions: string;
    colSurveys: string;
    colPassport: string;
    modelsByTier: string;
    noModels: string;
    questionsValue: string;
    questionsDay: string;
    questionsNone: string;
    surveysValue: string;
    surveysNone: string;
    passportNone: string;
    loading: string;
    open: string;
    /** "Paketi" in the list: the exhibitor's cars open under its row. */
    packagesOpen: string;
    packagesClose: string;
    /** {name} = exhibitor. */
    packagesAria: string;
    /** {name} = exhibitor. */
    packagesFor: string;
    openAria: string;
    websiteAria: string;
    emptyTitle: string;
    emptyBody: string;
    emptyShowAll: string;
    noExhibitorsTitle: string;
    noExhibitorsBody: string;
    noMatchTitle: string;
    noMatchBody: string;
  };
  exhibitorPage: {
    back: string;
    notFoundTitle: string;
    notFoundBody: string;
    profile: string;
    noWebsite: string;
    models: string;
    jumpLabel: string;
    packagesTitle: string;
    packagesHelp: string;
    packagesEmptyTitle: string;
    packagesEmptyBody: string;
    packagesEmptyAction: string;
    colModel: string;
    colBrand: string;
    colPackage: string;
    colStatus: string;
    upgradeTo: string;
    upgradeAria: string;
    upgradeConfirm: string;
    /** {count} = live cars of the exhibitor. */
    carsShow: string;
    carsHide: string;
    bulkLabel: string;
    bulkTo: string;
    bulkAria: string;
    bulkConfirm: string;
    confirm: string;
    cancel: string;
    upgraded: string;
    bulkDone: string;
    bulkPartial: string;
    highestTier: string;
    pendingFrom: string;
    noInteractionsTitle: string;
    noInteractionsBody: string;
  };
  /** Admin UX A4 — `qr`: filters (lib/admin-v1/qr-filters.ts), list columns and scan numbers. */
  qrList: {
    searchLabel: string;
    searchPlaceholder: string;
    hierarchyLabel: string;
    facetState: string;
    states: Record<"slobodan" | "ovaj" | "drugi" | "neaktivan" | "panel", string>;
    /** {shown} of {total} codes. */
    count: string;
    /** {loaded} codes loaded so far. */
    partial: string;
    /** {q} = search text. */
    searchChip: string;
    /** {code}. */
    openCode: string;
    openCodeHint: string;
    noMatchTitle: string;
    noMatchBody: string;
    colCode: string;
    /** {code} = label / SMQ of the drawn QR. */
    qrAria: string;
    colState: string;
    colModel: string;
    colScans: string;
    colLastScan: string;
    /** {count}. */
    scansTotal: string;
    scansUnique: string;
    modelNone: string;
    modelOtherEvent: string;
    /** N2 — a panel leads to its own URL. */
    modelPanel: string;
    manage: string;
    /** {code} — accessible name of „Upravljaj“. */
    manageAria: string;
    statsNote: string;
  };
  /** Admin UX A4 — `qr/[kod]`: where the code leads, change of destination, remove link, stats, history. */
  qrDetail: {
    /** Izlagači 2026 — the sticker label and the drawn QR of the code. */
    factLabel: string;
    copyAddress: string;
    addressCopied: string;
    openAddress: string;
    scanHelp: string;
    factSmq: string;
    factCode: string;
    factChannel: string;
    loading: string;
    notFoundTitle: string;
    /** {code}. */
    notFoundBody: string;
    errorTitle: string;
    whereTitle: string;
    whereModel: string;
    wherePath: string;
    whereSince: string;
    whereReason: string;
    whereModelStatus: string;
    whereFree: string;
    /** {event}. */
    whereOtherEvent: string;
    whereUnpublished: string;
    /** N2 — a panel code: its own URL, never a car. */
    wherePanel: string;
    panelNote: string;
    /** N2 — after a conflict the detail is read again. */
    conflictRefreshed: string;
    openModel: string;
    changeTitle: string;
    changeHelp: string;
    assignTitle: string;
    assignHelp: string;
    pickLabel: string;
    pickCurrent: string;
    /** {code} — the model already has this QR. */
    pickHasQr: string;
    reasonLabel: string;
    reasonOptional: string;
    /** {min}, {max}. */
    reasonHelp: string;
    continue: string;
    back: string;
    /** {reason}. */
    reasonSummary: string;
    confirmChangeTitle: string;
    /** {code}, {from}, {to}. */
    confirmChangeBody: string;
    confirmChange: string;
    changeDone: string;
    confirmAssignTitle: string;
    /** {code}, {to}. */
    confirmAssignBody: string;
    confirmAssign: string;
    assignDone: string;
    removeTitle: string;
    removeHelp: string;
    remove: string;
    confirmRemoveTitle: string;
    /** {code}, {model}. */
    confirmRemoveBody: string;
    confirmRemove: string;
    removeDone: string;
    /** lib/admin-v1/qr-flow.ts problems; {min}, {max}. */
    problems: Record<"target_missing" | "target_same" | "reason_short" | "reason_long", string>;
    statsTitle: string;
    statsTotal: string;
    statsUnique: string;
    statsLast: string;
    statsAllTime: string;
    statsHelp: string;
    statsNone: string;
    statsNever: string;
    historyTitle: string;
    historyEmpty: string;
    historyActive: string;
    historyReleased: string;
    /** {from}. */
    historySince: string;
    /** {from}, {to}. */
    historyPeriod: string;
    historyOtherEvent: string;
    historyUnknownModel: string;
    /** {count}. */
    historyCapped: string;
    generalAdmin: string;
    generalAdminHelp: string;
  };
  /** Admin UX A4 — „Dodela u većem broju“ (lib/admin-v1/qr-bulk.ts + bulkAssignQr dry run / commit). */
  qrBulk: {
    title: string;
    open: string;
    close: string;
    /** {max} rows. */
    help: string;
    textLabel: string;
    placeholder: string;
    check: string;
    checking: string;
    empty: string;
    /** {max}. */
    tooMany: string;
    headerSkipped: string;
    /** {line}. */
    parseProblem: string;
    resultTitle: string;
    colLine: string;
    colCode: string;
    colModel: string;
    colResult: string;
    statusOk: string;
    statusUnchanged: string;
    statusError: string;
    statusApplied: string;
    /** {model}. */
    heldBy: string;
    /** {ok}, {unchanged}, {errors}. */
    summary: string;
    /** {count}. */
    commit: string;
    nothingToApply: string;
    confirmTitle: string;
    /** {count}. */
    confirmBody: string;
    confirm: string;
    /** {applied}, {unchanged}, {errors}. */
    done: string;
    verifyReminder: string;
  };
  /** Admin UX A3 — `modeli`: filters (lib/admin-v1/model-filters.ts), list and groups. */
  modelList: {
    searchLabel: string;
    searchPlaceholder: string;
    hierarchyLabel: string;
    /** {shown} of {total} models. */
    count: string;
    facets: { paket: string; status: string; problemi: string; qr: string; foto: string };
    values: {
      paket: Record<"za-sve" | "starter" | "napredni", string>;
      status: Record<"nacrt" | "objavljen" | "povucen", string>;
      problemi: Record<"greske" | "upozorenja" | "bez", string>;
      qr: Record<"ima" | "nema", string>;
      foto: Record<"ima" | "nema", string>;
    };
    /** {q} = search text. */
    searchChip: string;
    noMatchTitle: string;
    noMatchBody: string;
    emptyTitle: string;
    emptyBody: string;
    emptyAction: string;
    colExhibitor: string;
    colStand: string;
    colProblems: string;
    colPhoto: string;
    qrNone: string;
    /** {errors}, {warnings}. */
    problemsCount: string;
    problemsNone: string;
    photoYes: string;
    photoNo: string;
    photoFallback: string;
    photoStored: string;
    /** {exhibitor} · {brand}; {count} models in the group. */
    groupLabel: string;
    groupCount: string;
    open: string;
    /** {model} — accessible name of the open link. */
    openAria: string;
  };
  /** Admin UX A3 — `modeli/[modelId]`: navigation, QR block and the linked summaries. */
  modelDetail: {
    /** {index} of {total} in the current filter. */
    position: string;
    notInFilter: string;
    previous: string;
    next: string;
    /** {model}. */
    previousAria: string;
    nextAria: string;
    validationExplain: string;
    publishTitle: string;
    publishHelp: string;
    qrTitle: string;
    qrOpen: string;
    qrNone: string;
    qrSmq: string;
    /** N2 — the printed label of the car's sticker, the field, its confirmation step. */
    qrLabel: string;
    qrResolver: string;
    qrCodeLabel: string;
    qrCodeHelp: string;
    qrFind: string;
    qrFinding: string;
    qrConfirmTitle: string;
    /** {sticker}, {model}, {exhibitor}, {stand}. */
    qrConfirmBody: string;
    qrConfirm: string;
    qrConfirmDraft: string;
    /** {model} — the sticker is on another car. */
    qrTaken: string;
    qrTakenOther: string;
    qrPanel: string;
    qrOpenLink: string;
    resolveHelp: string;
    summaryTitle: string;
    summaryOpen: string;
    /** {section} — accessible name of the summary link. */
    summaryOpenAria: string;
    questions: string;
    /** {day}: {published}, {draft}, {closed}. */
    questionsDay: string;
    questionsNone: string;
    survey: string;
    /** {version}, {status}. */
    surveyVersion: string;
    surveyNone: string;
    advancedOnly: string;
    starterOnly: string;
    passport: string;
    passportNone: string;
    /** {status}. */
    passportMember: string;
    passportNotMember: string;
    forms: string;
    formInterest: string;
    formTestDrive: string;
    formOn: string;
    formOff: string;
    formNotInPackage: string;
    leads: string;
    /** {interest}, {testDrive}, {undelivered}. */
    leadsValue: string;
    leadsCapped: string;
    sponsored: string;
    /** {order}. */
    sponsoredActive: string;
    sponsoredCandidate: string;
    sponsoredNone: string;
  };
  daysTitle: string;
  noDays: string;
  participationsTitle: string;
  standsTitle: string;
  modelsTitle: string;
  colExhibitor: string;
  colSegment: string;
  colStatus: string;
  colStand: string;
  colMapLocation: string;
  colModel: string;
  colBrand: string;
  colPackage: string;
  colQr: string;
  colCheck: string;
  colCode: string;
  colChannelState: string;
  colAssignment: string;
  colActions: string;
  colCodes: string;
  colName: string;
  colSmq: string;
  colQuestion: string;
  colDay: string;
  colOptions: string;
  colVersion: string;
  colMembers: string;
  colContact: string;
  colDate: string;
  colOrder: string;
  colResult: string;
  colPublishedAt: string;
  colReport: string;
  colRecipient: string;
  colRun: string;
  colProgress: string;
  colQuestions: string;
  colCategory: string;
  colCount: string;
  openModel: string;
  noQr: string;
  checkSummary: string;
  checkReady: string;
  emptyCatalogTitle: string;
  emptyCatalogBody: string;
  fieldExternalKey: string;
  fieldSlug: string;
  fieldPrice: string;
  fieldSpecifications: string;
  specCount: string;
  fieldPhoto: string;
  photoYes: string;
  photoNo: string;
  fieldStand: string;
  fieldQr: string;
  fieldPackageSince: string;
  fieldPassport: string;
  yes: string;
  no: string;
  validationTitle: string;
  validationOk: string;
  severityError: string;
  severityWarning: string;
  publish: string;
  withdraw: string;
  publishDone: string;
  withdrawDone: string;
  publishBlocked: string;
  upgradeTitle: string;
  upgradeHelp: string;
  upgradeTarget: string;
  upgradeNone: string;
  upgradeStart: string;
  upgradeConfirmTitle: string;
  upgradeConfirmBody: string;
  upgradeConfirm: string;
  upgradeDone: string;
  cancel: string;
  qrSubtitle: string;
  qrNotConfigured: string;
  qrEmpty: string;
  assignCode: string;
  assignCodePlaceholder: string;
  assignSubmit: string;
  assignDone: string;
  resolveTitle: string;
  resolveHelp: string;
  resolveCode: string;
  resolveSubmit: string;
  resolveOpens: string;
  resolveBlocked: string;
  resolveOther: string;
  resolveLiveNote: string;
  /** Admin UX A5 — `izlagaci`: every exhibitor of the event (lib/admin-v1/exhibitors.ts). */
  exhibitorList: {
    subtitle: string;
    filterLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    facetSegment: string;
    segments: { "event-only": string; standard: string };
    /** {shown}, {total}. */
    count: string;
    /** {q}. */
    searchChip: string;
    colExhibitor: string;
    colCodes: string;
    colSegment: string;
    colBrands: string;
    colModels: string;
    colQr: string;
    colLeads: string;
    colFollowUp: string;
    colStands: string;
    /** {included}, {starter}, {advanced}. */
    modelsByTier: string;
    /** {assigned}, {total}. */
    qrCoverageAria: string;
    /** {count}. */
    leadsUndelivered: string;
    leadsCapped: string;
    followUpPending: string;
    followUpPendingHint: string;
    /** A8 — the follow-up column: an exhibitor without an Advanced model needs no text. */
    followUpNoAdvanced: string;
    followUpOpenAria: string;
    none: string;
    openModels: string;
    /** {name}. */
    openModelsAria: string;
    /** Izlagači 2026 — the client's profile (logo, website, contacts). */
    openProfile: string;
    /** {name} = exhibitor. */
    openProfileAria: string;
    /** {name}. */
    convertAria: string;
    emptyTitle: string;
    emptyBody: string;
    emptyAction: string;
    noMatchTitle: string;
    noMatchBody: string;
    otherClientsTitle: string;
    otherClientsHelp: string;
    otherClientsEmpty: string;
  };
  /** Admin UX A5 — the table import guide (lib/fair-import/*): source, column mapping, preview with dry run, commit. */
  importGuide: {
    stepsAria: string;
    steps: { izvor: string; mapiranje: string; pregled: string; potvrda: string };
    /** {n}, {total}. */
    stepOf: string;
    next: string;
    back: string;
    sourceTitle: string;
    sourceHelp: string;
    sourceKindsAria: string;
    sourceKinds: { table: string; csv: string; json: string };
    pasteLabel: string;
    pastePlaceholder: string;
    csvChoose: string;
    /** {name}. */
    csvLoaded: string;
    template: string;
    templateHelp: string;
    formatTitle: string;
    formatRow: string;
    formatHeaders: string;
    formatSpecs: string;
    formatDefaults: string;
    formatPrice: string;
    /** {rows}, {columns}, {delimiter}. */
    parsedSummary: string;
    delimiters: { tab: string; semicolon: string; comma: string };
    unclosedQuote: string;
    noRows: string;
    mappingTitle: string;
    mappingHelp: string;
    colSource: string;
    colSample: string;
    colTarget: string;
    /** {column}. */
    targetAria: string;
    targetIgnore: string;
    targetGroupFields: string;
    targetGroupSpecs: string;
    targetSpec: string;
    /** {n}. */
    targetSpecLabel: string;
    /** {n}. */
    targetSpecValue: string;
    unnamedColumn: string;
    autoDetected: string;
    fields: {
      exhibitor: string;
      smk: string;
      sml: string;
      participationKey: string;
      reportEmail: string;
      contactEmail: string;
      brand: string;
      standCode: string;
      standName: string;
      mapLocationId: string;
      model: string;
      variant: string;
      modelKey: string;
      slug: string;
      price: string;
      package: string;
      packageFrom: string;
      qr: string;
      photoUrl: string;
      passport: string;
      sortOrder: string;
      specifications: string;
    };
    problemModelMissing: string;
    /** {field}. */
    problemDuplicate: string;
    /** {n}. */
    problemPair: string;
    problemUnlabeled: string;
    defaultsTitle: string;
    defaultsHelp: string;
    defaultNone: string;
    defaultFromHelp: string;
    passportYes: string;
    passportNo: string;
    previewTitle: string;
    /** {count}. */
    previewHelp: string;
    /** {shown}, {total}. */
    previewShown: string;
    previewCaption: string;
    colLine: string;
    colExhibitor: string;
    colModel: string;
    colStand: string;
    colPrice: string;
    colPackage: string;
    colSpecs: string;
    colQr: string;
    colRow: string;
    /** {count}. */
    specsCount: string;
    priceFallback: string;
    rowSkipped: string;
    rowReady: string;
    checking: string;
    recheck: string;
    countsTitle: string;
    /** {new}, {existing}. */
    countsModels: string;
    /** {count}. */
    countsSkipped: string;
    issuesTitle: string;
    issuesCaption: string;
    colColumn: string;
    colProblem: string;
    wholeImport: string;
    /** {field}. */
    fromDefault: string;
    rowIssues: Record<"IMPORT_MODEL_MISSING" | "IMPORT_EXHIBITOR_MISSING" | "IMPORT_EXHIBITOR_UNKNOWN" | "IMPORT_EXHIBITOR_CODES_MISSING" | "IMPORT_BRAND_MISSING" | "IMPORT_STAND_MISSING" | "IMPORT_STAND_LOCATION_MISSING" | "IMPORT_PACKAGE_MISSING" | "IMPORT_PACKAGE_INVALID" | "IMPORT_PACKAGE_FROM_INVALID" | "IMPORT_PASSPORT_MISSING" | "IMPORT_PASSPORT_INVALID" | "IMPORT_SORT_INVALID" | "IMPORT_KEY_INVALID" | "IMPORT_DUPLICATE_MODEL" | "IMPORT_SPEC_LABEL_MISSING", string>;
    nothingToImport: string;
    confirmTitle: string;
    confirmHelp: string;
    confirmBlocked: string;
    confirmSubmit: string;
    committing: string;
    restart: string;
    jsonTitle: string;
  };
  importTitle: string;
  importHelp: string;
  importTextLabel: string;
  importFile: string;
  importInvalidJson: string;
  importShapeInvalid: string;
  dryRun: string;
  commit: string;
  commitNeedsDryRun: string;
  dryRunOk: string;
  dryRunFailed: string;
  summaryLine: string;
  summaryUpgrades: string;
  summaryQr: string;
  entityParticipations: string;
  entityStands: string;
  entityModels: string;
  commitDone: string;
  commitLine: string;
  commitRejected: string;
  issuesTitle: string;
  noIssues: string;
  clientsSubtitle: string;
  clientsEmpty: string;
  convert: string;
  convertConfirmBody: string;
  convertConfirm: string;
  convertDone: string;
  loading: string;
  loadMore: string;
  loadingMore: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  actionFailed: string;
  unknownIssue: string;
  unknownProblem: string;
  previewBadge: string;
  previewDescription: string;
  fixtureIdentity: string;
  tiers: Record<FairPackageTier, string>;
  modelStatus: Record<FairModelStatus, string>;
  eventStatus: Record<FairEventStatus, string>;
  entryStatus: Record<FairParticipationStatus, string>;
  segments: Record<FairClientSegment, string>;
  channelStates: Record<"active" | "inactive" | "problem", string>;
  issues: Record<FairAdminIssueCode, string>;
  resolveProblems: Record<AdminEventsResolveProblem, string>;
  /** N1 — reasons the field flow writes by itself (fairAdminQr.linkSticker / undoLink); the QR history shows them. */
  qrFieldReasons: Record<"link" | "move" | "replace" | "undo" | "restore", string>;
  /** N2 — `povezi`: „Poveži nalepnicu“ on the fair floor (lib/admin-v1/qr-link.ts). */
  linkSticker: {
    intro: string;
    entry: string;
    stepSticker: string;
    numberLabel: string;
    /** {prefix} — the printed series. */
    numberHelp: string;
    numberPlaceholder: string;
    /** {max}. */
    numberInvalid: string;
    clear: string;
    stickerEmpty: string;
    stickerLoading: string;
    stickerError: string;
    /** {code}. */
    stickerNotFound: string;
    stateFree: string;
    stateLinked: string;
    stateOther: string;
    statePanel: string;
    stateOff: string;
    freeBody: string;
    /** {model}, {exhibitor}, {stand}. */
    linkedBody: string;
    linkedDraft: string;
    /** {event}. */
    otherBody: string;
    panelBody: string;
    /** {problem}. */
    offBody: string;
    stepExhibitor: string;
    exhibitorSearch: string;
    exhibitorSearchPlaceholder: string;
    /** {stands}. */
    exhibitorStand: string;
    exhibitorNoStand: string;
    /** {count}. */
    exhibitorCars: string;
    exhibitorChange: string;
    exhibitorNone: string;
    exhibitorEmpty: string;
    stepCar: string;
    pickExhibitorFirst: string;
    carStickerHere: string;
    /** {label}. */
    carHasSticker: string;
    carNoSticker: string;
    carWithdrawn: string;
    barLabel: string;
    barPick: string;
    /** {label}, {model}, {brand}, {stand}. */
    barSummary: string;
    warnDraft: string;
    /** {model}. */
    warnMove: string;
    /** {label}. */
    warnReplace: string;
    /** {problem}. */
    warnOutOfService: string;
    blockPanel: string;
    blockOther: string;
    blockWithdrawn: string;
    blockSame: string;
    confirmLink: string;
    confirmMove: string;
    confirmReplace: string;
    confirmMoveReplace: string;
    saving: string;
    doneTitle: string;
    /** {label}, {model}, {exhibitor}, {stand}. */
    doneBody: string;
    /** {label}, {model}. */
    doneUnchanged: string;
    /** {model}. */
    doneMoved: string;
    /** {label}. */
    doneReplaced: string;
    doneDraft: string;
    doneCheck: string;
    undo: string;
    undoing: string;
    undone: string;
    /** {label}. */
    next: string;
    nextPlain: string;
    conflictRefreshed: string;
    recentTitle: string;
    recentHelp: string;
    recentEmpty: string;
    recentLoading: string;
    /** {model}, {exhibitor}, {stand}. */
    recentLine: string;
    /** {time}, {who}. */
    recentBy: string;
    /** {label}. */
    recentUndoAria: string;
    /** {label}. */
    recentUndone: string;
  };
  // B3 — Interakcije tab (Glas publike, ankete, pasoši)
  tabInteractions: string;
  interactionsUnavailable: string;
  questionsTitle: string;
  questionsHelp: string;
  fieldModel: string;
  fieldDay: string;
  questionPrompt: string;
  questionSave: string;
  questionSaved: string;
  questionsEmpty: string;
  questionsNoModels: string;
  questionPublish: string;
  questionPublished: string;
  questionClose: string;
  questionClosed: string;
  questionStatus: Record<FairAudienceQuestionStatus, string>;
  surveysTitle: string;
  surveysHelp: string;
  surveyQuestionLabel: string;
  surveyKind: string;
  surveyKinds: Record<FairSurveyQuestionKind, string>;
  surveyAddQuestion: string;
  surveyRemoveQuestion: string;
  surveySave: string;
  surveySaved: string;
  surveysEmpty: string;
  surveysNoModels: string;
  surveyVersion: string;
  surveyPublish: string;
  surveyPublished: string;
  surveyRetire: string;
  surveyRetired: string;
  surveyStatus: Record<FairSurveyStatus, string>;
  /** Admin UX A6 — Glas publike. Placeholders: {day} {model} {used} {limit} {count} {tier} {date} {brand} {exhibitor} {reason} {prompt}. */
  audience: {
    formTitle: string;
    formEditTitle: string;
    cancelEdit: string;
    optionsLabel: string;
    saveAndPublish: string;
    savedAndPublished: string;
    savedPublishFailed: string;
    updated: string;
    pickModelFirst: string;
    promptEmpty: string;
    noDays: string;
    noModels: string;
    pickSublabel: string;
    pickNotEntitled: string;
    pickPending: string;
    quotaTitle: string;
    quotaLine: string;
    quotaRemaining: string;
    quotaDrafts: string;
    quotaStarterHint: string;
    quotaAdvancedHint: string;
    blocks: Record<"not_entitled" | "pending_package" | "day_limit", string>;
    publishBlockedShort: string;
    matrixTitle: string;
    matrixHelp: string;
    matrixGaps: string;
    matrixNoGaps: string;
    matrixModel: string;
    matrixToday: string;
    matrixCellAria: string;
    matrixDrafts: string;
    matrixNone: string;
    legendEmpty: string;
    legendPartial: string;
    legendFull: string;
    listTitle: string;
    listCount: string;
    groupLabel: string;
    groupQuota: string;
    filterLabel: string;
    facetStatus: string;
    facetExhibitor: string;
    statuses: Record<"draft" | "published" | "sponsored" | "closed", string>;
    noMatchTitle: string;
    noMatchBody: string;
    edit: string;
    editAria: string;
    closeConfirm: string;
    setSponsored: string;
    clearSponsored: string;
    sponsoredSet: string;
    sponsoredCleared: string;
    sponsoredHelp: string;
    /** P1 — „Otvori sada“ for a published question whose day is still ahead. {prompt} in the aria label. */
    openNow: string;
    openNowAria: string;
    openedNow: string;
  };
  /** Admin UX A6 — survey form. Placeholders: {n} {version} {from} {count} {max} {problem} {reason} {date} {model}. */
  surveyForm: {
    modelLabel: string;
    pickNotAdvanced: string;
    pickPending: string;
    noAdvancedTitle: string;
    noAdvancedBody: string;
    pickPrompt: string;
    editingDraft: string;
    newFromPublished: string;
    newFirst: string;
    questionLabel: string;
    promptLabel: string;
    kindLabel: string;
    optionsLabel: string;
    moveUp: string;
    moveDown: string;
    remove: string;
    add: string;
    count: string;
    maxReached: string;
    promptEmpty: string;
    optionsProblem: string;
    saveAndPublish: string;
    savedPublishFailed: string;
    versionsTitle: string;
    versionsCount: string;
    versionLabel: string;
    open: string;
    openAria: string;
    retireConfirm: string;
  };
  passportsTitle: string;
  passportsEmpty: string;
  passportRemoveModel: string;
  passportRemoveConfirm: string;
  passportRemoved: string;
  passportStatus: Record<FairPassportConfigStatus, string>;
  passportMemberStatus: Record<FairPassportEligibleStatus, string>;
  passportProblems: Record<AdminEventsPassportProblem, string>;
  /** Admin UX A7 — `interakcije/pasos`: the automatic brand passport (lib/admin-v1/passport-overview.ts). */
  passportAuto: {
    help: string;
    explainTitle: string;
    /** {date} = the event opening. */
    explainAuto: string;
    explainFreeze: string;
    explainHide: string;
    refresh: string;
    /** {created}, {updated}, {withdrawn}, {unchanged}, {frozen}. */
    refreshDone: string;
    filterLabel: string;
    facetExhibitor: string;
    facetState: string;
    /** {brand}. */
    brandChip: string;
    /** {shown} of {total} brands. */
    count: string;
    noMatchTitle: string;
    noMatchBody: string;
    colBrand: string;
    colCondition: string;
    colState: string;
    colMembers: string;
    conditionMet: string;
    conditionNotMet: string;
    /** {count}, {total}. */
    problems: Record<FairBrandPassportProblem, string>;
    noExhibited: string;
    /** {max}. */
    tooManyModels: string;
    states: Record<"active" | "frozen" | "hidden" | "not_eligible" | "missing", string>;
    /** {date}. */
    hintActive: string;
    /** {date}. */
    hintFrozen: string;
    hintHidden: string;
    hintWithdrawn: string;
    hintMissingBefore: string;
    hintMissingAfter: string;
    /** {required}. */
    membersCount: string;
    noMembers: string;
    memberRemovedByAdmin: string;
    memberWithdrawn: string;
    /** {count}. */
    blocking: string;
    hide: string;
    /** {brand}. */
    hideAria: string;
    /** {brand}. */
    hideConfirm: string;
    hidden: string;
    show: string;
    /** {brand}. */
    showAria: string;
    shown: string;
  };
  confirm: string;
  // B4 — Leadovi tab (saglasnost, podešavanje po modelu, follow-up tekst, leadovi)
  tabLeads: string;
  leadsUnavailable: string;
  leadKinds: Record<FairLeadKind, string>;
  consentTitle: string;
  consentHelp: string;
  consentActive: string;
  consentInactive: string;
  consentDraftLabel: string;
  consentNewLabel: string;
  consentSaveDraft: string;
  consentSaved: string;
  consentActivate: string;
  consentActivateConfirm: string;
  consentActivated: string;
  consentRetire: string;
  consentRetireConfirm: string;
  consentRetired: string;
  consentVersionLine: string;
  consentStatus: Record<FairConsentStatus, string>;
  // K3 — legal approval record at activation
  consentLegalTitle: string;
  consentLegalHelp: string;
  consentLegalApprovedBy: string;
  consentLegalApprovedAt: string;
  consentLegalLine: string;
  consentLegalNone: string;
  configEnabled: string;
  configRequirement: string;
  configPreferred: string;
  configPreferredNone: string;
  contactRequirements: Record<FairContactRequirement, string>;
  preferredContacts: Record<FairPreferredContact, string>;
  testDriveAdvancedOnly: string;
  /** Admin UX A7 — `interakcije/forme`: the lead forms per exhibitor (lib/admin-v1/lead-forms.ts). */
  leadForms: {
    help: string;
    statusLabel: string;
    leadsOn: string;
    leadsOff: string;
    followUpOn: string;
    followUpOff: string;
    /** {kind}, {version}. */
    consentOn: string;
    /** {kind}. */
    consentOff: string;
    consentLink: string;
    exhibitorLabel: string;
    /** {name}, {count}. */
    exhibitorOption: string;
    noExhibitorsTitle: string;
    noExhibitorsBody: string;
    /** {exhibitor}. */
    defaultsTitle: string;
    defaultsHelp: string;
    defaultNotSaved: string;
    testDriveDefaultNote: string;
    saveAndApply: string;
    saveOnly: string;
    apply: string;
    saved: string;
    /** {created}, {updated}, {unchanged}, {skipped}. */
    applied: string;
    notEntitledTitle: string;
    /** {model}, {kind}, {reason}. */
    notEntitledLine: string;
    /** {kind}. */
    missingDefault: string;
    /** {count}. */
    pending: string;
    modelsTitle: string;
    /** {shown} models. */
    count: string;
    noModelsTitle: string;
    noModelsBody: string;
    colModel: string;
    colPackage: string;
    states: Record<"on" | "off" | "not_entitled" | "not_set", string>;
    sourceDefault: string;
    sourceOverride: string;
    pendingBadge: string;
    /** {requirement}. */
    contactLine: string;
    /** {channel}. */
    preferredLine: string;
    notEntitledReasons: Record<FairLeadKind, string>;
    editOverride: string;
    /** {model}. */
    editOverrideAria: string;
    /** {model}. */
    overrideTitle: string;
    overrideHelp: string;
    saveOverride: string;
    overrideSaved: string;
    clearOverride: string;
    cleared: string;
    closeOverride: string;
    /** Leadovi: the forms moved to Interakcije. */
    movedNote: string;
    movedLink: string;
  };
  listTitle: string;
  listEmpty: string;
  leadNoEmail: string;
  leadNoPhone: string;
  confirmationLabel: string;
  followUpLabel: string;
  followUpPlanned: string;
  deliveryNone: string;
  deliveryStatus: Record<FairEmailDeliveryStatus, string>;
  deliveryErrors: Record<FairEmailDeliveryError, string>;
  suppress: string;
  suppressConfirm: string;
  suppressDone: string;
  unsuppress: string;
  unsuppressDone: string;
  followUpSuppressedBadge: string;
  retryConfirmation: string;
  retryFollowUp: string;
  retryDone: string;
  // Admin UX A8 — lead inbox, follow-up per exhibitor, consent settings
  leadInbox: AdminEventsLeadInboxDict;
  followUps: AdminEventsFollowUpsDict;
  leadSettings: { help: string; activitySharingNote: string; summaryActive: string; summaryNone: string; summaryDraft: string };
  // B5 — Sponzorisano tab (ručna objava liste Naprednih modela, rezultat na mapi)
  tabSponsored: string;
  sponsoredSubtitle: string;
  sponsoredUnavailable: string;
  sponsoredTitle: string;
  sponsoredHelp: string;
  sponsoredNone: string;
  sponsoredActiveLine: string;
  sponsoredUpToDate: string;
  sponsoredStale: string;
  sponsoredMissing: string;
  sponsoredExtra: string;
  sponsoredQuestionChanged: string;
  sponsoredPending: string;
  sponsoredPublish: string;
  sponsoredPublishConfirm: string;
  sponsoredPublished: string;
  sponsoredItemsTitle: string;
  sponsoredItemsHelp: string;
  sponsoredItemsEmpty: string;
  sponsoredItemLine: string;
  sponsoredItemResult: string;
  sponsoredItemNoResult: string;
  sponsoredResultTitle: string;
  sponsoredResultHelp: string;
  sponsoredResultNone: string;
  sponsoredResultNoModels: string;
  sponsoredResultNoQuestions: string;
  sponsoredResultSaved: string;
  sponsoredHistoryTitle: string;
  sponsoredHistoryHelp: string;
  sponsoredHistoryLine: string;
  sponsoredStatus: Record<FairSponsoredSnapshotStatus, string>;
  tabReports: string;
  reportsSubtitle: string;
  reportsUnavailable: string;
  reportsBuildTitle: string;
  reportsBuildHelp: string;
  reportsBuildEmpty: string;
  reportsDay: string;
  reportsExhibitor: string;
  reportsFormat: string;
  reportsBuild: string;
  reportsBuildQueued: string;
  reportsListTitle: string;
  reportsListHelp: string;
  reportsEmpty: string;
  reportsRunLine: string;
  reportsRunMeta: string;
  reportsApprovedAt: string;
  reportsCorrectionBadge: string;
  reportsRecipient: string;
  reportsNoRecipient: string;
  reportsDelivery: string;
  reportsError: string;
  reportsReview: string;
  reportsCloseReview: string;
  reportsReviewLoading: string;
  reportsReviewEmpty: string;
  reportsApprove: string;
  reportsApproveConfirm: string;
  reportsApproved: string;
  reportsSend: string;
  reportsSendConfirm: string;
  reportsSent: string;
  reportsResend: string;
  reportsResendConfirm: string;
  reportsRetry: string;
  reportsRetried: string;
  reportsCorrect: string;
  reportsCorrectConfirm: string;
  reportsCorrected: string;
  reportsDownload: string;
  reportsDownloaded: string;
  reportsRecipientLabel: string;
  reportsExportsTitle: string;
  reportsExportsHelp: string;
  reportsLeadsWarning: string;
  reportsOrganizerLabel: string;
  reportsOrganizerDownload: string;
  reportStatus: Record<FairReportStatus, string>;
  reportsFormats: Record<FairReportFormat, string>;
  reportBuildErrors: Record<"BUILD_FAILED" | "REPORT_CONTEXT_MISSING", string>;
  // B7 — Brisanje podataka (16 Nov 2026 purge: preview, dry run, audit)
  tabRetention: string;
  retentionSubtitle: string;
  retentionUnavailable: string;
  retentionScheduleTitle: string;
  retentionScheduleHelp: string;
  retentionScheduleLine: string;
  retentionKeptNote: string;
  retentionPreviewTitle: string;
  retentionPreviewHelp: string;
  retentionCountCapped: string;
  retentionDryRun: string;
  retentionDryRunStarted: string;
  retentionRunsTitle: string;
  retentionRunsHelp: string;
  retentionRunsEmpty: string;
  retentionRunLine: string;
  retentionRunFinished: string;
  retentionRunProgress: string;
  retentionCategoryLine: string;
  retentionModes: Record<FairPurgeMode, string>;
  retentionTriggers: Record<FairPurgeTrigger, string>;
  retentionRunStatus: Record<FairPurgeRunStatus, string>;
  retentionCategoryStatus: Record<FairPurgeCategoryStatus, string>;
  retentionCategories: Record<FairPurgeCategory, string>;
  // Admin UX A9 — automatic sponsored list, report queue, retention countdown.
  sponsoredAuto: AdminEventsSponsoredAutoDict;
  reportQueue: AdminEventsReportQueueDict;
  retentionPlan: AdminEventsRetentionPlanDict;
  // Admin UX A10 — Pregled: the event dashboard.
  dashboard: AdminEventsDashboardDict;
  // P1 — „Pre-event podaci“ (Brisanje): counts per kind and the reset.
  preEvent: AdminEventsPreEventDict;
}

/**
 * Admin UX A10 — `pregled`: phase and countdown, „Šta treba da uradim“ (one
 * title + one sentence per backend rule), KPI row and section cards. The
 * backend (fairDashboard.getEventDashboard) returns rules and numbers only.
 */
export interface AdminEventsDashboardDict {
  title: string;
  /** sajam: {day} of {count}. */
  phase: Record<FairDashboardPhase, string>;
  /** Between two fair days: {day} = the next one, {count} = days. */
  phaseNextDay: string;
  /** {from} – {to} (dates). */
  dates: string;
  daysLabel: string;
  todayTag: string;
  deadline: Record<FairDashboardDeadline, string>;
  left: { days: string; hours: string; minutes: string; now: string };
  updated: string;
  todoTitle: string;
  todoHelp: string;
  /** {hitno} / {uskoro} / {info} = items per tone. */
  todoSummary: string;
  readyTitle: string;
  /** {published}/{total} models, {qr} assigned codes. */
  readyBody: string;
  /** Title (independent of the number) and one sentence; {day}, {date}, {days} where noted. */
  rules: Record<FairDashboardRule, { title: string; body: string }>;
  /** Count badge of the purge countdown: {count} = days. */
  daysBadge: string;
  /** Link of an item to its filtered section; {title} is read by screen readers only. */
  open: Record<FairDashboardSection, string>;
  openFor: string;
  kpiTitle: string;
  kpi: {
    models: string;
    /** {included} / {starter} / {advanced}. */
    modelsHint: string;
    qr: string;
    qrHint: string;
    qrNoInventory: string;
    scans: string;
    /** {total} all time, {unique} unique. */
    scansHint: string;
    /** After the fair the totals lead (today is empty). */
    scansTotal: string;
    scansTotalHint: string;
    leads: string;
    /** {undelivered} of {total}. */
    leadsHint: string;
    leadsUndelivered: string;
    leadsUndeliveredHint: string;
    questionsToday: string;
    /** {day} = the next fair day. */
    questionsDay: string;
    questionsHint: string;
    reports: string;
    reportsHint: string;
    capped: string;
  };
  cardsTitle: string;
  cardOpen: string;
  cards: {
    modeli: { published: string; draft: string; withErrors: string; withdrawn: string };
    qr: { assigned: string; withoutQr: string; onWithdrawn: string };
    interakcije: { questions: string; passports: string; forms: string };
    leadovi: { total: string; undelivered: string; followUp: string; none: string };
    sponzorisano: { inList: string; withoutQuestion: string; autoOn: string; autoOff: string; none: string };
    izvestaji: { pending: string; failed: string; sent: string; none: string };
    izlagaci: { active: string; withAdvanced: string };
  };
  errorTitle: string;
  errorBody: string;
}

/** Admin UX A9 — `sponzorisano`: automatic list, today's order, map question per model, warnings. */
export interface AdminEventsSponsoredAutoDict {
  autoOn: string;
  autoOff: string;
  autoOnHelp: string;
  autoOffHelp: string;
  lastUpdate: string;
  sources: Record<FairSponsoredSnapshotTrigger, string>;
  modelsInRotation: string;
  turnOff: string;
  turnOffConfirm: string;
  turnOn: string;
  turnOnConfirm: string;
  turnedOff: string;
  turnedOn: string;
  pendingAuto: string;
  warningsTitle: string;
  warnTag: string;
  infoTag: string;
  warningsHelp: string;
  warningsNone: string;
  warnNoPhoto: string;
  warnNoQuestion: string;
  warnFewVotes: string;
  orderTitle: string;
  orderHelp: string;
  orderCycle: string;
  nowMap: string;
  nowGarage: string;
  colPicture: string;
  colMapShows: string;
  visual: Record<"photo" | "brand_logo" | "event_placeholder", string>;
  mapShowsNone: string;
  questionHelp: string;
  questionNoneNote: string;
  votesLine: string;
  votesBelow: string;
  votesLoading: string;
  savedAuto: string;
  technicalTitle: string;
  technicalVersion: string;
  colSource: string;
}

/** Admin UX A9 — `izvestaji`: one row per day × exhibitor with the state of its newest run. */
export interface AdminEventsReportQueueDict {
  title: string;
  help: string;
  filterLabel: string;
  facetDay: string;
  facetExhibitor: string;
  facetStatus: string;
  statuses: Record<"ceka-podatke" | "u-izradi" | "ceka-odobrenje" | "odobreno" | "poslato" | "greska", string>;
  summary: string;
  count: string;
  colDay: string;
  colExhibitor: string;
  colState: string;
  waitingClosed: string;
  waitingOpen: string;
  build: string;
  version: string;
  older: string;
  noMatchTitle: string;
  noMatchBody: string;
}

/** Admin UX A9 — `brisanje`: countdown, last dry run, what is deleted and what stays. */
/**
 * P1 — `brisanje`: the event's pre-event data (visitor writes before the
 * event's start) per kind, the dry run and the reset with the typed slug.
 * Placeholders: {date} {cap} {count} {total} {slug}.
 */
export interface AdminEventsPreEventDict {
  title: string;
  help: string;
  boundary: string;
  countsTitle: string;
  countsHelp: string;
  countCapped: string;
  total: string;
  totalCapped: string;
  empty: string;
  categories: Record<FairPreEventCategory, string>;
  dryRun: string;
  dryRunDone: string;
  reset: string;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  confirmHint: string;
  confirmButton: string;
  cancel: string;
  started: string;
  keptTitle: string;
  kept: readonly string[];
  unavailable: string;
}

export interface AdminEventsRetentionPlanDict {
  countdownTitle: string;
  countdownHelp: string;
  daysLeft: string;
  dueToday: string;
  started: string;
  leadDeadline: string;
  lastDryRunTitle: string;
  lastDryRunNone: string;
  lastDryRunLine: string;
  keptTitle: string;
  keptHelp: string;
  kept: readonly string[];
}

/** Admin UX A8 — `leadovi` (inbox, detail with activity, delivery, export). */
export interface AdminEventsLeadInboxDict {
  help: string;
  listTitle: string;
  filtersLabel: string;
  hierarchyLabel: string;
  facetKind: string;
  facetDelivery: string;
  kindOptions: Record<"zainteresovan" | "probna-voznja", string>;
  deliveryOptions: Record<"ne" | "da", string>;
  fromLabel: string;
  toLabel: string;
  chipKind: string;
  chipDelivery: string;
  chipFrom: string;
  chipTo: string;
  count: string;
  countMore: string;
  undelivered: string;
  undeliveredCapped: string;
  deadlineDays: string;
  deadlineToday: string;
  deadlinePassed: string;
  leadsOff: string;
  linksLabel: string;
  formsLink: string;
  followUpLink: string;
  settingsLink: string;
  emptyTitle: string;
  emptyBody: string;
  emptyFilteredTitle: string;
  emptyFilteredBody: string;
  colLead: string;
  colReceived: string;
  colKindModel: string;
  colExhibitor: string;
  colDelivery: string;
  colEmails: string;
  delivered: string;
  notDelivered: string;
  deliveredOn: string;
  open: string;
  openAria: string;
  markDelivered: string;
  markDeliveredAria: string;
  markDeliveredDone: string;
  handOverTitle: string;
  handOverHelp: string;
  handOverPick: string;
  handOverExhibitor: string;
  exportDownload: string;
  exportDone: string;
  markExhibitor: string;
  markExhibitorConfirm: string;
  markExhibitorDone: string;
  markExhibitorMore: string;
  detailTitle: string;
  detailDescription: string;
  detailClose: string;
  detailLoading: string;
  detailMissing: string;
  contactTitle: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  leadLine: string;
  tierAtLead: string;
  consentTitle: string;
  consentLine: string;
  deliveryTitle: string;
  emailsTitle: string;
  suppressedOn: string;
  activityTitle: string;
  activityHelp: string;
  activityShared: string;
  activityNotShared: string;
  activityEmpty: string;
  activityCapped: string;
  activityGroups: Record<FairLeadActivityGroup, string>;
  scanLine: string;
  ratingFields: Record<"overall" | "appearance" | "specifications" | "price", string>;
  passportLine: string;
  passportLineNoTotal: string;
  favoriteLine: string;
  sponsoredKinds: Record<"open_model" | "garage_add", string>;
  yes: string;
  no: string;
  unknownModel: string;
  unknownBrand: string;
  unknownExhibitor: string;
}

/** Admin UX A8 — `leadovi/follow-up` (one text per exhibitor, merge fields, preview, estimate). */
export interface AdminEventsFollowUpsDict {
  help: string;
  statusLabel: string;
  switchOn: string;
  switchOff: string;
  leadsOff: string;
  listTitle: string;
  colExhibitor: string;
  colText: string;
  colAdvanced: string;
  colEstimate: string;
  states: Record<Exclude<FairFollowUpTemplateStatus, "retired"> | "none", string>;
  draftPending: string;
  noAdvanced: string;
  advancedCount: string;
  modelTexts: string;
  estimate: string;
  estimateDetail: string;
  estimateCapped: string;
  estimateNoText: string;
  estimateHelp: string;
  edit: string;
  editAria: string;
  editorTitle: string;
  editorHelp: string;
  pickExhibitor: string;
  versionActive: string;
  versionDraft: string;
  versionNone: string;
  subject: string;
  text: string;
  fieldsTitle: string;
  fieldsHelp: string;
  insertAria: string;
  fields: Record<FairFollowUpField, string>;
  unknownField: string;
  saveDraft: string;
  saved: string;
  unsaved: string;
  activate: string;
  activateConfirm: string;
  activated: string;
  retire: string;
  retireConfirm: string;
  retired: string;
  previewTitle: string;
  previewSource: string;
  previewSample: string;
  previewLeadOption: string;
  previewSampleNote: string;
  previewLoading: string;
  previewSubject: string;
  previewEmpty: string;
  noExhibitorsTitle: string;
  noExhibitorsBody: string;
  loading: string;
}

export type AdminEventsPassportProblem = "fewer_than_two_models" | "model_not_published" | "model_not_candidate" | "model_below_starter";

// event-lead-email — visitor emails after a fair lead (Sajam 2026 B4,
// convex/lib/fairEmails.ts). Placeholder copy until P1 is locked.
export interface EventLeadEmailDict {
  confirmationSubjectInterest: string;
  confirmationSubjectTestDrive: string;
  greeting: string;
  /** N5 — the greeting when the stored name is not safe to repeat. */
  greetingWithoutName: string;
  confirmationBodyInterest: string;
  confirmationBodyTestDrive: string;
  /** N5 — `{where}` = stand name and event venue ("Štand 2, Hala Čair, Niš"). */
  confirmationWhere: string;
  /** N5 — the next step by kind; `{exhibitor}`. */
  confirmationNextInterest: string;
  confirmationNextTestDrive: string;
  /** N5 — `{contact}` = the email and/or phone the visitor shared. */
  confirmationContact: string;
  /** N5 — `{exhibitor}`, `{date}` = the purge day. */
  confirmationPrivacy: string;
  confirmationNotYou: string;
  confirmationFollowUpNote: string;
  followUpFooter: string;
  /** Admin UX A8 — what a merge field becomes when the lead has no value for it. */
  followUpFallbacks: Record<FairFollowUpField, string>;
  /** Admin UX A8 — the word before the last name of a list ("A, B i C"). */
  listAnd: string;
  /** Admin UX A8 — `{ime}` in the admin preview when no lead is chosen (clearly marked as an example). */
  followUpSampleName: string;
  modelLink: string;
  signature: string;
  devTestSubject: string;
  devTestBody: string;
}

// event-report — B6 exhibitor daily report, organizer aggregate and PII lead
// export files + the report email (convex/lib/fairReportFiles.ts). The visual
// template is PRIVREMENO (MASTER §12); these are neutral placeholder labels.
export interface EventReportDict {
  reportTitle: string;
  reportSubtitle: string;
  builtAtLine: string;
  windowLine: string;
  provisionalNote: string;
  truncatedNote: string;
  cappedNote: string;
  standsHeading: string;
  standsNote: string;
  modelsHeading: string;
  hourlyHeading: string;
  comparisonHeading: string;
  ratingsHeading: string;
  audienceHeading: string;
  surveyHeading: string;
  sponsoredHeading: string;
  noModelAnalytics: string;
  colStand: string;
  colModel: string;
  colPackage: string;
  colTotal: string;
  colUnique: string;
  colHour: string;
  colInterest: string;
  colTestDrive: string;
  colMetric: string;
  colToday: string;
  colPrevious: string;
  colChange: string;
  colField: string;
  colCount: string;
  colAverage: string;
  colQuestion: string;
  colAnswer: string;
  colVotes: string;
  colResponses: string;
  colOpenModel: string;
  colGarageAdd: string;
  colDay: string;
  colDate: string;
  colKind: string;
  colName: string;
  colEmail: string;
  colPhone: string;
  colConsentVersion: string;
  colConsentedAt: string;
  colCreatedAt: string;
  tiers: Record<"included" | "starter" | "advanced", string>;
  ratingFields: Record<"overall" | "appearance" | "specifications" | "price", string>;
  comparisonMetrics: Record<"scans_total" | "scans_unique" | "interest" | "test_drive" | "sponsored_open_model" | "sponsored_garage_add", string>;
  questionStatus: Record<"draft" | "published" | "closed", string>;
  leadKinds: Record<"interest" | "test_drive", string>;
  yes: string;
  no: string;
  surveyVersion: string;
  pageOf: string;
  sheetName: string;
  organizerTitle: string;
  organizerSubtitle: string;
  organizerHeading: string;
  organizerNote: string;
  leadsTitle: string;
  leadsSubtitle: string;
  leadsHeading: string;
  leadsActivityNote: string;
  leadActivityColumns: Record<"scans" | "ratings" | "audienceVotes" | "surveyAnswers" | "sponsoredActions", string>;
  /** {model}, {count}. */
  leadActivityScan: string;
  emailSubject: string;
  emailBody: string;
  emailCorrectionNote: string;
  emailSignature: string;
}

/** Admin UX A1 — shared admin primitives (Tabela/Kartice prikaz, sortiranje). */
export interface AdminUiDict {
  viewToggleLabel: string;
  viewTable: string;
  viewCards: string;
  /** {column} = column header. */
  sortBy: string;
  sortAscending: string;
  sortDescending: string;
  actionsColumn: string;
  /** A2 — section navigation: {count} = number next to a section. */
  navCount: string;
  /** A2 — urgency badge in the section navigation (filled by A10). {count} = items. */
  urgency: { hitno: string; uskoro: string; info: string };
  /** A10 — the tone word of AdminUrgencyBadge (text next to the color). */
  urgencyLabel: { hitno: string; uskoro: string; info: string };
  /** A3 — AdminFilterBar. */
  filters: {
    /** Mobile toggle; {count} = active filters. */
    toggle: string;
    toggleCount: string;
    clear: string;
    activeLabel: string;
    /** {label} = chip text. */
    removeChip: string;
    /** `<select>` option that turns a facet off. */
    any: string;
  };
  /** A3 — AdminHierarchyPicker (Izlagač → Brend → Model). */
  hierarchy: {
    exhibitor: string;
    brand: string;
    model: string;
    allExhibitors: string;
    allBrands: string;
    /** {label} ({count}). */
    optionCount: string;
    modelPlaceholder: string;
    modelListLabel: string;
    noMatches: string;
    /** {shown}, {total}. */
    moreMatches: string;
    /** {count} matching models (screen reader). */
    matchesAnnounce: string;
    clearModel: string;
    /** {model}. */
    selected: string;
  };
  /** A6 — AdminOptionRows (answer options as dynamic rows). {n} = row number. */
  optionRows: {
    option: string;
    add: string;
    remove: string;
    moveUp: string;
    moveDown: string;
    /** {count}, {max}. */
    count: string;
    /** {min}. */
    tooFew: string;
    /** {max}. */
    tooMany: string;
    empty: string;
    duplicate: string;
    duplicateRow: string;
    emptyRow: string;
  };
}

/** Admin UX Z1 — Pošta: each admin's own Zoho mailbox, read live (ADMIN-UX-ZAHTEVI §10). */
export interface PostaDict {
  pageTitle: string;
  pageSubtitle: string;
  previewBadge: string;
  connect: string;
  connecting: string;
  reconnect: string;
  disconnect: string;
  /** {email}. */
  disconnectConfirm: string;
  connectionsLabel: string;
  connectionActive: string;
  connectionAuthRequired: string;
  mailboxLabel: string;
  notConfiguredTitle: string;
  notConfiguredBody: string;
  noConnectionTitle: string;
  noConnectionBody: string;
  privacyNote: string;
  foldersLabel: string;
  /** Names of the Zoho system folders by `folderType`. */
  folderNames: Record<"Inbox" | "Sent" | "Drafts" | "Spam" | "Trash" | "Outbox" | "Templates" | "Snoozed", string>;
  foldersEmpty: string;
  loadingFolders: string;
  listLabel: string;
  filterLabel: string;
  filterAll: string;
  filterUnread: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchSubmit: string;
  searchClear: string;
  /** {query}. */
  searchScope: string;
  unread: string;
  hasAttachment: string;
  noSubject: string;
  unknownSender: string;
  listEmptyTitle: string;
  listEmptyBody: string;
  unreadEmptyBody: string;
  searchEmptyTitle: string;
  searchEmptyBody: string;
  loadingList: string;
  pagination: string;
  pagePrevious: string;
  pageNext: string;
  /** {from}, {to}. */
  pageRange: string;
  readerLabel: string;
  readerEmptyTitle: string;
  readerEmptyBody: string;
  loadingMessage: string;
  back: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  markRead: string;
  markedRead: string;
  imagesBlocked: string;
  showImages: string;
  imagesShown: string;
  /** {subject}. */
  htmlFrameTitle: string;
  attachmentsLabel: string;
  /** {name}, {size}. */
  download: string;
  downloading: string;
  connectedNotice: string;
  previewNotice: string;
  dismissNotice: string;
  retry: string;
  /** {seconds}. */
  retryAfter: string;
  /** Z2 — the ScanMe email template (lib/email-template/scanme-email.ts). */
  email: {
    footer: string;
    footerLink: string;
    /** {date}, {sender}. */
    replyHeader: string;
    forwardHeader: string;
    forwardFrom: string;
    forwardDate: string;
    forwardSubject: string;
    forwardTo: string;
    forwardCc: string;
    replyPrefix: string;
    forwardPrefix: string;
  };
  /** Z2 — writing, replying and forwarding. */
  compose: {
    newMessage: string;
    titles: Record<"new" | "reply" | "reply_all" | "forward", string>;
    reply: string;
    replyAll: string;
    forward: string;
    messageActions: string;
    tabsLabel: string;
    tabWrite: string;
    tabPreview: string;
    from: string;
    to: string;
    cc: string;
    bcc: string;
    addCc: string;
    addBcc: string;
    recipientPlaceholder: string;
    /** {address}. */
    removeRecipient: string;
    /** {address}. */
    invalidRecipient: string;
    missingRecipient: string;
    subjectMissing: string;
    waitForUploads: string;
    suggestionsLabel: string;
    subject: string;
    body: string;
    bodyPlaceholder: string;
    toolbarLabel: string;
    bold: string;
    link: string;
    linkPrompt: string;
    formattingHint: string;
    attachments: string;
    dropzone: string;
    chooseFiles: string;
    /** {count}, {size}. */
    attachmentLimits: string;
    /** {name}, {percent}. */
    uploading: string;
    /** {name}. */
    removeAttachment: string;
    attachmentFailed: string;
    forwardAttachments: string;
    quoteNote: Record<"reply" | "forward", string>;
    signatureNote: string;
    noSignature: string;
    send: string;
    sending: string;
    sendAgain: string;
    resendConfirm: string;
    discard: string;
    discardConfirm: string;
    draftSaved: string;
    sent: string;
    openSent: string;
    uncertain: string;
    /** {subject}. */
    previewTitle: string;
    textVersion: string;
    close: string;
  };
  /** Z2 — signature per mailbox ("podešavanja Pošte"). */
  settings: {
    open: string;
    title: string;
    description: string;
    /** {email}. */
    signatureLabel: string;
    signaturePlaceholder: string;
    save: string;
    saving: string;
    saved: string;
    preview: string;
  };
  /** Stable backend codes (convex/lib/adminMailContract.ts) + the generic fallback. */
  errors: Record<
    | "ZOHO_NOT_CONFIGURED"
    | "ZOHO_AUTH_REQUIRED"
    | "ZOHO_RATE_LIMITED"
    | "ZOHO_UNAVAILABLE"
    | "ZOHO_STATE_INVALID"
    | "ZOHO_CONNECTION_NOT_FOUND"
    | "ZOHO_NO_MAILBOX"
    | "ZOHO_REGION_UNSUPPORTED"
    | "ZOHO_ATTACHMENT_BLOCKED"
    | "ZOHO_REQUEST_REJECTED"
    | "ZOHO_RECIPIENT_INVALID"
    | "ZOHO_COMPOSE_INVALID"
    | "ZOHO_SEND_UNCERTAIN"
    | "ACTION_FAILED",
    string
  >;
}

export interface DictBySurface {
  "event-map": EventMapDict;
  "fair-map": FairMapDict;
  "fair-model": FairModelDict;
  "fair-garage": FairGarageDict;
  "fair-passport": FairPassportDict;
  "admin-v1": AdminV1Dict;
  "admin-ui": AdminUiDict;
  posta: PostaDict;
  "admin-settings": AdminSettingsDict;
  "admin-tasks": AdminTasksDict;
  "admin-orders": AdminOrdersDict;
  "admin-finance": AdminFinanceDict;
  "admin-services": AdminServicesDict;
  "admin-products": AdminProductsDict;
  "admin-search": AdminSearchDict;
  "admin-team": AdminTeamDict;
  "admin-events": AdminEventsDict;
  "event-lead-email": EventLeadEmailDict;
  "event-report": EventReportDict;
  communications: CommunicationsDict;
  "admin-domain": AdminDomainDict;
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
  "admin-location": AdminLocationDict;
  menu: MenuDict;
  "menu-editor": MenuEditorDict;
  "menu-admin": MenuAdminDict;
  "ordering-admin": OrderingAdminDict;
  ordering: OrderingDict;
  "ordering-panel": OrderingPanelDict;
  "cards-admin": CardsAdminDict;
}

export type Surface = keyof DictBySurface;
