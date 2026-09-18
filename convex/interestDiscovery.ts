import type { Infer } from "convex/values";
import type { detailPage, detailItem } from "./interestDetails";
import { collectionTitle } from "./interestDetails";
import { sameActivity, sourceHost } from "./interestDiversity";
import { safeDiscoveryUrl } from "./interestSearch";

export async function discoverSpecificIdeas(seeds: { url: string; title: string }[], visit: (url: string) => Promise<Infer<typeof detailPage>>, options: { maxVisits?: number; activities?: boolean; deadline?: number; maxDepth?: number; maxItems?: number; perHost?: number } = {}) {
  const seenHosts = new Map<string, number>();
  const perHost = options.perHost ?? 1;
  const maxItems = options.maxItems ?? 3;
  const diverseSeeds = [...seeds].sort((a, b) => Number(collectionTitle(a.title)) - Number(collectionTitle(b.title))).filter(seed => {
    const host = sourceHost(seed.url);
    if ((seenHosts.get(host) ?? 0) >= perHost) return false;
    seenHosts.set(host, (seenHosts.get(host) ?? 0) + 1); return true;
  });
  const queue = diverseSeeds.slice(0, options.maxVisits ?? 4).map(seed => ({ url: seed.url, depth: 0 }));
  const visited = new Set<string>();
  const items: Infer<typeof detailItem>[] = [];
  let failedPages = 0;
  while (queue.length && Date.now() < (options.deadline ?? Infinity) && visited.size < (options.maxVisits ?? 4) && items.length < maxItems) {
    const next = queue.shift()!;
    const url = safeDiscoveryUrl(next.url);
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const page = await visit(url);
      for (const item of page.items) if (!items.some(existing => existing.url === item.url ||
        (options.activities && sameActivity(existing, item))) && (!options.activities || items.filter(existing => sourceHost(existing.url) === sourceHost(item.url)).length < perHost)) items.push(item);
      if (next.depth < (options.maxDepth ?? 1)) {
        const candidates = page.candidates.slice(0, 6).map(item => ({ url: item.url, depth: next.depth + 1 }));
        if (candidates.length) queue.unshift(candidates[0]);
        queue.push(...candidates.slice(1));
      }
    } catch { failedPages++; }
  }
  return { items: items.slice(0, maxItems), failedPages };
}
