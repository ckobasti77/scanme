import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "./convex-client-provider";
import "./globals.css";
import "./liquid-glass.css";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

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
    description: "Reviews, Venue, Memories i Loyalty rešenja koja trenutak gosta pretvaraju u sledeću korisnu akciju.",
    type: "website",
    locale: "sr_RS",
    siteName: "ScanMe",
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="sr-Latn"
      className={`dark ${plexMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key="scanme-marketing-theme";var saved=localStorage.getItem(key);var theme=saved==="light"||saved==="dark"?saved:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.marketingTheme=theme}catch(e){document.documentElement.dataset.marketingTheme="dark"}})();`,
          }}
        />
      </head>
      <body className="min-h-svh bg-background font-mono text-foreground antialiased">
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
