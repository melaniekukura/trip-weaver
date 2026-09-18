import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { LocationPicker } from "./LocationPicker";
import type { LocationPickerProps } from "./LocationPicker";
export function OriginPicker(props: LocationPickerProps) {
  const profile = useQuery(api.profile.get, {});
  return <div>
    <LocationPicker {...props} />
    {profile?.defaultAirport && props.value !== profile.defaultAirport && <button type="button" className="text-button" disabled={props.disabled}
      onClick={() => props.onSelect(profile.defaultAirport!)}>Use default airport</button>}
  </div>;
}
