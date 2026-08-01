"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Check,
  CircleHelp,
  Crown,
  Image,
  LoaderCircle,
  Palette,
  PanelTop,
  Paintbrush,
  Redo2,
  Save,
  Send,
  Settings,
  SlidersHorizontal,
  Type,
  Undo2,
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
  AnalyticsPanel,
  BackgroundPanel,
  ButtonPanel,
  ColorPanel,
  ContentPanel,
  HelpPanel,
  ProPanel,
  SettingsPanel,
  StylePanel,
  TextPanel,
} from "@/components/admin/scanme-links-editor-panels";
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
import { extractAccentCandidates } from "@/lib/accent-palette";
import {
  DESTINATION_DEFAULTS,
  type DestinationKind,
  type DestinationLifecycle,
} from "@/lib/scanme-links";
import {
  createSafeScanMeLinksDesignV2,
  type ScanMeLinksDesignV2,
} from "@/lib/scanme-links-design";
import { cn } from "@/lib/utils";
import styles from "./scanme-links-editor.module.css";
import type {
  EditorDestination,
  EditorPanelId,
  EditorSaveState,
  PreviewDevice,
  ScanMeLinksEditorDocument,
} from "./scanme-links-editor-types";
import { useEditorHistory } from "./use-editor-history";

type EditorData = NonNullable<
  FunctionReturnType<typeof api.scanMeLinks.editorBySlug>
>;

const primaryRailItems = [
  { id: "content", label: "Sadržaj", icon: PanelTop },
  { id: "style", label: "Stil", icon: Paintbrush },
  { id: "background", label: "Pozadina", icon: Image },
  { id: "button", label: "Dugme", icon: SlidersHorizontal },
  { id: "text", label: "Tekst", icon: Type },
  { id: "color", label: "Boja", icon: Palette },
] as const;

const secondaryRailItems = [
  { id: "analytics", label: "Analitika", icon: BarChart3 },
  { id: "settings", label: "Podešavanja", icon: Settings },
  { id: "pro", label: "Pro", icon: Crown },
  { id: "help", label: "Pomoć", icon: CircleHelp },
] as const;

const PRIMARY_RAIL_DISPLACEMENT_MAP = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs>
      <linearGradient id="x" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="rgb(255,0,0)" />
        <stop offset="0.045" stop-color="rgb(178,0,0)" />
        <stop offset="0.1" stop-color="rgb(128,0,0)" />
        <stop offset="0.9" stop-color="rgb(128,0,0)" />
        <stop offset="0.955" stop-color="rgb(78,0,0)" />
        <stop offset="1" stop-color="rgb(0,0,0)" />
      </linearGradient>
      <linearGradient id="y" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgb(0,255,0)" />
        <stop offset="0.009" stop-color="rgb(0,178,0)" />
        <stop offset="0.019" stop-color="rgb(0,128,0)" />
        <stop offset="0.981" stop-color="rgb(0,128,0)" />
        <stop offset="0.991" stop-color="rgb(0,78,0)" />
        <stop offset="1" stop-color="rgb(0,0,0)" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#x)" />
    <rect width="100" height="100" fill="url(#y)" style="mix-blend-mode:screen" />
  </svg>
`)}`;

const panelCopy: Record<
  EditorPanelId,
  { title: string; description: string }
> = {
  content: {
    title: "Sadržaj",
    description:
      "Uredite identitet stranice i kliknite na dugme u previewu da promenite njegov link.",
  },
  style: {
    title: "Stilovi",
    description:
      "Stil određuje skladne pozadine, dugmad, fontove i izgled ikonica.",
  },
  background: {
    title: "Pozadina",
    description:
      "Izaberite tip, a zatim fino podesite boje, medij ili efekat.",
  },
  button: {
    title: "Dugmad",
    description:
      "Podesite formu, boju i senku u granicama izabranog stila.",
  },
  text: {
    title: "Tekst",
    description: "Dostupni fontovi su odabrani da odgovaraju aktivnom stilu.",
  },
  color: {
    title: "Boje",
    description: "Ključne boje cele stranice dostupne su na jednom mestu.",
  },
  analytics: {
    title: "Analitika",
    description: "Metrika objavljene stranice i pojedinačnih linkova.",
  },
  settings: {
    title: "Podešavanja",
    description: "Javna adresa, status stranice i budući pristup klijenta.",
  },
  pro: {
    title: "Pro",
    description: "Napredne opcije za bogatije ScanMe Links iskustvo.",
  },
  help: {
    title: "Pomoć",
    description: "Kratak vodič kroz najvažnije tokove u editoru.",
  },
};

