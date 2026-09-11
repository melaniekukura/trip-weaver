import { useState } from "react";
import { Icon } from "../Icons";
import { LocationPicker } from "../LocationPicker";
import { TripForm } from "../TripForm";

export function HomePage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [planning, setPlanning] = useState(false);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">Trip planning, woven together</p>
      <h1 id="hero-title">Trip-Weaver</h1>
      <p className="hero-copy">
        Pull every flight, stay, and stop into one itinerary that holds
        together, thread by thread.
      </p>
      <form className="search-card live-planner" id="planner" onSubmit={(event) => {
        event.preventDefault();
        if (origin && destination) setPlanning(true);
      }}>
        <div className="search-field">
          <LocationPicker label="Leaving from" value={origin} required onSelect={setOrigin} onClear={() => setOrigin("")} />
        </div>
        <div className="search-field">
          <LocationPicker label="Going to" value={destination} required onSelect={setDestination} onClear={() => setDestination("")} />
        </div>
        <label className="search-field">
          <span>Departure date</span>
          <input aria-label="Departure date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button className="search-button" type="submit" aria-label="Continue to trip details">
          <Icon size={20}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></Icon>
        </button>
      </form>
      <p className="field-hint home-search-hint">Add your trip details, then turn on Find my flight in Transportation.</p>
      {planning && <TripForm initialValues={{ origin, destinations: [destination], startDate: date }} onClose={() => setPlanning(false)} />}
    </section>
  );
}
