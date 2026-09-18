export function sourceHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
export function sameActivity(left: { title: string; venue?: string }, right: { title: string; venue?: string }) {
  const words = (value: string) => new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(word =>
    word.length > 2 && !/^(the|and|with|for|best|private|guided|guide|tour|tours|visit|ticket|tickets|admission|entrance|audioguide|experience|skip|line)$/.test(word)));
  const a = words(left.title); const b = words(right.title);
  const overlap = [...a].filter(word => b.has(word)).length;
  return left.title.toLowerCase() === right.title.toLowerCase() || (overlap >= 2 && overlap / Math.min(a.size, b.size) >= .8);
}
export function diversifyIdeas<T extends { title: string; url: string; venue?: string }>(groups: T[][], max = 5, perHost = 1, activities = true) {
  const results: T[] = [];
  for (let index = 0; index < Math.max(0, ...groups.map(group => group.length)); index++) {
    for (const group of groups) {
      const item = group[index];
      if (!item || results.length >= max || results.some(saved => saved.url === item.url || (activities && sameActivity(saved, item)))) continue;
      if (results.filter(saved => sourceHost(saved.url) === sourceHost(item.url)).length >= perHost) continue;
      results.push(item);
    }
  }
  return results;
}
