import { afterEach, expect, test, vi } from "vitest";
import { parseExchangeRates } from "./exchangeRates";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
test("accepts only positive rates for the requested base and preserves the reference date", () => {
  const rows = [{ base: "USD", quote: "EUR", rate: 0.9, date: "2026-09-18" },
    { base: "USD", quote: "GBP", rate: 0.75, date: "2026-09-17" }, { base: "EUR", quote: "GBP", rate: 2, date: "2026-09-18" },
    { base: "USD", quote: "JPY", rate: -1, date: "2026-09-18" }];
  expect(parseExchangeRates(rows, "USD")).toEqual({ base: "USD", rates: { USD: 1, EUR: 0.9, GBP: 0.75 }, date: "2026-09-17" });
  expect(() => parseExchangeRates([], "USD")).toThrow();
});
test("shares concurrent requests across cards and tabs and caches successful rates", async () => {
  vi.resetModules();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ base: "CAD", quote: "EUR", rate: 0.65, date: "2026-09-18" }])));
  vi.stubGlobal("fetch", fetchMock);
  const { loadExchangeRates } = await import("./exchangeRates");
  const [first, second] = await Promise.all([loadExchangeRates("CAD"), loadExchangeRates("CAD")]);
  expect(first).toBe(second);
  await loadExchangeRates("CAD");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain("base=CAD&providers=ecb");
});
test("failed requests can be retried", async () => {
  vi.resetModules();
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(
    new Response(JSON.stringify([{ base: "GBP", quote: "EUR", rate: 1.2, date: "2026-09-18" }])));
  vi.stubGlobal("fetch", fetchMock);
  const { loadExchangeRates } = await import("./exchangeRates");
  await expect(loadExchangeRates("GBP")).rejects.toThrow();
  await expect(loadExchangeRates("GBP")).resolves.toMatchObject({ base: "GBP" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
