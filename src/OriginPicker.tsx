import { LocationPicker } from "./LocationPicker";
import type { LocationPickerProps } from "./LocationPicker";
type OriginPickerProps = LocationPickerProps & { defaultAirport?: string };

export function OriginPicker({ defaultAirport, ...props }: OriginPickerProps) {
  return <div>
    <LocationPicker {...props} />
    {defaultAirport && props.value !== defaultAirport && <button type="button" className="text-button" disabled={props.disabled}
      onClick={() => props.onSelect(defaultAirport)}>Use default airport</button>}
  </div>;
}
