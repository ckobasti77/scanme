"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ScanMePresetPreview } from "@/components/scanme-links/templates/registry";
import type { ScanMeLinksViewModel } from "@/components/scanme-links/templates/types";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  createAccentTokens,
  extractLogoTheme,
  prepareLogoTheme,
} from "@/lib/accent-palette";
import {
  validateScanMeLogo,
} from "@/lib/logo-palette.client";
import {
  DEFAULT_SCANME_DESIGN,
  PRESET_DESIGNS,
  type PaletteAnalysis,
  type ScanMeDesignV1,
  type ScanMePresetKey,
} from "@/lib/scanme-design";
import {
  DESTINATION_DEFAULTS,
  normalizeDestinationUrl,
  type DestinationKind,
} from "@/lib/scanme-links";
import { ContentPanel, type EditorDestinationDraft } from "./content-panel";
import {
  BackgroundPanel,
  BrandColorsPanel,
  ButtonsPanel,
  QuickStylesPanel,
  resetColorsForDesign,
  TextPanel,
} from "./design-panels";
import {
  EditorShell,
  type EditorPanelId,
  type EditorPreviewMode,
  type EditorSaveStatus,
  type EditorZoom,
} from "./editor-shell";
import {
  AnalyticsPanel,
  type EditorMetrics,
  type EditorMetricsRange,
  SettingsPanel,
} from "./operations-panels";
import { EditorPanel, LockedPanel } from "./panel-primitives";
import { EditorPreviewStage } from "./preview-stage";

export type EditorData = NonNullable<
  FunctionReturnType<typeof api.scanMeLinks.editorByRouteKey>
>;

type SaveMutationResult = {
  draftRevision: number;
  design?: ScanMeDesignV1;
};

