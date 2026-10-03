import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp({
  env: {
    SCANME_DEMO_SETUP_KEY: v.optional(v.string()),
    SCANME_VENUE_DEMO_SETUP_KEY: v.optional(v.string()),
    SCANME_MEMORIES_DEMO_SETUP_KEY: v.optional(v.string()),
    SCANME_ADMIN_EMAILS: v.optional(v.string()),
    SCANME_ADMIN_SETUP_SECRET: v.optional(v.string()),
    SCANME_INVITE_SECRET: v.optional(v.string()),
    // HMAC key for the Memories guest cookie (RFC-001 §2.6). The HMAC is
    // computed and verified in the NEXT.JS layer only (route handlers), so
    // Convex queries stay deterministic and cacheable with no crypto; it is
    // declared here so the platform env inventory stays complete and because
    // the TASK-15/16 pipeline routes read the same secret.
    SCANME_GUEST_SECRET: v.optional(v.string()),
    // Shared secret gating the image-pipeline mutations (RFC-001 §2.8,
    // TASK-15): the Next.js route app/api/m/[code]/process authenticates to
    // convex/memoriesPipeline.ts (uploadContext/commitProcessed) with it.
    // Server env on BOTH platforms (Vercel + Convex), never client-visible,
    // rotatable by setting a new value in both places.
    SCANME_PIPELINE_SECRET: v.optional(v.string()),
    SCANME_SITE_URL: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_FROM_EMAIL: v.optional(v.string()),
    SCANME_ACTIVATION_REQUEST_EMAIL: v.optional(v.string()),
    // Sajam 2026 B4: public base URL for links in fair emails (default: the
    // main ScanMe domain) and the monitored ScanMe address that receives
    // replies to the lead confirmation (follow-up opt-out). Both optional.
    FAIR_PUBLIC_BASE_URL: v.optional(v.string()),
    FAIR_EMAIL_REPLY_TO: v.optional(v.string()),
    // ADMIN-09B Zoho Mail adapter. All values are server-only and optional so
    // the foundation remains inert until ADMIN-09C supplies and verifies them.
    ZOHO_MAIL_API_BASE_URL: v.optional(v.string()),
    ZOHO_ACCOUNTS_BASE_URL: v.optional(v.string()),
    ZOHO_MAIL_CLIENT_ID: v.optional(v.string()),
    ZOHO_MAIL_CLIENT_SECRET: v.optional(v.string()),
    ZOHO_MAIL_REFRESH_TOKEN: v.optional(v.string()),
    ZOHO_MAIL_ACCOUNT_ID: v.optional(v.string()),
    ZOHO_MAIL_FROM_ADDRESS: v.optional(v.string()),
    ZOHO_MAIL_INBOX_FOLDER_ID: v.optional(v.string()),
    ZOHO_MAIL_SENT_FOLDER_ID: v.optional(v.string()),
    ZOHO_MAIL_SYNC_ENABLED: v.optional(v.string()),
    ZOHO_MAIL_OUTBOUND_ENABLED: v.optional(v.string()),
    ZOHO_MAIL_GROUP_SEND_AS_VERIFIED: v.optional(v.string()),
    ZOHO_MAIL_POLL_INTERVAL_SECONDS: v.optional(v.string()),
  },
});

// @convex-dev/rate-limiter (RFC-001 §2.9): abuse throttling for the new public
// Memories/cards surfaces — per-IP card resolution + guest creation, per-guest
// reservation bursts. Deliberately NOT used for the photo quota itself (that is
// a same-transaction index count in memories.reserveUpload).
app.use(rateLimiter);

export default app;
