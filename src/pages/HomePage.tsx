import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { Icon } from "../Icons";

type FlightSearchResult = FunctionReturnType<typeof api.flights.search>;
const flightTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function HomePage() {
  const searchFlights = useAction(api.flights.search);
  const [origin, setOrigin] = useState("Lisbon");
  const [destination, setDestination] = useState("");
  const [dates, setDates] = useState("Sep 12 – Sep 20");
  const [flightResults, setFlightResults] = useState<FlightSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await searchFlights({
        source: origin,
        destination,
      });
      setFlightResults(results);
    } catch (error) {
      setFlightResults(null);
      setSearchError(
        error instanceof Error ? error.message : "Unable to search for flights.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">Trip planning, woven together</p>
      <h1 id="hero-title">Trip-Weaver</h1>
      <p className="hero-copy">
        Pull every flight, stay, and stop into one itinerary that holds
        together, thread by thread.
      </p>

      <form className="search-card" id="planner" onSubmit={handleSubmit}>
        <label className="search-field">
          <span>Leaving from</span>
          <input
            aria-label="Leaving from"
            onChange={(event) => setOrigin(event.target.value)}
            required
            value={origin}
          />
        </label>
        <label className="search-field">
          <span>Going to</span>
          <input
            aria-label="Going to"
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Add a destination"
            required
            value={destination}
          />
        </label>
        <label className="search-field">
          <span>Dates</span>
          <input
            aria-label="Travel dates"
            onChange={(event) => setDates(event.target.value)}
            value={dates}
          />
        </label>
        <button
          aria-label={isSearching ? "Searching flights" : "Search flights"}
          className="search-button"
          disabled={isSearching}
          type="submit"
        >
          <Icon size={20}>
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" />
          </Icon>
        </button>
      </form>

      {searchError && (
        <p className="search-feedback search-error" role="alert">
          {searchError}
        </p>
      )}

      {flightResults && (
        <section className="flight-results" aria-live="polite">
          <header className="flight-results-header">
            <div>
              <span className="result-label">Flight result</span>
              <h2>
                {flightResults.source} to {flightResults.destination}
              </h2>
            </div>
            <span className="data-source">{flightResults.dataSource} data</span>
          </header>

          {flightResults.flights.map((flight) => (
            <article
              className="flight-result"
              key={`${flight.flightNumber}-${flight.departureAt}`}
            >
              <div className="flight-carrier">
                <strong>{flight.airline}</strong>
                <span>{flight.flightNumber}</span>
              </div>
              <div className="flight-route">
                <div>
                  <strong>{flight.departureLocation}</strong>
                  <time dateTime={flight.departureAt}>
                    {flightTimeFormatter.format(new Date(flight.departureAt))}
                  </time>
                </div>
                <span aria-hidden="true" className="route-line">
                  →
                </span>
                <div>
                  <strong>{flight.arrivalLocation}</strong>
                  <time dateTime={flight.arrivalAt}>
                    {flightTimeFormatter.format(new Date(flight.arrivalAt))}
                  </time>
                </div>
              </div>
              <div className="flight-meta">
                <span>{flight.durationMinutes} min</span>
                <span>{flight.stops === 0 ? "Nonstop" : `${flight.stops} stops`}</span>
                <strong>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: flight.price.currency,
                  }).format(flight.price.amount)}
                </strong>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
