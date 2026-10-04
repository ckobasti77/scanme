import { PrelaunchLanding } from "@/components/prelaunch-landing";
import { redirect } from "next/navigation";
import { isProductionPrelaunchOnly } from "@/lib/prelaunch-mode";

export default function PrelaunchPreviewPage() {
  if (isProductionPrelaunchOnly()) redirect("/");
  return <PrelaunchLanding />;
}