export function EditorWorkspace({ data }: { data: EditorData }) {
  const profile = data.profile!;
  const config = data.config!;
  const initialDesign = config.design ?? DEFAULT_SCANME_DESIGN;
  const [design, setDesignState] = useState<ScanMeDesignV1>(initialDesign);
  const [description, setDescriptionState] = useState(config.description);
  const [paletteAnalysis, setPaletteAnalysisState] =
    useState<PaletteAnalysis | undefined>(
      config.paletteAnalysis ?? undefined,
    );
  const [designReady, setDesignReady] = useState(
    config.designState === "ready",
  );
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(
    config.logoUrl,
  );
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<
    string | null
  >(config.backgroundImageUrl);
  const [activePanel, setActivePanel] = useState<EditorPanelId>(
    config.designState === "ready" ? "content" : "styles",
  );
  const [selectedId, setSelectedId] =
    useState<Id<"serviceDestinations"> | null>(
      data.destinations[0]?.id ?? null,
    );
  const [addKind, setAddKind] = useState<DestinationKind>("instagram");
  const [previewMode, setPreviewMode] =
    useState<EditorPreviewMode>("mobile");
  const [zoom, setZoom] = useState<EditorZoom>("fit");
  const [saveStatus, setSaveStatus] =
    useState<EditorSaveStatus>("saved");
  const [changeTick, setChangeTick] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string>();
  const [publishing, setPublishing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteId, setDeleteId] =
    useState<Id<"serviceDestinations"> | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [extractingPalette, setExtractingPalette] = useState(false);
  const [applyingPreset, setApplyingPreset] =
    useState<ScanMePresetKey | null>(null);
  const [addingDestination, setAddingDestination] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [mobilePanelOpenRequest, setMobilePanelOpenRequest] = useState(0);
  const [metricsRange, setMetricsRange] =
    useState<EditorMetricsRange>("7d");

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef(config.draftRevision);
  const designRef = useRef(design);
  const descriptionRef = useRef(description);
  const paletteRef = useRef(paletteAnalysis);
  const changeVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  const lastServerRevisionRef = useRef(config.draftRevision);
  const logoObjectUrlRef = useRef<string | null>(null);
  const backgroundObjectUrlRef = useRef<string | null>(null);
  const lastLogoFileRef = useRef<File | null>(null);

  const saveDraftDesign = useMutation(api.scanMeLinks.saveDraftDesign);
  const initializeDraftDesign = useMutation(
    api.scanMeLinks.initializeDraftDesign,
  );
  const generateUploadUrl = useMutation(
    api.scanMeLinks.generateDisplayLogoUploadUrl,
  );
  const setDraftLogo = useMutation(api.scanMeLinks.setDraftLogo);
  const setDraftBackgroundImage = useMutation(
    api.scanMeLinks.setDraftBackgroundImage,
  );
  const addDestination = useMutation(api.scanMeLinks.addDestination);
  const updateDestination = useMutation(api.scanMeLinks.updateDestination);
  const reorderDestinations = useMutation(
    api.scanMeLinks.reorderDestinations,
  );
  const markDestinationDeleted = useMutation(
    api.scanMeLinks.markDestinationDeleted,
  );
  const discardDraft = useMutation(api.scanMeLinks.discardDraft);
  const publishDraft = useMutation(api.scanMeLinks.publishDraft);
  const setServiceActive = useMutation(api.scanMeLinks.setServiceActive);
  const setClientEditingEnabled = useMutation(
    api.scanMeLinks.setClientEditingEnabled,
  );

  const metrics = useQuery(
    api.scanMeLinks.metrics,
    {
      businessId: data.id,
      range: metricsRange,
    },
  ) as EditorMetrics | null | undefined;

  const destinations = useMemo(
    () =>
      [...data.destinations]
        .sort((first, second) => first.order - second.order)
        .map(
          (destination) =>
            ({
              ...destination,
              presentation: destination.presentation ?? "button",
            }) satisfies EditorDestinationDraft,
        ),
    [data.destinations],
  );
  const currentSelectedId =
    selectedId &&
    destinations.some((destination) => destination.id === selectedId)
      ? selectedId
      : (destinations[0]?.id ?? null);

  useEffect(() => {
    revisionRef.current = Math.max(
      revisionRef.current,
      config.draftRevision,
    );
    if (
      config.draftRevision > lastServerRevisionRef.current &&
      changeVersionRef.current === savedVersionRef.current &&
      saveStatus !== "saving"
    ) {
      const timeout = window.setTimeout(() => {
        lastServerRevisionRef.current = config.draftRevision;
        if (config.design) {
          setDesignState(config.design);
          designRef.current = config.design;
        }
        setDescriptionState(config.description);
        descriptionRef.current = config.description;
        const nextPalette = config.paletteAnalysis ?? undefined;
        setPaletteAnalysisState(nextPalette);
        paletteRef.current = nextPalette;
        setDesignReady(config.designState === "ready");
        if (!logoObjectUrlRef.current) setLogoPreviewUrl(config.logoUrl);
        if (!backgroundObjectUrlRef.current) {
          setBackgroundPreviewUrl(config.backgroundImageUrl);
        }
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [config, saveStatus]);

  useEffect(
    () => () => {
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
      }
      if (backgroundObjectUrlRef.current) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (
        changeVersionRef.current !== savedVersionRef.current ||
        saveStatus === "error"
      ) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [saveStatus]);

  const flushDesign = useCallback(async (): Promise<void> => {
    if (!designReady) return;
    while (savedVersionRef.current < changeVersionRef.current) {
      if (inFlightSaveRef.current) {
        await inFlightSaveRef.current;
        continue;
      }
      const savingVersion = changeVersionRef.current;
      setSaveStatus("saving");
      setSaveMessage(undefined);
      const request = (async () => {
        try {
          const result = (await saveDraftDesign({
            serviceProfileId: profile.id,
            expectedDraftRevision: revisionRef.current,
            design: designRef.current,
            description: descriptionRef.current,
            ...(paletteRef.current
              ? { paletteAnalysis: paletteRef.current }
              : {}),
          })) as SaveMutationResult;
          revisionRef.current = result.draftRevision;
          lastServerRevisionRef.current = result.draftRevision;
          if (result.design) {
            designRef.current = result.design;
            setDesignState(result.design);
          }
          savedVersionRef.current = Math.max(
            savedVersionRef.current,
            savingVersion,
          );
          setSaveStatus(
            savedVersionRef.current < changeVersionRef.current
              ? "dirty"
              : "saved",
          );
        } catch (error) {
          setSaveStatus("error");
          setSaveMessage(errorMessage(error, "Nacrt nije sačuvan."));
          throw error;
        } finally {
          inFlightSaveRef.current = null;
        }
      })();
      inFlightSaveRef.current = request;
      await request;
    }
  }, [designReady, profile.id, saveDraftDesign]);

  useEffect(() => {
    if (saveStatus !== "dirty" || !designReady) return;
    const timeout = window.setTimeout(() => {
      void flushDesign().catch(() => {
        // The visible save status and retry action handle the failure.
      });
    }, 550);
    return () => window.clearTimeout(timeout);
  }, [changeTick, designReady, flushDesign, saveStatus]);

  function markDesignDirty(
    nextDesign: ScanMeDesignV1,
    nextDescription = descriptionRef.current,
    nextPalette = paletteRef.current,
  ) {
    designRef.current = nextDesign;
    descriptionRef.current = nextDescription;
    paletteRef.current = nextPalette;
    setDesignState(nextDesign);
    setDescriptionState(nextDescription);
    setPaletteAnalysisState(nextPalette);
    changeVersionRef.current += 1;
    setChangeTick((value) => value + 1);
    setSaveStatus("dirty");
    setSaveMessage(undefined);
  }

  function changeDescription(next: string) {
    const limited = next.slice(0, 160);
    markDesignDirty(designRef.current, limited, paletteRef.current);
  }

  async function applyPreset(presetKey: ScanMePresetKey) {
    setApplyingPreset(presetKey);
    try {
      const preset = structuredClone(PRESET_DESIGNS[presetKey]);
      if (!designReady) {
        const result = (await initializeDraftDesign({
          serviceProfileId: profile.id,
          expectedDraftRevision: revisionRef.current,
          source: { kind: "preset", presetKey },
          description: descriptionRef.current,
        })) as SaveMutationResult;
        revisionRef.current = result.draftRevision;
        lastServerRevisionRef.current = result.draftRevision;
        designRef.current = result.design ?? preset;
        setDesignState(result.design ?? preset);
        setDesignReady(true);
        changeVersionRef.current += 1;
        setChangeTick((value) => value + 1);
        savedVersionRef.current = changeVersionRef.current;
        setSaveStatus("saved");
        toast.success("Početni stil je primenjen.");
      } else {
        markDesignDirty(preset);
      }
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(errorMessage(error, "Stil nije primenjen."));
      toast.error(errorMessage(error, "Stil nije primenjen."));
    } finally {
      setApplyingPreset(null);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    try {
      validateScanMeLogo(file);
      const controller = new AbortController();
      const prepared = await prepareLogoTheme(file, {
        signal: controller.signal,
      });
      const { uploadFile, ...generated } = prepared;
      const uploadUrl = await generateUploadUrl({
        serviceProfileId: profile.id,
      });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": uploadFile.type },
        body: uploadFile,
      });
      if (!response.ok) throw new Error("Logotip nije otpremljen.");
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      await flushDesign();
      const logoResult = await setDraftLogo({
        serviceProfileId: profile.id,
        expectedDraftRevision: revisionRef.current,
        logoStorageId: storageId,
      });
      revisionRef.current = logoResult.draftRevision;
      lastServerRevisionRef.current = logoResult.draftRevision;
      lastLogoFileRef.current = file;
      setObjectPreview(file, logoObjectUrlRef, setLogoPreviewUrl);

      if (!designReady) {
        const result = (await initializeDraftDesign({
          serviceProfileId: profile.id,
          expectedDraftRevision: revisionRef.current,
          source: {
            kind: "generated",
            design: generated.design,
            paletteAnalysis: generated.paletteAnalysis,
          },
          description: descriptionRef.current,
        })) as SaveMutationResult;
        revisionRef.current = result.draftRevision;
        lastServerRevisionRef.current = result.draftRevision;
        designRef.current = result.design ?? generated.design;
        paletteRef.current = generated.paletteAnalysis;
        setDesignState(result.design ?? generated.design);
        setPaletteAnalysisState(generated.paletteAnalysis);
        setDesignReady(true);
        changeVersionRef.current += 1;
        setChangeTick((value) => value + 1);
        savedVersionRef.current = changeVersionRef.current;
        setSaveStatus("saved");
      } else {
        markDesignDirty(
          generated.design,
          descriptionRef.current,
          generated.paletteAnalysis,
        );
      }
      toast.success("Logotip i pristupačna paleta su spremni.");
    } catch (error) {
      toast.error(errorMessage(error, "Logotip nije otpremljen."));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function extractPaletteAgain() {
    if (!logoPreviewUrl) return;
    setExtractingPalette(true);
    try {
      let file = lastLogoFileRef.current;
      if (!file) {
        const response = await fetch(logoPreviewUrl);
        if (!response.ok) throw new Error("Logotip nije moguće učitati.");
        const blob = await response.blob();
        file = new File([blob], "scanme-logo", {
          type: blob.type || "image/png",
        });
      }
      const generated = await extractLogoTheme(file);
      if (!designReady) {
        const result = (await initializeDraftDesign({
          serviceProfileId: profile.id,
          expectedDraftRevision: revisionRef.current,
          source: {
            kind: "generated",
            design: generated.design,
            paletteAnalysis: generated.paletteAnalysis,
          },
          description: descriptionRef.current,
        })) as SaveMutationResult;
        revisionRef.current = result.draftRevision;
        designRef.current = result.design ?? generated.design;
        setDesignState(result.design ?? generated.design);
        setDesignReady(true);
        changeVersionRef.current += 1;
        setChangeTick((value) => value + 1);
        savedVersionRef.current = changeVersionRef.current;
        setSaveStatus("saved");
      } else {
        markDesignDirty(
          generated.design,
          descriptionRef.current,
          generated.paletteAnalysis,
        );
      }
      setPaletteAnalysisState(generated.paletteAnalysis);
      paletteRef.current = generated.paletteAnalysis;
      toast.success("Paleta je ponovo generisana.");
    } catch (error) {
      toast.error(errorMessage(error, "Paleta nije generisana."));
    } finally {
      setExtractingPalette(false);
    }
  }

  async function uploadBackground(file: File | undefined) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size <= 0 ||
      file.size > 8 * 1024 * 1024
    ) {
      toast.error("Pozadina mora biti PNG, JPEG ili WebP do 8 MB.");
      return;
    }
    setUploadingBackground(true);
    try {
      const uploadFile = await optimizeBackgroundImage(file);
      await flushDesign();
      const uploadUrl = await generateUploadUrl({
        serviceProfileId: profile.id,
      });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": uploadFile.type },
        body: uploadFile,
      });
      if (!response.ok) throw new Error("Pozadina nije otpremljena.");
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };
      const result = await setDraftBackgroundImage({
        serviceProfileId: profile.id,
        expectedDraftRevision: revisionRef.current,
        backgroundImageStorageId: storageId,
      });
      revisionRef.current = result.draftRevision;
      lastServerRevisionRef.current = result.draftRevision;
      setObjectPreview(
        uploadFile,
        backgroundObjectUrlRef,
        setBackgroundPreviewUrl,
      );
      setSaveStatus("saved");
      toast.success("Pozadinska slika je sačuvana u nacrtu.");
    } catch (error) {
      toast.error(errorMessage(error, "Pozadina nije otpremljena."));
    } finally {
      setUploadingBackground(false);
    }
  }

  async function removeBackground() {
    try {
      await flushDesign();
      const result = await setDraftBackgroundImage({
        serviceProfileId: profile.id,
        expectedDraftRevision: revisionRef.current,
        backgroundImageStorageId: null,
      });
      revisionRef.current = result.draftRevision;
      if (backgroundObjectUrlRef.current) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current);
        backgroundObjectUrlRef.current = null;
      }
      setBackgroundPreviewUrl(null);
      toast.success("Pozadinska slika je uklonjena iz nacrta.");
    } catch (error) {
      toast.error(errorMessage(error, "Pozadina nije uklonjena."));
    }
  }

  async function addNewDestination(input?: {
    kind: DestinationKind;
    label?: string;
    url?: string;
    iconKey?: string;
    presentation?: "button" | "social";
  }) {
    setAddingDestination(true);
    try {
      await flushDesign();
      const kind = input?.kind ?? addKind;
      const result = await addDestination({
        serviceProfileId: profile.id,
        kind,
        presentation: input?.presentation ?? "button",
      });
      revisionRef.current = result.draftRevision;

      const defaults = DESTINATION_DEFAULTS[kind];
      const label = input?.label?.trim() || defaults.label;
      const rawUrl = input?.url?.trim() || "";
      const url = rawUrl ? normalizeDestinationUrl(rawUrl) : "";
      const iconKey = input?.iconKey || defaults.iconKey;
      const state = url ? "active" : "inactive";
      const presentation = input?.presentation ?? "button";

      const updateResult = await updateDestination({
        destinationId: result.destinationId,
        kind,
        label,
        url,
        iconKey,
        state,
        presentation,
      });
      revisionRef.current = updateResult.draftRevision;

      setSelectedId(result.destinationId);
      setActivePanel("content");
      setMobilePanelOpenRequest((value) => value + 1);
      toast.success("Link je uspešno dodat.");
    } catch (error) {
      toast.error(errorMessage(error, "Link nije dodat."));
    } finally {
      setAddingDestination(false);
    }
  }

  async function updateExistingDestination(
    destination: EditorDestinationDraft,
  ) {
    try {
      await flushDesign();
      const result = await updateDestination({
        destinationId: destination.id,
        kind: destination.kind,
        label: destination.label,
        url: destination.url,
        iconKey: destination.iconKey,
        state: destination.state,
        presentation: destination.presentation ?? "button",
      });
      revisionRef.current = result.draftRevision;
    } catch (error) {
      toast.error(errorMessage(error, "Link nije sačuvan."));
      throw error;
    }
  }

  async function reorder(ids: Id<"serviceDestinations">[]) {
    try {
      await flushDesign();
      const result = await reorderDestinations({
        serviceProfileId: profile.id,
        destinationIds: ids,
      });
      revisionRef.current = result.draftRevision;
    } catch (error) {
      toast.error(errorMessage(error, "Redosled nije sačuvan."));
      throw error;
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await flushDesign();
      const result = await markDestinationDeleted({
        destinationId: deleteId,
      });
      revisionRef.current = result.draftRevision;
      setDeleteId(null);
      setSelectedId(null);
      toast.success("Brisanje je dodato u nacrt.");
    } catch (error) {
      toast.error(errorMessage(error, "Link nije obrisan."));
    }
  }

  async function discard() {
    if (
      !window.confirm(
        "Odbaciti sve izmene nacrta i vratiti poslednju objavljenu verziju?",
      )
    ) {
      return;
    }
    try {
      const result = await discardDraft({ serviceProfileId: profile.id });
      revisionRef.current = result.draftRevision;
      lastServerRevisionRef.current = result.draftRevision - 1;
      changeVersionRef.current += 1;
      setChangeTick((value) => value + 1);
      savedVersionRef.current = changeVersionRef.current;
      setSaveStatus("saved");
      setSelectedId(null);
      toast.success("Nacrt je vraćen na poslednju objavljenu verziju.");
    } catch (error) {
      toast.error(errorMessage(error, "Nacrt nije odbačen."));
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      await flushDesign();
      await publishDraft({
        serviceProfileId: profile.id,
        expectedDraftRevision: revisionRef.current,
      });
      setPublishOpen(false);
      setSaveStatus("saved");
      toast.success("ScanMe Links stranica je objavljena.");
    } catch (error) {
      toast.error(errorMessage(error, "Izmene nisu objavljene."));
    } finally {
      setPublishing(false);
    }
  }

  async function changeServiceActive(active: boolean) {
    setUpdatingSettings(true);
    try {
      await setServiceActive({ serviceProfileId: profile.id, active });
      toast.success(active ? "Stranica je aktivirana." : "Stranica je pauzirana.");
    } catch (error) {
      toast.error(errorMessage(error, "Status nije promenjen."));
    } finally {
      setUpdatingSettings(false);
    }
  }

  async function changeClientEditing(enabled: boolean) {
    setUpdatingSettings(true);
    try {
      await setClientEditingEnabled({
        serviceProfileId: profile.id,
        enabled,
      });
      toast.success(
        enabled
          ? "Klijentsko uređivanje je uključeno."
          : "Klijentsko uređivanje je isključeno.",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Pristup nije promenjen."));
    } finally {
      setUpdatingSettings(false);
    }
  }

  const activeDestinations = destinations.filter(
    (destination) => destination.state === "active",
  );
  const preview: ScanMeLinksViewModel = {
    displayName: data.name,
    description,
    logoUrl: logoPreviewUrl,
    backgroundImageUrl: backgroundPreviewUrl,
    templateKey: "option-two",
    backgroundKey: "warm-ivory",
    accent: design.colors.accent,
    accentTokens: createAccentTokens(design.colors.accent),
    design,
    destinations: activeDestinations.map((destination) => ({
      id: destination.id,
      kind: destination.kind,
      label: destination.label,
      url: destination.url,
      iconKey: destination.iconKey,
      presentation: destination.presentation ?? "button",
    })),
  };

  const panelLocked =
    !designReady &&
    !["styles", "colors", "settings"].includes(activePanel);
  const panel = panelLocked ? (
    <EditorPanel
      title={
        activePanel === "content"
          ? "Sadržaj"
          : activePanel === "analytics"
            ? "Analitika"
            : activePanel === "background"
              ? "Pozadina"
              : activePanel === "buttons"
                ? "Dugmad"
                : "Tekst"
      }
      description="Ova sekcija se otključava kada postavite početni stil."
    >
      <LockedPanel onChooseStyle={() => setActivePanel("styles")} />
    </EditorPanel>
  ) : (
    renderPanel()
  );

  function renderPanel() {
    switch (activePanel) {
      case "content":
        return (
          <ContentPanel
            businessName={data.name}
            description={description}
            onDescriptionChange={changeDescription}
            onDescriptionCommit={() => {
              void flushDesign().catch(() => {
                // The panel and top bar expose retry.
              });
            }}
            logoUrl={logoPreviewUrl}
            uploadingLogo={uploadingLogo}
            onLogoUpload={(file) => void uploadLogo(file)}
            destinations={destinations}
            selectedId={currentSelectedId}
            onSelectDestination={setSelectedId}
            addKind={addKind}
            onAddKindChange={setAddKind}
            addingDestination={addingDestination}
            onAddDestination={() => void addNewDestination()}
            onUpdateDestination={updateExistingDestination}
            onDeleteDestination={setDeleteId}
          />
        );
      case "styles":
        return (
          <QuickStylesPanel
            design={design}
            isInitialized={designReady}
            applyingPreset={applyingPreset}
            onApplyPreset={(preset) => void applyPreset(preset)}
            onSuggestFromLogo={() => {
              setActivePanel("colors");
              setMobilePanelOpenRequest((value) => value + 1);
            }}
            renderPresetPreview={(preset) => (
              <ScanMePresetPreview
                presetKey={preset}
                displayName={data.name}
                className="h-full w-full"
              />
            )}
          />
        );
      case "colors":
        return (
          <BrandColorsPanel
            design={design}
            isInitialized={designReady}
            paletteAnalysis={paletteAnalysis}
            logoUrl={logoPreviewUrl}
            uploadingLogo={uploadingLogo}
            onLogoUpload={(file) => void uploadLogo(file)}
            extractingPalette={extractingPalette}
            onExtractPalette={() => void extractPaletteAgain()}
            onDesignChange={markDesignDirty}
            onReset={() => markDesignDirty(resetColorsForDesign(design))}
          />
        );
      case "background":
        return (
          <BackgroundPanel
            design={design}
            backgroundImageUrl={backgroundPreviewUrl}
            uploadingImage={uploadingBackground}
            onDesignChange={markDesignDirty}
            onImageUpload={(file) => void uploadBackground(file)}
            onRemoveImage={() => void removeBackground()}
          />
        );
      case "buttons":
        return (
          <ButtonsPanel design={design} onDesignChange={markDesignDirty} />
        );
      case "text":
        return <TextPanel design={design} onDesignChange={markDesignDirty} />;
      case "analytics":
        return (
          <AnalyticsPanel
            metrics={metrics}
            loading={metrics === undefined}
            range={metricsRange}
            onRangeChange={setMetricsRange}
            available
          />
        );
      case "settings":
        return (
          <SettingsPanel
            publicHref={`/${profile.slug}`}
            serviceActive={profile.status === "active"}
            clientEditingEnabled={profile.clientEditingEnabled}
            isAdmin={data.editorRole === "admin"}
            hasUnpublishedChanges={
              config.hasUnpublishedChanges ||
              saveStatus === "dirty" ||
              saveStatus === "saving" ||
              saveStatus === "error"
            }
            updating={updatingSettings}
            onServiceActiveChange={(active) =>
              void changeServiceActive(active)
            }
            onClientEditingChange={(enabled) =>
              void changeClientEditing(enabled)
            }
            onDiscard={() => void discard()}
          />
        );
    }
  }

  const localChanges =
    saveStatus === "dirty" ||
    saveStatus === "saving" ||
    saveStatus === "error";
  const canPublish =
    designReady &&
    saveStatus !== "error" &&
    saveStatus !== "saving" &&
    (config.hasUnpublishedChanges || localChanges);

  return (
    <>
      <EditorShell
        businessName={data.name}
        publicHref={`/${profile.slug}`}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        isDesignReady={designReady}
        saveStatus={saveStatus}
        saveMessage={saveMessage}
        canPublish={canPublish}
        publishing={publishing}
        onSave={() =>
          void flushDesign()
            .then(() => toast.success("Nacrt je sačuvan."))
            .catch(() => {
              // The top bar exposes the save error and retry action.
            })
        }
        onRetry={() => {
          void flushDesign().catch(() => {
            // Retry keeps the error state visible when it fails again.
          });
        }}
        onPublish={() => setPublishOpen(true)}
        onDiscard={() => void discard()}
        panel={panel}
        preview={
          <EditorPreviewStage
            view={preview}
            destinations={destinations}
            designReady={designReady}
            selectedId={currentSelectedId}
            previewMode={previewMode}
            zoom={zoom}
            onSelect={(id) => {
              setSelectedId(id);
              setActivePanel("content");
              setMobilePanelOpenRequest((value) => value + 1);
            }}
            onAdd={() => {
              setActivePanel("content");
              setMobilePanelOpenRequest((value) => value + 1);
            }}
            onChooseStyle={() => {
              setActivePanel("styles");
              setMobilePanelOpenRequest((value) => value + 1);
            }}
            onReorder={reorder}
          />
        }
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        zoom={zoom}
        onZoomChange={setZoom}
        onFullscreen={() => {
          const element = previewContainerRef.current;
          if (element?.requestFullscreen) {
            void element.requestFullscreen().catch(() =>
              toast.error("Fullscreen prikaz nije dostupan."),
            );
          }
        }}
        previewContainerRef={previewContainerRef}
        mobilePanelOpenRequest={mobilePanelOpenRequest}
      />

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="rounded-2xl bg-[#fcfbf8]">
          <DialogHeader>
            <DialogTitle>Objaviti izmene?</DialogTitle>
            <DialogDescription>
              Nova verzija će odmah postati vidljiva svim posetiocima.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={publishing}>
                Otkaži
              </Button>
            </DialogClose>
            <Button onClick={() => void publish()} disabled={publishing}>
              {publishing ? "Objavljivanje…" : "Objavi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent className="rounded-2xl bg-[#fcfbf8]">
          <DialogHeader>
            <DialogTitle>Obrisati link?</DialogTitle>
            <DialogDescription>
              Link će biti uklonjen nakon sledećeg objavljivanja. Metrike se
              trajno brišu tek tada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Otkaži</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              Obriši link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function setObjectPreview(
  file: File,
  reference: MutableRefObject<string | null>,
  setter: (value: string | null) => void,
) {
  if (reference.current) URL.revokeObjectURL(reference.current);
  const next = URL.createObjectURL(file);
  reference.current = next;
  setter(next);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function optimizeBackgroundImage(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = sourceUrl;
    await image.decode();
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("Pozadinska slika nema ispravne dimenzije.");
    }
    const maximumDimension = 2400;
    const scale = Math.min(
      1,
      maximumDimension / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Pregledač ne podržava obradu slike.");
    }
    context.drawImage(image, 0, 0, width, height);
    const outputType = file.type === "image/png" ? "image/png" : "image/webp";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Pozadina nije optimizovana.")),
        outputType,
        outputType === "image/webp" ? 0.86 : undefined,
      );
    });
    if (blob.size > 8 * 1024 * 1024) {
      throw new Error(
        "Optimizovana pozadina je i dalje veća od 8 MB. Izaberite manju sliku.",
      );
    }
    const extension = outputType === "image/png" ? ".png" : ".webp";
    const name = file.name.replace(/\.[^.]+$/, "") || "scanme-background";
    return new File([blob], `${name}${extension}`, {
      type: outputType,
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
