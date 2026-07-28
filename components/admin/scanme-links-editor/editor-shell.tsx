"use client";

import {
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  Cloud,
  CloudCog,
  Crown,
  Droplets,
  Expand,
  ExternalLink,
  FileText,
  HelpCircle,
  LoaderCircle,
  Maximize2,
  Monitor,
  MoreVertical,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  RectangleHorizontal,
  RotateCcw,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Type,
} from "lucide-react";
import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import styles from "./editor-shell.module.css";

export const EDITOR_PANEL_IDS = [
  "content",
  "styles",
  "colors",
  "background",
  "buttons",
  "text",
  "analytics",
  "settings",
] as const;

export type EditorPanelId = (typeof EDITOR_PANEL_IDS)[number];
export type EditorSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";
export type EditorPreviewMode = "mobile" | "desktop";
export type EditorZoom = "fit" | 50 | 75 | 100;

type NavigationItem = {
  id: EditorPanelId;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof FileText;
  group: "main" | "support";
};

export const EDITOR_NAVIGATION: NavigationItem[] = [
  {
    id: "content",
    label: "Sadržaj",
    shortLabel: "Sadržaj",
    description: "Naziv, opis, logo i linkovi",
    icon: FileText,
    group: "main",
  },
  {
    id: "styles",
    label: "Brzi stilovi",
    shortLabel: "Stilovi",
    description: "Izaberite početnu temu",
    icon: Sparkles,
    group: "main",
  },
  {
    id: "colors",
    label: "Boje brenda",
    shortLabel: "Boje",
    description: "Paleta i pristupačan kontrast",
    icon: Droplets,
    group: "main",
  },
  {
    id: "background",
    label: "Pozadina",
    shortLabel: "Pozadina",
    description: "Boja, gradijent, šara ili slika",
    icon: Paintbrush,
    group: "main",
  },
  {
    id: "buttons",
    label: "Dugmad",
    shortLabel: "Dugmad",
    description: "Stil i ponašanje linkova",
    icon: RectangleHorizontal,
    group: "main",
  },
  {
    id: "text",
    label: "Tekst",
    shortLabel: "Tekst",
    description: "Tipografija i čitljivost",
    icon: Type,
    group: "main",
  },
  {
    id: "analytics",
    label: "Analitika",
    shortLabel: "Analitika",
    description: "Pregledi i klikovi",
    icon: BarChart3,
    group: "support",
  },
  {
    id: "settings",
    label: "Podešavanja",
    shortLabel: "Podeš.",
    description: "Status i javna adresa",
    icon: Settings,
    group: "support",
  },
];

type EditorShellProps = {
  businessName: string;
  publicHref: string;
  activePanel: EditorPanelId;
  onPanelChange: (panel: EditorPanelId) => void;
  isDesignReady: boolean;
  saveStatus: EditorSaveStatus;
  saveMessage?: string;
  canPublish: boolean;
  publishing: boolean;
  onSave: () => void;
  onRetry: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  panel: ReactNode;
  preview: ReactNode;
  previewMode: EditorPreviewMode;
  onPreviewModeChange: (mode: EditorPreviewMode) => void;
  zoom: EditorZoom;
  onZoomChange: (zoom: EditorZoom) => void;
  onFullscreen: () => void;
  previewContainerRef?: React.RefObject<HTMLDivElement | null>;
  mobilePanelOpenRequest?: number;
};

const SIDEBAR_STORAGE_KEY = "scanme-links-editor-sidebar-collapsed";

