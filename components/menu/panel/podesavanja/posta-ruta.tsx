"use client";

// ScanMe Menu V1 (K26) — the route side of the reply blocks in Podešavanja:
// Pošta lokala (menuMail.status, startConnect → the browser goes to Google or
// Microsoft; disconnect) and Šabloni odgovora (menuMail.templates,
// saveTemplate, resetTemplate, setSignature). K28 mounts each block where the
// section wants it and passes `povratak` from the page's search params
// (lib/menu/http/mail-callback.ts readMailReturn). The blocks are
// presentational (posta.tsx, sabloni.tsx); the izlog mounts them with fixtures.

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { menuOdgovorSr } from "@/lib/i18n/sr/menu-odgovor";
import type { TemplateKind } from "@/lib/menu/reply-templates";
import { GreskaStanje } from "../../zajednicko/stanja";
import type { PostaPovratak, PostaProvajder, SablonCilj } from "../../odgovor/model";
import { PoslovnaPosta } from "./posta";
import { SabloniOdgovora } from "./sabloni";

const o = menuOdgovorSr;

function tekstGreske(error: unknown): string {
  const code = error instanceof ConvexError && typeof error.data === "string" ? error.data : "mail/provider_unavailable";
  return (o.greske as Record<string, string>)[code] ?? o.greske["mail/provider_unavailable"];
}

export function PoslovnaPostaRuta({ menuServiceId, povratak }: { menuServiceId: Id<"menuServices">; povratak?: PostaPovratak }) {
  const stanje = useQuery(api.menuMail.status, { menuServiceId });
  const pocni = useMutation(api.menuMail.startConnect);
  const prekini = useMutation(api.menuMail.disconnect);
  const [radi, setRadi] = useState<PostaProvajder | "prekid" | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  if (stanje === null) return <GreskaStanje nivo={3} />;
  return (
    <PoslovnaPosta
      stanje={stanje}
      povratak={povratak}
      radi={radi}
      greska={greska}
      onPovezi={(provider) => {
        setRadi(provider);
        setGreska(null);
        pocni({ menuServiceId, provider })
          .then((ishod) => {
            if (ishod.ok) {
              window.location.assign(ishod.authorizeUrl);
              return;
            }
            setGreska(o.greske[ishod.code]);
            setRadi(null);
          })
          .catch((error: unknown) => {
            setGreska(tekstGreske(error));
            setRadi(null);
          });
      }}
      onPrekini={() => {
        setRadi("prekid");
        setGreska(null);
        prekini({ menuServiceId })
          .catch((error: unknown) => setGreska(tekstGreske(error)))
          .finally(() => setRadi(null));
      }}
    />
  );
}

export function SabloniOdgovoraRuta({ menuServiceId }: { menuServiceId: Id<"menuServices"> }) {
  const podaci = useQuery(api.menuMail.templates, { menuServiceId });
  const sacuvaj = useMutation(api.menuMail.saveTemplate);
  const vrati = useMutation(api.menuMail.resetTemplate);
  const potpis = useMutation(api.menuMail.setSignature);
  const [cuva, setCuva] = useState<SablonCilj | null>(null);
  const [sacuvano, setSacuvano] = useState<SablonCilj | null>(null);
  const [greska, setGreska] = useState<{ cilj: SablonCilj; tekst: string } | null>(null);

  const radi = (cilj: SablonCilj, rad: () => Promise<{ ok: true } | { ok: false; code: keyof typeof o.greske }>) => {
    setCuva(cilj);
    setSacuvano(null);
    setGreska(null);
    rad()
      .then((ishod) => (ishod.ok ? setSacuvano(cilj) : setGreska({ cilj, tekst: o.greske[ishod.code] })))
      .catch((error: unknown) => setGreska({ cilj, tekst: tekstGreske(error) }))
      .finally(() => setCuva(null));
  };

  if (podaci === null) return <GreskaStanje nivo={3} />;
  return (
    <SabloniOdgovora
      podaci={podaci}
      cuva={cuva}
      sacuvano={sacuvano}
      greska={greska}
      onSacuvaj={(kind: TemplateKind, subject, body) => radi(kind, () => sacuvaj({ menuServiceId, kind, subject, body }))}
      onVrati={(kind: TemplateKind) => radi(kind, () => vrati({ menuServiceId, kind }))}
      onPotpis={(signature) => radi("potpis", () => potpis({ menuServiceId, signature }))}
    />
  );
}
