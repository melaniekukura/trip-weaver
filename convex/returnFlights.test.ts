import { expect, test } from "vitest";
import fixture from "./fixtures/return-flights.json";
import { parseReturnResults } from "./returnFlights";
const request = { origin: "DTW", destination: "LAX", departureDate: "2026-10-15", tripType: "round-trip" as const, returnDate: "2026-10-22" };
const outbound = { airline: "Frontier", departure: "6:30 AM on Thu, Oct 15", arrival: "12:02 PM on Thu, Oct 15", duration: "8 hr 32 min", stops: "1 stop", amount: 273, currency: "USD" as const };

test("extracts matching returns with total round-trip prices and next-day arrivals", () => {
  const result = parseReturnResults(fixture, request, outbound);
  expect(result.flights).toHaveLength(5);
  expect(result.flights[0]).toMatchObject({ airline: "Frontier", amount: 273, departure: "10:38 PM on Thu, Oct 22", arrival: "2:08 PM on Fri, Oct 23" });
  expect(result.flights[1].amount).toBe(314);
  expect(result.sourceUrl).toContain("/travel/flights/search?tfs=");
});

test.each([
  { ...fixture, initial: fixture.initial.replaceAll("2026-10-22", "2026-10-23") },
  { ...fixture, selectedLabel: fixture.selectedLabel.replace("6:30 AM", "7:30 AM") },
  { ...fixture, selectedLabel: fixture.selectedLabel.replace("12:02 PM", "1:02 PM") },
  { ...fixture, labels: fixture.labels.map(label => label.replaceAll("October 22", "October 24")) },
  { ...fixture, labels: fixture.labels.map(label => label.replaceAll("Detroit Metropolitan Wayne County Airport", "Other Airport")) },
  { ...fixture, initial: fixture.initial.replaceAll("Currency USD", "Currency CAD") },
  { ...fixture, url: "https://example.com/travel/flights/search?tfs=test" },
  { ...fixture, labels: [] },
])("rejects mismatched selection, dates, routes, currency, and missing returns", (data) => {
  expect(() => parseReturnResults(data, request, outbound)).toThrow("FLIGHTS_UNAVAILABLE");
});

test("browser execution failure still closes the session and does not leak provider details", async () => {
  const { vi } = await import("vitest");
  const { browseReturnFlights } = await import("./firecrawl");
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, options) => new Response(JSON.stringify(
    options?.method === "DELETE" ? { success: true } : String(url).endsWith("/execute")
      ? { success: true, result: "provider-secret", stderr: "private diagnostics", exitCode: 1, killed: true }
      : { success: true, id: "test-session" },
  )));
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock);
  try {
    await expect(browseReturnFlights("test code")).rejects.toThrow("FLIGHTS_UNAVAILABLE");
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
