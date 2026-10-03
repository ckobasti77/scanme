import type { CSSProperties, MouseEvent } from "react";
import type {
  AccentTokens,
  BackgroundKey,
  DestinationKind,
  DestinationLifecycle,
  TemplateKey,
} from "@/lib/scanme-links";
import type { ScanMeLinksDesignV2 } from "@/lib/scanme-links-design";

export type PublicDestination = {
  id: string;
  kind: DestinationKind;
  label: string;
  url: string;
  iconKey: string;
  state?: DestinationLifecycle;
};

export type ScanMeLinksViewModel = {
  displayName: string;
  description?: string | null;
  logoUrl: string | null;
  templateKey: TemplateKey;
  backgroundKey: BackgroundKey;
  accent: string;
  accentTokens: AccentTokens;
  design?: ScanMeLinksDesignV2 | null;
  backgroundImageUrl?: string | null;
  backgroundVideoUrl?: string | null;
  destinations: PublicDestination[];
};

export type TemplateProps = {
  view: ScanMeLinksViewModel;
  requestId?: string;
  onDestinationClick?: (
    destination: PublicDestination,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  preview?: boolean;
};

export type AccentStyle = CSSProperties & {
  "--links-accent": string;
  "--links-accent-strong": string;
  "--links-accent-soft": string;
  "--links-accent-border": string;
  "--links-accent-focus": string;
  "--links-on-accent": string;
  "--links-page"?: string;
  "--links-surface"?: string;
  "--links-title"?: string;
  "--links-body"?: string;
  "--links-button"?: string;
  "--links-button-hover"?: string;
  "--links-button-text"?: string;
  "--links-icon"?: string;
  "--links-border"?: string;
  "--links-button-radius"?: string;
  "--links-button-border-width"?: string;
  "--links-button-padding-x"?: string;
  "--links-button-padding-y"?: string;
  "--links-button-shadow"?: string;
  "--links-text-shadow"?: string;
  "--links-logo-shadow"?: string;
  "--links-powered-color"?: string;
  "--links-flow-gap"?: string;
  "--links-heading-size"?: string;
  "--links-body-size"?: string;
  "--links-line-height"?: string;
  "--links-heading-weight"?: string;
  "--links-body-weight"?: string;
  "--links-font-family"?: string;
  "--links-text-align"?: string;
  "--links-cross-align"?: string;
  "--links-background-image"?: string;
  "--links-background-detail-image"?: string;
  "--links-background-detail-size"?: string;
  "--links-background-detail-opacity"?: string;
  "--links-media-overlay"?: string;
  "--links-animation-duration"?: string;
  "--links-animation-intensity"?: string;
};
