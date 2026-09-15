import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";

export const diagnosticStages = {
  booking_match: "Match selected itinerary", booking_options: "Load airline booking options", booking_policy: "Verify airline website", booking_handoff: "Retrieve airline booking link",
  outbound_lookup: "Load selected outgoing flight", airport_lookup: "Resolve airports", outbound_scrape: "Read outgoing flights",
  outbound_parse: "Verify outgoing fares", browser_session: "Start flight-search browser", browser_execute: "Run flight-search browser",
  navigation: "Open Google Flights", outbound_list: "Load outgoing options", page_dates: "Check search dates",
  outbound_match: "Match selected outgoing flight", outbound_select: "Select outgoing flight",
  return_list: "Load return options", browser_result: "Read browser response", return_context: "Verify search settings",
  selected_outbound: "Verify outgoing selection", return_parse: "Verify return options", save_results: "Save flight results", worker: "Run background search",
} as const;
export const diagnosticReasons = {
  selection_unavailable: "The selected itinerary could not be uniquely matched.", airline_option_unavailable: "No direct booking option from the selected airlines was available.", direct_link_unavailable: "The airline did not provide a reusable direct booking link.",
  missing_output: "The browser returned no readable search output.", invalid_output: "The browser output was not a recognized search response.",
  unavailable: "The search could not complete this step.", timeout: "This step timed out.",
  http_error: "The provider rejected the request.", invalid_response: "The provider returned an unexpected response.",
  network_error: "The provider could not be reached.", browser_failed: "Browser execution failed.", browser_killed: "Browser execution was stopped.",
  date_mismatch: "The page dates did not match the requested dates.",
  outbound_missing: "The selected outgoing flight was not found.", outbound_ambiguous: "More than one outgoing flight matched the selection.",
  context_mismatch: "The route, passenger count, cabin, currency, or trip type did not match.",
  url_mismatch: "The returned page was not a Google Flights selection page.",
  label_unrecognized: "The outgoing flight label could not be parsed.", selection_mismatch: "The outgoing flight details did not match the selection.",
  no_labels: "No return-flight labels were returned.", no_parseable_labels: "The return-flight labels could not be parsed.",
  no_matching_returns: "Parsed return flights did not match the requested route and date.", interrupted: "The background search was interrupted.",
} as const;
export type DiagnosticStage = keyof typeof diagnosticStages;
export type DiagnosticReason = keyof typeof diagnosticReasons;
export const flightDiagnostic = v.object({
  stage: v.union(...Object.keys(diagnosticStages).map(stage => v.literal(stage))),
  reason: v.union(...Object.keys(diagnosticReasons).map(reason => v.literal(reason))), code: v.string(),
  httpStatus: v.optional(v.number()), exitCode: v.optional(v.number()),
  airlineMatchCount: v.optional(v.number()), departureMatchCount: v.optional(v.number()), arrivalMatchCount: v.optional(v.number()),
  durationMatchCount: v.optional(v.number()), stopsMatchCount: v.optional(v.number()),
  labelCount: v.optional(v.number()), matchCount: v.optional(v.number()), parsedCount: v.optional(v.number()),
});
export type FlightDiagnostic = Infer<typeof flightDiagnostic>;
type Metrics = Partial<Pick<FlightDiagnostic, "httpStatus" | "exitCode" | "labelCount" | "matchCount" | "parsedCount" | "airlineMatchCount" | "departureMatchCount" | "arrivalMatchCount" | "durationMatchCount" | "stopsMatchCount">>;

export function flightFailure(stage: DiagnosticStage, reason: DiagnosticReason, metrics: Metrics = {}, code = "FLIGHTS_UNAVAILABLE"): never {
  throw new ConvexError({ code, message: diagnosticReasons[reason], diagnostic: { stage, reason, ...metrics } });
}

export function diagnoseFlightFailure(error: unknown, fallback: DiagnosticStage): FlightDiagnostic {
  const data = error instanceof ConvexError && error.data && typeof error.data === "object" ? error.data : {};
  const value = "diagnostic" in data && data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic : {};
  return sanitizeFlightDiagnostic(value, fallback, "code" in data ? data.code : null);
}

export function sanitizeFlightDiagnostic(input: unknown, fallback: DiagnosticStage, errorCode: unknown = "FLIGHTS_UNAVAILABLE"): FlightDiagnostic {
  const value: Record<string, unknown> = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const stage = "stage" in value && typeof value.stage === "string" && Object.hasOwn(diagnosticStages, value.stage) ? value.stage : fallback;
  const reason = "reason" in value && typeof value.reason === "string" && Object.hasOwn(diagnosticReasons, value.reason) ? value.reason : "unavailable";
  const code = typeof errorCode === "string" && /^(?:FIRECRAWL_[A-Z_]{1,40}|FLIGHTS_UNAVAILABLE|AIRPORT_LOOKUP_FAILED)$/.test(errorCode) ? errorCode : "SEARCH_FAILED";
  const metrics: Metrics = {};
  for (const key of ["httpStatus", "exitCode", "labelCount", "matchCount", "parsedCount", "airlineMatchCount", "departureMatchCount", "arrivalMatchCount", "durationMatchCount", "stopsMatchCount"] as const) {
    if (key in value && typeof value[key] === "number" && Number.isInteger(value[key]) && Math.abs(value[key]) <= 1000000) metrics[key] = value[key];
  }
  return { stage, reason, code, ...metrics };
}
