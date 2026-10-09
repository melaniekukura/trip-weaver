import { expect, test, vi } from "vitest";
import { parseInterestPage } from "./interestDetails";
import { discoverSpecificIdeas } from "./interestDiscovery";

const url = "https://example.org/museum";
test("individual results require source-supported names and excerpts; unsupported facts are omitted", () => {
  const raw = { pageType: "individual", relevant: true, name: "Design Museum", excerpt: "Explore the history of Italian design.", venue: "Milan", dates: "October 4, 2026", price: "€20" };
  const page = parseInterestPage(raw, "# Design Museum\nExplore the history of Italian design. Milan. Admission €20.", url, []);
  expect(page.items).toEqual([{ title: "Design Museum", description: raw.excerpt, url, venue: "Milan", price: "€20" }]);
  expect(parseInterestPage({ ...raw, excerpt: "Invented description" }, "Design Museum", url, []).items).toEqual([]);
  expect(parseInterestPage({ ...raw, relevant: false }, "Design Museum", url, []).items).toEqual([]);
});

test("collection pages only provide candidates whose names and links are present", () => {
  const raw = { pageType: "collection", relevant: true, candidates: [{ name: "Design Museum", url: "/museum" }, { name: "Invented Museum", url: "/invented" }, { name: "Design Museum", url: "https://fake.example/detail" }] };
  const page = parseInterestPage(raw, "Visit the Design Museum", "https://example.org/guide", ["/museum"]);
  expect(page.items).toEqual([]);
  expect(page.candidates).toEqual([{ title: "Design Museum", url }]);
});

test("listicles are discovery sources, not final cards, even if mislabeled", () => {
  expect(parseInterestPage({ pageType: "individual", relevant: true, name: "Top 10 places", excerpt: "Places to see" }, "Top 10 places. Places to see", url, []).items).toEqual([]);
});

test("discovery follows actual individual links, skips broken pages and bounds total visits", async () => {
  const visit = vi.fn(async (target: string) => {
    if (target.endsWith("guide")) return { items: [], candidates: ["broken", "museum", "event"].map(name => ({ title: name, url: `https://example.org/${name}` })) };
    if (target.endsWith("broken")) throw new Error("Blocked");
    return { items: [{ title: target.endsWith("museum") ? "Design Museum" : "Art exhibition", description: "Source excerpt", url: target }], candidates: [] };
  });
  const result = await discoverSpecificIdeas([{ title: "Top 10 places", url: "https://example.org/guide" }], visit);
  expect(result.items.map(item => item.title)).toEqual(["Design Museum", "Art exhibition"]);
  expect(result.failedPages).toBe(1); expect(visit).toHaveBeenCalledTimes(4);
});

test("a paraphrased extraction uses an actual page excerpt and preserves source date lines", () => {
  const markdown = "# Design Festival\n\n## Discover independent exhibitors, talks and workshops dedicated to creative publishing\n\nFrom 3 October 2026\n\nTo 4 October 2026";
  const page = parseInterestPage({ pageType: "individual", relevant: true, name: "Design Festival", excerpt: "A made-up paraphrase", dates: "3–4 October 2026" }, markdown, url, []);
  expect(page.items[0]).toMatchObject({ title: "Design Festival", description: "Discover independent exhibitors, talks and workshops dedicated to creative publishing", dates: "From 3 October 2026 · To 4 October 2026" });
});
