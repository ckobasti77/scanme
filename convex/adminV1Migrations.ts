import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  ADMIN_V1_MIGRATION_VERSION,
  normalizeAdminHumanCode,
  normalizeAdminSearchText,
} from "./lib/adminV1Validators";

// Deliberately below Convex transaction limits. An account above these bounds
// must move through a future cursor-based component migration; this mutation
// never attempts a dangerously large all-at-once backfill.
const MAX_VENUES_PER_ACCOUNT = 20;
const MAX_CONTACTS_PER_VENUE = 50;
const MAX_MEMBERSHIPS_PER_VENUE = 50;

const venueMigrationValidator = v.object({
  businessId: v.id("businesses"),
  smlCode: v.string(),
  city: v.string(),
  address: v.string(),
});

const migrationResultValidator = v.object({
  dryRun: v.boolean(),
  accountId: v.union(v.id("accounts"), v.null()),
  createdAccount: v.boolean(),
  venues: v.number(),
  sourceContacts: v.number(),
  sourceMemberships: v.number(),
  createdContacts: v.number(),
  createdMemberships: v.number(),
  createdScopes: v.number(),
});

type LegacyMembership = Doc<"businessMemberships">;

function requiredText(value: string, field: string): string {
  const text = value.trim();
  if (!text) throw new ConvexError(`${field} je obavezan.`);
  return text;
}

async function codeOwner(
  ctx: MutationCtx,
  table: "accounts" | "businesses",
  code: string,
) {
  return table === "accounts"
    ? ctx.db
        .query("accounts")
        .withIndex("by_smkCode", (q) => q.eq("smkCode", code))
        .unique()
    : ctx.db
        .query("businesses")
        .withIndex("by_smlCode", (q) => q.eq("smlCode", code))
        .unique();
}

async function legacyMembershipsForBusiness(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
) {
  const active = await ctx.db
    .query("businessMemberships")
    .withIndex("by_businessId_and_active", (q) =>
      q.eq("businessId", businessId).eq("active", true),
    )
    .take(MAX_MEMBERSHIPS_PER_VENUE + 1);
  const inactive = await ctx.db
    .query("businessMemberships")
    .withIndex("by_businessId_and_active", (q) =>
      q.eq("businessId", businessId).eq("active", false),
    )
    .take(MAX_MEMBERSHIPS_PER_VENUE + 1);
  if (
    active.length > MAX_MEMBERSHIPS_PER_VENUE ||
    inactive.length > MAX_MEMBERSHIPS_PER_VENUE
  ) {
    throw new ConvexError("Lokal ima previše legacy članstava za jedan bezbedan batch.");
  }
  return [...active, ...inactive];
}

async function ensureMapping(
  ctx: MutationCtx,
  sourceKind: "business_contact" | "business_membership",
  sourceId: string,
  targetKind: "account_contact" | "account_membership",
  targetId: string,
  now: number,
) {
  const existing = await ctx.db
    .query("adminV1MigrationMappings")
    .withIndex("by_version_and_sourceKind_and_sourceId", (q) =>
      q
        .eq("version", ADMIN_V1_MIGRATION_VERSION)
        .eq("sourceKind", sourceKind)
        .eq("sourceId", sourceId),
    )
    .unique();
  if (existing) {
    if (existing.targetKind !== targetKind || existing.targetId !== targetId) {
      throw new ConvexError("Legacy zapis već ima drugo ADMIN-02 mapiranje.");
    }
    return;
  }
  await ctx.db.insert("adminV1MigrationMappings", {
    version: ADMIN_V1_MIGRATION_VERSION,
    sourceKind,
    sourceId,
    targetKind,
    targetId,
    createdAt: now,
  });
}

