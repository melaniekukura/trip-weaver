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
  let listener: (request: unknown) => void = () => {};
  const page = {
    goto: async () => {}, context: () => ({ on: (_event: string, callback: typeof listener) => { listener = callback; } }),
    getByText: () => ({ waitFor: async () => {} }),
    getByRole: (role: string, options: { name: unknown }) => ({
      first: () => ({ waitFor: async () => {} }), press: async () => {}, waitFor: async () => { expect(expanded).toBe(true); },
      evaluateAll: async () => String(options.name).includes("View fare options") ? (collapsed ? ["View fare options on Frontier", "View fare options on Travel Agency"] : []) : role === "button" ? (expanded ? ["Continue to book with Frontier, Economy for 273 US dollars", "Continue to book with Travel Agency, Economy for 200 US dollars"] : []) : [fixture.selectedLabel],
      getAttribute: async () => "https://www.google.com/url?url=https%3A%2F%2Fwww.flyfrontier.com%2Fbaggage",
      click: async () => {
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
    for (let index = 0; index < 3; index++) await user.mutation(internal.bookingLinks.reserve, { tripId });
    await expect(user.mutation(internal.bookingLinks.reserve, { tripId })).rejects.toThrow("Too many");
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
