import { useBudgetCosts } from "./useBudgetCosts";
import { BudgetConversionStatus } from "./BudgetConversionStatus";
import { useId, useState } from "react";
import type { Doc } from "../convex/_generated/dataModel";
import type { FeeResult } from "../convex/extraFeeResearch";
import { budgetCosts, costCategories, dailyCosts, formatCost } from "./budgetCosts";

export function BudgetGraphs({ trip, fees }: { trip: Doc<"trips">; fees?: FeeResult[] }) {
  const { costs, currency, error, retry, rateDate } = useBudgetCosts(trip, fees);
  return <div className="budget-graphs">
    <div className="budget-graphs-toolbar"><strong>Total Cost: {costs ? formatCost(costs.totals[currency] ?? 0, currency) : error ? "--" : "Calculating…"}</strong></div>
    <BudgetConversionStatus error={error} retry={retry} rateDate={rateDate || undefined} />
    {costs ? <BudgetCurrencyGraphs trip={trip} costs={costs} currency={currency} feesLoading={fees === undefined} />
      : !error && <p role="status">Converting all costs to {currency}…</p>}
  </div>;
}

function BudgetCurrencyGraphs({ trip, costs, currency, feesLoading }: {
  trip: Doc<"trips">; costs: ReturnType<typeof budgetCosts>; currency: string; feesLoading: boolean;
}) {
  const chartId = useId();
  const [category, setCategory] = useState("all");
  const [focusedDate, setFocusedDate] = useState("");
  const entries = costs.entries.filter(entry => entry.currency === currency);
  const total = Math.round((costs.totals[currency] ?? 0) * 100);
  const categories = costs.breakdown.map(item => ({ ...item, cents: Math.round((item.totals[currency] ?? 0) * 100) }));
  let offset = 0;
  const gradient = categories.filter(item => item.cents > 0).map(item => {
    const start = offset; offset += item.cents / total * 100;
    return `${item.color} ${start}% ${offset}%`;
  }).join(", ");
  const filtered = entries.filter(entry => category === "all" || entry.category === category);
  const daily = dailyCosts(trip.startDate, trip.endDate, filtered);
  const max = Math.max(1, ...daily?.days.map(day => day.cents) ?? []);
  const dailyTotal = daily?.days.reduce((sum, day) => sum + day.cents, 0) ?? 0;
  const selectedDay = daily?.days.find(day => day.date === focusedDate);
  const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const money = (cents: number) => formatCost(cents / 100, currency);

  return <section className="budget-graphs" aria-label={`${currency} budget graphs`}>
    <div className="budget-graphs-toolbar"><h4>{currency}</h4><span className="budget-report-period">{dateLabel(trip.startDate)} – {dateLabel(trip.endDate)}</span></div>
    <div className="budget-metrics">
      <article><span>Priced costs · {currency}</span><strong>{money(total)}</strong></article>
      <article><span>Daily average{category !== "all" ? " · selected category" : ""}</span><strong>{daily ? money(Math.round(dailyTotal / daily.days.length)) : "--"}</strong></article>
      <article><span>Prices to confirm</span><strong>{feesLoading ? "--" : costs.unknown}</strong></article>
    </div>
    {(costs.unknown > 0 || feesLoading) && <p role="status" className="field-hint">{feesLoading ? "Loading extra fees…" : "Charts show priced items only. Unconfirmed fees are not counted as free."}</p>}
    <div className="budget-chart-grid">
      <section className="budget-chart-card" aria-labelledby={`${chartId}-category`}>
        <header><h4 id={`${chartId}-category`}>Cost by category</h4><span>{currency}</span></header>
        <div className="budget-pie-layout">
          <div className="budget-donut" role="img" aria-label={total > 0 ? `Cost breakdown: ${categories.filter(item => item.cents).map(item => `${item.label} ${money(item.cents)}`).join(", ")}` : "No priced costs yet"}
            style={{ background: total > 0 ? `conic-gradient(${gradient})` : "#e4e4e4" }}>
            <div><span>Total cost</span><strong>{money(total)}</strong></div>
          </div>
          <ul className="budget-chart-legend">{categories.map(item => <li key={item.id}>
            <button type="button" aria-pressed={category === item.id} onClick={() => setCategory(category === item.id ? "all" : item.id)}>
              <span className="budget-legend-dot" style={{ background: item.color }} />
              <span>{item.label}</span><strong>{money(item.cents)}</strong><small>{total ? Math.round(item.cents / total * 100) : 0}%</small>
            </button>
          </li>)}</ul>
        </div>
        {!total && <p className="field-hint">Select transportation or research extra fees to build your breakdown.</p>}
      </section>
      <section className="budget-chart-card" aria-labelledby={`${chartId}-daily`}>
        <header><h4 id={`${chartId}-daily`}>Spending per day</h4>
          <button className="text-button" type="button" onClick={() => setCategory("all")} disabled={category === "all"}>All categories</button></header>
        <p className="budget-chart-focus" aria-live="polite">{selectedDay ? `${dateLabel(selectedDay.date)} · ${money(selectedDay.cents)}` : category === "all" ? "All categories" : costCategories.find(item => item.id === category)?.label}</p>
        {daily ? <>
          <div className="budget-daily-plot">
            <div className="budget-daily-axis" aria-hidden="true"><span>{money(max)}</span><span>{money(Math.round(max / 2))}</span><span>{money(0)}</span></div>
          <div className="budget-daily-scroll">
            <div className="budget-daily-bars" style={{ minWidth: `${daily.days.length * 38}px` }}>
              {daily.days.map(day => <div className="budget-day" key={day.date}>
                <button type="button" className="budget-day-button" aria-label={`${dateLabel(day.date)}: ${money(day.cents)}`}
                  title={`${dateLabel(day.date)}: ${money(day.cents)}`} onFocus={() => setFocusedDate(day.date)}
                  onMouseEnter={() => setFocusedDate(day.date)} onClick={() => setFocusedDate(day.date)}>
                  <span style={{ height: `${day.cents / max * 100}%`, minHeight: day.cents > 0 ? "3px" : "0",
                    background: costCategories.find(item => item.id === category)?.color ?? "#16CBC4" }} />
                </button>
                <small>{dateLabel(day.date)}</small>
              </div>)}
            </div>
          </div>
          </div>
          {daily.unscheduledCents > 0 && <p className="field-hint">{money(daily.unscheduledCents)} falls outside these dates and is included only in the category chart.</p>}
        </> : <p>Daily charts support trip durations of 1–366 days.</p>}
        <details className="budget-allocation-details"><summary>How daily costs are allocated</summary><p className="field-hint">Trip-wide and undated costs are spread evenly across the trip. Round-trip airfare is split across departure and return dates. These are planned costs, not payment dates.</p></details>
      </section>
    </div>
  </section>;
}
