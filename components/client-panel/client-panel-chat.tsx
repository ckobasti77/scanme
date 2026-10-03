"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronDown, MessageSquareText, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { communicationsSr as dict } from "@/lib/i18n/sr/communications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const dateFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function requestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replaceAll("-", "");
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function ClientPanelChat({ slug }: { slug: string }) {
  const conversation = useQuery(api.clientCommunications.getPanelConversation, { slug });
  const markAvailable = useMutation(api.clientCommunications.markPanelAvailable);
  const markRead = useMutation(api.clientCommunications.markConversationRead);
  const send = useMutation(api.clientCommunications.sendPanelMessage);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pendingRequest = useRef<{ id: string; content: string } | null>(null);
  const conversationId = conversation?.status === "available"
    ? conversation.conversationId
    : null;
  const latestMessageId = conversation?.status === "available"
    ? conversation.messages.at(-1)?.id ?? null
    : null;

  useEffect(() => {
    if (conversation?.status !== "available") return;
    void markAvailable({ slug }).catch(() => undefined);
  }, [conversation?.status, latestMessageId, markAvailable, slug]);

  useEffect(() => {
    if (!open || conversation?.status !== "available" || !conversationId) return;
    void markRead({ slug }).catch(() => undefined);
  }, [conversation?.status, conversationId, latestMessageId, markRead, open, slug]);

  if (conversation === undefined) {
    return <section aria-label={dict.clientTitle} className="h-24 animate-pulse border border-border bg-card motion-reduce:animate-none" />;
  }
  if (conversation.status === "unavailable") return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = content.trim();
    if (!message || busy) return;
    const current = pendingRequest.current?.content === message
      ? pendingRequest.current
      : { id: requestId(), content: message };
    pendingRequest.current = current;
    setBusy(true);
    setError("");
    try {
      await send({ slug, clientMessageId: current.id, content: current.content });
      pendingRequest.current = null;
      setContent("");
    } catch {
      setError(dict.clientError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border bg-card" aria-labelledby="client-chat-title">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="client-chat-content"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-16 w-full items-center justify-between gap-4 px-4 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-6"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center bg-primary/10 text-primary"><MessageSquareText className="size-5" aria-hidden="true" /></span>
          <span className="min-w-0">
            <strong id="client-chat-title" className="block truncate">{dict.clientTitle}</strong>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{dict.clientSubtitle}</span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-primary">
          <span className="hidden sm:inline">{open ? dict.clientClose : dict.clientOpen}</span>
          <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div id="client-chat-content" className="grid gap-5 border-t border-border p-4 sm:p-6">
          <div className="grid max-h-[28rem] gap-3 overflow-y-auto" aria-live="polite">
            {conversation.messagesCapped ? <p className="text-xs text-muted-foreground">{dict.clientHistoryCapped}</p> : null}
            {conversation.messages.length === 0 ? (
              <p className="py-5 text-sm text-muted-foreground">{dict.clientEmpty}</p>
            ) : conversation.messages.map((message) => (
              <article key={message.id} className={cn("max-w-[92%] border px-3.5 py-3 sm:max-w-[76%]", message.mine ? "ml-auto border-primary/25 bg-primary/8" : "border-border bg-background")}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">{message.mine ? dict.clientYou : dict.clientScanMe}</strong>
                  <time dateTime={new Date(message.createdAt).toISOString()}>{dateFormatter.format(message.createdAt)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
              </article>
            ))}
          </div>
          <form onSubmit={(event) => void submit(event)} className="grid gap-3 border-t border-border pt-5">
            <Label htmlFor="client-chat-message">{dict.clientMessageLabel}</Label>
            <Textarea
              id="client-chat-message"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={dict.clientMessagePlaceholder}
              maxLength={4_000}
              rows={3}
              required
              disabled={busy}
            />
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={busy || !content.trim()} className="justify-self-start">
              <Send className="size-4" aria-hidden="true" />
              {busy ? dict.clientSending : dict.clientSend}
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function ClientPanelChatPreview() {
  const [open, setOpen] = useState(true);
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<Array<{
    id: string;
    mine: boolean;
    content: string;
    createdAt: number;
  }>>([
    { id: "preview-client", mine: true, content: dict.previewClientMessage, createdAt: Date.parse("2026-09-11T11:32:00Z") },
    { id: "preview-admin", mine: false, content: dict.previewAdminMessage, createdAt: Date.parse("2026-09-11T11:38:00Z") },
  ]);
  return (
    <section className="border border-border bg-card" aria-labelledby="client-chat-preview-title">
      <button type="button" aria-expanded={open} aria-controls="client-chat-preview-content" onClick={() => setOpen((value) => !value)} className="flex min-h-16 w-full items-center justify-between gap-4 px-4 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-6">
        <span className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center bg-primary/10 text-primary"><MessageSquareText className="size-5" aria-hidden="true" /></span><span className="min-w-0"><strong id="client-chat-preview-title" className="block truncate">{dict.clientTitle}</strong><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{dict.clientSubtitle}</span></span></span>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-primary"><span className="hidden sm:inline">{open ? dict.clientClose : dict.clientOpen}</span><ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" /></span>
      </button>
      {open ? (
        <div id="client-chat-preview-content" className="grid gap-5 border-t border-border p-4 sm:p-6">
          <div className="grid max-h-[28rem] gap-3 overflow-y-auto" aria-live="polite">
            {messages.map((message) => <article key={message.id} className={cn("max-w-[92%] border px-3.5 py-3 sm:max-w-[76%]", message.mine ? "ml-auto border-primary/25 bg-primary/8" : "border-border bg-background")}><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><strong className="text-foreground">{message.mine ? dict.clientYou : dict.clientScanMe}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{dateFormatter.format(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p></article>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); const message = content.trim(); if (!message) return; setMessages((rows) => [...rows, { id: `preview-${rows.length}`, mine: true, content: message, createdAt: Date.now() }]); setContent(""); }} className="grid gap-3 border-t border-border pt-5">
            <Label htmlFor="client-chat-preview-message">{dict.clientMessageLabel}</Label>
            <Textarea
              id="client-chat-preview-message"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={dict.clientMessagePlaceholder}
              maxLength={4_000}
              rows={3}
              required
            />
            <Button type="submit" disabled={!content.trim()} className="justify-self-start"><Send className="size-4" aria-hidden="true" />{dict.clientSend}</Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
