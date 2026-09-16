import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";

export const diagnosticStages = {
  booking_list: "Load flights for booking", booking_match: "Match selected itinerary", booking_options: "Load booking options", booking_policy: "Verify airline website", booking_handoff: "Retrieve airline booking link",
  outbound_lookup: "Load selected outgoing flight", airport_lookup: "Resolve airports", outbound_scrape: "Read outgoing flights",
  outbound_parse: "Verify outgoing fares", browser_session: "Start flight-search browser", browser_execute: "Run flight-search browser",
  navigation: "Open Google Flights", outbound_list: "Load outgoing options", page_dates: "Check search dates",
  outbound_match: "Match selected outgoing flight", outbound_select: "Select outgoing flight",
  return_list: "Load return options", browser_result: "Read browser response", return_context: "Verify search settings",
  selected_outbound: "Verify outgoing selection", return_parse: "Verify return options", save_results: "Save flight results", worker: "Run background search",
} as const;
export const diagnosticReasons = {
  script_error: "The booking browser script encountered an error.", browser_closed: "The search browser closed unexpectedly.",
  selection_unavailable: "The selected itinerary could not be uniquely matched.", airline_option_unavailable: "No direct booking option from the selected airlines was available.", direct_link_unavailable: "The airline did not provide a reusable direct booking link.",
  missing_output: "The browser returned no readable search output.", invalid_output: "The browser output was not a recognized search response.",
  search_page_not_ready: "The provider returned a landing or loading page instead of flight search results.",
  no_outgoing_fares: "No outgoing fares passed the date, airport, and price checks.",
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
  itinerarySegments: v.optional(v.array(v.object({ flightNumber: v.string(), origin: v.string(), destination: v.string(), departure: v.string(), arrival: v.string() }))),
  bookingProviderLabels: v.optional(v.array(v.string())),
  selectedAirline: v.optional(v.string()),
  airlineCandidates: v.optional(v.array(v.object({ airline: v.string(), otherDetailsMatch: v.boolean() }))),
  networkCode: v.optional(v.string()),
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
  const comparison: Pick<FlightDiagnostic, "selectedAirline" | "airlineCandidates" | "bookingProviderLabels" | "itinerarySegments"> = {};
  const cleanAirline = (name: unknown) => typeof name === "string" && name.length > 0 && name.length <= 200 &&
    !/[\x00-\x1f<>]|https?:|www\./i.test(name) ? name : undefined;
  if (Array.isArray(value.bookingProviderLabels)) comparison.bookingProviderLabels = value.bookingProviderLabels.slice(0, 20)
    .flatMap(label => { const clean = cleanAirline(label); return clean ? [clean] : []; });
  if (Array.isArray(value.itinerarySegments) && value.itinerarySegments.length <= 6) {
    const valid = value.itinerarySegments.every(segment => segment && typeof segment === "object" &&
      /^[A-Z0-9]{2} \d{1,4}$/.test(segment.flightNumber) && /^[A-Z]{3}$/.test(segment.origin) && /^[A-Z]{3}$/.test(segment.destination) &&
      [segment.departure, segment.arrival].every(time => typeof time === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)));
    if (valid) comparison.itinerarySegments = value.itinerarySegments.map(({ flightNumber, origin, destination, departure, arrival }) =>
      ({ flightNumber, origin, destination, departure, arrival }));
  }
  const selectedAirline = cleanAirline(value.selectedAirline);
  if (selectedAirline) comparison.selectedAirline = selectedAirline;
  if (Array.isArray(value.airlineCandidates)) comparison.airlineCandidates = value.airlineCandidates.slice(0, 20).flatMap(candidate => {
    if (!candidate || typeof candidate !== "object") return [];
    const airline = cleanAirline(candidate.airline);
    return airline && typeof candidate.otherDetailsMatch === "boolean" ? [{ airline, otherDetailsMatch: candidate.otherDetailsMatch }] : [];
  });
  return { stage, reason, code, ...metrics, ...comparison,
    ...(typeof value.networkCode === "string" && /^ERR_[A-Z_]{1,60}$/.test(value.networkCode) ? { networkCode: value.networkCode } : {}) };
}
