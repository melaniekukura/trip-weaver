/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessibility from "../accessibility.js";
import type * as agentmail from "../agentmail.js";
import type * as agentmailClient from "../agentmailClient.js";
import type * as agentmailWebhook from "../agentmailWebhook.js";
import type * as airlineNames from "../airlineNames.js";
import type * as assistantSchema from "../assistantSchema.js";
import type * as auth from "../auth.js";
import type * as bookingLinks from "../bookingLinks.js";
import type * as cityAirports from "../cityAirports.js";
import type * as emailSchema from "../emailSchema.js";
import type * as firecrawl from "../firecrawl.js";
import type * as flightDiagnostics from "../flightDiagnostics.js";
import type * as flightJobs from "../flightJobs.js";
import type * as flightPlanFields from "../flightPlanFields.js";
import type * as flightSchema from "../flightSchema.js";
import type * as flightSearch from "../flightSearch.js";
import type * as flightSegments from "../flightSegments.js";
import type * as flights from "../flights.js";
import type * as health from "../health.js";
import type * as homeJourney from "../homeJourney.js";
import type * as http from "../http.js";
import type * as interestDates from "../interestDates.js";
import type * as interestDetails from "../interestDetails.js";
import type * as interestDiscovery from "../interestDiscovery.js";
import type * as interestDiversity from "../interestDiversity.js";
import type * as interestJobs from "../interestJobs.js";
import type * as interestSchema from "../interestSchema.js";
import type * as interestSearch from "../interestSearch.js";
import type * as itineraryEmailContent from "../itineraryEmailContent.js";
import type * as itineraryEmails from "../itineraryEmails.js";
import type * as returnFlights from "../returnFlights.js";
import type * as tripAgent from "../tripAgent.js";
import type * as tripAssistant from "../tripAssistant.js";
import type * as tripFields from "../tripFields.js";
import type * as trips from "../trips.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessibility: typeof accessibility;
  agentmail: typeof agentmail;
  agentmailClient: typeof agentmailClient;
  agentmailWebhook: typeof agentmailWebhook;
  airlineNames: typeof airlineNames;
  assistantSchema: typeof assistantSchema;
  auth: typeof auth;
  bookingLinks: typeof bookingLinks;
  cityAirports: typeof cityAirports;
  emailSchema: typeof emailSchema;
  firecrawl: typeof firecrawl;
  flightDiagnostics: typeof flightDiagnostics;
  flightJobs: typeof flightJobs;
  flightPlanFields: typeof flightPlanFields;
  flightSchema: typeof flightSchema;
  flightSearch: typeof flightSearch;
  flightSegments: typeof flightSegments;
  flights: typeof flights;
  health: typeof health;
  homeJourney: typeof homeJourney;
  http: typeof http;
  interestDates: typeof interestDates;
  interestDetails: typeof interestDetails;
  interestDiscovery: typeof interestDiscovery;
  interestDiversity: typeof interestDiversity;
  interestJobs: typeof interestJobs;
  interestSchema: typeof interestSchema;
  interestSearch: typeof interestSearch;
  itineraryEmailContent: typeof itineraryEmailContent;
  itineraryEmails: typeof itineraryEmails;
  returnFlights: typeof returnFlights;
  tripAgent: typeof tripAgent;
  tripAssistant: typeof tripAssistant;
  tripFields: typeof tripFields;
  trips: typeof trips;
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
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  researchPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"researchPool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
