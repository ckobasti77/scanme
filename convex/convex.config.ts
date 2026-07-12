import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    SCANME_DEMO_SETUP_KEY: v.optional(v.string()),
  },
});

export default app;
