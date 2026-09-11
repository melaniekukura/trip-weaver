/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as cityAirports from "../cityAirports.js";
import type * as firecrawl from "../firecrawl.js";
import type * as flightJobs from "../flightJobs.js";
import type * as flightSchema from "../flightSchema.js";
import type * as flightSearch from "../flightSearch.js";
import type * as flights from "../flights.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as tripFields from "../tripFields.js";
import type * as trips from "../trips.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  cityAirports: typeof cityAirports;
  firecrawl: typeof firecrawl;
  flightJobs: typeof flightJobs;
  flightSchema: typeof flightSchema;
  flightSearch: typeof flightSearch;
  flights: typeof flights;
  health: typeof health;
  http: typeof http;
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
  researchPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"researchPool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
