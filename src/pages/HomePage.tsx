import { OriginPicker } from "../OriginPicker";
import { useDefaultOrigin } from "../profileDefaults";
import { useState } from "react";
import { Icon } from "../Icons";
import { LocationPicker } from "../LocationPicker";
import { TripForm } from "../TripForm";
import type { GuestTripDraft } from "../guestTripDraft";
import cyanLogo from "../../references/logo-icon/TW-cyan.svg";

export function HomePage({ onGuestContinue }: { onGuestContinue?: (draft: Omit<GuestTripDraft, "draftId">) => void }) {
  const [origin, setOrigin, defaultAirport] = useDefaultOrigin();
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [planning, setPlanning] = useState(false);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <img className="hero-logo" src={cyanLogo} alt="" width="184" height="180" />
      <p className="eyebrow">Trip planning, woven together</p>
      <h1 id="hero-title">Trip-Weaver</h1>
      <p className="hero-copy">
        Pull every flight, stay, and stop into one itinerary that holds
        together, thread by thread.
      </p>
      <form className="search-card live-planner" id="planner" onSubmit={(event) => {
        event.preventDefault();
        setPlanning(true);
      }}>
        <div className="search-field">
          <OriginPicker label="Leaving from" value={origin} defaultAirport={defaultAirport} onSelect={setOrigin} onInputChange={setOrigin} />
        </div>
        <div className="search-field">
          <LocationPicker label="Going to" value={destination} onSelect={setDestination} onInputChange={setDestination} />
        </div>
        <label className="search-field">
          <span>Departure date</span>
          <input aria-label="Departure date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button className="search-button" type="submit" aria-label="Continue to trip details">
          <Icon size={20}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></Icon>
        </button>
      </form>
      {planning && <TripForm onGuestContinue={onGuestContinue}
        initialValues={{ origin, destinations: destination ? [destination] : [], startDate: date }} onClose={() => setPlanning(false)} />}
    </section>
  );
}
