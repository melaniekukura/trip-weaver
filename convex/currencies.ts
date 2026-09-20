export const supportedCurrencies = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"] as const;

export function isSupportedCurrency(value: string): value is typeof supportedCurrencies[number] {
  return supportedCurrencies.some(currency => currency === value);
}
