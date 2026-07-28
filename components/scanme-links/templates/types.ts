import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type {
  DestinationPresentation,
  ScanMeDesignV1,
} from "@/lib/scanme-design";
import type {
  AccentTokens,
  BackgroundKey,
  DestinationKind,
  TemplateKey,
} from "@/lib/scanme-links";

export type PublicDestination = {
  id: string;
  kind: DestinationKind;
  label: string;
  url: string;
  iconKey: string;
  presentation?: DestinationPresentation;
};

export type ScanMeLinksViewModel = {
  displayName: string;
  description?: string | null;
  logoUrl: string | null;
  backgroundImageUrl?: string | null;
  templateKey: TemplateKey;
  backgroundKey: BackgroundKey;
  accent: string;
  accentTokens: AccentTokens;
  design?: ScanMeDesignV1;
  destinations: PublicDestination[];
};

export type ScanMeRenderMode = "public" | "preview" | "thumbnail";

export type TemplateProps = {
  view: ScanMeLinksViewModel;
  requestId?: string;
  onDestinationClick?: (
    destination: PublicDestination,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  preview?: boolean;
  renderMode?: ScanMeRenderMode;
  editorSlot?: ReactNode;
};

export type AccentStyle = CSSProperties & {
  "--links-accent": string;
  "--links-accent-strong": string;
  "--links-accent-soft": string;
  "--links-accent-border": string;
  "--links-accent-focus": string;
  "--links-on-accent": string;
};

export type ScanMeDesignStyle = AccentStyle & {
  "--scanme-page": string;
  "--scanme-surface": string;
  "--scanme-title": string;
  "--scanme-body": string;
  "--scanme-accent": string;
  "--scanme-border": string;
  "--scanme-focus": string;
  "--scanme-button": string;
  "--scanme-button-hover": string;
  "--scanme-button-text": string;
  "--scanme-button-radius": string;
  "--scanme-button-border": string;
  "--scanme-button-padding-x": string;
  "--scanme-button-padding-y": string;
  "--scanme-button-font-size": string;
  "--scanme-line-height": number;
  "--scanme-section-gap": string;
  "--scanme-text-align": CSSProperties["textAlign"];
};
