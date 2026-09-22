import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { LocationPicker } from "./LocationPicker";
import type { LocationPickerProps } from "./LocationPicker";
type OriginPickerProps = LocationPickerProps & { loadProfile?: boolean };

export function OriginPicker({ loadProfile = true, ...props }: OriginPickerProps) {
  const profile = useQuery(api.profile.get, loadProfile ? {} : "skip");
  return <div>
    <LocationPicker {...props} />
    {profile?.defaultAirport && props.value !== profile.defaultAirport && <button type="button" className="text-button" disabled={props.disabled}
      onClick={() => props.onSelect(profile.defaultAirport!)}>Use default airport</button>}
  </div>;
}