async function inferLegacyPlan(
  ctx: MutationCtx,
  businesses: readonly Doc<"businesses">[],
) {
  for (const business of businesses) {
    const entitlements = await ctx.db
      .query("entitlements")
      .withIndex("by_businessId_and_product", (q) =>
        q.eq("businessId", business._id),
      )
      .take(50);
    if (
      entitlements.some(
        (row) =>
          row.spaceId === undefined &&
          row.status === "active" &&
          row.planKey === "premium",
      )
    ) {
      return "premium" as const;
    }
  }
  return "basic" as const;
}

/**
 * ADMIN-02 widen-phase migration. The operator supplies the exact account,
 * venue, owner and default-contact mapping; the function never groups by name
 * or email. One transaction is intentionally bounded to a single client.
 * `dryRun` performs every read and validation but writes nothing.
 */
export const migrateLegacyClient = internalMutation({
  args: {
    accountId: v.optional(v.id("accounts")),
    smkCode: v.string(),
    ownerDisplayName: v.string(),
    primaryOwnerUserId: v.id("users"),
    primaryOwnerBusinessContactId: v.id("businessContacts"),
    defaultBusinessContactId: v.id("businessContacts"),
    venues: v.array(venueMigrationValidator),
    dryRun: v.boolean(),
    now: v.number(),
  },
  returns: migrationResultValidator,
  handler: async (ctx, args) => {
    if (args.venues.length === 0) {
      throw new ConvexError("Migracija zahteva najmanje jedan eksplicitno izabran lokal.");
    }
    if (args.venues.length > MAX_VENUES_PER_ACCOUNT) {
      throw new ConvexError("Klijent prelazi bezbednu granicu jednog migration batch-a.");
    }
    const smkCode = normalizeAdminHumanCode(args.smkCode, "SMK");
    const ownerDisplayName = requiredText(args.ownerDisplayName, "Ime vlasnika");
    const ownerUser = await ctx.db.get(args.primaryOwnerUserId);
    if (!ownerUser) throw new ConvexError("Primarni vlasnički korisnik nije pronađen.");

    const venueIdSet = new Set<string>();
    const smlCodeSet = new Set<string>();
    const businesses: Doc<"businesses">[] = [];
    const normalizedVenues: Array<{
      businessId: Id<"businesses">;
      smlCode: string;
      city: string;
      address: string;
    }> = [];
    for (const venue of args.venues) {
      if (venueIdSet.has(venue.businessId)) {
        throw new ConvexError("Isti lokal je naveden više puta u migracionom planu.");
      }
      venueIdSet.add(venue.businessId);
      const smlCode = normalizeAdminHumanCode(venue.smlCode, "SML");
      if (smlCodeSet.has(smlCode)) {
        throw new ConvexError("Dupliran SML kod u migracionom planu.");
      }
      smlCodeSet.add(smlCode);
      const business = await ctx.db.get(venue.businessId);
      if (!business || business.kind === "celebration") {
        throw new ConvexError("Izabrani zapis nije poslovni lokal.");
      }
      businesses.push(business);
      normalizedVenues.push({
        businessId: venue.businessId,
        smlCode,
        city: venue.city.trim(),
        address: venue.address.trim(),
      });
    }

    const linkedAccountIds = new Set(
      businesses
        .map((business) => business.accountId)
        .filter((id): id is Id<"accounts"> => id !== undefined),
    );
    if (linkedAccountIds.size > 1) {
      throw new ConvexError("Izabrani lokali već pripadaju različitim nalozima.");
    }
    const inferredAccountId = [...linkedAccountIds][0];
    if (args.accountId && inferredAccountId && args.accountId !== inferredAccountId) {
      throw new ConvexError("Migracioni accountId se ne poklapa sa vlasništvom lokala.");
    }
    const resolvedAccountId = args.accountId ?? inferredAccountId;
    let account = resolvedAccountId
      ? await ctx.db.get(resolvedAccountId)
      : null;
    if (resolvedAccountId && !account) throw new ConvexError("Klijentski nalog nije pronađen.");
    if (account) {
      const linked = await ctx.db
        .query("businesses")
        .withIndex("by_account", (q) => q.eq("accountId", account!._id))
        .take(MAX_VENUES_PER_ACCOUNT + 1);
      if (linked.length > MAX_VENUES_PER_ACCOUNT) {
        throw new ConvexError("Klijent prelazi bezbednu granicu jednog migration batch-a.");
      }
      const omitted = linked.find(
        (business) => business.kind !== "celebration" && !venueIdSet.has(business._id),
      );
      if (omitted) {
        throw new ConvexError(`Migracioni plan nije obuhvatio lokal ${omitted._id}.`);
      }
    } else if (businesses.some((business) => business.accountId !== undefined)) {
      throw new ConvexError("Account-less migracija ne sme usvojiti lokal drugog naloga.");
    }

    const existingSmk = await codeOwner(ctx, "accounts", smkCode);
    if (existingSmk && existingSmk._id !== account?._id) {
      throw new ConvexError("SMK kod se već koristi.");
    }
    if (account?.smkCode && account.smkCode !== smkCode) {
      throw new ConvexError("Nalog već ima drugi SMK kod.");
    }
    for (let index = 0; index < normalizedVenues.length; index += 1) {
      const current = businesses[index];
      const desired = normalizedVenues[index];
      const existingSml = await codeOwner(ctx, "businesses", desired.smlCode);
      if (existingSml && existingSml._id !== current._id) {
        throw new ConvexError("SML kod se već koristi.");
      }
      if (current.smlCode && current.smlCode !== desired.smlCode) {
        throw new ConvexError("Lokal već ima drugi SML kod.");
      }
    }

    const contacts: Doc<"businessContacts">[] = [];
    const legacyMemberships: LegacyMembership[] = [];
    const membershipIds = new Set<string>();
    for (const business of businesses) {
      const rows = await ctx.db
        .query("businessContacts")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .take(MAX_CONTACTS_PER_VENUE + 1);
      if (rows.length > MAX_CONTACTS_PER_VENUE) {
        throw new ConvexError("Lokal ima previše kontakata za jedan bezbedan batch.");
      }
      contacts.push(...rows);
      const memberships = await legacyMembershipsForBusiness(ctx, business._id);
      for (const membership of memberships) {
        if (membershipIds.has(membership._id)) {
          throw new ConvexError("Legacy članstvo je duplirano u migracionom planu.");
        }
        membershipIds.add(membership._id);
        legacyMemberships.push(membership);
      }
    }
    const contactIds = new Set(contacts.map((contact) => String(contact._id)));
    if (!contactIds.has(args.primaryOwnerBusinessContactId)) {
      throw new ConvexError("Kontakt primarnog vlasnika nije u izabranom klijentu.");
    }
    if (!contactIds.has(args.defaultBusinessContactId)) {
      throw new ConvexError("Podrazumevani kontakt nije u izabranom klijentu.");
    }
    const sourceOwnerContact = contacts.find(
      (contact) => contact._id === args.primaryOwnerBusinessContactId,
    )!;
    if (
      sourceOwnerContact.authUserId &&
      sourceOwnerContact.authUserId !== args.primaryOwnerUserId
    ) {
      throw new ConvexError("Kontakt primarnog vlasnika je vezan za drugog korisnika.");
    }

    if (args.dryRun) {
      return {
        dryRun: true,
        accountId: account?._id ?? null,
        createdAccount: account === null,
        venues: businesses.length,
        sourceContacts: contacts.length,
        sourceMemberships: legacyMemberships.length,
        createdContacts: contacts.filter((contact) => !contact.accountContactId).length,
        createdMemberships: new Set([
          args.primaryOwnerUserId,
          ...legacyMemberships.map((membership) => membership.userId),
        ]).size,
        createdScopes: legacyMemberships.length,
      };
    }

    let createdAccount = false;
    if (!account) {
      const plan = await inferLegacyPlan(ctx, businesses);
      const accountId = await ctx.db.insert("accounts", {
        name: ownerDisplayName,
        plan,
        status: "active",
        planSource: "manual",
        smkCode,
        ownerDisplayName,
        normalizedOwnerDisplayName: normalizeAdminSearchText(ownerDisplayName),
        clientStatus: "active",
        createdAt: args.now,
        updatedAt: args.now,
      });
      account = await ctx.db.get(accountId);
      createdAccount = true;
    }
    if (!account) throw new ConvexError("Klijentski nalog nije mogao biti kreiran.");

    let createdContacts = 0;
    const contactMap = new Map<string, Id<"accountContacts">>();
    for (const source of contacts) {
      let target = await ctx.db
        .query("accountContacts")
        .withIndex("by_legacyBusinessContactId", (q) =>
          q.eq("legacyBusinessContactId", source._id),
        )
        .unique();
      if (target && target.accountId !== account._id) {
        throw new ConvexError("Legacy kontakt je već mapiran na drugi nalog.");
      }
      if (!target) {
        const targetId = await ctx.db.insert("accountContacts", {
          accountId: account._id,
          firstName: source.firstName,
          lastName: source.lastName,
          normalizedName: normalizeAdminSearchText(
            `${source.firstName} ${source.lastName}`,
          ),
          ...(source.normalizedEmail
            ? { normalizedEmail: source.normalizedEmail }
            : {}),
          ...(source.phone ? { normalizedPhone: source.phone } : {}),
          positionTitle: source.positionTitle,
          isOwner: source._id === args.primaryOwnerBusinessContactId,
          status: source.status === "inactive" ? "inactive" : "active",
          ...(source._id === args.primaryOwnerBusinessContactId
            ? { authUserId: args.primaryOwnerUserId }
            : source.authUserId
              ? { authUserId: source.authUserId }
              : {}),
          legacyBusinessContactId: source._id,
          createdAt: source.createdAt,
          updatedAt: args.now,
        });
        target = await ctx.db.get(targetId);
        createdContacts += 1;
      }
      if (!target) throw new ConvexError("Account kontakt nije mogao biti kreiran.");
      contactMap.set(String(source._id), target._id);
      if (source.accountContactId !== target._id) {
        await ctx.db.patch(source._id, { accountContactId: target._id, updatedAt: args.now });
      }
      await ensureMapping(
        ctx,
        "business_contact",
        String(source._id),
        "account_contact",
        String(target._id),
        args.now,
      );
    }

    const ownerContactId = contactMap.get(String(args.primaryOwnerBusinessContactId));
    const defaultContactId = contactMap.get(String(args.defaultBusinessContactId));
    if (!ownerContactId || !defaultContactId) {
      throw new ConvexError("Obavezni kontakti nisu mapirani.");
    }

    let createdMemberships = 0;
    let ownerMembership = await ctx.db
      .query("accountMemberships")
      .withIndex("by_accountId_and_userId", (q) =>
        q.eq("accountId", account!._id).eq("userId", args.primaryOwnerUserId),
      )
      .unique();
    if (!ownerMembership) {
      const membershipId = await ctx.db.insert("accountMemberships", {
        accountId: account._id,
        userId: args.primaryOwnerUserId,
        contactId: ownerContactId,
        role: "full_access",
        active: true,
        venueAccess: "all",
        canBuyServices: true,
        canBuyPremium: true,
        createdAt: args.now,
        updatedAt: args.now,
      });
      ownerMembership = await ctx.db.get(membershipId);
      createdMemberships += 1;
    } else if (
      ownerMembership.role !== "full_access" ||
      !ownerMembership.active ||
      ownerMembership.venueAccess !== "all" ||
      ownerMembership.contactId !== ownerContactId ||
      !ownerMembership.canBuyServices ||
      !ownerMembership.canBuyPremium
    ) {
      await ctx.db.patch(ownerMembership._id, {
        contactId: ownerContactId,
        role: "full_access",
        active: true,
        venueAccess: "all",
        canBuyServices: true,
        canBuyPremium: true,
        updatedAt: args.now,
      });
      ownerMembership = await ctx.db.get(ownerMembership._id);
    }
    if (!ownerMembership) throw new ConvexError("Primarni vlasnik nije mogao biti kreiran.");

    const membershipsByUser = new Map<string, LegacyMembership[]>();
    for (const source of legacyMemberships) {
      const key = String(source.userId);
      const rows = membershipsByUser.get(key) ?? [];
      rows.push(source);
      membershipsByUser.set(key, rows);
    }
    let createdScopes = 0;
    for (const rows of membershipsByUser.values()) {
      const userId = rows[0].userId;
      let target = userId === args.primaryOwnerUserId
        ? ownerMembership
        : await ctx.db
            .query("accountMemberships")
            .withIndex("by_accountId_and_userId", (q) =>
              q.eq("accountId", account!._id).eq("userId", userId),
            )
            .unique();
      if (!target) {
        const targetId = await ctx.db.insert("accountMemberships", {
          accountId: account._id,
          userId,
          role: "view_only",
          active: rows.some((row) => row.active),
          venueAccess: "selected",
          canBuyServices: false,
          canBuyPremium: false,
          createdAt: args.now,
          updatedAt: args.now,
        });
        target = await ctx.db.get(targetId);
        createdMemberships += 1;
      }
      if (!target) throw new ConvexError("Account članstvo nije moglo biti kreirano.");
      for (const source of rows) {
        if (target.venueAccess === "selected") {
          const scope = await ctx.db
            .query("accountMembershipVenueScopes")
            .withIndex("by_membershipId_and_businessId", (q) =>
              q.eq("membershipId", target!._id).eq("businessId", source.businessId),
            )
            .unique();
          if (!scope) {
            await ctx.db.insert("accountMembershipVenueScopes", {
              membershipId: target._id,
              accountId: account._id,
              businessId: source.businessId,
              createdAt: args.now,
            });
            createdScopes += 1;
          } else if (scope.accountId !== account._id) {
            throw new ConvexError("Venue scope pripada drugom nalogu.");
          }
        }
        await ensureMapping(
          ctx,
          "business_membership",
          String(source._id),
          "account_membership",
          String(target._id),
          args.now,
        );
      }
    }

    for (let index = 0; index < normalizedVenues.length; index += 1) {
      const current = businesses[index];
      const desired = normalizedVenues[index];
      await ctx.db.patch(current._id, {
        accountId: account._id,
        smlCode: desired.smlCode,
        clientStatus: current.archivedAt ? "archived" : "active",
        normalizedName: normalizeAdminSearchText(current.name),
        ...(desired.city
          ? {
              city: desired.city,
              normalizedCity: normalizeAdminSearchText(desired.city),
            }
          : { city: undefined, normalizedCity: undefined }),
        ...(desired.address ? { address: desired.address } : { address: undefined }),
        adminV1MigrationVersion: ADMIN_V1_MIGRATION_VERSION,
        updatedAt: args.now,
      });
    }
    await ctx.db.patch(account._id, {
      smkCode,
      ownerDisplayName,
      normalizedOwnerDisplayName: normalizeAdminSearchText(ownerDisplayName),
      clientStatus: account.clientStatus ?? "active",
      primaryOwnerMembershipId: ownerMembership._id,
      defaultContactId,
      adminV1MigrationVersion: ADMIN_V1_MIGRATION_VERSION,
      adminV1MigratedAt: args.now,
      updatedAt: args.now,
    });

    return {
      dryRun: false,
      accountId: account._id,
      createdAccount,
      venues: businesses.length,
      sourceContacts: contacts.length,
      sourceMemberships: legacyMemberships.length,
      createdContacts,
      createdMemberships,
      createdScopes,
    };
  },
});
