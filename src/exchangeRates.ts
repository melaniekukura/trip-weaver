export type ExchangeRates = { base: string; rates: Record<string, number>; date: string };
const cache = new Map<string, { expires: number; value: ExchangeRates }>();
const requests = new Map<string, Promise<ExchangeRates>>();
export function parseExchangeRates(data: unknown, base: string): ExchangeRates {
  if (!Array.isArray(data) || !data.length) throw new Error("Exchange rates are unavailable.");
  const rates: Record<string, number> = { [base]: 1 };
  const dates: string[] = [];
  for (const row of data) {
    if (!row || row.base !== base || typeof row.quote !== "string" || !/^[A-Z]{3}$/.test(row.quote) ||
      typeof row.rate !== "number" || !Number.isFinite(row.rate) || row.rate <= 0 || typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date))) continue;
    rates[row.quote] = row.rate;
    dates.push(row.date);
  }
  if (!dates.length) throw new Error("Exchange rates are unavailable.");
  return { base, rates, date: dates.sort()[0] };
}
export function cachedExchangeRates(base: string) {
  const saved = cache.get(base);
  return saved && saved.expires > Date.now() ? saved.value : undefined;
}
export function loadExchangeRates(base: string): Promise<ExchangeRates> {
  const saved = cachedExchangeRates(base);
  if (saved) return Promise.resolve(saved);
  const pending = requests.get(base);
  if (pending) return pending;
  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}&providers=ecb`, {
        signal: controller.signal, credentials: "omit",
      });
      if (!response.ok) throw new Error("Exchange rates are unavailable.");
      const value = parseExchangeRates(await response.json(), base);
      cache.set(base, { value, expires: Date.now() + 3600000 });
      return value;
    } finally { clearTimeout(timer); requests.delete(base); }
  })();
  requests.set(base, promise);
  return promise;
}
