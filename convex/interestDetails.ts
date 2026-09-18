import { activityAccessibilityEvidence, activityAccessibilityExtraction, parseActivityAccessibility } from "./activityAccessibility";
import type { Infer } from "convex/values";
import { v } from "convex/values";
import { safeDiscoveryUrl, discoveryPreview } from "./interestSearch";

export const detailItem = v.object({ accessibilityEvidence: v.optional(v.array(activityAccessibilityEvidence)), title: v.string(), description: v.string(), url: v.string(),
  venue: v.optional(v.string()), dates: v.optional(v.string()), price: v.optional(v.string()) });
export const detailPage = v.object({ rejection: v.optional(v.string()), items: v.array(detailItem), candidates: v.array(v.object({ title: v.string(), url: v.string() })) });
const nullableText = { type: ["string", "null"] };
export const interestExtractionSchema = {
  type: "object", required: ["pageType", "relevant", "name", "excerpt", "venue", "dates", "price", "candidates", "accessibility"],
  properties: {
    accessibility: activityAccessibilityExtraction,
    pageType: { type: "string", enum: ["individual", "collection", "unrelated"] }, relevant: { type: "boolean" },
    name: nullableText, excerpt: nullableText, venue: nullableText, dates: nullableText, price: nullableText,
    candidates: { type: "array", maxItems: 6, items: { type: "object", required: ["name", "url"],
      properties: { name: { type: "string" }, url: { type: "string" } }, additionalProperties: false } },
  }, additionalProperties: false,
};
const normalized = (value: string) => value.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}€£$¥]+/gu, " ").trim();
export function collectionTitle(title: string) {
  return /\b(?:top\s+\d+|\d+\s+best|best\s+(?:things|places|attractions)|things to do|all events|what['’]?s on|travel guide|event calendar)\b/i.test(title);
}
export function parseInterestPage(raw: unknown, markdown: string, sourceUrl: string, links: string[], requirements: string[] = []) {
  const empty: Infer<typeof detailPage> = { items: [], candidates: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const data = raw as Record<string, unknown>;
  const source = safeDiscoveryUrl(sourceUrl);
  if (!source || !markdown.trim() || data.relevant !== true) return { ...empty, rejection: "unrelated_or_unreadable" };
  const content = normalized(markdown);
  const supported = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max &&
    normalized(value).length > 1 && (` ${content} `).includes(` ${normalized(value)} `) ? discoveryPreview(value) : undefined;
  if (data.pageType === "individual") {
    const title = supported(data.name, 200);
    const excerpt = markdown.split(/\n\s*\n/).slice(0, 15).find(block => {
      const text = discoveryPreview(block);
      return text.length >= 60 && /[a-z]/i.test(text) && !/^\s*!?\[|cookie|privacy policy|copyright|all rights reserved/i.test(block);
    });
    const description = supported(data.excerpt, 420) ?? (excerpt ? discoveryPreview(excerpt) : undefined);
    const dateLines = markdown.split("\n").map(line => line.trim()).filter(line =>
      /^(?:From|To|Date|Dates|When)\b/i.test(line) && /\b20\d{2}\b/.test(line) && line.length <= 100).slice(0, 2);
    const dates = supported(data.dates, 200) ?? (dateLines.length ? dateLines.join(" · ") : undefined);
    if (!title || !description) empty.rejection = !title ? "unsupported_name" : "unsupported_excerpt";
    if (title && description && !collectionTitle(title)) empty.items.push({ title, description, url: source,
      ...(requirements.length ? { accessibilityEvidence: parseActivityAccessibility(data.accessibility, markdown, source, requirements) } : {}),
      ...(supported(data.venue, 200) ? { venue: supported(data.venue, 200) } : {}),
      ...(dates ? { dates } : {}),
      ...(supported(data.price, 120) ? { price: supported(data.price, 120) } : {}) });
  }
  if (data.pageType === "collection" && Array.isArray(data.candidates)) {
    const allowed = new Set(links.map(link => { try { return safeDiscoveryUrl(new URL(link, source).href); } catch { return null; } }));
    for (const candidate of data.candidates.slice(0, 6)) {
      if (!candidate || typeof candidate !== "object") continue;
      const title = supported(candidate.name, 200);
      let url: string | null = null;
      try { url = safeDiscoveryUrl(new URL(candidate.url, source).href); } catch { /* Ignore malformed links. */ }
      if (title && url && url !== source && allowed.has(url) && !collectionTitle(title) && !empty.candidates.some(item => item.url === url)) empty.candidates.push({ title, url });
    }
  }
  if (!empty.items.length && !empty.candidates.length) empty.rejection ??= "no_specific_details";
  return empty;
}
