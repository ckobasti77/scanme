// The Menu template root (TASK-51; RFC-003 §1.b, §2.4). Applies the --menu-*
// custom properties from createTokenCompiler("menu") via compileMenuTokens,
// renders the background through the engine's presentation (a media
// background remaps the base token to the menu page colour, so no
// Links-namespaced token is ever emitted), and lays out the masthead, the
// ordered group column, and the footer. FORKED from
// components/venue/venue-template.tsx — its own CSS module, no shared
// stylesheet with Venue or Links, ever. Server component.
//
// The editor preview mounts THIS component with groups as children (wrapped
// for selection); the public route (§4 TASK-52) passes `view.groups`.

import type { CSSProperties, ReactNode } from "react";
import {
  clampMenuDesign,
  compileMenuTokens,
  type MenuDesign,
} from "@/lib/design-engine/menu-tokens";
import { menuSr as dict } from "@/lib/i18n/sr/menu";
import { MenuGroupRender } from "./blocks/registry";
import {
  resolveMenuMedia,
  type MenuPageView,
  type MenuRenderContext,
} from "./menu-view";
import styles from "./menu-template.module.css";

// Root token style + data attributes for one design. Media backgrounds have
// no stored media on the Menu doc (RFC-003 §2.13), so the category paints the
// page colour — the remap compileMenuTokens documents.
function rootPresentation(design: MenuDesign) {
  const tokens = compileMenuTokens(design) as Record<string, string>;
  if (design.background.category === "media") {
    tokens["--menu-background-base-image"] =
      "linear-gradient(var(--menu-page), var(--menu-page))";
  }
  return {
    style: tokens as CSSProperties,
    scale: design.typography.scale,
    align: design.typography.alignment,
  };
}

export function MenuTemplate({
  view,
  businessSlug,
  children,
}: {
  view: MenuPageView;
  businessSlug: string;
  /** Extra group nodes (the editor preview's selectable wrappers). */
  children?: ReactNode;
}) {
  const design = clampMenuDesign(view.design);
  const { style, scale, align } = rootPresentation(design);
  const ctx: MenuRenderContext = {
    businessSlug,
    businessName: view.businessName,
  };
  const groups = resolveMenuMedia(view.groups, view.blockImageUrls);
  const empty = groups.length === 0 && !children;

  return (
    <div
      className={styles.root}
      style={style}
      data-menu-scale={scale}
      data-menu-align={align}
    >
      <div className={styles.backgroundDetail} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.masthead}>
          <h1 className={styles.title}>{view.businessName}</h1>
        </header>
        <main className={styles.groups}>
          {empty ? <p className={styles.emptyNote}>{dict.emptyMenu}</p> : null}
          {groups.map((group) => (
            <MenuGroupRender key={group.base.id} group={group} ctx={ctx} />
          ))}
          {children}
        </main>
        <footer className={styles.footer}>
          <p className={styles.footerBrand}>{dict.poweredBy}</p>
        </footer>
      </div>
    </div>
  );
}
