"use client";

import { ConvexError } from "convex/values";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  PanelTop,
  Redo2,
  Save,
  Send,
  Undo2,
  Video as VideoIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { AdminGuard } from "@/components/admin/admin-guard";
import { EditorTooltip } from "@/components/admin/editor-tooltip";
import {
  EditorBackdrop,
  EditorPanelContent,
  panelCopy,
  primaryToolItems,
  SaveStatus,
  secondaryToolItems,
  visibleSecondaryToolItems,
  useCompactEditor,
  type EditorToolItem,
} from "@/components/admin/scanme-links-editor-common";
import { MobileEditorShell } from "@/components/admin/scanme-links-editor-mobile";
import { ScanMeLinksEditorPreview } from "@/components/admin/scanme-links-editor-preview";
import { BrandLogo } from "@/components/brand-logo";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { extractLogoProfile } from "@/lib/accent-palette";
import {
  DESTINATION_DEFAULTS,
  type DestinationKind,
  type DestinationLifecycle,
} from "@/lib/scanme-links";
import {
  createSafeScanMeLinksDesignV2,
  type ScanMeLinksDesignV2,
} from "@/lib/scanme-links-design";
import {
  DEFAULT_PALETTE_LOCKS,
  DEFAULT_PALETTE_SCHEME,
  generateScanMePalette,
  inferPaletteMode,
  inferPaletteModeFromProfile,
  normalizePaletteLocks,
} from "@/lib/scanme-palette";
import { defaultSchemeFromColors } from "@/lib/scanme-material-color";
import { cn } from "@/lib/utils";
import styles from "./scanme-links-editor.module.css";
import type {
  EditorData,
  EditorDestination,
  EditorPanelId,
  EditorSaveState,
  PreviewDevice,
  ScanMeLinksEditorDocument,
} from "./scanme-links-editor-types";
import { useEditorHistory } from "./use-editor-history";

export function ScanMeLinksEditorScreen({
  slug,
  businessId,
}: {
  slug?: string;
  businessId?: string;
}) {
  if (slug) {
    // Ruta /[slug]/editor je dostupna i klijentima sa uključenim uređivanjem;
    // autorizaciju po lokalu sprovodi editorBySlug (admin ili klijent sa
    // clientEditingEnabled), pa je ovde dovoljna samo provera prijave.
    return (
      <>
        <AuthLoading>
          <main className="grid min-h-[100dvh] place-items-center bg-[#f4efe7]">
            <div className="grid justify-items-center gap-4 text-sm font-semibold text-black/55">
              <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
              Učitavanje editora…
            </div>
          </main>
        </AuthLoading>
        <Unauthenticated>
          <main className="grid min-h-[100dvh] place-items-center bg-[#f4efe7] p-5">
            <section className="w-full max-w-lg rounded-[2rem] border border-white/65 bg-white/70 p-8 text-center shadow-xl backdrop-blur-xl">
              <h1 className="text-2xl font-bold tracking-[-0.04em]">
                Prijava je potrebna
              </h1>
              <p className="mt-3 text-sm leading-6 text-black/55">
                Prijavite se nalogom koji ima pristup ovom lokalu da biste
                uređivali ScanMe Links stranicu.
              </p>
              <Link
                href={`/${encodeURIComponent(slug)}/client-panel`}
                className="button-primary mt-6 inline-flex"
              >
                Otvori prijavu
              </Link>
            </section>
          </main>
        </Unauthenticated>
        <Authenticated>
          <EditorLoader slug={slug} />
        </Authenticated>
      </>
    );
  }
  return (
    <AdminGuard>
      <EditorLoader businessId={businessId} />
    </AdminGuard>
  );
}

function EditorLoader({
  slug,
  businessId,
}: {
  slug?: string;
  businessId?: string;
}) {
  const bySlug = useQuery(
    api.scanMeLinks.editorBySlug,
    slug ? { slug } : "skip",
  );
  const byBusinessId = useQuery(
    api.scanMeLinks.editor,
    !slug && businessId
      ? { businessId: businessId as Id<"businesses"> }
      : "skip",
  );
  const data = (slug ? bySlug : byBusinessId) as EditorData | null | undefined;

  if (data === undefined) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4efe7]">
        <div className="grid justify-items-center gap-4 text-sm font-semibold text-black/55">
          <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
          Učitavanje editora…
        </div>
      </main>
    );
  }

  if (!data?.profile || !data.config) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4efe7] p-5">
        <section className="w-full max-w-lg rounded-[2rem] border border-white/65 bg-white/70 p-8 text-center shadow-xl backdrop-blur-xl">
          <h1 className="text-2xl font-bold tracking-[-0.04em]">
            Editor nije dostupan
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/55">
            ScanMe Links profil za ovaj lokal nije pronađen ili nemate dozvolu
            da ga uređujete.
          </p>
        </section>
      </main>
    );
  }

  return (
    <EditorWorkspace
      key={data.profile.id}
      data={data}
      enteredThroughLegacyRoute={!slug}
      requestedSlug={slug}
    />
  );
}

