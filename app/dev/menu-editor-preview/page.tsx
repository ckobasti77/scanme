// Dev-only editor izlog (K10): the REAL ScanMe Menu editor inside the real
// panel shell, on an invented menu held in memory — every action works
// (lib/menu/studio/memorija.ts), nothing calls Convex. Unavailable in
// production, not indexed. Parameters (docs/MENI-PLAN.md §7; unknown → default):
//
//   (none)                       the medium menu ("Demo restoran"), Standard plan
//   ?stanje=prazno|veliki|brzi-unos
//   ?state=empty                 TASK-51, the same as stanje=prazno
//   ?design=dark                 TASK-51, the dark design of the preview
//   ?pogled=struktura|uredi|pregled   the pane, drawer or overlay open (snapshots)
//   ?plan=standard|premium       Premium switches Room service on
//   ?fokus=artikal|varijante     K15: the article detail
//   ?fokus=kombo|prevodi|room-service   K16: a combo with "Proveri cenu", the
//                                translations view, the Room service context with the
//                                price decision open (prevodi and room-service open on
//                                Premium unless &plan=standard shows the locks)
//   ?tab=izgled                  K17: the Izgled mode (&plan=premium unlocks the Premium variants)
//   ?paleta=<id>                 K17: the venue starts on this curated palette (as published)
//   ?modal=objava|objava-greske|objava-zastarelo|verzije
//                                K18: Objavi open (consequences and a warning to confirm; two
//                                errors that lead to their articles; a review made stale by a
//                                colleague) or the previous publications (restore makes a draft)
//   ?stanje=konflikt             K18: a price saved meanwhile by a colleague, both values shown,
//                                and who else is in the editor
//   ?editor=stari                the legacy editor (legacy menus still use it)
//   ?tema=svetla|tamna           the app theme (K07)

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { MenuEditorWorkspace } from "@/components/menu/editor/menu-editor";
import type { MenuEditorData } from "@/components/menu/editor/menu-editor-types";
import { IzlogOkvir } from "@/components/menu/izlog/izlog-okvir";
import { PanelIzlog } from "@/components/menu/izlog/panel-izlog";
import { DARK_MENU_DESIGN, fixtureModel } from "@/components/menu/menu-fixtures";
import { IzlogTema } from "@/components/menu/zajednicko/izlog-tema";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { parseEditorPreview } from "@/lib/menu/izlog-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: menuZajednickoSr.izlog.naslovi.editor,
  robots: { index: false, follow: false },
};

/** The legacy editor as TASK-51 showed it (autosave lands in its honest failed-with-retry state). */
function StariEditor({ empty, darkDesign }: { empty: boolean; darkDesign: boolean }) {
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
      draftDesign: darkDesign
        ? (DARK_MENU_DESIGN as unknown as NonNullable<MenuEditorData["menu"]>["draftDesign"])
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

export default async function MenuEditorPreviewPage({
  searchParams,
}: PageProps<"/dev/menu-editor-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = parseEditorPreview(await searchParams);
  if (params.stariEditor) {
    return (
      <>
        <IzlogTema tema={params.tema} />
        <StariEditor empty={params.empty} darkDesign={params.darkDesign} />
      </>
    );
  }
  return (
    <>
      <IzlogTema tema={params.tema} />
      <IzlogOkvir ruta="editor" tema={params.tema} ceoEkran>
        <PanelIzlog
          params={{ tema: params.tema, sekcija: "editor", plan: params.plan, uloga: "vlasnik", stanje: null, fiokaOtvorena: false }}
          editor={params}
        />
      </IzlogOkvir>
    </>
  );
}
