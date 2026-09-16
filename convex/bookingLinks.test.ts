/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { decodeBookingResult, parseBookingLink } from "./bookingLinks";
import { bookingBrowserCode } from "./returnFlights";
import fixture from "./fixtures/return-flights.json";
const modules = import.meta.glob("./**/*.ts");

test("booking links accept airline HTTPS URLs and reject unrelated or unsafe destinations", () => {
  const link = { url: "https://www.aa.com/goto/metasearch?ITEN=test", provider: "American", airlineHost: "aa.com", amount: 1218 };
  expect(parseBookingLink(link)).toEqual({ url: link.url, provider: "American", amount: 1218 });
  for (const url of ["https://aa.com.evil.example/book", "javascript:alert(1)", "https://user:password@aa.com/book", "http://aa.com/book", "https://www.google.com/travel/flights"]) {
    expect(() => parseBookingLink({ ...link, url })).toThrow();
  }
  expect(() => parseBookingLink({ failure: "direct_link_unavailable" })).toThrow("not available");
});

test.each([false, true])("booking script matches the itinerary and handles collapsed airline fares: %s", async (collapsed) => {
  const flight = { airline: "Frontier", departure: "6:30 AM on Thu, Oct 15", arrival: "12:02 PM on Thu, Oct 15", duration: "8 hr 32 min", stops: "1 stop", amount: 273, currency: "USD" as const };
  let expanded = !collapsed;
  let moreExpanded = !collapsed;
  let listener: (request: unknown) => void = () => {};
  const page = {
    goto: async () => {}, context: () => ({ on: (_event: string, callback: typeof listener) => { listener = callback; } }),
    getByText: () => ({ waitFor: async () => {} }),
    getByRole: (role: string, options: { name: unknown }) => ({
      count: async () => String(options.name).includes("more booking options") && !moreExpanded ? 1 : 0, first: () => ({ waitFor: async () => {} }), press: async () => {}, waitFor: async () => { expect(expanded).toBe(true); },
      evaluateAll: async () => String(options.name).includes("Select flight") ? [fixture.selectedLabel] : !moreExpanded ? [] : String(options.name).includes("View fare options") ? (collapsed ? ["View fare options on Frontier", "View fare options on Travel Agency"] : []) : role === "button" ? (expanded ? ["Continue to book with Frontier, Economy for 273 US dollars", "Continue to book with Travel Agency, Economy for 200 US dollars"] : []) : [fixture.selectedLabel],
      getAttribute: async () => "https://www.google.com/url?url=https%3A%2F%2Fwww.flyfrontier.com%2Fbaggage",
      click: async () => {
        if (String(options.name).includes("more booking options")) { moreExpanded = true; return; }
        if (options.name === "View fare options on Frontier") { expanded = true; return; }
        expect(options.name).toBe("Continue to book with Frontier, Economy for 273 US dollars");
        listener({ url: () => "https://booking.flyfrontier.com/Flight?itinerary=test", method: () => "GET", isNavigationRequest: () => true });
      },
    }),
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const result = JSON.parse(await new AsyncFunction("page", "return " + bookingBrowserCode("https://www.google.com/travel/flights", flight, "2026-10-15"))(page));
  expect(parseBookingLink(result).provider).toBe("Frontier");
  expect(result.url).toContain("itinerary=test");
});

test("booking resolver refuses anonymous, other-owner and incomplete round-trip requests before provider calls", async () => {
  const t = convexTest(schema, modules); rateLimiter.register(t);
  const owner = await t.run(ctx => ctx.db.insert("users", {}));
  const other = await t.run(ctx => ctx.db.insert("users", {}));
  const user = t.withIdentity({ subject: `${owner}|session` });
  const tripId = await user.mutation(api.trips.create, { name: "Trip", origin: "DTW", destinations: ["LAX"], startDate: "2026-10-15", endDate: "2026-10-22", budget: null, currency: "USD", travelers: 1, interests: [] });
  const outboundId = await t.run(async ctx => {
    const runId = await ctx.db.insert("researchRuns", { tripId, ownerId: owner, destination: "LAX", topic: "flights", status: "completed", tripUpdatedAt: 0, searchKey: "test", query: "test",
      flightRequest: { origin: "DTW", destination: "LAX", departureDate: "2026-10-15", returnDate: "2026-10-22", tripType: "round-trip" } });
    return ctx.db.insert("researchSources", { tripId, runId, title: "Delta", category: "flights", description: "", destination: "LAX", sourceUrl: "https://www.google.com/travel/flights", retrievedAt: "2026-09-12",
      flight: { airline: "Delta", departure: "8:00 AM", arrival: "10:00 AM", duration: "5 hr", stops: "Nonstop", amount: 129, currency: "USD" } });
  });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  try {
    for (const client of [t, t.withIdentity({ subject: `${other}|session` }), user]) {
      await expect(client.action(api.bookingLinks.resolve, { tripId, outboundId })).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    for (let index = 0; index < 6; index++) await user.mutation(internal.bookingLinks.reserve, { tripId });
    await expect(user.mutation(internal.bookingLinks.reserve, { tripId })).rejects.toThrow("Try again in 6 minute(s)");
  } finally { vi.unstubAllGlobals(); }
});

test("booking responses accept stdout and nested JSON, and preserve failed-step diagnostics", () => {
  const link = { url: "https://www.aa.com/book?flight=123", provider: "American", airlineHost: "aa.com", amount: 300 };
  expect(decodeBookingResult({ result: "0", stdout: "TRIP_WEAVER_BOOKING:" + JSON.stringify(link) })).toEqual(link);
  expect(decodeBookingResult({ result: JSON.stringify(JSON.stringify(link)) })).toEqual(link);
  expect(() => decodeBookingResult({ result: "0" })).toThrow("recognized");
  expect(() => decodeBookingResult({ result: JSON.stringify({ browserFailure: true, stage: "booking_options", reason: "timeout" }) })).toThrow("booking_options");
});

test("booking browser failures identify the step without exposing provider output", async () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const flight = { airline: "American", departure: "8:00 AM", arrival: "10:00 AM", duration: "2 hr", stops: "Nonstop", amount: 300, currency: "USD" as const };
  const timeout = new Error("private provider details"); timeout.name = "TimeoutError";
  const result = await new AsyncFunction("page", "return " + bookingBrowserCode("https://www.google.com/travel/flights", flight, "2026-10-15"))({ goto: async () => { throw timeout; } });
  expect(JSON.parse(result)).toEqual({ browserFailure: true, stage: "navigation", reason: "timeout" });
  expect(result).not.toContain("private");
});

test.each([
  ["Continue to book with Delta Air Lines, Main Cabin for 635 US dollars", "Delta Air Lines", 635],
  ["Continue to book with Air Europa for 1,235.50 US dollars.", "Air Europa", 1235.5],
])("reads booking labels with and without fare class: %s", async (label, provider, amount) => {
  const { parseBookingChoice } = await import("./returnFlights");
  expect(parseBookingChoice(label)).toMatchObject({ provider, amount });
  expect(parseBookingChoice("Continue to book with Delta for unknown US dollars")).toBeNull();
  expect(parseBookingChoice("Continue to book with Delta for 0 US dollars")).toBeNull();
});

test("booking reader accepts a Delta Air Lines link after matching a multi-carrier itinerary", async () => {
  const flight = { airline: "Delta, Air EuropaOperated by Air Europa Express", departure: "6:30 AM on Thu, Oct 15", arrival: "12:02 PM on Thu, Oct 15", duration: "8 hr 32 min", stops: "1 stop", amount: 635, currency: "USD" as const };
  const bookingLabel = "Continue to book with Delta Air Lines for 635 US dollars";
  let listener: (request: unknown) => void = () => {};
  const page = {
    goto: async () => {}, getByText: () => ({ waitFor: async () => {} }),
    context: () => ({ on: (_: string, callback: typeof listener) => { listener = callback; } }),
    getByRole: (role: string, options: { name: unknown }) => ({
      count: async () => 0, first: () => ({ waitFor: async () => {} }), press: async () => {},
      evaluateAll: async () => String(options.name).includes("Select flight") ? [fixture.selectedLabel.replace("Frontier", "Delta and Air Europa")]
        : String(options.name).includes("Continue to book") && role === "link" ? [bookingLabel] : [],
      getAttribute: async () => "https://www.delta.com/baggage",
      click: async () => {
        expect(role).toBe("link"); expect(options.name).toBe(bookingLabel);
        listener({ url: () => "https://www.delta.com/book?itinerary=test", method: () => "GET", isNavigationRequest: () => true });
      },
    }),
  };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const result = JSON.parse(await new AsyncFunction("page", "return " + bookingBrowserCode("https://www.google.com/travel/flights", flight, "2026-10-15"))(page));
  expect(parseBookingLink(result)).toMatchObject({ provider: "Delta Air Lines", amount: 635 });
});

test("booking reader reports agency-only options after a bounded wait without selecting them", async () => {
  const flight = { airline: "Frontier", departure: "6:30 AM on Thu, Oct 15", arrival: "12:02 PM on Thu, Oct 15", duration: "8 hr 32 min", stops: "1 stop", amount: 273, currency: "USD" as const };
  const label = "Continue to book with Travel Agency, Economy for 200 US dollars";
  const click = vi.fn();
  let waits = 0;
  const page = { goto: async () => {}, getByText: () => ({ waitFor: async () => {} }),
    getByRole: (role: string, options: { name: unknown }) => ({
      count: async () => 0, first: () => ({ waitFor: async () => {} }), press: async () => {}, click,
      evaluateAll: async () => String(options.name).includes("Select flight") ? [fixture.selectedLabel]
        : role === "button" && String(options.name).includes("Continue to book") ? [label] : [],
    }) };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const result = JSON.parse(await new AsyncFunction("page", "setTimeout", "return " + bookingBrowserCode("https://www.google.com/travel/flights", flight, "2026-10-15"))
    (page, (callback: () => void) => { waits++; callback(); }));
  expect(result).toMatchObject({ reason: "airline_option_unavailable", bookingProviderLabels: [label], parsedCount: 1, matchCount: 0 });
  expect(waits).toBe(4);
  expect(click).not.toHaveBeenCalled();
});

test("Google booking links require a selected itinerary and reject generic searches and unsafe URLs", async () => {
  const { parseGoogleBookingLink } = await import("./bookingLinks");
  const url = "https://www.google.com/travel/flights/booking?tfs=itinerary&tfu=selection";
  expect(parseGoogleBookingLink({ url })).toEqual({ url, outgoingSegments: [], returnSegments: [] });
  for (const bad of ["https://www.google.com/travel/flights/search?tfs=test", "https://www.google.com/travel/flights/booking?tfs=test",
    "https://www.google.com.evil.example/travel/flights/booking?tfs=x&tfu=y", "https://user@www.google.com/travel/flights/booking?tfs=x&tfu=y", "javascript:alert(1)"]) {
    expect(() => parseGoogleBookingLink({ url: bad })).toThrow();
  }
});

test.each([false, true])("Google booking handoff works without airline sellers and never visits an airline: round trip %s", async (roundTrip) => {
  const { parseGoogleBookingLink } = await import("./bookingLinks");
  const flight = { airline: "Frontier", departure: "6:30 AM on Thu, Oct 15", arrival: "12:02 PM on Thu, Oct 15", duration: "8 hr 32 min", stops: "1 stop", amount: 273, currency: "USD" as const };
  const label = roundTrip ? fixture.selectedLabel : fixture.selectedLabel.replace(" round trip total", "");
  const url = "https://www.google.com/travel/flights/booking?tfs=itinerary&tfu=selection";
  const goto = vi.fn(); const press = vi.fn();
  const page = { goto, url: () => url, getByText: () => ({ waitFor: async () => {} }),
    getByRole: (_role: string, options: { name: unknown }) => {
      expect(String(options.name)).not.toContain("Continue to book");
      return { first: () => ({ waitFor: async () => {} }), evaluateAll: async () => [label], press, count: async () => 0 };
    } };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const raw = JSON.parse(await new AsyncFunction("page", "return " + bookingBrowserCode("https://www.google.com/travel/flights/search?tfs=test", flight, "2026-10-15", roundTrip, { flight, date: "2026-10-15" }))(page));
  expect(parseGoogleBookingLink(raw).url).toBe(url);
  expect(goto).toHaveBeenCalledTimes(1);
  expect(press).toHaveBeenCalledTimes(1);
});

test("booking navigation retries one transient error but never retries HTTP rate limits", async () => {
  const flight = { airline: "Frontier", departure: "6:30 AM on Thu, Oct 15", arrival: "12:02 PM on Thu, Oct 15", duration: "8 hr 32 min", stops: "1 stop", amount: 273, currency: "USD" as const };
  const code = bookingBrowserCode("https://www.google.com/travel/flights", flight, "2026-10-15", true, { flight, date: "2026-10-15" });
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const goto = vi.fn().mockRejectedValueOnce(new Error("net::ERR_CONNECTION_RESET at private-url")).mockResolvedValue({ status: () => 429 });
  const result = JSON.parse(await new AsyncFunction("page", "return " + code)({ goto }));
  expect(goto).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({ stage: "navigation", reason: "http_error", httpStatus: 429 });
  goto.mockReset().mockRejectedValue(new Error("net::ERR_CONNECTION_RESET at private-url"));
  const failed = JSON.parse(await new AsyncFunction("page", "return " + code)({ goto }));
  expect(goto).toHaveBeenCalledTimes(2);
  expect(failed).toMatchObject({ reason: "network_error", networkCode: "ERR_CONNECTION_RESET" });
  expect(JSON.stringify(failed)).not.toContain("private-url");
});

test("bundled booking scripts preserve flight numbers in the isolated browser runtime", async () => {
  const { build } = await import("esbuild");
  const { createRequire } = await import("node:module");
  const { readFile } = await import("node:fs/promises");
  const snapshot = await readFile("convex/fixtures/google-booking-segments.txt", "utf8");
  const built = await build({ entryPoints: ["convex/returnFlights.ts"], bundle: true, write: false, format: "cjs", platform: "node", keepNames: true, packages: "external" });
  const module = { exports: {} as typeof import("./returnFlights") };
  new Function("require", "module", "exports", built.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const flight = { airline: "Frontier", departure: "6:30 AM on Thu, Oct 15", arrival: "12:02 PM on Thu, Oct 15", duration: "8 hr 32 min", stops: "1 stop", amount: 273, currency: "USD" as const };
  const outbound = { ...flight, stops: "2 stops", originAirport: "DTW", destinationAirport: "MXP" };
  const page = { goto: async () => {}, url: () => "https://www.google.com/travel/flights/booking?tfs=x&tfu=y", getByText: () => ({ waitFor: async () => {} }),
    getByRole: () => ({ first: () => ({ waitFor: async () => {} }), evaluateAll: async () => [fixture.selectedLabel], press: async () => {},
      count: async () => 1, getAttribute: async () => "true", locator: () => ({ ariaSnapshot: async () => snapshot }) }) };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const code = module.exports.bookingBrowserCode("https://www.google.com/travel/flights", flight, "2026-10-15", true, { flight: outbound, date: "2026-09-25" });
  const result = JSON.parse(await new AsyncFunction("page", "return " + code)(page));
  expect(result.outgoingSegments.map((segment: { flightNumber: string }) => segment.flightNumber)).toEqual(["DL 1316", "UX 92", "UX 1063"]);
});

test.each(["success", "missing", "failure"])("booking output recovery reads the same session once: %s", async outcome => {
  const { executeReturnBrowser } = await import("./firecrawl");
  const value = { url: "https://www.google.com/travel/flights/booking?tfs=x&tfu=y", provider: "Google Flights" };
  const browserFailure = { browserFailure: true, stage: "booking_match", reason: "selection_unavailable" };
  const calls: { url: string; code?: string; method?: string }[] = [];
  let executions = 0;
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
    calls.push({ url, code: options.body ? JSON.parse(String(options.body)).code : undefined, method: options.method });
    const body = options.method === "DELETE" ? { success: true } : url.endsWith("/execute")
      ? { success: true, exitCode: 0, result: ++executions === 1 ? (outcome === "failure" ? JSON.stringify(browserFailure) : "0")
        : outcome === "success" ? JSON.stringify(value) : "0" }
      : { success: true, id: "booking-session" };
    return new Response(JSON.stringify(body));
  }));
  try {
    const response = executeReturnBrowser("original booking search", { decode: decodeBookingResult,
      code: "await page.evaluate(() => globalThis.__tripWeaverBookingOutput)" });
    if (outcome === "success") expect(decodeBookingResult(await response)).toEqual(value);
    else await expect(response).rejects.toThrow(outcome === "missing" ? "invalid_output" : "selection_unavailable");
    expect(executions).toBe(outcome === "failure" ? 1 : 2);
    expect(calls.filter(call => call.code === "original booking search")).toHaveLength(1);
    if (outcome !== "failure") expect(calls[2]).toMatchObject({ url: "https://api.firecrawl.dev/v2/interact/booking-session/execute", code: "await page.evaluate(() => globalThis.__tripWeaverBookingOutput)" });
    expect(calls.at(-1)?.method).toBe("DELETE");
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
