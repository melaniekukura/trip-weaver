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

test.each([
  [{ ...fixture, labels: [] }, "no_labels"],
  [{ ...fixture, labels: ["unexpected format"] }, "no_parseable_labels"],
  [{ ...fixture, labels: fixture.labels.map(label => label.replaceAll("October 22", "October 24")) }, "no_matching_returns"],
  [{ ...fixture, selectedLabel: "unrecognized" }, "label_unrecognized"],
  [{ ...fixture, selectedLabel: fixture.selectedLabel.replace("Frontier", "American") }, "selection_mismatch"],
  [{ ...fixture, url: "not a URL" }, "url_mismatch"],
])("reports the reason a return response was rejected", async (value, reason) => {
  const { diagnoseFlightFailure } = await import("./flightDiagnostics");
  expect.assertions(1);
  try { parseReturnResults(value, request, outbound); }
  catch (error) { expect(diagnoseFlightFailure(error, "return_parse").reason).toBe(reason); }
});

test.each([401, 402, 429, 503])("browser HTTP %i retains status without provider text", async status => {
  const { vi } = await import("vitest");
  const { browseReturnFlights } = await import("./firecrawl");
  const { diagnoseFlightFailure } = await import("./flightDiagnostics");
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider-secret", { status })));
  try {
    await expect(browseReturnFlights("test")).rejects.toSatisfy((error: unknown) => {
      const detail = diagnoseFlightFailure(error, "browser_execute");
      return detail.stage === "browser_session" && detail.httpStatus === status && !JSON.stringify(error).includes("provider-secret");
    });
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});

test("generated browser script captures match counts and timeouts without raw errors", async () => {
  const { returnBrowserCode } = await import("./returnFlights");
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const execute = new AsyncFunction("page", "return " + returnBrowserCode(request, outbound));
  const page = { evaluate: async () => {}, goto: async () => {}, locator: () => ({ ariaSnapshot: async () => fixture.initial }),
    getByRole: () => ({ first: () => ({ waitFor: async () => {} }), evaluateAll: async () => [] }) };
  expect(JSON.parse(await execute(page))).toMatchObject({ browserFailure: true, stage: "outbound_match", reason: "outbound_missing", labelCount: 0, matchCount: 0 });
  page.goto = async () => { throw Object.assign(new Error("private browser URL"), { name: "TimeoutError" }); };
  expect(JSON.parse(await execute(page))).toEqual({ browserFailure: true, stage: "navigation", reason: "timeout" });
});


test("outbound matching tolerates airline list formatting but rejects different flight details", async () => {
  const { outboundLabelChecks } = await import("./returnFlights");
  const saved = { ...outbound, airline: "American, British AirwaysOperated by Envoy Air as American Eagle" };
  const label = fixture.selectedLabel.replace("Frontier", "American and British Airways");
  expect(Object.values(outboundLabelChecks(label, saved, request.departureDate)).every(Boolean)).toBe(true);
  expect(outboundLabelChecks(label.replace("British Airways", "Delta"), saved, request.departureDate).airline).toBe(false);
  expect(outboundLabelChecks(label.replace("6:30 AM", "7:30 AM"), saved, request.departureDate).departure).toBe(false);
  expect(outboundLabelChecks(label.replace("12:02 PM", "1:02 PM"), saved, request.departureDate).arrival).toBe(false);
  expect(outboundLabelChecks(label.replace("8 hr 32 min", "9 hr 32 min"), saved, request.departureDate).duration).toBe(false);
  expect(outboundLabelChecks(label.replace("1 stop", "2 stops"), saved, request.departureDate).stops).toBe(false);
  expect(outboundLabelChecks(label, saved, "2026-10-16").departure).toBe(false);
  expect(parseReturnResults({ ...fixture, selectedLabel: label }, request, saved).flights).toHaveLength(5);
});


test("browser script and server agree on formatted multi-airline selections", async () => {
  const { returnBrowserCode } = await import("./returnFlights");
  const label = fixture.selectedLabel.replace("Frontier", "American and British Airways");
  const saved = { ...outbound, airline: "American, British AirwaysOperated by Envoy Air" };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const execute = new AsyncFunction("page", "return " + returnBrowserCode(request, saved));
  let selected = false;
  const page = { evaluate: async () => {}, goto: async () => {}, url: () => fixture.url, locator: () => ({ ariaSnapshot: async () => fixture.initial }),
    getByRole: () => ({ first: () => ({ waitFor: async () => {} }), waitFor: async () => {},
      evaluateAll: async () => selected ? fixture.labels : [label], press: async () => { selected = true; } }) };
  const result = JSON.parse(await execute(page));
  expect(result.selectedLabel).toBe(label);
  expect(parseReturnResults(result, request, saved).flights).toHaveLength(5);
});

test("response decoder accepts result, encoded result, and explicit stdout; rejects invalid output", async () => {
  const { decodeReturnBrowserResult } = await import("./firecrawl");
  for (const response of [
    { result: JSON.stringify(fixture) },
    { result: JSON.stringify(JSON.stringify(fixture)) },
    { result: fixture },
    { stdout: JSON.stringify(fixture), result: "0" },
    { stdout: `TRIP_WEAVER_RETURN:${JSON.stringify(fixture)}\n`, result: null },
    { stdout: `unrelated log\nTRIP_WEAVER_RETURN:${JSON.stringify(fixture)}\n`, result: "undefined" },
  ]) expect(decodeReturnBrowserResult(response)).toEqual(fixture);
  expect(() => decodeReturnBrowserResult({ result: "provider-secret" })).toThrow("invalid_output");
  expect(() => decodeReturnBrowserResult({ result: null })).toThrow("missing_output");
});

test("Convex-style bundled code runs in a separate browser runtime without bundler helpers", async () => {
  const { build } = await import("esbuild");
  const { createRequire } = await import("node:module");
  const result = await build({ entryPoints: ["convex/returnFlights.ts"], bundle: true, write: false,
    format: "cjs", platform: "node", keepNames: true, packages: "external" });
  const module = { exports: {} as typeof import("./returnFlights") };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const code = module.exports.returnBrowserCode(request, outbound);
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const execute = new AsyncFunction("page", "console", code);
  const logs: string[] = [];
  let selected = false;
  const page = { evaluate: async () => {}, goto: async () => {}, url: () => fixture.url, locator: () => ({ ariaSnapshot: async () => fixture.initial }),
    getByRole: () => ({ first: () => ({ waitFor: async () => {} }), waitFor: async () => {},
      evaluateAll: async () => selected ? fixture.labels : [fixture.selectedLabel], press: async () => { selected = true; } }) };
  await execute(page, { log: (value: string) => logs.push(value) });
  const { decodeReturnBrowserResult } = await import("./firecrawl");
  expect(parseReturnResults(decodeReturnBrowserResult({ stdout: logs.join("\n") }), request, outbound).flights).toHaveLength(5);
});

test("city return searches verify the selected airports and accept the live Economy label", async () => {
  const { returnBrowserCode } = await import("./returnFlights");
  const cityRequest = { ...request, destination: "QLA", destinationType: "city" as const };
  const selected = { ...outbound, destinationAirport: "LAX", originAirport: "DTW" };
  const live = { ...fixture, initial: fixture.initial.replace("Economy (include Basic)", "Economy") };
  expect(parseReturnResults(live, cityRequest, selected).flights).toHaveLength(5);
  expect(() => parseReturnResults({ ...live, initial: live.initial.replace("Economy", "Business") }, cityRequest, selected)).toThrow();
  expect(() => parseReturnResults({ ...live, initial: live.initial.replace("Los Angeles LAX", "New York JFK") }, cityRequest, selected)).toThrow();
  const script = returnBrowserCode(cityRequest, selected);
  expect(script).toContain("to+LAX");
  expect(script).not.toContain("to+QLA");
});

test.each([true, false])("unreadable output gets one retrieval attempt in the same session (recoverable: %s)", async recoverable => {
  const { vi } = await import("vitest");
  const { browseReturnFlights } = await import("./firecrawl");
  let executions = 0;
  const calls: { url: string; method?: string; code?: string }[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    const code = options?.body ? JSON.parse(String(options.body)).code : undefined;
    calls.push({ url: String(url), method: options?.method, code });
    const response = options?.method === "DELETE" ? { success: true } : String(url).endsWith("/execute")
      ? { success: true, exitCode: 0, result: ++executions === 2 && recoverable ? JSON.stringify(fixture) : "0" }
      : { success: true, id: "one-session" };
    return new Response(JSON.stringify(response));
  });
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key"); vi.stubGlobal("fetch", fetchMock);
  try {
    if (recoverable) await expect(browseReturnFlights("original search")).resolves.toEqual(fixture);
    else await expect(browseReturnFlights("original search")).rejects.toThrow("invalid_output");
    expect(executions).toBe(2);
    expect(calls).toHaveLength(4);
    expect(calls[2].url).toContain("one-session/execute");
    expect(calls[2].code).toContain("page.evaluate(() => globalThis.__tripWeaverReturnOutput)");
    expect(calls[2].code).not.toContain("original search");
    expect(calls.at(-1)?.method).toBe("DELETE");
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});

test("return options recover from one loading timeout without relying on a heading or reopening search", async () => {
  const { returnBrowserCode } = await import("./returnFlights");
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  let selected = false;
  let navigations = 0;
  let returnWaits = 0;
  const page = {
    evaluate: async () => {}, goto: async () => { navigations++; }, url: () => fixture.url,
    locator: () => ({ ariaSnapshot: async () => fixture.initial }),
    getByRole: (role: string) => {
      expect(role).not.toBe("heading");
      return {
        first: () => ({ waitFor: async () => {
          if (selected && ++returnWaits === 1) throw Object.assign(new Error("loading"), { name: "TimeoutError" });
        } }),
        waitFor: async () => {}, press: async () => { selected = true; },
        evaluateAll: async () => selected ? [fixture.selectedLabel, ...fixture.labels] : [fixture.selectedLabel],
      };
    },
  };
  const raw = JSON.parse(await new AsyncFunction("page", "return " + returnBrowserCode(request, outbound))(page));
  expect(parseReturnResults(raw, request, outbound).flights).toHaveLength(5);
  expect(returnWaits).toBe(2);
  expect(navigations).toBe(1);
  expect(raw.labels).not.toContain(fixture.selectedLabel);
});
