"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "scanme-theme";
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function readSystemTheme(): Theme {
  return window.matchMedia(DARK_MODE_QUERY).matches ? "dark" : "light";
}

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
  const systemTheme = window.matchMedia(DARK_MODE_QUERY);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(isTheme(event.newValue) ? event.newValue : readSystemTheme());
    onStoreChange();
  };

  const handleSystemTheme = () => {
    if (readStoredTheme()) return;
    applyTheme(readSystemTheme());
    onStoreChange();
  };

  window.addEventListener("scanme-theme-change", onStoreChange);
  window.addEventListener("storage", handleStorage);
  systemTheme.addEventListener("change", handleSystemTheme);
  return () => {
    window.removeEventListener("scanme-theme-change", onStoreChange);
    window.removeEventListener("storage", handleStorage);
    systemTheme.removeEventListener("change", handleSystemTheme);
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
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
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
