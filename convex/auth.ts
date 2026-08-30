import { ConvexError } from "convex/values";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { env, type MutationCtx } from "./_generated/server";
import { isAdminEmail } from "./lib/access";
import { acceptInvitationForUser, findInvitationByToken } from "./lib/invitations";
import { normalizeEmail } from "./lib/validation";

const passwordProvider = Password({
  profile(params) {
    const profile: Record<string, string | boolean> & { email: string } = {
      email: normalizeEmail(String(params.email ?? "")),
      emailVerified: true,
    };
    if (typeof params.invitationToken === "string") profile.invitationToken = params.invitationToken;
    if (typeof params.scanSlug === "string") profile.scanSlug = params.scanSlug;
    if (typeof params.adminSetupSecret === "string") profile.adminSetupSecret = params.adminSetupSecret;
    return profile;
  },
  validatePasswordRequirements(password) {
    if (
      password.length < 10 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new ConvexError("Šifra mora imati najmanje 10 karaktera, veliko i malo slovo i broj.");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
  callbacks: {
    async createOrUpdateUser(ctx: MutationCtx, args) {
      const email = normalizeEmail(String(args.profile.email ?? ""));
      const invitationToken =
        typeof args.profile.invitationToken === "string" ? args.profile.invitationToken : "";
      const scanSlug = typeof args.profile.scanSlug === "string" ? args.profile.scanSlug : "";
      const adminSetupSecret =
        typeof args.profile.adminSetupSecret === "string" ? args.profile.adminSetupSecret : "";

      const configuredAdminSecret = env.SCANME_ADMIN_SETUP_SECRET ?? "";
      const isAdminSetup =
        isAdminEmail(email) &&
        configuredAdminSecret.length >= 16 &&
        adminSetupSecret === configuredAdminSecret;
      const invitation =
        invitationToken && scanSlug
          ? await findInvitationByToken(ctx, invitationToken, scanSlug)
          : null;

      if (args.existingUserId) {
        // Postojeći nalog bez aktivnog članstva mora da prihvati važeću
        // pozivnicu pri prijavi, inače beforeSessionCreation trajno blokira
        // ulazak (ponovo pozvani kontakt nikada ne bi mogao da se prijavi).
        if (invitation) {
          const user = await ctx.db.get(args.existingUserId);
          const claimable =
            invitation.invitation.status === "sent" ||
            invitation.invitation.status === "queued" ||
            invitation.invitation.status === "failed";
          if (
            claimable &&
            user?.email &&
            normalizeEmail(user.email) === invitation.invitation.normalizedEmail &&
            invitation.invitation.expiresAt > Date.now()
          ) {
            await acceptInvitationForUser(
              ctx,
              invitation.invitation._id,
              args.existingUserId,
            );
          }
        }
        return args.existingUserId;
      }

      if (!isAdminSetup && !invitation) {
        throw new ConvexError("Registracija je moguća samo preko važeće ScanMe pozivnice.");
      }
      if (invitation && invitation.invitation.normalizedEmail !== email) {
        throw new ConvexError("Email adresa ne odgovara pozivnici.");
      }

      const userId = await ctx.db.insert("users", {
        email,
        emailVerificationTime: Date.now(),
      });
      if (invitation) {
        await acceptInvitationForUser(ctx, invitation.invitation._id, userId);
      }
      return userId;
    },
    async beforeSessionCreation(ctx: MutationCtx, { userId }) {
      const user = await ctx.db.get(userId);
      if (isAdminEmail(user?.email)) return;
      const membership = await ctx.db
        .query("businessMemberships")
        .withIndex("by_userId_and_active", (q) => q.eq("userId", userId).eq("active", true))
        .take(1);
      if (membership.length) return;
      // Password signIn tok ne poziva createOrUpdateUser za postojeće naloge,
      // pa se pozivnica ne može prihvatiti pre ove provere. Nalog sa važećom
      // pozivnicom sme da se prijavi; prihvatanje završava stranica za
      // aktivaciju (invitations.claim).
      const email = normalizeEmail(user?.email ?? "");
      if (email) {
        const invitations = await ctx.db
          .query("businessInvitations")
          .withIndex("by_normalizedEmail", (q) => q.eq("normalizedEmail", email))
          .order("desc")
          .take(10);
        const now = Date.now();
        const hasClaimable = invitations.some(
          (invitation) =>
            (invitation.status === "sent" ||
              invitation.status === "queued" ||
              invitation.status === "failed") &&
            invitation.expiresAt > now,
        );
        if (hasClaimable) return;
      }
      throw new ConvexError("Nalog nema pristup aktivnom lokalu.");
    },
  },
});
