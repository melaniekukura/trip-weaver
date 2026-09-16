export function airlineNames(value: string): string[] {
  return [...new Set(value.split(/operated by/i)[0]
    .replace(/([a-z])([A-Z])/g, "$1,$2")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1,$2")
    .toLowerCase().split(/\s*(?:,|&|\band\b)\s*/)
    .map(name => name.replace(/\s+/g, " ").trim())
    .map(name => ({ "delta air lines": "delta", "united airlines": "united", "american airlines": "american" } as Record<string, string>)[name] ?? name).filter(Boolean))].sort();
}

export function rankReturnFlights<T extends { flight: { airline: string; amount: number } }>(options: T[], outgoing: string): T[] {
  const airlines = airlineNames(outgoing);
  const shared = (option: T) => airlineNames(option.flight.airline).some(name => airlines.includes(name));
  return [...options].sort((a, b) => Number(shared(b)) - Number(shared(a)) || a.flight.amount - b.flight.amount);
}
