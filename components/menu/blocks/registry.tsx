// The Menu group registry (RFC-003 §1.a, §2.1 — TASK-51): { shape, label,
// icon, Render, EditorPanel? } per group SHAPE — the group shape is the block
// kind. FORKED from components/venue/blocks/registry.tsx: the `EditorPanel`
// slot is deliberately NOT filled here — the editor-side map
// (components/menu/editor/menu-editor-group-panels.tsx) extends these entries
// without touching the render path, so the public render never bundles a
// panel. Labels come from the menu-editor dictionary because the palette is
// an editor surface.
//
// Client module (§4 TASK-52): `MenuGroupRender` reads the accordion context to
// decide whether a group is expanded, so a group under the public controller's
// provider reveals its collapsed items. Without a provider (editor preview, SSR
// first paint, render tests) it renders exactly as TASK-51 did.

"use client";

import type { LucideIcon } from "lucide-react";
import {
  GalleryHorizontal,
  LayoutGrid,
  List,
  Star,
  Table2,
} from "lucide-react";
import type { ReactNode } from "react";
import { menuEditorSr } from "@/lib/i18n/sr/menu-editor";
import type { MenuGroup, MenuGroupShape } from "@/lib/menu-blocks";
import { useMenuAccordion } from "../menu-accordion-context";
import type { MenuRenderContext } from "../menu-view";
import { GalerijaGroup } from "./galerija-group";
import { GroupShell } from "./group-shell";
import { IstaknutoGroup } from "./istaknuto-group";
import { ListaGroup } from "./lista-group";
import { TabelaVarijantiGroup } from "./tabela-varijanti-group";
import { TrakaGroup } from "./traka-group";

// The editor's per-group property panel contract. `historyGroup` names an
// undo-grouping key (a slider drag is one undo step), as in Venue.
export type MenuGroupEditorPanelProps = {
  group: MenuGroup;
  onChange: (next: MenuGroup, historyGroup?: string) => void;
};

export type MenuGroupRegistryEntry = {
  shape: MenuGroupShape;
  label: string;
  icon: LucideIcon;
  Render: (props: { group: MenuGroup; ctx: MenuRenderContext }) => ReactNode;
  EditorPanel?: (props: MenuGroupEditorPanelProps) => ReactNode;
};

// One switch renders the discriminated union with full narrowing; registry
// entries reuse it so both lookup styles stay in sync. `reveal` opens the caret
// accordion (§2.1): when true the shape renders all its items, not just the
// first VISIBLE_COUNT. Istaknuto is one hero, so it ignores reveal.
export function renderMenuGroupContent(
  group: MenuGroup,
  reveal = false,
): ReactNode {
  switch (group.shape) {
    case "lista":
      return <ListaGroup group={group} reveal={reveal} />;
    case "galerija":
      return <GalerijaGroup group={group} reveal={reveal} />;
    case "traka":
      return <TrakaGroup group={group} reveal={reveal} />;
    case "istaknuto":
      return <IstaknutoGroup group={group} />;
    case "tabela_varijanti":
      return <TabelaVarijantiGroup group={group} reveal={reveal} />;
  }
}

// The full group: the section shell (anchor + heading) around the shape's
// content. An empty group still renders its shell — the heading is the
// scroll-spy target and the editor's selection surface. The group is expanded
// when the `reveal` override says so, else when the accordion context names it
// as the open group; with no provider it stays collapsed (TASK-51 behavior).
export function MenuGroupRender({
  group,
  reveal,
}: {
  group: MenuGroup;
  ctx: MenuRenderContext;
  reveal?: boolean;
}) {
  const accordion = useMenuAccordion();
  const open =
    reveal ?? (accordion ? accordion.openGroupId === group.base.id : false);
  return (
    <GroupShell group={group}>{renderMenuGroupContent(group, open)}</GroupShell>
  );
}

function entry(
  shape: MenuGroupShape,
  label: string,
  icon: LucideIcon,
): MenuGroupRegistryEntry {
  return { shape, label, icon, Render: MenuGroupRender };
}

export const MENU_GROUP_REGISTRY: Record<MenuGroupShape, MenuGroupRegistryEntry> =
  {
    lista: entry("lista", menuEditorSr.shapeLabelLista, List),
    galerija: entry("galerija", menuEditorSr.shapeLabelGalerija, LayoutGrid),
    traka: entry("traka", menuEditorSr.shapeLabelTraka, GalleryHorizontal),
    istaknuto: entry("istaknuto", menuEditorSr.shapeLabelIstaknuto, Star),
    tabela_varijanti: entry(
      "tabela_varijanti",
      menuEditorSr.shapeLabelTabelaVarijanti,
      Table2,
    ),
  };