// Eksportovan zbog dev harness rute (app/dev/mobile-editor) koja ubacuje
// fixture podatke bez prijave; produkcione rute i dalje ulaze kroz
// ScanMeLinksEditorScreen.
export function EditorWorkspace({
  data,
  enteredThroughLegacyRoute,
  requestedSlug,
}: {
  data: EditorData;
  enteredThroughLegacyRoute: boolean;
  requestedSlug?: string;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const compactEditor = useCompactEditor();
  const initialDocument = useMemo(() => documentFromData(data), [data]);
  const history = useEditorHistory(initialDocument);
  const document = history.value;
  const [saveState, setSaveState] = useState<EditorSaveState>("saved");
  const setDocument = useCallback(
    (
      next:
        | ScanMeLinksEditorDocument
        | ((
            current: ScanMeLinksEditorDocument,
          ) => ScanMeLinksEditorDocument),
      group?: string,
    ) => {
      setSaveState("saving");
      history.set(next, group);
    },
    [history],
  );
  const [activePanel, setActivePanel] = useState<EditorPanelId | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] =
    useState<Id<"serviceDestinations"> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("phone");
  const [zoom, setZoom] = useState(100);
  const [deleteTarget, setDeleteTarget] =
    useState<EditorDestination | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [dragTargetSide, setDragTargetSide] = useState<"left" | "right">("left");
  const editorRootRef = useRef<HTMLDivElement>(null);
  const currentDocumentRef = useRef(document);
  const persistedHashRef = useRef(documentHash(initialDocument));
  const latestRevisionRef = useRef(data.config!.draftRevision);
  const saveRequestRef = useRef(0);
  const objectUrlsRef = useRef(new Set<string>());

  const saveEditorDraft = useMutation(api.scanMeLinks.saveEditorDraft);
  const publishDraft = useMutation(api.scanMeLinks.publishDraft);
  const addDestination = useMutation(api.scanMeLinks.addDestination);
  const generateEditorUploadUrl = useMutation(
    api.scanMeLinks.generateEditorUploadUrl,
  );
  const updateBusinessName = useMutation(api.admin.updateBusinessName);
  const updateBusinessSlug = useMutation(api.admin.updateBusinessSlug);
  const setServiceActive = useMutation(api.scanMeLinks.setServiceActive);

  const currentHash = useMemo(() => documentHash(document), [document]);
  const selectedDestination =
    document.destinations.find(
      (destination) => destination.id === selectedDestinationId,
    ) ?? null;

  useEffect(() => {
    currentDocumentRef.current = document;
  }, [document]);

  useEffect(() => {
    if (
      data.clientPanelSlug &&
      (enteredThroughLegacyRoute || requestedSlug !== data.clientPanelSlug)
    ) {
      router.replace(`/${data.clientPanelSlug}/editor`);
    }
  }, [
    data.clientPanelSlug,
    enteredThroughLegacyRoute,
    requestedSlug,
    router,
  ]);

  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const persistDocument = useCallback(
    async (
      target: ScanMeLinksEditorDocument,
      options?: { force?: boolean },
    ) => {
      const hash = documentHash(target);
      if (!options?.force && hash === persistedHashRef.current) {
        return { draftRevision: latestRevisionRef.current };
      }

      validateDocument(target);
      const requestId = ++saveRequestRef.current;
      setSaveState("saving");
      setSaveError(null);
      try {
        const result = await saveEditorDraft({
          serviceProfileId: data.profile!.id,
          displayName: target.title.trim() || null,
          description: target.description.trim() || null,
          ...(target.inheritsBusinessLogo
            ? {}
            : { logoStorageId: target.logoStorageId }),
          palette: target.palette,
          paletteAnalysis: target.paletteAnalysis,
          design: target.design,
          backgroundImageStorageId: target.backgroundImageStorageId,
          backgroundVideoStorageId: target.backgroundVideoStorageId,
          destinations: target.destinations.map((destination, order) => ({
            id: destination.id,
            kind: destination.kind,
            label: destination.label.trim(),
            url: destination.url.trim(),
            order,
            state:
              destination.state === "deleted"
                ? ("deleted" as const)
                : destination.state === "inactive"
                  ? ("inactive" as const)
                  : ("active" as const),
          })),
        });
        persistedHashRef.current = hash;
        latestRevisionRef.current = result.draftRevision;
        if (requestId === saveRequestRef.current) {
          setSaveState(
            documentHash(currentDocumentRef.current) === hash
              ? "saved"
              : "saving",
          );
        }
        return result;
      } catch (error) {
        const message = errorMessage(error, "Nacrt nije sačuvan.");
        if (requestId === saveRequestRef.current) {
          setSaveState("error");
          setSaveError(message);
        }
        throw error;
      }
    },
    [data.profile, saveEditorDraft],
  );

  useEffect(() => {
    if (currentHash === persistedHashRef.current) {
      const settledTimer = window.setTimeout(() => {
        setSaveState((current) => (current === "error" ? current : "saved"));
      }, 0);
      return () => window.clearTimeout(settledTimer);
    }
    const timer = window.setTimeout(() => {
      void persistDocument(document).catch(() => {
        // The visible save state and toast from explicit actions carry the error.
      });
    }, 720);
    return () => window.clearTimeout(timer);
  }, [currentHash, document, persistDocument]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDragDepth(0);
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") {
        return;
      }
      if (!editorRootRef.current || !window.document.hasFocus()) return;
      event.preventDefault();
      setSaveState("saving");
      if (event.shiftKey) history.redo();
      else history.undo();
    }

    function handleWindowDragOver(event: DragEvent) {
      if (hasFiles(event.dataTransfer!)) {
        event.preventDefault();
      }
    }

    function handleWindowDrop(event: DragEvent) {
      if (hasFiles(event.dataTransfer!)) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [history]);

  async function handleExplicitSave() {
    try {
      await persistDocument(document, { force: currentHash !== persistedHashRef.current });
      toast.success("Nacrt je sačuvan.");
    } catch (error) {
      toast.error(errorMessage(error, "Nacrt nije sačuvan."));
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const saveResult = await persistDocument(currentDocumentRef.current);
      await publishDraft({
        serviceProfileId: data.profile!.id,
        expectedDraftRevision: saveResult.draftRevision,
      });
      setPublishOpen(false);
      toast.success("ScanMe Links stranica je objavljena.");
    } catch (error) {
      toast.error(errorMessage(error, "Nacrt nije objavljen."));
    } finally {
      setPublishing(false);
    }
  }

  async function handleAddDestination() {
    if (addBusy) return;
    setAddBusy(true);
    try {
      const result = await addDestination({
        serviceProfileId: data.profile!.id,
        kind: "instagram",
      });
      const visible = document.destinations.filter(
        (destination) => destination.state !== "deleted",
      );
      const nextDestination: EditorDestination = {
        id: result.destinationId,
        kind: "instagram",
        label: DESTINATION_DEFAULTS.instagram.label,
        url: "",
        iconKey: DESTINATION_DEFAULTS.instagram.iconKey,
        order: visible.length,
        state: "active",
        publishedState: null,
        totalClicks: 0,
        totalDirectVisits: 0,
      };
      latestRevisionRef.current = result.draftRevision;
      setDocument((current) => ({
        ...current,
        destinations: [...current.destinations, nextDestination],
      }));
      setSelectedDestinationId(result.destinationId);
      setActivePanel("content");
    } catch (error) {
      toast.error(errorMessage(error, "Novi link nije dodat."));
    } finally {
      setAddBusy(false);
    }
  }

  function handleReorder(activeId: string, overId: string) {
    const ordered = document.destinations
      .filter((destination) => destination.state !== "deleted")
      .sort((a, b) => a.order - b.order);
    const oldIndex = ordered.findIndex(
      (destination) => destination.id === activeId,
    );
    const newIndex = ordered.findIndex(
      (destination) => destination.id === overId,
    );
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const moved = arrayMove(ordered, oldIndex, newIndex).map(
      (destination, order) => ({ ...destination, order }),
    );
    const movedById = new Map(moved.map((destination) => [destination.id, destination]));
    setDocument((current) => ({
      ...current,
      destinations: current.destinations.map(
        (destination) => movedById.get(destination.id) ?? destination,
      ),
    }));
  }

  function handleSelectDestination(
    destinationId: Id<"serviceDestinations">,
  ) {
    setSelectedDestinationId(destinationId);
    setActivePanel("content");
  }

  function handlePanelSelect(panel: EditorPanelId) {
    const nextPanel = activePanel === panel ? null : panel;
    if (nextPanel !== "content") {
      setSelectedDestinationId(null);
    }
    setActivePanel(nextPanel);
  }

  function closeActivePanel() {
    setSelectedDestinationId(null);
    setActivePanel(null);
  }

  function handleUndo() {
    setSaveState("saving");
    history.undo();
  }

  function handleRedo() {
    setSaveState("saving");
    history.redo();
  }

  function confirmDeleteDestination() {
    if (!deleteTarget) return;
    const destinationId = deleteTarget.id;
    setDocument((current) => ({
      ...current,
      destinations: current.destinations.map((destination) =>
        destination.id === destinationId
          ? { ...destination, state: "deleted" }
          : destination,
      ),
    }));
    setSelectedDestinationId(null);
    setDeleteTarget(null);
    toast.success("Link je uklonjen iz nacrta.");
  }

  async function uploadLogo(file: File) {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ];
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error("Logo mora biti PNG, JPEG, WebP ili SVG fajl do 5 MB.");
      return;
    }
    setUploadBusy(true);
    try {
      const [storageId, logoProfile] = await Promise.all([
        uploadFile(file, generateEditorUploadUrl, data.profile!.id),
        extractLogoProfile(file),
      ]);
      const palette = logoProfile.accent
        ? [
            logoProfile.accent,
            ...logoProfile.swatches
              .map((s) => s.hex)
              .filter((h) => h !== logoProfile.accent),
          ]
        : logoProfile.swatches.map((s) => s.hex);
      const previewUrl = rememberObjectUrl(file, objectUrlsRef.current);
      setDocument((current) => {
        const generationMode = inferPaletteModeFromProfile(logoProfile);
        // Start on the scheme whose geometry matches the logo's own colour story.
        const schemeType = defaultSchemeFromColors(palette);
        const adjusted = generateScanMePalette({
          logoProfile,
          mode: generationMode,
          schemeType,
        });
        const chosenAccent =
          logoProfile.accent ?? palette[0] ?? current.design.colors.accent;
        return {
          ...current,
          logoStorageId: storageId,
          inheritsBusinessLogo: false,
          logoUrl: previewUrl,
          palette,
          paletteAnalysis: {
            original: palette,
            adjusted,
            correctedRoles: [],
            generationMode,
            lockedSlots: [...DEFAULT_PALETTE_LOCKS],
            schemeType,
          },
          design: {
            ...current.design,
            colors: {
              ...current.design.colors,
              accent: chosenAccent,
              icon: chosenAccent,
            },
          },
        };
      }, "logo-upload");
    } catch (error) {
      toast.error(errorMessage(error, "Logo nije otpremljen."));
    } finally {
      setUploadBusy(false);
    }
  }

  async function uploadBackground(kind: "image" | "video", file: File) {
    const imageAllowed = ["image/png", "image/jpeg", "image/webp"];
    const videoAllowed = ["video/mp4", "video/webm"];
    const valid =
      kind === "image"
        ? imageAllowed.includes(file.type) && file.size <= 12 * 1024 * 1024
        : videoAllowed.includes(file.type) && file.size <= 30 * 1024 * 1024;
    if (!valid) {
      toast.error(
        kind === "image"
          ? "Pozadinska slika mora biti PNG, JPEG ili WebP do 12 MB."
          : "Pozadinski video mora biti MP4 ili WebM do 30 MB.",
      );
      return;
    }
    setUploadBusy(true);
    try {
      const storageId = await uploadFile(
        file,
        generateEditorUploadUrl,
        data.profile!.id,
      );
      const previewUrl = rememberObjectUrl(file, objectUrlsRef.current);
      setDocument((current) => ({
        ...current,
        backgroundImageStorageId:
          kind === "image" ? storageId : current.backgroundImageStorageId,
        backgroundImageUrl:
          kind === "image" ? previewUrl : current.backgroundImageUrl,
        backgroundVideoStorageId:
          kind === "video" ? storageId : current.backgroundVideoStorageId,
        backgroundVideoUrl:
          kind === "video" ? previewUrl : current.backgroundVideoUrl,
        design: {
          ...current.design,
          background:
            current.design.background.category === "media"
              ? { ...current.design.background, mediaType: kind }
              : {
                  category: "media" as const,
                  mediaType: kind,
                  fit: "cover" as const,
                  zoom: 1,
                  positionX: 50,
                  positionY: 50,
                  overlayColor: "#000000",
                  overlayOpacity: 0.35,
                },
        },
      }));
    } catch (error) {
      toast.error(errorMessage(error, "Pozadina nije otpremljena."));
    } finally {
      setUploadBusy(false);
      setDragDepth(0);
    }
  }

  async function saveBusinessIdentity(name: string, nextSlug: string) {
    setSettingsBusy(true);
    try {
      const trimmedName = name.trim();
      const trimmedSlug = nextSlug.trim().toLowerCase();
      let resolvedSlug = data.clientPanelSlug;
      if (trimmedName !== data.name) {
        // Renaming now re-slugs everything automatically; use the slug it resolved to.
        const result = await updateBusinessName({
          businessId: data.id,
          name: trimmedName,
        });
        resolvedSlug = result.clientPanelSlug;
      }
      // Manual slug override: only when the typed slug genuinely differs from both the
      // current and the name-derived slug (so leaving the field on the old value after a
      // rename doesn't revert the automatic sync).
      if (
        trimmedSlug &&
        trimmedSlug !== resolvedSlug &&
        trimmedSlug !== data.clientPanelSlug
      ) {
        const result = await updateBusinessSlug({
          businessId: data.id,
          kind: "clientPanel",
          slug: trimmedSlug,
        });
        resolvedSlug = result.clientPanelSlug;
      }
      toast.success("Naziv i javna adresa su sačuvani.");
      if (resolvedSlug !== data.clientPanelSlug) {
        router.replace(`/${resolvedSlug}/editor`);
      }
    } catch (error) {
      toast.error(errorMessage(error, "Podešavanja nisu sačuvana."));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function togglePublic(active: boolean) {
    setSettingsBusy(true);
    try {
      await setServiceActive({
        serviceProfileId: data.profile!.id,
        active,
      });
      toast.success(
        active ? "Javna stranica je aktivirana." : "Javna stranica je deaktivirana.",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Status stranice nije promenjen."));
    } finally {
      setSettingsBusy(false);
    }
  }

  function handleWorkspacePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (
      target.closest(
        "[data-slot='select-content'],[data-radix-popper-content-wrapper]",
      )
    ) {
      return;
    }

    if (target.closest("[data-editor-destination='true']")) {
      return;
    }

    if (target.closest("[data-editor-preview='true']")) {
      setSelectedDestinationId(null);
      return;
    }

    if (target.closest("[data-context-panel='true']")) {
      if (activePanel !== "content") {
        setSelectedDestinationId(null);
      }
      return;
    }

    if (target.closest("[data-rail='true']")) return;

    if (
      target.closest(
        "button,a,input,textarea,select,[role='button'],[role='combobox'],[data-editor-preserve-panel='true']",
      )
    ) {
      setSelectedDestinationId(null);
      return;
    }

    setSelectedDestinationId(null);
    setActivePanel(null);
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragDepth((value) => value + 1);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragDepth((value) => Math.max(0, value - 1));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const bounds = event.currentTarget.getBoundingClientRect();
    const isRight = event.clientX >= bounds.left + bounds.width / 2;
    setDragTargetSide(isRight ? "right" : "left");
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragDepth(0);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;

    if (uploadBusy) {
      toast.error("Otpremanje je već u toku. Sačekajte da se završi.");
      return;
    }

    if (files.length > 1) {
      toast.info("Prevučeno je više fajlova — otprema se samo prvi.");
    }
    const file = files[0];

    const isVideo = file.type.startsWith("video/");
    const bounds = event.currentTarget.getBoundingClientRect();
    const isRightSide = event.clientX >= bounds.left + bounds.width / 2;

    // Video always targets phone background regardless of side (cannot be a logo)
    if (isVideo) {
      void uploadBackground("video", file);
      return;
    }

    // For images: Left side -> Logo, Right side -> Background image
    if (isRightSide) {
      void uploadBackground("image", file);
    } else {
      void uploadLogo(file);
    }
  }

  const activeEmptyCount = document.destinations.filter(
    (destination) =>
      destination.state === "active" && !destination.url.trim(),
  ).length;

  return (
    <div
      ref={editorRootRef}
      className={styles.editorRoot}
      tabIndex={-1}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <span data-theme-toggle="local" hidden />
      {compactEditor ? (
        <MobileEditorShell
          data={data}
          document={document}
          setDocument={setDocument}
          saveState={saveState}
          saveError={saveError}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onExplicitSave={() => void handleExplicitSave()}
          onOpenPublish={() => setPublishOpen(true)}
          activePanel={activePanel}
          onPanelSelect={handlePanelSelect}
          onClosePanel={closeActivePanel}
          selectedDestination={selectedDestination}
          selectedDestinationId={selectedDestinationId}
          onSelectDestination={handleSelectDestination}
          onClearSelection={() => setSelectedDestinationId(null)}
          onReorder={handleReorder}
          onAddDestination={() => void handleAddDestination()}
          addBusy={addBusy}
          uploadLogo={uploadLogo}
          uploadBackground={uploadBackground}
          uploadBusy={uploadBusy}
          setDeleteTarget={setDeleteTarget}
          settingsBusy={settingsBusy}
          saveBusinessIdentity={saveBusinessIdentity}
          togglePublic={togglePublic}
        />
      ) : (
      <div className={styles.desktopEditor}>
        <EditorBackdrop />

        <header
          className={styles.topBar}
          data-editor-preserve-panel="true"
          onPointerDown={() => setSelectedDestinationId(null)}
        >
          <Link className={styles.brandLink} href="/admin/scanme-links">
            <BrandLogo width="6.6rem" />
            <span className="sr-only">Nazad na ScanMe Links admin panel</span>
          </Link>
          <SaveStatus state={saveState} error={saveError} />
          <div className={styles.topSpacer} />
          <div className={styles.utilityGroup} aria-label="Istorija izmena">
            <EditorTooltip label="Undo · Ctrl+Z">
            <button
              className={styles.iconButton}
              type="button"
              disabled={!history.canUndo}
              aria-label="Vrati prethodnu izmenu (Ctrl+Z)"
              onClick={() => {
                setSaveState("saving");
                history.undo();
              }}
            >
              <Undo2 className="size-[17px]" aria-hidden="true" />
            </button>
            </EditorTooltip>
            <EditorTooltip label="Redo · Ctrl+Shift+Z">
            <button
              className={styles.iconButton}
              type="button"
              disabled={!history.canRedo}
              aria-label="Ponovi izmenu (Ctrl+Shift+Z)"
              onClick={() => {
                setSaveState("saving");
                history.redo();
              }}
            >
              <Redo2 className="size-[17px]" aria-hidden="true" />
            </button>
            </EditorTooltip>
          </div>
          <button
            type="button"
            className={cn(styles.topAction, styles.saveButton)}
            onClick={() => void handleExplicitSave()}
          >
            <Save className="mr-2 inline size-4" aria-hidden="true" />
            Sačuvaj nacrt
          </button>
          <button
            type="button"
            className={cn(styles.topAction, styles.publishButton)}
            onClick={() => setPublishOpen(true)}
          >
            <Send className="mr-2 inline size-4" aria-hidden="true" />
            Objavi
          </button>
        </header>

        <div
          className={styles.workspace}
          onPointerDown={handleWorkspacePointerDown}
        >
          <EditorRail
            activePanel={activePanel}
            onSelect={handlePanelSelect}
            editorRole={data.editorRole}
          />

          <div className={styles.contextSlot}>
            <AnimatePresence initial={false}>
              {activePanel ? (
                <motion.aside
                  key="context-panel"
                  className={styles.contextPanel}
                  data-context-panel="true"
                  initial={
                    reducedMotion
                      ? false
                      : {
                          opacity: 0,
                          clipPath: "inset(0 100% 0 0 round 44px)",
                        }
                  }
                  animate={{
                    opacity: 1,
                    clipPath: "inset(0 0% 0 0 round 44px)",
                  }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          clipPath: "inset(0 100% 0 0 round 44px)",
                        }
                  }
                  transition={{
                    duration: reducedMotion ? 0.01 : 0.3,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <PanelScrollArea key={activePanel}>
                    {(() => {
                      const item =
                        primaryToolItems.find((i) => i.id === activePanel) ??
                        secondaryToolItems.find((i) => i.id === activePanel);
                      const Icon = item?.icon ?? PanelTop;
                      const copy = panelCopy[activePanel];
                      return (
                        <>
                          <header className={styles.panelSectionHeader}>
                            <span
                              className={styles.panelSectionBadge}
                              aria-hidden="true"
                            >
                              <Icon className="size-[18px]" strokeWidth={1.7} />
                            </span>
                            <div className={styles.panelSectionHeading}>
                              <h2 className={styles.panelSectionTitle}>
                                {copy.title}
                              </h2>
                              <p className={styles.panelSectionDescription}>
                                {copy.description}
                              </p>
                            </div>
                          </header>
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                              key={activePanel}
                              initial={
                                reducedMotion
                                  ? false
                                  : { opacity: 0, y: 5, scale: 0.99 }
                              }
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={
                                reducedMotion
                                  ? undefined
                                  : { opacity: 0, y: -3 }
                              }
                              transition={{
                                duration: reducedMotion ? 0.01 : 0.2,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                            >
                              <EditorPanelContent
                                panel={activePanel}
                                data={data}
                                document={document}
                                setDocument={setDocument}
                                selectedDestination={selectedDestination}
                                uploadLogo={uploadLogo}
                                uploadBackground={uploadBackground}
                                uploadBusy={uploadBusy}
                                setDeleteTarget={setDeleteTarget}
                                settingsBusy={settingsBusy}
                                saveBusinessIdentity={saveBusinessIdentity}
                                togglePublic={togglePublic}
                              />
                            </motion.div>
                          </AnimatePresence>
                        </>
                      );
                    })()}
                  </PanelScrollArea>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>

          <ScanMeLinksEditorPreview
            businessName={data.name}
            document={document}
            selectedDestinationId={selectedDestinationId}
            onSelectDestination={handleSelectDestination}
            onReorder={handleReorder}
            onAddDestination={() => void handleAddDestination()}
            addBusy={addBusy}
            device={device}
            setDevice={setDevice}
            zoom={zoom}
            setZoom={setZoom}
          />
        </div>

        {dragDepth > 0 ? (
          <div className={styles.dropOverlay} aria-hidden="true">
            <div
              className={styles.dropZoneHalf}
              data-active={dragTargetSide === "left"}
            >
              <div className={styles.dropMessage}>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
                  <ImagePlus className="size-6" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-bold text-black/90">Postavi kao logotip</div>
                  <div className="mt-0.5 text-xs font-normal text-black/55">
                    Leva strana ekrana • PNG, JPEG, WebP, SVG
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.dropZoneDivider} />

            <div
              className={styles.dropZoneHalf}
              data-active={dragTargetSide === "right"}
            >
              <div className={styles.dropMessage}>
                <div className="flex items-center gap-1.5 rounded-2xl bg-orange-500/10 p-3 text-orange-700">
                  <ImageIcon className="size-6" aria-hidden="true" />
                  <VideoIcon className="size-6" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-bold text-black/90">Postavi kao pozadinu telefona</div>
                  <div className="mt-0.5 text-xs font-normal text-black/55">
                    Desna strana ekrana • Slika ili Video
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="rounded-[1.75rem] border-white/60 bg-[#fffaf4] shadow-2xl">
          <DialogHeader>
            <DialogTitle>Obriši „{deleteTarget?.label}”?</DialogTitle>
            <DialogDescription className="leading-6">
              Dugme se odmah uklanja iz nacrta, ali promena na javnoj stranici
              važi tek kada objavite nacrt. Prethodna analitika i broj klikova
              ostaju trajno sačuvani i biće označeni kao obrisan link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className={cn(styles.topAction, styles.saveButton)} type="button">
                Odustani
              </button>
            </DialogClose>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={confirmDeleteDestination}
            >
              Obriši iz nacrta
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="rounded-[1.75rem] border-white/60 bg-[#fffaf4] shadow-2xl">
          <DialogHeader>
            <DialogTitle>Objavi trenutni nacrt?</DialogTitle>
            <DialogDescription className="leading-6">
              Sve sačuvane izmene postaće vidljive na javnoj ScanMe Links
              stranici.
              {activeEmptyCount
                ? ` ${activeEmptyCount} aktivn${
                    activeEmptyCount === 1 ? "o dugme nema" : "a dugmeta nemaju"
                  } URL i neće biti prikazano javno.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className={cn(styles.topAction, styles.saveButton)} type="button">
                Odustani
              </button>
            </DialogClose>
            <button
              className={cn(styles.topAction, styles.publishButton)}
              type="button"
              disabled={publishing}
              onClick={() => void handlePublish()}
            >
              {publishing ? (
                <LoaderCircle className="mr-2 inline size-4 animate-spin" />
              ) : (
                <Send className="mr-2 inline size-4" />
              )}
              Objavi nacrt
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditorRail({
  activePanel,
  onSelect,
  editorRole,
}: {
  activePanel: EditorPanelId | null;
  onSelect: (panel: EditorPanelId) => void;
  editorRole: EditorData["editorRole"];
}) {
  return (
    <nav
      className={styles.railStack}
      data-rail="true"
      aria-label="Alati editora"
    >
      <div className={styles.rail}>
        {primaryToolItems.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={activePanel === item.id}
            activeSurfaceId="editor-rail-active-primary"
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
      <div className={styles.railBottom}>
        {visibleSecondaryToolItems(editorRole).map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={activePanel === item.id}
            activeSurfaceId="editor-rail-active-secondary"
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}

type PanelScrollState = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  trackHeight: number;
};

function PanelScrollArea({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportId = useId();
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startScrollTop: number;
  } | null>(null);
  const [scrollState, setScrollState] = useState<PanelScrollState>({
    clientHeight: 0,
    scrollHeight: 0,
    scrollTop: 0,
    trackHeight: 0,
  });

  const syncScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport) return;
    setScrollState({
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
      trackHeight: track?.clientHeight ?? 0,
    });
  }, []);

  useLayoutEffect(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const resizeObserver = new ResizeObserver(syncScrollState);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver.observe(viewport.firstElementChild);
    }
    if (trackRef.current) resizeObserver.observe(trackRef.current);
    syncScrollState();

    return () => resizeObserver.disconnect();
  }, [syncScrollState]);

  const maxScroll = Math.max(
    0,
    scrollState.scrollHeight - scrollState.clientHeight,
  );
  const viewportRatio =
    scrollState.scrollHeight > 0
      ? Math.min(1, scrollState.clientHeight / scrollState.scrollHeight)
      : 1;
  const hasOverflow = maxScroll > 1;
  const thumbHeight = scrollState.trackHeight
    ? Math.max(42, scrollState.trackHeight * viewportRatio)
    : 0;
  const movableTrackHeight = Math.max(
    0,
    scrollState.trackHeight - thumbHeight,
  );
  const scrollProgress = maxScroll
    ? Math.min(1, Math.max(0, scrollState.scrollTop / maxScroll))
    : 0;

  function moveTo(scrollTop: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = Math.min(maxScroll, Math.max(0, scrollTop));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scrollState.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !movableTrackHeight) {
      return;
    }
    moveTo(
      drag.startScrollTop +
        (event.clientY - drag.startY) * (maxScroll / movableTrackHeight),
    );
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = Math.max(72, scrollState.clientHeight * 0.18);
    if (event.key === "ArrowUp") moveTo(scrollState.scrollTop - step);
    else if (event.key === "ArrowDown") moveTo(scrollState.scrollTop + step);
    else if (event.key === "PageUp") {
      moveTo(scrollState.scrollTop - scrollState.clientHeight * 0.8);
    } else if (event.key === "PageDown") {
      moveTo(scrollState.scrollTop + scrollState.clientHeight * 0.8);
    } else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(maxScroll);
    else return;
    event.preventDefault();
  }

  return (
    <div className={styles.panelScrollShell}>
      <div
        id={viewportId}
        ref={viewportRef}
        className={styles.panelScroll}
        data-panel-scroll="true"
        onScroll={syncScrollState}
      >
        {children}
      </div>
      <div
        ref={trackRef}
        className={styles.panelScrollTrack}
        data-visible={hasOverflow}
        aria-hidden={!hasOverflow}
      >
        <span className={styles.panelScrollRail} aria-hidden="true" />
        {hasOverflow ? (
          <button
            type="button"
            role="scrollbar"
            aria-label="Pomeranje panela"
            aria-controls={viewportId}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(scrollProgress * 100)}
            className={styles.panelScrollThumb}
            style={{
              height: `${thumbHeight}px`,
              top: `${scrollProgress * movableTrackHeight}px`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onKeyDown={handleKeyDown}
          />
        ) : null}
      </div>
    </div>
  );
}

function RailButton({
  item,
  active,
  activeSurfaceId,
  onClick,
}: {
  item: EditorToolItem;
  active: boolean;
  activeSurfaceId: string;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={styles.railButton}
      aria-pressed={active}
      aria-label={item.label}
      onClick={onClick}
    >
      {active ? (
        <motion.span
          className={styles.railActiveSurface}
          layoutId={activeSurfaceId}
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 430, damping: 34 }}
        />
      ) : null}
      <Icon className="size-[20px]" strokeWidth={1.7} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

function documentFromData(data: EditorData): ScanMeLinksEditorDocument {
  const config = data.config!;
  const design = createSafeScanMeLinksDesignV2(
    config.design as ScanMeLinksDesignV2,
  );
  return {
    title: config.displayName ?? data.name,
    description: config.description ?? "",
    logoStorageId: config.logoStorageId ?? null,
    inheritsBusinessLogo: config.inheritsBusinessLogo,
    logoUrl: config.logoUrl ?? null,
    palette: config.palette ?? [],
    paletteAnalysis: config.paletteAnalysis
      ? {
          ...config.paletteAnalysis,
          generationMode:
            config.paletteAnalysis.generationMode ??
            inferPaletteMode(design.colors.page),
          lockedSlots: normalizePaletteLocks(
            config.paletteAnalysis.lockedSlots,
          ),
          schemeType:
            config.paletteAnalysis.schemeType ?? DEFAULT_PALETTE_SCHEME,
        }
      : null,
    design,
    backgroundImageStorageId: config.backgroundImageStorageId ?? null,
    backgroundImageUrl: config.backgroundImageUrl ?? null,
    backgroundVideoStorageId: config.backgroundVideoStorageId ?? null,
    backgroundVideoUrl: config.backgroundVideoUrl ?? null,
    destinations: data.destinations.map((destination) => ({
      id: destination.id,
      kind: destination.kind as DestinationKind,
      label: destination.label,
      url: destination.url,
      iconKey: destination.iconKey,
      order: destination.order,
      state: destination.state as DestinationLifecycle,
      publishedState:
        (destination.publishedState as DestinationLifecycle | null) ?? null,
      totalClicks: destination.totalClicks,
      totalDirectVisits: destination.totalDirectVisits,
    })),
  };
}

function documentHash(document: ScanMeLinksEditorDocument) {
  return JSON.stringify({
    title: document.title,
    description: document.description,
    logoStorageId: document.logoStorageId,
    inheritsBusinessLogo: document.inheritsBusinessLogo,
    palette: document.palette,
    paletteAnalysis: document.paletteAnalysis,
    design: document.design,
    backgroundImageStorageId: document.backgroundImageStorageId,
    backgroundVideoStorageId: document.backgroundVideoStorageId,
    destinations: document.destinations.map(
      ({ id, kind, label, url, order, state }) => ({
        id,
        kind,
        label,
        url,
        order,
        state,
      }),
    ),
  });
}

function validateDocument(document: ScanMeLinksEditorDocument) {
  if (document.title.length > 50) {
    throw new Error("Naziv lokala može imati najviše 50 karaktera.");
  }
  if (document.description.length > 50) {
    throw new Error("Kratak opis može imati najviše 50 karaktera.");
  }
  for (const destination of document.destinations) {
    const url = destination.url.trim();
    if (url && !/^https:\/\/[^\s]+$/i.test(url)) {
      throw new Error(
        `Link „${destination.label}” mora biti bezbedna HTTPS adresa.`,
      );
    }
    if (destination.state !== "deleted" && !destination.label.trim()) {
      throw new Error("Svako dugme mora imati naziv.");
    }
  }
}

async function uploadFile(
  file: File,
  generateUploadUrl: (args: {
    serviceProfileId: Id<"serviceProfiles">;
  }) => Promise<string>,
  serviceProfileId: Id<"serviceProfiles">,
) {
  const uploadUrl = await generateUploadUrl({ serviceProfileId });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) throw new Error("Otpremanje fajla nije uspelo.");
  const body = (await response.json()) as { storageId: Id<"_storage"> };
  return body.storageId;
}

function rememberObjectUrl(file: File, urls: Set<string>) {
  const url = URL.createObjectURL(file);
  urls.add(url);
  return url;
}

function hasFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
