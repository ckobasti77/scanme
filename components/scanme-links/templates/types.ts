import type { CSSProperties, MouseEvent } from "react";
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
};

export type ScanMeLinksViewModel = {
  displayName: string;
  logoUrl: string | null;
  templateKey: TemplateKey;
  backgroundKey: BackgroundKey;
  accent: string;
  accentTokens: AccentTokens;
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
};
