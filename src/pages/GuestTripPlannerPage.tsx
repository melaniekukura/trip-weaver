import { TripForm } from "../TripForm";
import { readGuestTripDraft, saveGuestTripDraft } from "../guestTripDraft";

export function GuestTripPlannerPage({ onSignIn }: { onSignIn: () => void }) {
  const draft = readGuestTripDraft();
  if (!draft) return <section className="empty-state">
    <h1>Start a trip first</h1>
    <a className="primary-button" href="#/">Return home</a>
  </section>;
  return <div className="trip-planner-page guest-trip-planner-page">
    <a className="planner-back" href="#/">← Home</a>
    <div className="planner-page-heading"><h1 className="planner-page-title">Plan My Trip</h1></div>
    <TripForm key={draft.draftId} mode="guest" initialValues={draft} onClose={() => { window.location.hash = "/"; }}
      onSignInRequired={onSignIn} onDraftChange={saveGuestTripDraft} />
  </div>;
}
