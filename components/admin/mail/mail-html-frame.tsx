import { buildMailSrcDoc, MAIL_FRAME_SANDBOX } from "./mail-srcdoc";
import { cn } from "@/lib/utils";

// Admin UX Z1 — an incoming HTML message in a sandboxed srcdoc iframe (no
// scripts, no forms, no same-origin, no top navigation; CSP in the document).
// Fixed height with its own scroll: no script inside the frame measures it.
export function MailHtmlFrame({
  html,
  allowRemoteImages,
  title,
  className,
}: {
  html: string;
  allowRemoteImages: boolean;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      sandbox={MAIL_FRAME_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={buildMailSrcDoc(html, { allowRemoteImages })}
      title={title}
      className={cn("block h-[62vh] min-h-[20rem] w-full rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-white", className)}
    />
  );
}
