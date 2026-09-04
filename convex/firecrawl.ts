import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";

const pageValidator = v.object({
  url: v.string(),
  title: v.string(),
  description: v.string(),
  markdown: v.union(v.string(), v.null()),
  truncated: v.boolean(),
});

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("FIRECRAWL_INVALID_RESPONSE", "Firecrawl returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function webUrl(value: unknown): string {
  try {
    const url = new URL(text(value));
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
      return url.href;
    }
  } catch { /* Invalid URLs are rejected below. */ }
  return fail("INVALID_URL", "Provide an HTTP or HTTPS URL without credentials.");
}

function page(value: unknown, fallbackUrl?: string) {
  const data = object(value);
  const metadata = data.metadata == null ? {} : object(data.metadata);
  const markdown = typeof data.markdown === "string" ? data.markdown : null;
  if (metadata.error || (typeof metadata.statusCode === "number" && metadata.statusCode >= 400)) {
    fail("FIRECRAWL_PAGE_FAILED", "Firecrawl could not read the requested page.");
  }
  return {
    url: webUrl(data.url ?? metadata.url ?? metadata.sourceURL ?? fallbackUrl),
    title: text(data.title, text(metadata.title)).slice(0, 1000),
    description: text(data.description, text(metadata.description)).slice(0, 4000),
    markdown: markdown === null ? null : markdown.slice(0, 30000),
    truncated: markdown !== null && markdown.length > 30000,
  };
}

async function request(endpoint: "search" | "scrape", body: Record<string, unknown>) {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) {
    fail("FIRECRAWL_NOT_CONFIGURED", "Set FIRECRAWL_API_KEY in the Convex deployment environment.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`https://api.firecrawl.dev/v2/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errors: Record<number, [string, string]> = {
        401: ["FIRECRAWL_UNAUTHORIZED", "Check the Firecrawl API key in Convex."],
        402: ["FIRECRAWL_CREDITS_EXHAUSTED", "The Firecrawl account has insufficient credits."],
        429: ["FIRECRAWL_RATE_LIMITED", "Firecrawl is rate limited. Try again later."],
        408: ["FIRECRAWL_TIMEOUT", "Firecrawl timed out. Try again later."],
      };
      const [code, message] = errors[response.status] ?? ["FIRECRAWL_REQUEST_FAILED", "Firecrawl could not complete the request."];
      fail(code, message);
    }
    const result = object(await response.json());
    if (result.success !== true) {
      fail("FIRECRAWL_REQUEST_FAILED", "Firecrawl could not complete the request.");
    }
    return result;
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    if (controller.signal.aborted) fail("FIRECRAWL_TIMEOUT", "Firecrawl timed out. Try again later.");
    if (error instanceof SyntaxError) fail("FIRECRAWL_INVALID_RESPONSE", "Firecrawl returned an invalid response.");
    return fail("FIRECRAWL_UNAVAILABLE", "Unable to reach Firecrawl. Try again later.");
  } finally {
    clearTimeout(timer);
  }
}

export const search = internalAction({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    includeContent: v.optional(v.boolean()),
  },
  returns: v.object({
    dataSource: v.literal("firecrawl"),
    retrievedAt: v.string(),
    results: v.array(pageValidator),
    warning: v.union(v.string(), v.null()),
  }),
  handler: async (_ctx, args) => {
    const query = args.query.trim();
    const limit = args.limit ?? 5;
    if (!query || query.length > 500) fail("INVALID_QUERY", "Search queries must contain 1–500 characters.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) fail("INVALID_LIMIT", "Search limits must be integers from 1 to 5.");
    const result = await request("search", {
      query, limit, sources: [{ type: "web" }], timeout: 30000,
      ...(args.includeContent ? { scrapeOptions: { formats: ["markdown"], onlyMainContent: true } } : {}),
    });
    const data = object(result.data);
    if (!Array.isArray(data.web)) fail("FIRECRAWL_INVALID_RESPONSE", "Firecrawl returned invalid search results.");
    return {
      dataSource: "firecrawl" as const,
      retrievedAt: new Date().toISOString(),
      results: data.web.slice(0, limit).map((item) => page(item)),
      warning: typeof result.warning === "string" ? result.warning.slice(0, 2000) : null,
    };
  },
});

export const scrape = internalAction({
  args: { url: v.string() },
  returns: v.object({
    dataSource: v.literal("firecrawl"),
    retrievedAt: v.string(),
    page: pageValidator,
  }),
  handler: async (_ctx, args) => {
    const url = webUrl(args.url.trim());
    const result = await request("scrape", {
      url, formats: ["markdown"], onlyMainContent: true, timeout: 30000,
    });
    const content = page(result.data, url);
    if (content.markdown === null) fail("FIRECRAWL_INVALID_RESPONSE", "Firecrawl returned no page content.");
    return { dataSource: "firecrawl" as const, retrievedAt: new Date().toISOString(), page: content };
  },
});
