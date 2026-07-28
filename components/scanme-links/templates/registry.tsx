import { OptionTwoTemplate } from "@/components/scanme-links/templates/option-two/option-two-template";
export {
  resolveScanMeDesign,
  scanMeButtonStyleClasses,
  ScanMeLinksPageRenderer,
  ScanMePageFrame,
  ScanMePresetPreview,
} from "@/components/scanme-links/templates/scanme-page-renderer";
import type {
  ScanMeLinksViewModel,
  TemplateProps,
} from "@/components/scanme-links/templates/types";

const renderers = {
  "option-two": OptionTwoTemplate,
} as const;

export function ScanMeLinksTemplate(props: TemplateProps) {
  const Template = renderers[props.view.templateKey] ?? OptionTwoTemplate;
  return <Template {...props} />;
}

export function normalizePublicView(
  view: ScanMeLinksViewModel,
): ScanMeLinksViewModel {
  return {
    ...view,
    description: view.description?.trim() || null,
    backgroundImageUrl: view.backgroundImageUrl ?? null,
    destinations: view.destinations.map((destination) => ({
      ...destination,
      presentation: destination.presentation ?? "button",
    })),
  };
}
