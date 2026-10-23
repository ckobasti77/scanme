import type { Metadata, Viewport } from "next";
import { FairPaperTexture } from "@/components/fair/fair-paper-texture";
import "./fair-event.css";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

// The fair app is light-only: `only light` opts it out of browser forced dark
// (Chrome auto-dark, Samsung Internet dark mode). The landing keeps its own
// light/dark theme, so this is scoped to /sajam/* (see also fair-event.css).
export const viewport: Viewport = {
  colorScheme: "only light",
};

export default function FairLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FairPaperTexture />
    </>
  );
}
