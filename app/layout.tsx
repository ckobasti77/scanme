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
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const themeScript = `(function(){var t;try{t=localStorage.getItem("scanme-theme")}catch(e){}if(t!=="dark"&&t!=="light")t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var r=document.documentElement;r.setAttribute("data-theme",t);r.classList.toggle("dark",t==="dark")})()`;

export const metadata: Metadata = {
  title: "ScanMe | Dinamički QR kodovi za lokalne biznise",
  description: "ScanMe dizajnira, priprema i održava QR rešenja koja fizičke materijale pretvaraju u Google recenzije, ponude i rezervacije.",
  keywords: [
    "Google recenzije",
    "dinamički QR kodovi",
    "QR kodovi za lokale",
    "QR rešenja za male biznise",
    "digitalne ponude",
  ],
  openGraph: {
    title: "ScanMe | Jedan gost. Mnogo novih.",
    description: "Kompletno QR rešenje za lokalne biznise, od dizajna i štampe do dinamičkog odredišta i statistike skeniranja.",
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
      </head>
      <body className="min-h-svh bg-background font-mono text-foreground antialiased">
        <ThemeToggle placement="global" />
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
        <Toaster />
      </body>
    </html>
  );
}
