"use client";

// ScanMe Menu V1 (K30) — the route side of Analitika: the choices of the screen
// and at most two subscriptions (convex/menuAnalytics.ts). Standard reads
// `pregled` (7 or 30 days). Premium reads `period` for every choice, with the
// comparison to the previous period, and `raspodela` only while a breakdown
// is chosen. The queries never read the clock: the device passes today's
// Belgrade day (checked every minute, so the argument changes only at
// midnight). A custom period is sent only when it is valid, so the query never
// throws `analytics/invalid_period`. A query that fails anyway (e.g. a very
// long period of a large venue past the read limit) lands in the boundary
// below: a plain message and a way back to 30 days, not a broken panel.

import { useConvexAuth, useQuery } from "convex/react";
import { Component, useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { danUBeogradu } from "@/lib/menu/analitika/vreme";
import { periodIzbora, proveriIzbor, type IzborPerioda, type MetrikaTrenda } from "@/lib/menu/analitika/prikaz";
import { panelSekcijaHref, sekcijaVidljiva } from "@/lib/menu/panel-nav";
import { Dugme } from "../../zajednicko/dugme";
import { GreskaStanje } from "../../zajednicko/stanja";
import { usePanelKontekst } from "../ruta";
import { AnalitikaEkran } from "./analitika";
import type { IzborRaspodele } from "./raspodela";

const t = menuAnalitikaSr;
const MINUT_MS = 60_000;

class GranicaGreske extends Component<{ onPovratak: () => void; children: ReactNode }, { greska: boolean }> {
  state = { greska: false };

  static getDerivedStateFromError() {
    return { greska: true };
  }

  render() {
    if (!this.state.greska) return this.props.children;
    return (
      <GreskaStanje
        naslov={t.greskaNaslov}
        opis={t.greskaPeriod}
        akcija={
          <Dugme
            vrsta="sekundarno"
            onClick={() => {
              this.props.onPovratak();
              this.setState({ greska: false });
            }}
          >
            {t.greskaPovratak}
          </Dugme>
        }
      />
    );
  }
}

function AnalitikaPodaci({
  izbor,
  setIzbor,
  danas,
}: {
  izbor: IzborPerioda;
  setIzbor: (izbor: IzborPerioda) => void;
  danas: string;
}) {
  const { slug, actor, plan, menuServiceId } = usePanelKontekst();
  const { isLoading } = useConvexAuth();
  const [trend, setTrend] = useState<MetrikaTrenda>("otvaranja");
  const [raspodela, setRaspodela] = useState<IzborRaspodele>({ metrika: "otvaranja", dimenzija: null });

  const premium = plan === "premium";
  const ispravan = proveriIzbor(izbor, danas, plan) === null;
  const period = periodIzbora(izbor, danas);
  const standardDana = izbor.vrsta === "d7" ? 7 : 30;

  const pregled = useQuery(api.menuAnalytics.pregled, isLoading || premium ? "skip" : { menuServiceId, danas, dana: standardDana });
  const izPerioda = useQuery(
    api.menuAnalytics.period,
    isLoading || !premium || !ispravan ? "skip" : { menuServiceId, danas, od: period.od, do: period.do, poredi: true },
  );
  const raspodelaPodaci = useQuery(
    api.menuAnalytics.raspodela,
    isLoading || !premium || !ispravan || raspodela.dimenzija === null
      ? "skip"
      : { menuServiceId, danas, od: period.od, do: period.do, metrika: raspodela.metrika, dimenzija: raspodela.dimenzija },
  );

  return (
    <AnalitikaEkran
      plan={plan}
      danas={danas}
      izbor={izbor}
      onIzbor={setIzbor}
      izvestaj={premium ? izPerioda : pregled}
      trend={trend}
      onTrend={setTrend}
      raspodela={raspodela}
      onRaspodela={setRaspodela}
      raspodelaPodaci={raspodelaPodaci}
      slug={slug}
      paketHref={sekcijaVidljiva(actor, "podesavanja") ? panelSekcijaHref(slug, "podesavanja") : null}
    />
  );
}

export function AnalitikaRuta() {
  const [izbor, setIzbor] = useState<IzborPerioda>({ vrsta: "d30" });
  const [danas, setDanas] = useState(() => danUBeogradu(Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => setDanas(danUBeogradu(Date.now())), MINUT_MS);
    return () => window.clearInterval(id);
  }, []);
  return (
    <GranicaGreske onPovratak={() => setIzbor({ vrsta: "d30" })}>
      <AnalitikaPodaci izbor={izbor} setIzbor={setIzbor} danas={danas} />
    </GranicaGreske>
  );
}
