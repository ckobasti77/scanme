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
import type * as auth from "../auth.js";
import type * as cards from "../cards.js";
import type * as clientPanel from "../clientPanel.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as entitlements from "../entitlements.js";
import type * as http from "../http.js";
import type * as invitationEmails from "../invitationEmails.js";
import type * as invitations from "../invitations.js";
import type * as leads from "../leads.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_contacts from "../lib/contacts.js";
import type * as lib_designEngineValidators from "../lib/designEngineValidators.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_invitations from "../lib/invitations.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_scanMeDesignValidators from "../lib/scanMeDesignValidators.js";
import type * as lib_serviceMetrics from "../lib/serviceMetrics.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_venueValidators from "../lib/venueValidators.js";
import type * as memories from "../memories.js";
import type * as memoriesAdmin from "../memoriesAdmin.js";
import type * as memoriesDevSeed from "../memoriesDevSeed.js";
import type * as memoriesHost from "../memoriesHost.js";
import type * as memoriesPipeline from "../memoriesPipeline.js";
import type * as migrations from "../migrations.js";
import type * as redirects from "../redirects.js";
import type * as scanMeLinks from "../scanMeLinks.js";
import type * as slugCollisionScan from "../slugCollisionScan.js";
import type * as venue from "../venue.js";
import type * as venueAdmin from "../venueAdmin.js";
import type * as venueDevSeed from "../venueDevSeed.js";

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
  auth: typeof auth;
  cards: typeof cards;
  clientPanel: typeof clientPanel;
  crons: typeof crons;
  demo: typeof demo;
  entitlements: typeof entitlements;
  http: typeof http;
  invitationEmails: typeof invitationEmails;
  invitations: typeof invitations;
  leads: typeof leads;
  "lib/access": typeof lib_access;
  "lib/codes": typeof lib_codes;
  "lib/contacts": typeof lib_contacts;
  "lib/designEngineValidators": typeof lib_designEngineValidators;
  "lib/entitlements": typeof lib_entitlements;
  "lib/invitations": typeof lib_invitations;
  "lib/metrics": typeof lib_metrics;
  "lib/plans": typeof lib_plans;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/scanMeDesignValidators": typeof lib_scanMeDesignValidators;
  "lib/serviceMetrics": typeof lib_serviceMetrics;
  "lib/storage": typeof lib_storage;
  "lib/validation": typeof lib_validation;
  "lib/venueValidators": typeof lib_venueValidators;
  memories: typeof memories;
  memoriesAdmin: typeof memoriesAdmin;
  memoriesDevSeed: typeof memoriesDevSeed;
  memoriesHost: typeof memoriesHost;
  memoriesPipeline: typeof memoriesPipeline;
  migrations: typeof migrations;
  redirects: typeof redirects;
  scanMeLinks: typeof scanMeLinks;
  slugCollisionScan: typeof slugCollisionScan;
  venue: typeof venue;
  venueAdmin: typeof venueAdmin;
  venueDevSeed: typeof venueDevSeed;
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
