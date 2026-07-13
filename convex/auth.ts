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
      throw new Error("Šifra mora imati najmanje 10 karaktera, veliko i malo slovo i broj.");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
  callbacks: {
    async createOrUpdateUser(ctx: MutationCtx, args) {
      if (args.existingUserId) return args.existingUserId;
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

      if (!isAdminSetup && !invitation) {
        throw new Error("Registracija je moguća samo preko važeće ScanMe pozivnice.");
      }
      if (invitation && invitation.invitation.normalizedEmail !== email) {
        throw new Error("Email adresa ne odgovara pozivnici.");
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
      if (!membership.length) throw new Error("Nalog nema pristup aktivnom lokalu.");
    },
  },
});
