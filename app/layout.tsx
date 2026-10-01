import type { Metadata } from "next";
// Fonts are self-hosted through Fontsource instead of fetched from Google at
// build time. The ScanMe Links templates let a business pick any of these for
// its public page, so they all have to be real loaded faces; going through
// fonts.googleapis.com would make every build depend on reaching Google and
// would hand EU visitor IPs to a third party on every page view.
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/nunito-sans";
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/lora";
import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/archivo";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "./convex-client-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { TextRevealGlobal } from "@/components/text-reveal-global";
import { Toaster } from "@/components/ui/sonner";
import { REVEAL_HIDE_CSS } from "@/constants/textRevealConfig";
import "./globals.css";
// Deljeni vizuelni jezik staklene ponude (/ponuda + /kupovina), TASK-44.
import "./offer-surface.css";

const themeScript = `(function(){var t;try{t=localStorage.getItem("scanme-theme")}catch(e){}if(t!=="dark"&&t!=="light")t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var r=document.documentElement;r.setAttribute("data-theme",t);r.classList.toggle("dark",t==="dark")})()`;

export const metadata: Metadata = {
  title: "ScanMe | Digitalni partner Sajma automobila",
  description: "ScanMe povezuje fizički prostor sa digitalnim uslugama, interakcijama i korisnim uvidima. Digitalni partner Sajma automobila u Nišu 2026.",
  keywords: [
    "Google recenzije",
    "dinamički QR kodovi",
    "QR kodovi za lokale",
    "QR rešenja za male biznise",
    "digitalne ponude",
  ],
  openGraph: {
    title: "ScanMe | Sajam automobila dobija novu digitalnu dimenziju",
    description: "Upoznajte ScanMe digitalne usluge i fizičke proizvode na Sajmu automobila u Nišu 2026.",
    type: "website",
    locale: "sr_RS",
    siteName: "ScanMe",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="sr-Latn"
      data-theme="light"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className="antialiased"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style dangerouslySetInnerHTML={{ __html: REVEAL_HIDE_CSS }} />
      </head>
      <body className="min-h-svh bg-background font-mono text-foreground antialiased">
        <ThemeToggle placement="global" />
        <TextRevealGlobal />
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
        <Toaster />
      </body>
    </html>
  );
}
