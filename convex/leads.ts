import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { optionalText, requireText } from "./lib/validation";

const interestValidator = v.union(
  v.literal("review"),
  v.literal("page"),
  v.literal("venue"),
  v.literal("memories"),
  v.literal("loyalty"),
  v.literal("not_sure"),
);

export const create = mutation({
  args: {
    contactName: v.string(),
    businessName: v.string(),
    businessType: v.string(),
    city: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    interest: interestValidator,
    message: v.optional(v.string()),
    submissionId: v.string(),
    formStartedAt: v.number(),
    website: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("accepted"), v.literal("duplicate")),
  }),
  handler: async (ctx, args) => {
    if (args.website.trim()) {
      throw new ConvexError("Slanje nije uspelo. Osvežite stranicu i pokušajte ponovo.");
    }

    const now = Date.now();
    const timeOnForm = now - args.formStartedAt;
    if (timeOnForm < 900 || timeOnForm > 86_400_000) {
      throw new ConvexError("Forma je istekla. Osvežite stranicu i pokušajte ponovo.");
    }

    const submissionId = requireText(args.submissionId, "Oznaka prijave", 16, 100);
    const duplicate = await ctx.db
      .query("leads")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .unique();
    if (duplicate) return { status: "duplicate" as const };

    const contactName = requireText(args.contactName, "Ime i prezime", 2, 100);
    const businessName = requireText(args.businessName, "Naziv biznisa", 2, 120);
    const businessType = requireText(args.businessType, "Tip biznisa", 2, 80);
    const city = optionalText(args.city, 80);
    const email = optionalText(args.email, 160)?.toLowerCase();
    const phone = optionalText(args.phone, 40);
    const message = optionalText(args.message, 1_000);

    if (!email && !phone) {
      throw new ConvexError("Unesite telefon ili imejl kako bismo mogli da vam odgovorimo.");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Unesite ispravnu imejl adresu.");
    }
    if (phone && phone.replace(/\D/g, "").length < 7) {
      throw new ConvexError("Unesite ispravan broj telefona.");
    }

    await ctx.db.insert("leads", {
      contactName,
      businessName,
      businessType,
      ...(city ? { city } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      interest: args.interest,
      ...(message ? { message } : {}),
      submissionId,
      status: "new",
      createdAt: now,
    });

    return { status: "accepted" as const };
  },
});
