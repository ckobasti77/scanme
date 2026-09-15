/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activationRequestEmails from "../activationRequestEmails.js";
import type * as activationRequestEmailsData from "../activationRequestEmailsData.js";
import type * as activationRequests from "../activationRequests.js";
import type * as admin from "../admin.js";
import type * as adminAccessMigrations from "../adminAccessMigrations.js";
import type * as adminActions from "../adminActions.js";
import type * as adminClientProfiles from "../adminClientProfiles.js";
import type * as adminCommunications from "../adminCommunications.js";
import type * as adminFinance from "../adminFinance.js";
import type * as adminOrderMigrations from "../adminOrderMigrations.js";
import type * as adminOrders from "../adminOrders.js";
import type * as adminProductReads from "../adminProductReads.js";
import type * as adminProducts from "../adminProducts.js";
import type * as adminReadModels from "../adminReadModels.js";
import type * as adminTasks from "../adminTasks.js";
import type * as adminV1Migrations from "../adminV1Migrations.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as cards from "../cards.js";
import type * as cardsAdmin from "../cardsAdmin.js";
import type * as checkout from "../checkout.js";
import type * as clientAccounts from "../clientAccounts.js";
import type * as clientCommunications from "../clientCommunications.js";
import type * as clientPanel from "../clientPanel.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as emailProviderFoundation from "../emailProviderFoundation.js";
import type * as enterpriseProvisioning from "../enterpriseProvisioning.js";
import type * as entitlements from "../entitlements.js";
import type * as http from "../http.js";
import type * as invitationEmails from "../invitationEmails.js";
import type * as invitations from "../invitations.js";
import type * as leads from "../leads.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_accessOperations from "../lib/accessOperations.js";
import type * as lib_accessOrderBridge from "../lib/accessOrderBridge.js";
import type * as lib_accessResolution from "../lib/accessResolution.js";
import type * as lib_accessValidators from "../lib/accessValidators.js";
import type * as lib_adminActionAdapters from "../lib/adminActionAdapters.js";
import type * as lib_adminActionEngine from "../lib/adminActionEngine.js";
import type * as lib_adminActionValidators from "../lib/adminActionValidators.js";
import type * as lib_adminAudit from "../lib/adminAudit.js";
import type * as lib_adminCommunicationValidators from "../lib/adminCommunicationValidators.js";
import type * as lib_adminOrderOperations from "../lib/adminOrderOperations.js";
import type * as lib_adminOrderValidators from "../lib/adminOrderValidators.js";
import type * as lib_adminReadModelEngine from "../lib/adminReadModelEngine.js";
import type * as lib_adminTaskValidators from "../lib/adminTaskValidators.js";
import type * as lib_adminV1Validators from "../lib/adminV1Validators.js";
import type * as lib_billingCycle from "../lib/billingCycle.js";
import type * as lib_billingPort from "../lib/billingPort.js";
import type * as lib_clientAccountAccess from "../lib/clientAccountAccess.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_contacts from "../lib/contacts.js";
import type * as lib_countShards from "../lib/countShards.js";
import type * as lib_designEngineValidators from "../lib/designEngineValidators.js";
import type * as lib_emailProvider from "../lib/emailProvider.js";
import type * as lib_emailProviderValidators from "../lib/emailProviderValidators.js";
import type * as lib_emailSyncEngine from "../lib/emailSyncEngine.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_financeProjection from "../lib/financeProjection.js";
import type * as lib_invitations from "../lib/invitations.js";
import type * as lib_menuValidators from "../lib/menuValidators.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_orderSnapshot from "../lib/orderSnapshot.js";
import type * as lib_orderingErrors from "../lib/orderingErrors.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_scanMeDesignValidators from "../lib/scanMeDesignValidators.js";
import type * as lib_serviceMetrics from "../lib/serviceMetrics.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_subscriptionValidators from "../lib/subscriptionValidators.js";
import type * as lib_subscriptions from "../lib/subscriptions.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_venueValidators from "../lib/venueValidators.js";
import type * as lib_zohoMailProvider from "../lib/zohoMailProvider.js";
import type * as memories from "../memories.js";
import type * as memoriesAdmin from "../memoriesAdmin.js";
import type * as memoriesArchive from "../memoriesArchive.js";
import type * as memoriesDevSeed from "../memoriesDevSeed.js";
import type * as memoriesExport from "../memoriesExport.js";
import type * as memoriesExportWorker from "../memoriesExportWorker.js";
import type * as memoriesHost from "../memoriesHost.js";
import type * as memoriesLoadSeed from "../memoriesLoadSeed.js";
import type * as memoriesPipeline from "../memoriesPipeline.js";
import type * as memoriesWall from "../memoriesWall.js";
import type * as menu from "../menu.js";
import type * as menuAdmin from "../menuAdmin.js";
import type * as menuExport from "../menuExport.js";
import type * as menuInquiryEmails from "../menuInquiryEmails.js";
import type * as menuInquiryEmailsData from "../menuInquiryEmailsData.js";
import type * as menuPerfSeed from "../menuPerfSeed.js";
import type * as migrations from "../migrations.js";
import type * as offerLogoUploads from "../offerLogoUploads.js";
import type * as ordering from "../ordering.js";
import type * as orderingDevSeed from "../orderingDevSeed.js";
import type * as orderingPanel from "../orderingPanel.js";
import type * as orderingRequests from "../orderingRequests.js";
import type * as orderingShifts from "../orderingShifts.js";
import type * as orderingStatus from "../orderingStatus.js";
import type * as orders from "../orders.js";
import type * as redirects from "../redirects.js";
import type * as scanMeLinks from "../scanMeLinks.js";
import type * as slugCollisionScan from "../slugCollisionScan.js";
import type * as subscriptionMigrations from "../subscriptionMigrations.js";
import type * as subscriptionPayments from "../subscriptionPayments.js";
import type * as subscriptionPricing from "../subscriptionPricing.js";
import type * as subscriptions from "../subscriptions.js";
import type * as venue from "../venue.js";
import type * as venueAdmin from "../venueAdmin.js";
import type * as venueAnalytics from "../venueAnalytics.js";
import type * as venueDevSeed from "../venueDevSeed.js";
import type * as venueReservations from "../venueReservations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activationRequestEmails: typeof activationRequestEmails;
  activationRequestEmailsData: typeof activationRequestEmailsData;
  activationRequests: typeof activationRequests;
  admin: typeof admin;
  adminAccessMigrations: typeof adminAccessMigrations;
  adminActions: typeof adminActions;
  adminClientProfiles: typeof adminClientProfiles;
  adminCommunications: typeof adminCommunications;
  adminFinance: typeof adminFinance;
  adminOrderMigrations: typeof adminOrderMigrations;
  adminOrders: typeof adminOrders;
  adminProductReads: typeof adminProductReads;
  adminProducts: typeof adminProducts;
  adminReadModels: typeof adminReadModels;
  adminTasks: typeof adminTasks;
  adminV1Migrations: typeof adminV1Migrations;
  auth: typeof auth;
  billing: typeof billing;
  cards: typeof cards;
  cardsAdmin: typeof cardsAdmin;
  checkout: typeof checkout;
  clientAccounts: typeof clientAccounts;
  clientCommunications: typeof clientCommunications;
  clientPanel: typeof clientPanel;
  crons: typeof crons;
  demo: typeof demo;
  emailProviderFoundation: typeof emailProviderFoundation;
  enterpriseProvisioning: typeof enterpriseProvisioning;
  entitlements: typeof entitlements;
  http: typeof http;
  invitationEmails: typeof invitationEmails;
  invitations: typeof invitations;
  leads: typeof leads;
  "lib/access": typeof lib_access;
  "lib/accessOperations": typeof lib_accessOperations;
  "lib/accessOrderBridge": typeof lib_accessOrderBridge;
  "lib/accessResolution": typeof lib_accessResolution;
  "lib/accessValidators": typeof lib_accessValidators;
  "lib/adminActionAdapters": typeof lib_adminActionAdapters;
  "lib/adminActionEngine": typeof lib_adminActionEngine;
  "lib/adminActionValidators": typeof lib_adminActionValidators;
  "lib/adminAudit": typeof lib_adminAudit;
  "lib/adminCommunicationValidators": typeof lib_adminCommunicationValidators;
  "lib/adminOrderOperations": typeof lib_adminOrderOperations;
  "lib/adminOrderValidators": typeof lib_adminOrderValidators;
  "lib/adminReadModelEngine": typeof lib_adminReadModelEngine;
  "lib/adminTaskValidators": typeof lib_adminTaskValidators;
  "lib/adminV1Validators": typeof lib_adminV1Validators;
  "lib/billingCycle": typeof lib_billingCycle;
  "lib/billingPort": typeof lib_billingPort;
  "lib/clientAccountAccess": typeof lib_clientAccountAccess;
  "lib/codes": typeof lib_codes;
  "lib/contacts": typeof lib_contacts;
  "lib/countShards": typeof lib_countShards;
  "lib/designEngineValidators": typeof lib_designEngineValidators;
  "lib/emailProvider": typeof lib_emailProvider;
  "lib/emailProviderValidators": typeof lib_emailProviderValidators;
  "lib/emailSyncEngine": typeof lib_emailSyncEngine;
  "lib/entitlements": typeof lib_entitlements;
  "lib/financeProjection": typeof lib_financeProjection;
  "lib/invitations": typeof lib_invitations;
  "lib/menuValidators": typeof lib_menuValidators;
  "lib/metrics": typeof lib_metrics;
  "lib/orderSnapshot": typeof lib_orderSnapshot;
  "lib/orderingErrors": typeof lib_orderingErrors;
  "lib/plans": typeof lib_plans;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/scanMeDesignValidators": typeof lib_scanMeDesignValidators;
  "lib/serviceMetrics": typeof lib_serviceMetrics;
  "lib/storage": typeof lib_storage;
  "lib/subscriptionValidators": typeof lib_subscriptionValidators;
  "lib/subscriptions": typeof lib_subscriptions;
  "lib/validation": typeof lib_validation;
  "lib/venueValidators": typeof lib_venueValidators;
  "lib/zohoMailProvider": typeof lib_zohoMailProvider;
  memories: typeof memories;
  memoriesAdmin: typeof memoriesAdmin;
  memoriesArchive: typeof memoriesArchive;
  memoriesDevSeed: typeof memoriesDevSeed;
  memoriesExport: typeof memoriesExport;
  memoriesExportWorker: typeof memoriesExportWorker;
  memoriesHost: typeof memoriesHost;
  memoriesLoadSeed: typeof memoriesLoadSeed;
  memoriesPipeline: typeof memoriesPipeline;
  memoriesWall: typeof memoriesWall;
  menu: typeof menu;
  menuAdmin: typeof menuAdmin;
  menuExport: typeof menuExport;
  menuInquiryEmails: typeof menuInquiryEmails;
  menuInquiryEmailsData: typeof menuInquiryEmailsData;
  menuPerfSeed: typeof menuPerfSeed;
  migrations: typeof migrations;
  offerLogoUploads: typeof offerLogoUploads;
  ordering: typeof ordering;
  orderingDevSeed: typeof orderingDevSeed;
  orderingPanel: typeof orderingPanel;
  orderingRequests: typeof orderingRequests;
  orderingShifts: typeof orderingShifts;
  orderingStatus: typeof orderingStatus;
  orders: typeof orders;
  redirects: typeof redirects;
  scanMeLinks: typeof scanMeLinks;
  slugCollisionScan: typeof slugCollisionScan;
  subscriptionMigrations: typeof subscriptionMigrations;
  subscriptionPayments: typeof subscriptionPayments;
  subscriptionPricing: typeof subscriptionPricing;
  subscriptions: typeof subscriptions;
  venue: typeof venue;
  venueAdmin: typeof venueAdmin;
  venueAnalytics: typeof venueAnalytics;
  venueDevSeed: typeof venueDevSeed;
  venueReservations: typeof venueReservations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
