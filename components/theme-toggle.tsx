"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function readServerTheme(): Theme {
  return "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
}

function subscribeToTheme(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== "scanme-theme") return;
    applyTheme(event.newValue === "dark" ? "dark" : "light");
    onStoreChange();
  };

  window.addEventListener("scanme-theme-change", onStoreChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener("scanme-theme-change", onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function ThemeToggle({
  placement = "local",
  className,
}: {
  placement?: "local" | "global";
  className?: string;
}) {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, readServerTheme);
  const dark = theme === "dark";

  function toggleTheme() {
    const nextTheme: Theme = dark ? "light" : "dark";

    applyTheme(nextTheme);
    try {
      window.localStorage.setItem("scanme-theme", nextTheme);
    } catch {
      // The selected theme still applies for this visit when storage is unavailable.
    }
    window.dispatchEvent(new Event("scanme-theme-change"));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Uključi svetlu temu" : "Uključi tamnu temu"}
      title={dark ? "Svetla tema" : "Tamna tema"}
      suppressHydrationWarning
      onClick={toggleTheme}
      data-theme-toggle={placement}
      className={cn(
        "focus-signal inline-flex size-11 shrink-0 items-center justify-center border border-foreground/20 bg-background text-foreground transition-colors duration-200 hover:border-primary hover:bg-primary hover:text-primary-foreground",
        placement === "global"
          ? "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 shadow-[0_8px_28px_rgb(0_0_0/0.12)]"
          : "relative",
        className,
      )}
    >
      <span className="relative size-5" aria-hidden="true">
        <Sun className="theme-icon theme-icon-sun size-5" strokeWidth={1.75} />
        <Moon className="theme-icon theme-icon-moon size-5" strokeWidth={1.75} />
      </span>
    </button>
  );
}
