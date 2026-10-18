// ScanMe Menu V1 — the body of the editor preview (K10; K13: the public
// renderer itself). JavniMeni in its `ugradjen` form: no main, no h1, no
// footer landmark, nothing focusable, no live subscription — inside the editor
// the preview is a picture of the page, and the editor already has its own
// main region and its one h1. The appearance is the venue's (K17 will pass the
// draft presentation; until then the default), or the izlog's dark colours.

import { memo, useMemo } from "react";
import type { MenuDesign } from "@/lib/design-engine/menu-tokens";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { MENU_DEFAULT_PRESENTATION } from "@/lib/menu/presentation";
import type { JavniPregled } from "@/lib/menu/studio/javni-pregled";
import { JavniMeni } from "../../javni/javni-meni";

const BEZ_SLIKA = {};
// The editor model carries no promotions yet (K15), so no moment is needed to judge them.
const BEZ_AKCIJA = 0;

// K11: memoized — the save status changes on every drag, move or group action, and
// redrawing a 400-article preview each time made a drop wait (props are stable).
export const PregledSadrzaj = memo(function PregledSadrzaj({
  pregled,
  dizajn,
}: {
  pregled: JavniPregled;
  dizajn: MenuDesign | null;
}) {
  const izgled = useMemo(() => javniIzgled(MENU_DEFAULT_PRESENTATION, dizajn?.colors ?? null), [dizajn]);
  return (
    <JavniMeni
      view={pregled.view}
      izgled={izgled}
      slike={BEZ_SLIKA}
      sadaMs={BEZ_AKCIJA}
      nedostupni={pregled.nedostupni}
      ugradjen
    />
  );
});
