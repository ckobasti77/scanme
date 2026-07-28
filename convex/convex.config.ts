import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    SCANME_DEMO_SETUP_KEY: v.optional(v.string()),
    SCANME_ADMIN_EMAILS: v.optional(v.string()),
    SCANME_ADMIN_SETUP_SECRET: v.optional(v.string()),
    SCANME_INVITE_SECRET: v.optional(v.string()),
    SCANME_SITE_URL: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_FROM_EMAIL: v.optional(v.string()),
    SCANME_ACTIVATION_REQUEST_EMAIL: v.optional(v.string()),
  },
});

export default app;
