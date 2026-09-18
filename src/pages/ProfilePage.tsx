import { AccessibilityTab } from "../AccessibilityTab";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import type { FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { LocationPicker } from "../LocationPicker";

export function ProfilePage() {
  const profile = useQuery(api.profile.get, {});
  const [saved, setSaved] = useState(false);
  return <section className="profile-page"><h1>Profile</h1>
    {profile ? <ProfileForm key={profile.revision} profile={profile} onSaved={() => setSaved(true)} /> : <p role="status">Loading your profile…</p>}
    {saved && <p role="status">Profile saved.</p>}
  </section>;
}
export function ProfileForm({ profile, onSaved }: { profile: FunctionReturnType<typeof api.profile.get>; onSaved?: () => void }) {
  const save = useMutation(api.profile.save);
  const [name, setName] = useState(profile.name);
  const [accessibility, setAccessibility] = useState(profile.defaultAccessibility);
  const [airport, setAirport] = useState(profile.defaultAirport ?? "");
  const [connections, setConnections] = useState(profile.maxConnections === null ? "any" : String(profile.maxConnections));
  const [airportKey, setAirportKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setMessage("");
    try { await save({ name, defaultAccessibility: accessibility, defaultAirport: airport || null, maxConnections: connections === "any" ? null : Number(connections), revision: profile.revision }); onSaved?.(); }
    catch (error) {
      const data = error instanceof ConvexError ? error.data : null;
      setMessage(data && typeof data === "object" && "message" in data ? String(data.message) : "Unable to save your profile. Please try again.");
    } finally { setPending(false); }
  }
  return <form onSubmit={event => void submit(event)}>
    <fieldset disabled={pending}><legend>Personal information</legend>
      <label>Name<input autoComplete="name" value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>
      <label>Email<input type="email" autoComplete="email" value={profile.email} readOnly /></label>
    </fieldset>
    <fieldset disabled={pending}><legend>Travel settings</legend>
      <LocationPicker key={airportKey} label="Default airport (optional)" airportsOnly value={airport} disabled={pending}
        onSelect={setAirport} onClear={() => setAirport("")} />
      {airport && <button type="button" className="text-button" onClick={() => { setAirport(""); setAirportKey(value => value + 1); }}>Clear default airport</button>}
      <label>Maximum connections<select value={connections} onChange={event => setConnections(event.target.value)}>
        <option value="any">No limit</option><option value="0">Nonstop only</option>
        <option value="1">Up to 1 connection</option><option value="2">Up to 2 connections</option><option value="3">Up to 3 connections</option>
      </select></label>
    </fieldset>
    <fieldset disabled={pending}><legend>Accessibility</legend>
      <AccessibilityTab compact initialValue={profile.defaultAccessibility} onChange={setAccessibility} />
    </fieldset>
    {message && <p className="search-error" role="alert">{message}</p>}
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
  </form>;
}
