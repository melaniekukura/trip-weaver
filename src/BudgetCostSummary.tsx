import { useBudgetCosts } from "./useBudgetCosts";
import { BudgetConversionStatus } from "./BudgetConversionStatus";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { formatCost } from "./budgetCosts";

export function BudgetCostSummary({ trip, fees, lodgings = [], breakdown = false }: {
  trip: Doc<"trips">; fees?: FeeResult[]; lodgings?: Doc<"lodgings">[]; breakdown?: boolean;
}) {
  const { costs, currency, native, error, retry, rateDate } = useBudgetCosts(trip, fees, lodgings);
  return <div className="budget-cost-summary" aria-live="polite">
    <p><strong>Total Cost:</strong> {costs ? formatCost(costs.totals[currency] ?? 0, currency) : error ? "--" : "Calculating…"} <span className="field-hint">{currency}</span></p>
    {breakdown && <dl className="budget-overview-breakdown" aria-label="Included costs">
      {native.breakdown.map(category => <div key={category.id}>
        <dt><span className="budget-legend-dot" style={{ background: category.color }} />{category.label}</dt>
        <dd>{costs ? formatCost(costs.breakdown.find(item => item.id === category.id)?.totals[currency] ?? 0, currency) : "--"}</dd>
      </div>)}
    </dl>}
    {fees === undefined ? <p className="field-hint">Loading extra fees…</p> : native.unknown > 0 &&
      <p className="field-hint">Partial total · {native.unknown} {native.unknown === 1 ? "price" : "prices"} not confirmed.</p>}
    <BudgetConversionStatus error={error} retry={retry} rateDate={rateDate || undefined} />
  </div>;
}
export function TripCardCost({ trip }: { trip: Doc<"trips"> }) {
  const fees = useQuery(api.extraFees.latest, { tripId: trip._id });
  const lodgings = useQuery(api.lodgings.list, { tripId: trip._id });
  return <BudgetCostSummary trip={trip} fees={fees?.results} lodgings={lodgings} />;
}