export function ScanMeLinksEditorScreen({
  slug,
  businessId,
}: {
  slug?: string;
  businessId?: string;
}) {
  return (
    <AdminGuard>
      <EditorLoader slug={slug} businessId={businessId} />
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

function EditorWorkspace({
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
  const mediaDropEnabled =
    activePanel === "background" &&
    document.design.background.category === "media";

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
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") {
        return;
      }
      if (!editorRootRef.current || !window.document.hasFocus()) return;
      event.preventDefault();
      setSaveState("saving");
      if (event.shiftKey) history.redo();
      else history.undo();
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
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
      const [storageId, palette] = await Promise.all([
        uploadFile(file, generateEditorUploadUrl, data.profile!.id),
        extractAccentCandidates(file),
      ]);
      const previewUrl = rememberObjectUrl(file, objectUrlsRef.current);
      setDocument((current) => ({
        ...current,
        logoStorageId: storageId,
        inheritsBusinessLogo: false,
        logoUrl: previewUrl,
        palette,
        paletteAnalysis: {
          original: palette,
          adjusted: palette,
          correctedRoles: [],
        },
        design: {
          ...current.design,
          colors: {
            ...current.design.colors,
            accent: palette[0] ?? current.design.colors.accent,
            icon: palette[0] ?? current.design.colors.icon,
          },
        },
      }));
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
              : current.design.background,
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
      if (name.trim() !== data.name) {
        await updateBusinessName({
          businessId: data.id,
          name: name.trim(),
        });
      }
      let resolvedSlug = data.clientPanelSlug;
      if (nextSlug.trim().toLowerCase() !== data.clientPanelSlug) {
        const result = await updateBusinessSlug({
          businessId: data.id,
          kind: "clientPanel",
          slug: nextSlug.trim().toLowerCase(),
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
    if (!mediaDropEnabled || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragDepth((value) => value + 1);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!mediaDropEnabled || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragDepth((value) => Math.max(0, value - 1));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!mediaDropEnabled || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!mediaDropEnabled || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragDepth(0);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const kind =
      file.type.startsWith("video/") ? ("video" as const) : ("image" as const);
    void uploadBackground(kind, file);
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
      <div className={styles.desktopEditor}>
        <EditorBackdrop />
        <EditorLensFilterDefinitions />

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
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>
                        {panelCopy[activePanel].title}
                      </h2>
                      <p className={styles.panelDescription}>
                        {panelCopy[activePanel].description}
                      </p>
                    </div>
                  </div>
                  <PanelScrollArea key={activePanel}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={activePanel}
                        initial={
                          reducedMotion ? false : { opacity: 0, y: 5, scale: 0.99 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={
                          reducedMotion ? undefined : { opacity: 0, y: -3 }
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

        {dragDepth > 0 && mediaDropEnabled ? (
          <div className={styles.dropOverlay} aria-hidden="true">
            <div className={styles.dropMessage}>
              Pustite fajl da ga postavite kao pozadinu
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.desktopNotice}>
        <section className={styles.noticeCard}>
          <BrandLogo className="mx-auto" width="7rem" />
          <h1 className="mt-7 text-2xl font-bold tracking-[-0.04em]">
            Editor je trenutno dostupan na desktopu
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/55">
            Mobilna verzija imaće poseban raspored prilagođen radu dodirom.
            Otvorite ovu stranicu na većem ekranu da nastavite uređivanje.
          </p>
        </section>
      </div>

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
}: {
  activePanel: EditorPanelId | null;
  onSelect: (panel: EditorPanelId) => void;
}) {
  function handleLensPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.pointerType === "touch" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(prefers-reduced-transparency: reduce)").matches
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;

    event.currentTarget.style.setProperty("--scanme-rail-lens-x", `${x}%`);
    event.currentTarget.style.setProperty("--scanme-rail-lens-y", `${y}%`);
  }

  function handleLensPointerLeave(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.style.removeProperty("--scanme-rail-lens-x");
    event.currentTarget.style.removeProperty("--scanme-rail-lens-y");
  }

  return (
    <nav
      className={styles.railStack}
      data-rail="true"
      aria-label="Alati editora"
    >
      <div
        className={cn(styles.rail, styles.primaryRailLens)}
        data-liquid-lens="primary-rail"
        onPointerMove={handleLensPointerMove}
        onPointerLeave={handleLensPointerLeave}
      >
        {primaryRailItems.map((item) => (
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
        {secondaryRailItems.map((item) => (
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
  item: {
    id: EditorPanelId;
    label: string;
    icon: typeof PanelTop;
  };
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

function SaveStatus({
  state,
  error,
}: {
  state: EditorSaveState;
  error: string | null;
}) {
  const status = (
    <span
      className={styles.saveState}
      role="status"
    >
      <span className={styles.saveStateDot}>
        {state === "saving" ? (
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
        ) : state === "error" ? (
          <span aria-hidden="true">!</span>
        ) : (
          <Check className="size-3" aria-hidden="true" />
        )}
      </span>
      {state === "saving"
        ? "Čuvanje…"
        : state === "error"
          ? "Nije sačuvano"
          : "Sačuvano"}
    </span>
  );

  return state === "error" ? (
    <EditorTooltip label={error ?? "Greška pri čuvanju"} align="start">
      {status}
    </EditorTooltip>
  ) : (
    status
  );
}

function EditorBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <span className={styles.paperIndigo} />
      <span className={styles.paperSage} />
      <span className={styles.paperCoral} />
      <span className={styles.paperMauve} />
      <span className={styles.paperOchre} />
    </div>
  );
}

function EditorLensFilterDefinitions() {
  return (
    <svg
      className={styles.lensFilterDefinitions}
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          id="scanme-primary-rail-refraction"
          x="-6%"
          y="-2%"
          width="112%"
          height="104%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={PRIMARY_RAIL_DISPLACEMENT_MAP}
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="rail-displacement-map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="rail-displacement-map"
            scale="3"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

function EditorPanelContent({
  panel,
  data,
  document,
  setDocument,
  selectedDestination,
  uploadLogo,
  uploadBackground,
  uploadBusy,
  setDeleteTarget,
  settingsBusy,
  saveBusinessIdentity,
  togglePublic,
}: {
  panel: EditorPanelId;
  data: EditorData;
  document: ScanMeLinksEditorDocument;
  setDocument: ReturnType<typeof useEditorHistory<ScanMeLinksEditorDocument>>["set"];
  selectedDestination: EditorDestination | null;
  uploadLogo: (file: File) => Promise<void>;
  uploadBackground: (kind: "image" | "video", file: File) => Promise<void>;
  uploadBusy: boolean;
  setDeleteTarget: (destination: EditorDestination) => void;
  settingsBusy: boolean;
  saveBusinessIdentity: (name: string, slug: string) => Promise<void>;
  togglePublic: (active: boolean) => Promise<void>;
}) {
  switch (panel) {
    case "content":
      return (
        <ContentPanel
          document={document}
          setDocument={setDocument}
          selectedDestination={selectedDestination}
          onUploadLogo={(file) => void uploadLogo(file)}
          onDeleteDestination={setDeleteTarget}
          uploadBusy={uploadBusy}
        />
      );
    case "style":
      return <StylePanel document={document} setDocument={setDocument} />;
    case "background":
      return (
        <BackgroundPanel
          document={document}
          setDocument={setDocument}
          onUploadBackground={(kind, file) =>
            void uploadBackground(kind, file)
          }
          uploadBusy={uploadBusy}
        />
      );
    case "button":
      return <ButtonPanel document={document} setDocument={setDocument} />;
    case "text":
      return <TextPanel document={document} setDocument={setDocument} />;
    case "color":
      return <ColorPanel document={document} setDocument={setDocument} />;
    case "analytics":
      return <AnalyticsPanel businessId={data.id} />;
    case "settings":
      return (
        <SettingsPanel
          businessName={data.name}
          slug={data.clientPanelSlug}
          publicActive={data.profile?.status === "active"}
          onSaveIdentity={saveBusinessIdentity}
          onTogglePublic={togglePublic}
          busy={settingsBusy}
        />
      );
    case "pro":
      return <ProPanel />;
    case "help":
      return <HelpPanel />;
  }
}

function documentFromData(data: EditorData): ScanMeLinksEditorDocument {
  const config = data.config!;
  return {
    title: config.displayName ?? data.name,
    description: config.description ?? "",
    logoStorageId: config.logoStorageId ?? null,
    inheritsBusinessLogo: config.inheritsBusinessLogo,
    logoUrl: config.logoUrl ?? null,
    palette: config.palette ?? [],
    paletteAnalysis: config.paletteAnalysis ?? null,
    design: createSafeScanMeLinksDesignV2(
      config.design as ScanMeLinksDesignV2,
    ),
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
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
