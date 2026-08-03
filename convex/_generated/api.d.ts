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
import type * as clientPanel from "../clientPanel.js";
import type * as demo from "../demo.js";
import type * as http from "../http.js";
import type * as invitationEmails from "../invitationEmails.js";
import type * as invitations from "../invitations.js";
import type * as leads from "../leads.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_contacts from "../lib/contacts.js";
import type * as lib_invitations from "../lib/invitations.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_scanMeDesignValidators from "../lib/scanMeDesignValidators.js";
import type * as lib_serviceMetrics from "../lib/serviceMetrics.js";
import type * as lib_validation from "../lib/validation.js";
import type * as migrations from "../migrations.js";
import type * as redirects from "../redirects.js";
import type * as scanMeLinks from "../scanMeLinks.js";

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
  clientPanel: typeof clientPanel;
  demo: typeof demo;
  http: typeof http;
  invitationEmails: typeof invitationEmails;
  invitations: typeof invitations;
  leads: typeof leads;
  "lib/access": typeof lib_access;
  "lib/contacts": typeof lib_contacts;
  "lib/invitations": typeof lib_invitations;
  "lib/metrics": typeof lib_metrics;
  "lib/scanMeDesignValidators": typeof lib_scanMeDesignValidators;
  "lib/serviceMetrics": typeof lib_serviceMetrics;
  "lib/validation": typeof lib_validation;
  migrations: typeof migrations;
  redirects: typeof redirects;
  scanMeLinks: typeof scanMeLinks;
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

export declare const components: {};
