import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  DestinationKind,
  DestinationLifecycle,
} from "@/lib/scanme-links";
import type { ScanMeLinksDesignV2 } from "@/lib/scanme-links-design";
import type { PaletteGenerationMode } from "@/lib/scanme-palette";

export type EditorData = NonNullable<
  FunctionReturnType<typeof api.scanMeLinks.editorBySlug>
>;

export const EDITOR_PANEL_IDS = [
  "content",
  "style",
  "background",
  "button",
  "text",
  "color",
  "analytics",
  "settings",
  "pro",
  "help",
] as const;

export type EditorPanelId = (typeof EDITOR_PANEL_IDS)[number];

export type EditorDestination = {
  id: Id<"serviceDestinations">;
  kind: DestinationKind;
  label: string;
  url: string;
  iconKey: string;
  order: number;
  state: DestinationLifecycle;
  publishedState: DestinationLifecycle | null;
  totalClicks: number;
  totalDirectVisits: number;
};

export type EditorPaletteAnalysis = {
  original: string[];
  adjusted: string[];
  correctedRoles: string[];
  generationMode: PaletteGenerationMode;
  lockedSlots: boolean[];
};

export type ScanMeLinksEditorDocument = {
  title: string;
  description: string;
  logoStorageId: Id<"_storage"> | null;
  inheritsBusinessLogo: boolean;
  logoUrl: string | null;
  palette: string[];
  paletteAnalysis: EditorPaletteAnalysis | null;
  design: ScanMeLinksDesignV2;
  backgroundImageStorageId: Id<"_storage"> | null;
  backgroundImageUrl: string | null;
  backgroundVideoStorageId: Id<"_storage"> | null;
  backgroundVideoUrl: string | null;
  destinations: EditorDestination[];
};

export type EditorSaveState = "saved" | "saving" | "error";

export type PreviewDevice = "phone" | "desktop";

export type EditorDocumentSetter = (
  next:
    | ScanMeLinksEditorDocument
    | ((current: ScanMeLinksEditorDocument) => ScanMeLinksEditorDocument),
  group?: string,
) => void;