export function EditorShell({
  businessName,
  publicHref,
  activePanel,
  onPanelChange,
  isDesignReady,
  saveStatus,
  saveMessage,
  canPublish,
  publishing,
  onSave,
  onRetry,
  onPublish,
  onDiscard,
  panel,
  preview,
  previewMode,
  onPreviewModeChange,
  zoom,
  onZoomChange,
  onFullscreen,
  previewContainerRef,
  mobilePanelOpenRequest = 0,
}: EditorShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [compactDesktop, setCompactDesktop] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(
      "(min-width: 960px) and (max-width: 1179px)",
    );
    const applyViewport = () => setCompactDesktop(media.matches);
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(
        window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true",
      );
      applyViewport();
    });
    media.addEventListener("change", applyViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", applyViewport);
    };
  }, []);

  useEffect(() => {
    if (mobilePanelOpenRequest <= 0) return;
    if (typeof window !== "undefined" && window.innerWidth < 960) {
      const timeout = window.setTimeout(() => setSheetOpen(true), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [mobilePanelOpenRequest]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  function selectMobilePanel(panelId: EditorPanelId) {
    onPanelChange(panelId);
    setSheetOpen(true);
  }

  const activeNavigation =
    EDITOR_NAVIGATION.find((item) => item.id === activePanel) ??
    EDITOR_NAVIGATION[0];
  const ActiveIcon = activeNavigation.icon;
  const effectiveSidebarCollapsed = sidebarCollapsed || compactDesktop;
  const gridStyle = {
    "--editor-nav-width": effectiveSidebarCollapsed ? "84px" : "216px",
  } as CSSProperties;

  return (
    <div className={styles.editor}>
      <div className={styles.desktopGrid} style={gridStyle}>
        <EditorSidebar
          activePanel={activePanel}
          collapsed={effectiveSidebarCollapsed}
          isDesignReady={isDesignReady}
          onPanelChange={onPanelChange}
          onToggle={toggleSidebar}
        />

        <aside
          className={cn(
            styles.panelScrollbar,
            "col-start-2 row-span-2 row-start-1 min-w-0 overflow-y-auto border-r border-[var(--editor-line)] bg-[var(--editor-surface)]",
          )}
          aria-label={`${activeNavigation.label} — podešavanja`}
        >
          {panel}
        </aside>

        <EditorTopbar
          businessName={businessName}
          publicHref={publicHref}
          saveStatus={saveStatus}
          saveMessage={saveMessage}
          canPublish={canPublish}
          publishing={publishing}
          onSave={onSave}
          onRetry={onRetry}
          onPublish={onPublish}
          onDiscard={onDiscard}
        />

        <main
          ref={previewContainerRef}
          className={cn(
            styles.previewCanvas,
            styles.panelScrollbar,
            "col-start-3 row-start-2 min-h-0 min-w-0 overflow-auto",
          )}
        >
          <DesktopPreviewToolbar
            previewMode={previewMode}
            onPreviewModeChange={onPreviewModeChange}
            zoom={zoom}
            onZoomChange={onZoomChange}
            onFullscreen={onFullscreen}
          />
          {preview}
        </main>
      </div>

      <div className={styles.mobileLayout}>
        <MobileHeader
          businessName={businessName}
          publicHref={publicHref}
          saveStatus={saveStatus}
          canPublish={canPublish}
          publishing={publishing}
          onSave={onSave}
          onRetry={onRetry}
          onPublish={onPublish}
          onDiscard={onDiscard}
        />

        <main
          ref={previewContainerRef}
          className={cn(
            styles.previewCanvas,
            styles.panelScrollbar,
            "min-h-0 flex-1 overflow-auto px-3 pb-32 pt-4 sm:px-5",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-sm font-semibold tracking-[-0.02em]">
                Pregled uživo
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--editor-muted)]">
                Promene se prikazuju odmah
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Prikaži preview preko celog ekrana"
              onClick={onFullscreen}
              className="size-11 rounded-xl"
            >
              <Expand className="size-5" />
            </Button>
          </div>
          {preview}
        </main>

        <MobileNavigation
          activePanel={activePanel}
          isDesignReady={isDesignReady}
          onSelect={selectMobilePanel}
        />

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[min(78dvh,760px)] gap-0 rounded-t-[32px] border-t border-white/60 bg-[#fcfbf8]/80 p-0 shadow-[0_-25px_80px_rgba(0,0,0,0.22),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl backdrop-saturate-180"
          >
            <div
              aria-hidden="true"
              className="mx-auto mt-3 h-1 w-12 rounded-full bg-black/25"
            />
            <SheetHeader className="border-b border-[var(--editor-line)] px-5 pb-4 pt-5 pr-16 text-left">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--editor-line)] bg-[var(--editor-surface)]">
                  <ActiveIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="text-lg tracking-[-0.03em]">
                    {activeNavigation.label}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs leading-5">
                    {activeNavigation.description}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div
              className={cn(
                styles.panelScrollbar,
                "min-h-0 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]",
              )}
            >
              {panel}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

function EditorSidebar({
  activePanel,
  collapsed,
  isDesignReady,
  onPanelChange,
  onToggle,
}: {
  activePanel: EditorPanelId;
  collapsed: boolean;
  isDesignReady: boolean;
  onPanelChange: (panel: EditorPanelId) => void;
  onToggle: () => void;
}) {
  const main = EDITOR_NAVIGATION.filter((item) => item.group === "main");
  const support = EDITOR_NAVIGATION.filter((item) => item.group === "support");

  return (
    <nav
      aria-label="Sekcije ScanMe Links editora"
      className="col-start-1 row-span-2 row-start-1 flex min-h-0 flex-col border-r border-[var(--editor-line)] bg-[var(--editor-surface)]"
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center justify-between border-b border-[var(--editor-line)]",
          collapsed ? "px-2" : "px-4",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            aria-label="Proširi glavni meni"
            onClick={onToggle}
            className="flex size-11 w-full items-center justify-center rounded-xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] text-[var(--editor-ink)] transition-colors hover:border-black hover:bg-[var(--editor-lime)]/30"
            title="Proširi glavni meni"
          >
            <PanelLeftOpen className="size-5" />
          </button>
        ) : (
          <>
            <Link
              href="/admin/scanme-links"
              aria-label="Nazad na ScanMe Links lokale"
              className="flex min-h-11 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              <BrandLogo width="8.25rem" />
            </Link>
            <button
              type="button"
              aria-label="Sklopi glavni meni"
              onClick={onToggle}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--editor-muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--editor-ink)]"
              title="Sklopi glavni meni"
            >
              <PanelLeftClose className="size-5" />
            </button>
          </>
        )}
      </div>

      <div
        className={cn(
          styles.panelScrollbar,
          "min-h-0 flex-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <SidebarGroup
          label="Stranica"
          items={main}
          activePanel={activePanel}
          collapsed={collapsed}
          isDesignReady={isDesignReady}
          onPanelChange={onPanelChange}
        />
        <div className="my-4 h-px bg-[var(--editor-line)]" />
        <SidebarGroup
          label="Lokal"
          items={support}
          activePanel={activePanel}
          collapsed={collapsed}
          isDesignReady
          onPanelChange={onPanelChange}
        />

        {/* PRO plan & Pomoć */}
        <div className="mt-6 pt-2">
          {!collapsed ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Crown className="size-4 text-[var(--editor-ink)]" />
                  <span className="text-xs font-semibold">PRO plan</span>
                </div>
                <span className="rounded-md bg-[var(--editor-lime)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
                  Aktivno
                </span>
              </div>
              <a
                href="mailto:podrska@scanme.rs"
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-xs font-medium text-[var(--editor-ink)] transition-colors hover:bg-black/[0.04]"
              >
                <HelpCircle className="size-4 shrink-0 text-[var(--editor-muted)]" />
                Pomoć
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div
                title="PRO plan"
                className="group relative flex size-10 items-center justify-center rounded-xl border border-[var(--editor-line)] bg-[var(--editor-surface-raised)]"
              >
                <Crown className="size-4 text-[var(--editor-ink)]" />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] px-3 py-2 text-xs font-medium shadow-md group-hover:block">
                  PRO plan
                </span>
              </div>
              <a
                href="mailto:podrska@scanme.rs"
                target="_blank"
                rel="noopener noreferrer"
                title="Pomoć"
                className="group relative flex size-10 items-center justify-center rounded-xl text-[var(--editor-muted)] hover:bg-black/[0.04]"
              >
                <HelpCircle className="size-4" />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] px-3 py-2 text-xs font-medium shadow-md group-hover:block">
                  Pomoć
                </span>
              </a>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "border-t border-[var(--editor-line)] p-3",
          collapsed && "px-2",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex min-h-11 w-full items-center rounded-xl text-xs font-semibold transition-colors hover:bg-black/[0.04]",
            collapsed
              ? "flex-col justify-center gap-1 px-1 py-2"
              : "gap-3 px-3",
          )}
          aria-label={collapsed ? "Proširi glavni meni" : "Sklopi glavni meni"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" />
          ) : (
            <>
              <PanelLeftClose className="size-5" />
              Sklopi meni
            </>
          )}
          {collapsed ? (
            <span className="text-[9px] font-medium">Proširi</span>
          ) : null}
        </button>
      </div>
    </nav>
  );
}

