"use client";

// TASK-64 — Ordering configuration & items card in the venue client panel.
// Server-gated via getOwnerOrderingConfig (returns "locked" on Basic — upsells).
// Per-venue config switches (enabled, callWaiterEnabled) and live item availability
// (setItemAvailable) update in real-time through Convex subscriptions.
// Prices are informational only (RFC-004 §2.3) — no cart, no in-app payment.

import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  Check,
  Copy,
  Info,
  Lock,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n";
import { orderingAdminSr as dict } from "@/lib/i18n/sr/ordering-admin";

interface VenueOrderingCardProps {
  businessId: Id<"businesses">;
  orderingEnabled: boolean;
}

type DialogState =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; itemId: Id<"orderingItems">; name: string; priceRsd?: number }
  | { kind: "delete"; itemId: Id<"orderingItems">; name: string };

export function VenueOrderingCard({
  businessId,
  orderingEnabled,
}: VenueOrderingCardProps) {
  const orderingData = useQuery(
    api.ordering.getOwnerOrderingConfig,
    orderingEnabled ? { businessId } : "skip",
  );

  const updateConfig = useMutation(api.ordering.updateOrderingConfig);
  const setItemAvailable = useMutation(api.ordering.setItemAvailable);
  const createItem = useMutation(api.ordering.createOrderingItem);
  const updateItem = useMutation(api.ordering.updateOrderingItem);
  const deleteItem = useMutation(api.ordering.deleteOrderingItem);

  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // If ordering capability is not unlocked on the venue plan, render locked card.
  if (!orderingEnabled) {
    return (
      <section className="border border-border bg-card p-5 sm:p-7">
        <h3 className="flex items-center gap-2 font-semibold">
          <Lock className="size-4 text-muted-foreground" />
          {dict.lockedHeading}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {dict.lockedNote}
        </p>
      </section>
    );
  }

  if (orderingData === undefined) {
    return (
      <section className="border border-border bg-card p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="size-5 text-muted-foreground animate-pulse" />
          <h3 className="font-semibold">{dict.cardHeading}</h3>
        </div>
      </section>
    );
  }

  if (orderingData.status === "locked") {
    return (
      <section className="border border-border bg-card p-5 sm:p-7">
        <h3 className="flex items-center gap-2 font-semibold">
          <Lock className="size-4 text-muted-foreground" />
          {dict.lockedHeading}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {dict.lockedNote}
        </p>
      </section>
    );
  }

  const config = orderingData.config;
  const items = orderingData.items;

  const handleToggleEnabled = async () => {
    const nextVal = !(config?.enabled ?? false);
    try {
      await updateConfig({
        businessId,
        enabled: nextVal,
      });
      toast.success(dict.configSaveSuccess);
    } catch {
      toast.error(dict.configSaveError);
    }
  };

  const handleToggleCallWaiter = async () => {
    const nextVal = !(config?.callWaiterEnabled ?? true);
    try {
      await updateConfig({
        businessId,
        callWaiterEnabled: nextVal,
      });
      toast.success(dict.configSaveSuccess);
    } catch {
      toast.error(dict.configSaveError);
    }
  };

  const handleToggleAvailable = async (
    itemId: Id<"orderingItems">,
    name: string,
    currentAvailable: boolean,
  ) => {
    try {
      await setItemAvailable({
        itemId,
        available: !currentAvailable,
      });
      toast.success(fmt(dict.toggleAvailableSuccess, { name }));
    } catch {
      toast.error(dict.itemAvailabilityError);
    }
  };

  const handleCopyLink = () => {
    if (!config?.code) return;
    const url = `${window.location.origin}/o/${config.code}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success(dict.linkCopied);
    setTimeout(() => setCopied(false), 2000);
  };

  const openAddDialog = () => {
    setFormName("");
    setFormPrice("");
    setDialog({ kind: "add" });
  };

  const openEditDialog = (item: {
    _id: Id<"orderingItems">;
    name: string;
    priceRsd?: number;
  }) => {
    setFormName(item.name);
    setFormPrice(item.priceRsd ? String(item.priceRsd) : "");
    setDialog({
      kind: "edit",
      itemId: item._id,
      name: item.name,
      priceRsd: item.priceRsd,
    });
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error(dict.itemNameRequired);
      return;
    }
    const numPrice = formPrice.trim() ? Number(formPrice.trim()) : undefined;

    setIsSubmitting(true);
    try {
      if (dialog.kind === "add") {
        await createItem({
          businessId,
          name: trimmedName,
          priceRsd: numPrice && numPrice > 0 ? numPrice : undefined,
        });
        toast.success(dict.itemSaveSuccess);
      } else if (dialog.kind === "edit") {
        await updateItem({
          itemId: dialog.itemId,
          name: trimmedName,
          priceRsd: numPrice && numPrice > 0 ? numPrice : null,
        });
        toast.success(dict.itemSaveSuccess);
      }
      setDialog({ kind: "none" });
    } catch {
      toast.error(dict.itemSaveError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    if (dialog.kind !== "delete") return;
    setIsSubmitting(true);
    try {
      await deleteItem({ itemId: dialog.itemId });
      toast.success(dict.itemDeleteSuccess);
      setDialog({ kind: "none" });
    } catch {
      toast.error(dict.itemDeleteError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <UtensilsCrossed className="size-5 text-primary" />
            {dict.cardHeading}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.cardDescription}
          </p>
        </div>
        {config?.code ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-muted px-2.5 py-1 rounded border border-border">
              /o/{config.code}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5 text-xs h-8"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-600" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {dict.copyLink}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Toggles */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-4 bg-muted/20">
          <div className="space-y-1">
            <Label className="text-sm font-medium cursor-pointer" onClick={handleToggleEnabled}>
              {dict.enabledLabel}
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {dict.enabledDescription}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config?.enabled ?? false}
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              config?.enabled ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                config?.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-4 bg-muted/20">
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer" onClick={handleToggleCallWaiter}>
              <Bell className="size-3.5 text-primary" />
              {dict.callWaiterLabel}
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {dict.callWaiterDescription}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config?.callWaiterEnabled ?? true}
            onClick={handleToggleCallWaiter}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              config?.callWaiterEnabled ?? true ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                config?.callWaiterEnabled ?? true ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Items management */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">{dict.itemsHeading}</h4>
            <p className="text-xs text-muted-foreground">
              {dict.itemsDescription}
            </p>
          </div>
          <Button size="sm" onClick={openAddDialog} className="gap-1.5 text-xs">
            <Plus className="size-3.5" />
            {dict.addItemAction}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {dict.emptyItems}
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border border border-border rounded-lg overflow-hidden">
            {items.map((item) => (
              <div
                key={item._id}
                className="flex items-center justify-between p-3 sm:px-4 text-sm bg-card hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    {item.priceRsd ? (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {item.priceRsd} RSD
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {/* Live availability toggle */}
                  <Button
                    variant={item.available ? "outline" : "secondary"}
                    size="sm"
                    onClick={() =>
                      handleToggleAvailable(item._id, item.name, item.available)
                    }
                    className={`h-8 text-xs font-medium px-2.5 sm:px-3 ${
                      item.available
                        ? "text-emerald-700 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                        : "text-muted-foreground bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {item.available ? dict.availableLabel : dict.unavailableLabel}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => openEditDialog(item)}
                    title={dict.editItemAction}
                  >
                    <Pencil className="size-3.5" />
                    <span className="sr-only">{dict.editItemAction}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() =>
                      setDialog({
                        kind: "delete",
                        itemId: item._id,
                        name: item.name,
                      })
                    }
                    title={dict.deleteItemAction}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">{dict.deleteItemAction}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
          <p>{dict.itemPriceNote}</p>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog
        open={dialog.kind === "add" || dialog.kind === "edit"}
        onOpenChange={(open) => !open && setDialog({ kind: "none" })}
      >
        <DialogContent>
          <form onSubmit={handleSaveItem}>
            <DialogHeader>
              <DialogTitle>
                {dialog.kind === "add"
                  ? dict.dialogAddTitle
                  : dict.dialogEditTitle}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="item-name">{dict.itemNameLabel}</Label>
                <Input
                  id="item-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={dict.itemNamePlaceholder}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-price">{dict.itemPriceLabel}</Label>
                <Input
                  id="item-price"
                  type="number"
                  min="0"
                  step="1"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder={dict.itemPricePlaceholder}
                />
                <p className="text-xs text-muted-foreground">
                  {dict.itemPriceNote}
                </p>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  {dict.cancelAction}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {dict.saveAction}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={dialog.kind === "delete"}
        onOpenChange={(open) => !open && setDialog({ kind: "none" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.confirmDeleteTitle}</DialogTitle>
            <DialogDescription>
              {dialog.kind === "delete" ? `"${dialog.name}". ` : ""}
              {dict.confirmDeleteDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                {dict.cancelAction}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteItem}
              disabled={isSubmitting}
            >
              {dict.deleteItemAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
