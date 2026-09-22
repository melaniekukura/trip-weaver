import { OriginPicker } from "./OriginPicker";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { LocationPicker } from "./LocationPicker";
import { moveDestination } from "./locations";
import { sameTravelLocation } from "../convex/homeJourney";

export type DestinationStop = { id: string; value: string };

export function insertDestinationBeforeHome(origin: string, stops: DestinationStop[], stop: DestinationStop) {
  const index = sameTravelLocation(origin, stops.at(-1)?.value ?? "") ? stops.length - 1 : stops.length;
  return { index, stops: [...stops.slice(0, index), stop, ...stops.slice(index)] };
}

type DestinationsEditorProps = {
  homePrompt?: ReactNode;
  origin: string;
  stops: DestinationStop[];
  disabled: boolean;
  defaultAirport?: string;
  onOriginChange: (value: string) => void;
  onStopsChange: (stops: DestinationStop[]) => void;
};

export function DestinationsEditor({ origin, stops, disabled, defaultAirport, onOriginChange, onStopsChange, homePrompt }: DestinationsEditorProps) {
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  function move(from: number, to: number) {
    if (disabled || from === to || from < 0 || to < 0 || to >= stops.length) return;
    onStopsChange(moveDestination(stops, from, to));
    setAnnouncement(`${stops[from].value} moved to stop ${to + 1}.`);
  }

  function remove(index: number) {
    onStopsChange(stops.filter((_, position) => position !== index));
    setAnnouncement(`${stops[index].value} removed.`);
    requestAnimationFrame(() => {
      const cards = container.current?.querySelectorAll<HTMLElement>(".destination-stop");
      const next = cards?.[Math.min(index, (cards?.length ?? 0) - 1)];
      (next?.querySelector<HTMLButtonElement>(".remove-stop") ?? container.current?.querySelector<HTMLInputElement>(".destination-add input"))?.focus();
    });
  }

  return (
    <div className="destinations-editor" ref={container}>
      <OriginPicker label="Leaving from" value={origin} required disabled={disabled} defaultAirport={defaultAirport}
        onSelect={onOriginChange} onClear={() => onOriginChange("")} />
      <div className="destination-stops-heading">
        <h4>Destinations</h4><span>{stops.length} / 20 stops</span>
      </div>
      <ol className="destination-stops" aria-label="Destinations in travel order">
        {stops.map((stop, index) => (
          <li className={`destination-stop${dragging === stop.id ? " is-dragging" : ""}`} key={stop.id}
            draggable={!disabled} onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", stop.id);
              event.dataTransfer.effectAllowed = "move";
              setDragging(stop.id);
            }} onDragEnd={() => setDragging(null)} onDragOver={(event) => {
              if (!disabled && dragging) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }
            }} onDrop={(event) => {
              event.preventDefault();
              move(stops.findIndex((item) => item.id === event.dataTransfer.getData("text/plain")), index);
              setDragging(null);
            }}>
            <span className="stop-grip" aria-hidden="true">⠿</span>
            <span className="stop-number" aria-label={`Stop ${index + 1}`}>{index + 1}</span>
            <span className="stop-name">{stop.value}</span>
            <div className="stop-controls">
              <button type="button" disabled={disabled || index === 0} aria-label={`Move ${stop.value} up`} onClick={() => move(index, index - 1)}>↑</button>
              <button type="button" disabled={disabled || index === stops.length - 1} aria-label={`Move ${stop.value} down`} onClick={() => move(index, index + 1)}>↓</button>
              <button className="remove-stop" type="button" disabled={disabled} aria-label={`Remove ${stop.value}`} onClick={() => remove(index)}>×</button>
            </div>
          </li>
        ))}
      </ol>
      {homePrompt}
      <div className="destination-add">
        <LocationPicker label="Add a destination" required={stops.length === 0} disabled={disabled || stops.length >= 20} clearOnSelect
          onSelect={(value) => {
            if (stops.length >= 20) return;
            const added = insertDestinationBeforeHome(origin, stops, { id: crypto.randomUUID(), value });
            onStopsChange(added.stops);
            setAnnouncement(`${value} added as stop ${added.index + 1}.`);
          }} />
      </div>
      {stops.length >= 20 && <p className="field-hint">You have reached the 20-stop limit.</p>}
      <p className="visually-hidden" role="status">{announcement}</p>
    </div>
  );
}
