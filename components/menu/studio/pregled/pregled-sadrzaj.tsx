// ScanMe Menu V1 — the body of the interim editor preview (K10, until K13).
// The same tokens, CSS module and group renderers as the public MenuTemplate
// (components/menu/menu-template.tsx), but without its page landmarks (main,
// header, footer, h1): inside the editor the preview is a picture of the
// page, and the editor already has its own main region and its one h1.

import { memo, type CSSProperties } from "react";
import { clampMenuDesign, compileMenuTokens, type MenuDesign } from "@/lib/design-engine/menu-tokens";
import { menuSr } from "@/lib/i18n/sr/menu";
import type { StudioPregledView } from "@/lib/menu/studio/legacy-preview";
import { MenuGroupRender } from "../../blocks/registry";
import styles from "../../menu-template.module.css";

function izgled(design: MenuDesign) {
  const tokens = compileMenuTokens(design) as Record<string, string>;
  if (design.background.category === "media") {
    tokens["--menu-background-base-image"] = "linear-gradient(var(--menu-page), var(--menu-page))";
  }
  return { style: tokens as CSSProperties, scale: design.typography.scale, align: design.typography.alignment };
}

// K11: memoized — the save status changes on every drag, move or group action, and
// redrawing a 400-article preview each time made a drop wait (props are stable).
export const PregledSadrzaj = memo(function PregledSadrzaj({
  view,
  slug,
  dizajn,
}: {
  view: StudioPregledView;
  slug: string;
  dizajn: MenuDesign | null;
}) {
  const { style, scale, align } = izgled(clampMenuDesign(dizajn));
  const ctx = { businessSlug: slug, businessName: view.businessName };
  return (
    <div className={styles.root} style={style} data-menu-scale={scale} data-menu-align={align}>
      <div className={styles.backgroundDetail} aria-hidden="true" />
      <div className={styles.frame}>
        <div className={styles.masthead}>
          <p className={styles.title}>{view.businessName}</p>
        </div>
        <div className={styles.groups}>
          {view.groups.map((group) => (
            <MenuGroupRender key={group.base.id} group={group} ctx={ctx} />
          ))}
        </div>
        <div className={styles.footer}>
          <p className={styles.footerBrand}>{menuSr.poweredBy}</p>
        </div>
      </div>
    </div>
  );
});
