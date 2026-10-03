import { OptionTwoTemplate } from "@/components/scanme-links/templates/option-two/option-two-template";
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
  return view;
}