function SidebarGroup({
  label,
  items,
  activePanel,
  collapsed,
  isDesignReady,
  onPanelChange,
}: {
  label: string;
  items: NavigationItem[];
  activePanel: EditorPanelId;
  collapsed: boolean;
  isDesignReady: boolean;
  onPanelChange: (panel: EditorPanelId) => void;
}) {
  return (
    <div>
      {!collapsed ? (
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--editor-muted)]">
          {label}
        </p>
      ) : null}
      <ul className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePanel === item.id;
          const locked =
            !isDesignReady &&
            !["styles", "colors", "settings"].includes(item.id);
          return (
            <li key={item.id} className="group relative">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                aria-disabled={locked}
                title={collapsed ? item.label : undefined}
                onClick={() => onPanelChange(item.id)}
                className={cn(
                  "relative flex min-h-12 w-full items-center rounded-xl text-left text-xs font-medium transition-[background-color,color,transform]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--editor-surface)]",
                  collapsed
                    ? "flex-col justify-center gap-1 px-1 py-2 text-center"
                    : "gap-3 px-3",
                  active
                    ? "bg-[var(--editor-lime)] text-black"
                    : "text-[var(--editor-ink)] hover:bg-black/[0.04]",
                  locked && "text-[var(--editor-muted)]",
                )}
              >
                <Icon className={cn("size-5 shrink-0", active && "stroke-[2.2]")} />
                <span
                  className={cn(
                    "min-w-0",
                    collapsed
                      ? "max-w-[64px] truncate text-[9px] leading-3"
                      : "truncate",
                  )}
                >
                  {collapsed ? item.shortLabel : item.label}
                </span>
                {locked && !collapsed ? (
                  <span className="ml-auto text-[9px] uppercase tracking-wider">
                    Zaključano
                  </span>
                ) : null}
              </button>
              {collapsed ? (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--editor-line)] bg-[var(--editor-surface-raised)] px-3 py-2 text-xs font-medium shadow-md group-hover:block group-focus-within:block"
                >
                  {item.label}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditorTopbar({
  businessName,
  publicHref,
  saveStatus,
  saveMessage,
  canPublish,
  publishing,
  onSave,
  onRetry,
  onPublish,
  onDiscard,
}: Pick<
  EditorShellProps,
  | "businessName"
  | "publicHref"
  | "saveStatus"
  | "saveMessage"
  | "canPublish"
  | "publishing"
  | "onSave"
  | "onRetry"
  | "onPublish"
  | "onDiscard"
>) {
  return (
    <header className="col-start-3 row-start-1 flex min-w-0 items-center gap-3 border-b border-[var(--editor-line)] bg-[var(--editor-surface)] px-5">
      <SaveStatus status={saveStatus} message={saveMessage} />
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-xs font-semibold">{businessName}</p>
      </div>
      {saveStatus === "error" ? (
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="h-10 rounded-xl"
        >
          Pokušaj ponovo
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={onSave}
        disabled={saveStatus === "saving"}
        className="h-10 rounded-xl border-[var(--editor-line-strong)] bg-transparent px-4"
      >
        Sačuvaj nacrt
      </Button>
      <Button
        type="button"
        onClick={onPublish}
        disabled={!canPublish || publishing}
        className="h-10 min-w-28 rounded-xl bg-black px-5 text-white hover:bg-black/80"
      >
        {publishing ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        Objavi
      </Button>
      <EditorMoreMenu
        publicHref={publicHref}
        canDiscard={canPublish}
        onDiscard={onDiscard}
      />
    </header>
  );
}

function MobileHeader({
  businessName,
  publicHref,
  saveStatus,
  canPublish,
  publishing,
  onSave,
  onRetry,
  onPublish,
  onDiscard,
}: Pick<
  EditorShellProps,
  | "businessName"
  | "publicHref"
  | "saveStatus"
  | "canPublish"
  | "publishing"
  | "onSave"
  | "onRetry"
  | "onPublish"
  | "onDiscard"
>) {
  return (
    <header className="sticky top-0 z-40 flex min-h-16 items-center gap-3 border-b border-[var(--editor-line)] bg-[var(--editor-surface)] px-4">
      <Link
        href="/admin/scanme-links"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
        aria-label="Nazad na ScanMe Links lokale"
      >
        <BrandLogo width="7.75rem" />
        <span className="sr-only">{businessName}</span>
      </Link>
      <SaveStatus status={saveStatus} compact />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Akcije editora"
            className="size-11 rounded-xl"
          >
            <MoreVertical className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
          <DropdownMenuItem onSelect={onSave} disabled={saveStatus === "saving"}>
            <Cloud className="size-4" />
            Sačuvaj nacrt
          </DropdownMenuItem>
          {saveStatus === "error" ? (
            <DropdownMenuItem onSelect={onRetry}>
              <CloudCog className="size-4" />
              Pokušaj ponovo
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={onPublish}
            disabled={!canPublish || publishing}
          >
            <Send className="size-4" />
            Objavi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={publicHref} target="_blank">
              <ExternalLink className="size-4" />
              Otvori javnu stranicu
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={onDiscard}
            disabled={!canPublish}
          >
            <RotateCcw className="size-4" />
            Odbaci izmene
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function SaveStatus({
  status,
  message,
  compact = false,
}: {
  status: EditorSaveStatus;
  message?: string;
  compact?: boolean;
}) {
  const definition = useMemo(() => {
    if (status === "saving") {
      return {
        icon: LoaderCircle,
        label: "Čuvanje…",
        iconClass: "animate-spin text-[var(--editor-muted)]",
      };
    }
    if (status === "error") {
      return {
        icon: CircleAlert,
        label: "Nije sačuvano",
        iconClass: "text-[var(--editor-danger)]",
      };
    }
    if (status === "dirty") {
      return {
        icon: CloudCog,
        label: "Nesačuvane izmene",
        iconClass: "text-[var(--editor-muted)]",
      };
    }
    return {
      icon: Check,
      label: status === "idle" ? "Nacrt je spreman" : "Sačuvano",
      iconClass: "text-black",
    };
  }, [status]);
  const Icon = definition.icon;

  return (
    <div
      aria-live="polite"
      title={message}
      className={cn(
        "flex shrink-0 items-center gap-2 text-xs",
        compact && "max-w-[108px]",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full",
          status === "saved" || status === "idle"
            ? "bg-[var(--editor-lime)]"
            : "bg-black/[0.05]",
        )}
      >
        <Icon className={cn("size-3.5", definition.iconClass)} />
      </span>
      <span className={cn("truncate", compact && "hidden min-[390px]:block")}>
        {definition.label}
      </span>
    </div>
  );
}

function EditorMoreMenu({
  publicHref,
  canDiscard,
  onDiscard,
}: {
  publicHref: string;
  canDiscard: boolean;
  onDiscard: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Još akcija"
          className="size-10 rounded-xl"
        >
          <MoreVertical className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
        <DropdownMenuItem asChild>
          <Link href={publicHref} target="_blank">
            <ExternalLink className="size-4" />
            Otvori javnu stranicu
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={onDiscard}
          disabled={!canDiscard}
        >
          <RotateCcw className="size-4" />
          Odbaci izmene
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DesktopPreviewToolbar({
  previewMode,
  onPreviewModeChange,
  zoom,
  onZoomChange,
  onFullscreen,
}: Pick<
  EditorShellProps,
  | "previewMode"
  | "onPreviewModeChange"
  | "zoom"
  | "onZoomChange"
  | "onFullscreen"
>) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-center gap-3 px-5 py-4">
      <div
        className="flex rounded-xl border border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)] p-1 shadow-[0_8px_24px_rgb(23_24_22/0.05)]"
        role="group"
        aria-label="Uređaj za pregled"
      >
        <button
          type="button"
          aria-pressed={previewMode === "mobile"}
          aria-label="Mobilni pregled"
          onClick={() => onPreviewModeChange("mobile")}
          className={cn(
            "grid size-10 place-items-center rounded-lg transition-colors",
            previewMode === "mobile"
              ? "bg-[var(--editor-lime)] text-black"
              : "text-[var(--editor-muted)] hover:bg-black/[0.04]",
          )}
        >
          <Smartphone className="size-5" />
        </button>
        <button
          type="button"
          aria-pressed={previewMode === "desktop"}
          aria-label="Desktop pregled"
          onClick={() => onPreviewModeChange("desktop")}
          className={cn(
            "grid size-10 place-items-center rounded-lg transition-colors",
            previewMode === "desktop"
              ? "bg-[var(--editor-lime)] text-black"
              : "text-[var(--editor-muted)] hover:bg-black/[0.04]",
          )}
        >
          <Monitor className="size-5" />
        </button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-12 min-w-24 rounded-xl border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)]"
          >
            {zoom === "fit" ? "Auto" : `${zoom}%`}
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="rounded-xl p-1.5">
          {(["fit", 50, 75, 100] as const).map((value) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => onZoomChange(value)}
              className="min-h-10"
            >
              {value === "fit" ? "Prilagodi prostoru" : `${value}%`}
              {zoom === value ? <Check className="ml-auto size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onFullscreen}
        aria-label="Prikaži preview preko celog ekrana"
        className="size-12 rounded-xl border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)]"
      >
        <Maximize2 className="size-5" />
      </Button>
    </div>
  );
}

function MobileNavigation({
  activePanel,
  isDesignReady,
  onSelect,
}: {
  activePanel: EditorPanelId;
  isDesignReady: boolean;
  onSelect: (panel: EditorPanelId) => void;
}) {
  return (
    <nav
      aria-label="Sekcije editora"
      className="fixed inset-x-2 bottom-2 z-40 rounded-[22px] border border-[var(--editor-line-strong)] bg-[var(--editor-surface-raised)]/95 p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_14px_44px_rgb(23_24_22/0.13)] backdrop-blur-md"
    >
      <div
        className={cn(
          styles.mobileNav,
          "flex gap-1 overflow-x-auto overscroll-x-contain",
        )}
      >
        {EDITOR_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const active = activePanel === item.id;
          const locked =
            !isDesignReady &&
            !["styles", "colors", "settings"].includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-disabled={locked}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex min-h-[62px] min-w-[70px] shrink-0 flex-col items-center justify-center gap-1 rounded-[16px] px-2 text-[10px] font-medium transition-colors",
                active
                  ? "bg-[var(--editor-lime)] text-black"
                  : "text-[var(--editor-ink)] hover:bg-black/[0.04]",
                locked && "text-[var(--editor-muted)]",
              )}
            >
              <Icon className="size-5" />
              <span className="max-w-[66px] truncate">{item.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
