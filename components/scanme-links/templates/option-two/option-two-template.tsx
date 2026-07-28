import type { ReactNode } from "react";
import {
  scanMeDestinationClassName,
  ScanMeDestinationContent,
  ScanMeLinksPageRenderer,
  ScanMePageFrame,
  scanMeDuplicateNumber,
} from "@/components/scanme-links/templates/scanme-page-renderer";
import type {
  PublicDestination,
  ScanMeLinksViewModel,
  TemplateProps,
} from "@/components/scanme-links/templates/types";

// Compatibility exports for the existing editor while its destination DnD
// surface moves to the shared page renderer.
export const optionTwoDestinationClassName = scanMeDestinationClassName;

export function OptionTwoDestinationContent({
  destination,
  duplicate,
}: {
  destination: PublicDestination;
  duplicate: number | null;
}) {
  return (
    <ScanMeDestinationContent
      destination={destination}
      duplicate={duplicate}
    />
  );
}

export function OptionTwoFrame({
  view,
  preview = false,
  children,
}: {
  view: ScanMeLinksViewModel;
  preview?: boolean;
  children: ReactNode;
}) {
  return (
    <ScanMePageFrame view={view} mode={preview ? "preview" : "public"}>
      {children}
    </ScanMePageFrame>
  );
}

export function OptionTwoTemplate(props: TemplateProps) {
  return <ScanMeLinksPageRenderer {...props} />;
}

export function optionTwoDuplicateNumber(
  destinations: PublicDestination[],
  index: number,
) {
  return scanMeDuplicateNumber(destinations, index);
}
