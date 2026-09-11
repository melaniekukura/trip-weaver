import { useId } from "react";
import { emptyFlightFilters, flightFilterError } from "./flightFilters";
import type { FlightFilters as Filters } from "./flightFilters";

export function FlightFilterControls({ value, onChange, title = "Flight filters", leg = "outbound", priceLabel = "Maximum price (USD)" }: { value: Filters; onChange: (filters: Filters) => void; title?: string; leg?: string; priceLabel?: string }) {
  const id = useId();
  const error = flightFilterError(value);
  const timeFields = [
    ["departureFrom", "Depart at or after"], ["departureTo", "Depart by"],
    ["arrivalFrom", "Arrive at or after"], ["arrivalTo", "Arrive by"],
  ] as const;
  return <fieldset className="flight-filters">
    <legend>{title}</legend>
    <p className="field-hint">Choose filters now or after searching. They apply to the retrieved {leg} flights, without a new search. Hours use each airport’s local time, including next-day arrivals. A range such as 10 PM–6 AM spans midnight.</p>
    <div className="flight-filter-fields">
      {timeFields.map(([field, label]) => <label key={field} htmlFor={`${id}-${field}`}>{label}
        <input id={`${id}-${field}`} type="time" value={value[field]}
          onChange={(event) => onChange({ ...value, [field]: event.target.value })} />
      </label>)}
      <label htmlFor={`${id}-stops`}>Stops
        <select id={`${id}-stops`} value={value.stops}
          onChange={(event) => onChange({ ...value, stops: event.target.value as Filters["stops"] })}>
          <option value="any">Any number of stops</option><option value="nonstop">Nonstop</option>
          <option value="one">Exactly 1 stop</option><option value="multiple">2 or more stops</option>
        </select>
      </label>
      <label htmlFor={`${id}-price`}>{priceLabel}
        <input id={`${id}-price`} type="number" min="0" step="0.01" placeholder="No limit" value={value.maxPrice}
          aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange({ ...value, maxPrice: event.target.value })} />
      </label>
    </div>
    {error && <p id={`${id}-error`} className="search-error" role="alert">{error} The price filter is not applied.</p>}
    <button className="text-button" type="button" onClick={() => onChange({ ...emptyFlightFilters })}>Clear filters</button>
  </fieldset>;
}
