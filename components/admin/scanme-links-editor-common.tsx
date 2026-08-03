"use client";

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
  Settings,
  SlidersHorizontal,
  Type,
} from "lucide-react";
import { useSyncExternalStore } from "react";
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
import styles from "./scanme-links-editor.module.css";
import type {
  EditorData,
  EditorDestination,
  EditorDocumentSetter,
  EditorPanelId,
  EditorSaveState,
  ScanMeLinksEditorDocument,
} from "./scanme-links-editor-types";

export type EditorToolItem = {
  id: EditorPanelId;
  label: string;
  icon: typeof PanelTop;
};

export const primaryToolItems: readonly EditorToolItem[] = [
  { id: "content", label: "Sadržaj", icon: PanelTop },
  { id: "style", label: "Stil", icon: Paintbrush },
  { id: "background", label: "Pozadina", icon: Image },
  { id: "button", label: "Dugme", icon: SlidersHorizontal },
  { id: "text", label: "Tekst", icon: Type },
  { id: "color", label: "Boja", icon: Palette },
] as const;

export const secondaryToolItems: readonly EditorToolItem[] = [
  { id: "analytics", label: "Analitika", icon: BarChart3 },
  { id: "settings", label: "Podešavanja", icon: Settings },
  { id: "pro", label: "Pro", icon: Crown },
  { id: "help", label: "Pomoć", icon: CircleHelp },
] as const;

// Podešavanja sadrže isključivo admin akcije (naziv, slug, javni status),
// pa se klijentu sa pravom uređivanja taj alat ne prikazuje.
export function visibleSecondaryToolItems(
  editorRole: EditorData["editorRole"],
) {
  return editorRole === "admin"
    ? secondaryToolItems
    : secondaryToolItems.filter((item) => item.id !== "settings");
}

export const panelCopy: Record<
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

const COMPACT_EDITOR_QUERY = "(max-width: 1099px)";

function subscribeToCompactEditor(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(COMPACT_EDITOR_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  // I resize kao rezervni signal: pod DevTools/WebView emulacijom viewporta
  // matchMedia "change" ume da izostane iako se .matches promenio. Snapshot
  // se svakako čita sveže, pa React sam preskače render kad vrednost stoji.
  window.addEventListener("resize", onStoreChange);
  return () => {
    mediaQuery.removeEventListener("change", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
  };
}

function readCompactEditor() {
  return window.matchMedia(COMPACT_EDITOR_QUERY).matches;
}

// Ista granica kao nekadašnji CSS breakpoint desktop editora: ispod nje se
// montira mobilni shell umesto desktop rasporeda (JS switch, ne display:none,
// da se video pozadine i DnD kontekst ne bi montirali dvaput).
export function useCompactEditor() {
  return useSyncExternalStore(
    subscribeToCompactEditor,
    readCompactEditor,
    () => false,
  );
}

export function SaveStatus({
  state,
  error,
}: {
  state: EditorSaveState;
  error: string | null;
}) {
  const status = (
    <span className={styles.saveState} role="status">
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

export function EditorBackdrop() {
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

export function EditorPanelContent({
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
  setDocument: EditorDocumentSetter;
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
      if (data.editorRole !== "admin") return null;
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
