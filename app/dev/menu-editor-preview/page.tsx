// Dev-only Menu editor preview (TASK-51 browser QA): mounts the REAL
// MenuEditorWorkspace with fixture data so the five group shapes, every
// panel, the desktop rail and the mobile dock can be exercised in a browser
// without an authenticated business. Autosave/publish hit Convex with a fake
// menu id and land in the honest failed-with-retry state — the server paths
// are proven by convex/menu.test.ts; this page proves the chrome and the
// preview. Unavailable in production, mirroring app/dev/venue-preview.
//
//   /dev/menu-editor-preview            → the fixture menu (default design)
//   ?state=empty                        → a menu with no groups yet
//   ?design=dark                        → dark token variant

import { notFound } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { MenuEditorWorkspace } from "@/components/menu/editor/menu-editor";
import type { MenuEditorData } from "@/components/menu/editor/menu-editor-types";
import {
  DARK_MENU_DESIGN,
  fixtureModel,
} from "@/components/menu/menu-fixtures";

export const dynamic = "force-dynamic";

export default async function MenuEditorPreviewPage({
  searchParams,
}: PageProps<"/dev/menu-editor-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const resolved = await searchParams;
  const empty = resolved.state === "empty";
  const model = empty ? { groups: [], dayparts: [] } : fixtureModel();

  const data: MenuEditorData = {
    businessId: "businesses_fixture" as Id<"businesses">,
    businessName: "Kafana kod Mike",
    businessSlug: "kafana-kod-mike",
    editorRole: "client",
    brandColors: ["#7A5C43", "#F7F8F3", "#161916"],
    menu: {
      id: "menus_fixture" as Id<"menus">,
      status: "draft",
      draftModel: model as unknown as NonNullable<MenuEditorData["menu"]>["draftModel"],
      draftDesign:
        resolved.design === "dark"
          ? (DARK_MENU_DESIGN as unknown as NonNullable<
              MenuEditorData["menu"]
            >["draftDesign"])
          : null,
      blockImageUrls: {},
      draftRevision: 0,
      publishedRevision: 0,
      publishedAt: null,
      hasUnpublishedChanges: false,
    },
  };

  return <MenuEditorWorkspace data={data} />;
}
