import { useEffect, useState } from "react";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { budgetCosts, convertBudgetCosts } from "./budgetCosts";
import { cachedExchangeRates, loadExchangeRates } from "./exchangeRates";
import type { ExchangeRates } from "./exchangeRates";

export function useBudgetCosts(trip: Doc<"trips">, fees?: FeeResult[], lodgings: Doc<"lodgings">[] = []) {
  const currency = trip.currency || "USD";
  const native = budgetCosts(trip, fees, lodgings);
  const foreign = Object.keys(native.totals).filter(code => code !== currency).sort().join(",");
  const [rates, setRates] = useState<ExchangeRates | undefined>(() => cachedExchangeRates(currency));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!foreign) return;
    let cancelled = false;
    setFailed(false);
    void loadExchangeRates(currency).then(value => {
      if (!cancelled) { setRates(value); setFailed(foreign.split(",").some(code => !value.rates[code])); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [currency, foreign, attempt]);
  const costs = convertBudgetCosts(native, currency, rates);
  return { costs, currency, native, rateDate: foreign && rates?.base === currency ? rates.date : undefined,
    error: !costs && failed, retry: () => { setFailed(false); setAttempt(value => value + 1); } };
}
