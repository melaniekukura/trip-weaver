import { transportLocationLabel } from "./transportationLegs";

export type HomeJourneyPromptProps = {
  origin: string; destination: string; status: "covered" | "not-needed" | "missing";
  disabled?: boolean; full?: boolean; onAdd: () => void; onNotNeeded: () => void; onReset: () => void;
};

export function HomeJourneyPrompt({ origin, destination, status, disabled, full, onAdd, onNotNeeded, onReset }: HomeJourneyPromptProps) {
  if (status === "covered") return null;
  if (status === "not-needed") return <div className="home-journey-choice">
    <span>Flight home marked as not needed.</span><button type="button" className="text-button" disabled={disabled} onClick={onReset}>Change</button>
  </div>;
  return <div className="home-journey-prompt" role="status">
    <div>This trip ends in {transportLocationLabel(destination)}, not {transportLocationLabel(origin)}. Add a leg back home, or confirm you don’t need one.
      {full && <p>Remove a stop to make room for the flight home (20-stop limit).</p>}</div>
    <div className="button-row"><button type="button" className="secondary-button" disabled={disabled || full} onClick={onAdd}>Add flight home</button>
      <button type="button" className="text-button" disabled={disabled} onClick={onNotNeeded}>Not needed</button></div>
  </div>;
}
