import type { FlightResearch } from "./flightResearch";

export function FlightAccessibilityNotice({ assessment }: { assessment: FlightResearch["accessibility"] }) {
  if (!assessment) return null;
  return <>
    {assessment.unverified.length > 0 && <p className="flight-accessibility-warning" role="status"
      title={`Unverified: ${assessment.unverified.join(", ")}`}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3 22 21H2L12 3Z" strokeLinejoin="round" />
        <path d="M12 9v5" strokeLinecap="round" /><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
      <span>cannot confirm accessibility requirements</span>
    </p>}
    {assessment.notApplicable.length > 0 && <p className="field-hint">Accommodation requirements are saved for lodging, and do not filter flights: {assessment.notApplicable.join(", ")}.</p>}
  </>;
}
