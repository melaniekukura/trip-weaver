/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const search = makeFunctionReference<"action">("firecrawl:search");
const scrape = makeFunctionReference<"action">("firecrawl:scrape");
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("FIRECRAWL_API_KEY", "test-secret");
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

test("search sends the server key and preserves sources and content", async () => {
  respond({ success: true, data: { web: [{ url: "https://example.com/travel", title: "Travel", markdown: "Read me" }] } });
  const result = await convexTest(schema, modules).action(search, { query: "  Kyoto sights  ", includeContent: true });
  expect(result.results[0]).toMatchObject({ url: "https://example.com/travel", markdown: "Read me", truncated: false });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.firecrawl.dev/v2/search");
  expect(options?.headers).toMatchObject({ Authorization: "Bearer test-secret" });
  expect(JSON.parse(options?.body as string)).toMatchObject({ query: "Kyoto sights", limit: 5, scrapeOptions: { formats: ["markdown"] } });
});

test("empty search is valid and scraping is opt-in", async () => {
  respond({ success: true, data: { web: [] }, warning: "No results" });
  const result = await convexTest(schema, modules).action(search, { query: "obscure destination" });
  expect(result.results).toEqual([]);
  expect(result.warning).toBe("No results");
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).not.toHaveProperty("scrapeOptions");
});

test.each([{ query: " " }, { query: "x".repeat(501) }, { query: "trip", limit: 6 }, { query: "trip", limit: 1.5 }])("rejects invalid search before spending credits: %j", async (args) => {
  await expect(convexTest(schema, modules).action(search, args)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("missing key fails without a network request", async () => {
  vi.stubEnv("FIRECRAWL_API_KEY", "");
  await expect(convexTest(schema, modules).action(search, { query: "Kyoto" })).rejects.toThrow("FIRECRAWL_NOT_CONFIGURED");
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([[401, "UNAUTHORIZED"], [402, "CREDITS_EXHAUSTED"], [429, "RATE_LIMITED"], [500, "REQUEST_FAILED"]])("handles HTTP %s without leaking provider errors", async (status, code) => {
  respond({ error: "test-secret" }, status as number);
  await expect(convexTest(schema, modules).action(search, { query: "Kyoto" })).rejects.toThrow(`FIRECRAWL_${code}`);
});

test.each([{ success: false }, { success: true, data: {} }, { success: true, data: { web: [{ url: "javascript:alert(1)" }] } }])("rejects malformed or failed responses: %j", async (body) => {
  respond(body);
  await expect(convexTest(schema, modules).action(search, { query: "Kyoto" })).rejects.toThrow();
});

test("scrape returns metadata and bounded markdown", async () => {
  respond({ success: true, data: { markdown: "a".repeat(31000), metadata: { title: "Guide", statusCode: 200 } } });
  const result = await convexTest(schema, modules).action(scrape, { url: "https://example.com/guide" });
  expect(result.page).toMatchObject({ url: "https://example.com/guide", title: "Guide", truncated: true });
  expect(result.page.markdown).toHaveLength(30000);
});

test.each(["file:///etc/passwd", "https://user:password@example.com", "invalid"])("rejects invalid scrape URL %s", async (url) => {
  await expect(convexTest(schema, modules).action(scrape, { url })).rejects.toThrow("INVALID_URL");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects a failed target page even when the API returns success", async () => {
  respond({ success: true, data: { markdown: "Not found", metadata: { statusCode: 404 } } });
  await expect(convexTest(schema, modules).action(scrape, { url: "https://example.com" })).rejects.toThrow("FIRECRAWL_PAGE_FAILED");
});

test("network errors are sanitized", async () => {
  fetchMock.mockRejectedValue(new Error("test-secret"));
  await expect(convexTest(schema, modules).action(search, { query: "Kyoto" })).rejects.toThrow("FIRECRAWL_UNAVAILABLE");
});
