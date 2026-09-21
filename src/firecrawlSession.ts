const KEY = "trip-weaver-firecrawl-session";

export function getFirecrawlSessionId(): string | undefined {
  if (typeof window === "undefined" || !window.sessionStorage) return undefined;
  const existing = window.sessionStorage.getItem(KEY);
  if (existing) return existing;
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(KEY, id);
  return id;
}
