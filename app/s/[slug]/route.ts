import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";

function deviceCategory(userAgent: string) {
  const value = userAgent.toLowerCase();
  if (/bot|crawler|spider|preview/.test(value)) return "bot" as const;
  if (/ipad|tablet/.test(value)) return "tablet" as const;
  if (/mobile|iphone|android/.test(value)) return "mobile" as const;
  if (value) return "desktop" as const;
  return "unknown" as const;
}

function externalReferrerHost(request: Request) {
  const referrer = request.headers.get("referer");
  if (!referrer) return undefined;
  try {
    const requestHost = new URL(request.url).hostname;
    const referrerHost = new URL(referrer).hostname.toLowerCase();
    return referrerHost !== requestHost ? referrerHost : undefined;
  } catch {
    return undefined;
  }
}

function errorPage(status: number, title: string, body: string) {
  const html = `<!doctype html>
<html lang="sr-Latn">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title} | ScanMe</title>
    <style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0b0c0a;color:#f1f3ed;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:24px}.wrap{width:min(100%,680px);border:1px solid rgba(241,243,237,.18);padding:clamp(24px,6vw,56px)}.mark{width:44px;height:44px;border:2px solid #c6ff4a;margin-bottom:56px}h1{font-size:clamp(32px,7vw,64px);line-height:1;letter-spacing:-.06em;margin:0;max-width:10ch}p{color:rgba(241,243,237,.68);line-height:1.7;max-width:52ch;margin:24px 0 0}a{display:inline-flex;min-height:48px;align-items:center;border:1px solid #c6ff4a;color:#0b0c0a;background:#c6ff4a;padding:0 18px;margin-top:36px;text-decoration:none;font-weight:700}a:focus-visible{outline:2px solid #c6ff4a;outline-offset:4px}
    </style>
  </head>
  <body><main class="wrap"><div class="mark" aria-hidden="true"></div><h1>${title}</h1><p>${body}</p><a href="/">Vrati se na ScanMe</a></main></body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return errorPage(
      503,
      "ScanMe veza trenutno nije dostupna.",
      "Digitalno odredište nije podešeno. Pokušajte ponovo kasnije.",
    );
  }

  try {
    const { slug } = await params;
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.redirects.resolveAndRecord, {
      slug,
      deviceCategory: deviceCategory(request.headers.get("user-agent") ?? ""),
      ...(externalReferrerHost(request)
        ? { referrerHost: externalReferrerHost(request) }
        : {}),
    });

    if (result.status === "available") {
      return new Response(null, {
        status: 307,
        headers: {
          Location: result.destinationUrl,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (result.status === "inactive") {
      return errorPage(
        410,
        "Ovaj ScanMe kod više nije aktivan.",
        "Vlasnik lokacije je isključio ovo odredište. Obratite se osoblju za aktuelne informacije.",
      );
    }
    if (result.status === "invalid_destination") {
      return errorPage(
        503,
        "Odredište nije bezbedno podešeno.",
        "Preusmerenje je zaustavljeno. ScanMe neće otvoriti adresu koja nije na dozvoljenoj listi.",
      );
    }
    return errorPage(
      404,
      "ScanMe kod nije pronađen.",
      "Proverite da li je kod pravilno skeniran ili se obratite osoblju lokacije.",
    );
  } catch {
    return errorPage(
      404,
      "ScanMe kod nije pronađen.",
      "Proverite da li je kod pravilno skeniran ili pokušajte ponovo kasnije.",
    );
  }
}
