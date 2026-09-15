import { diagnosticReasons, diagnosticStages } from "../convex/flightDiagnostics";
import type { FlightDiagnostic } from "../convex/flightDiagnostics";

export function FlightSearchError({ run }: { run: { _id: string; error?: string; diagnostic?: FlightDiagnostic } }) {
  const detail = run.diagnostic;
  return <div>
    <p className="search-error" role="alert">{run.error || "Flight search could not be completed. Please try again."}</p>
    <details className="flight-error-details">
      <summary>Search details</summary>
      {detail ? <>
        <p><strong>Step:</strong> {diagnosticStages[detail.stage as keyof typeof diagnosticStages] ?? "Flight search"}</p>
        <p>{diagnosticReasons[detail.reason as keyof typeof diagnosticReasons] ?? "The search could not complete this step."}</p>
        <p><strong>Code:</strong> {detail.code} / {detail.reason}</p>
        {detail.httpStatus !== undefined && <p>Provider HTTP status: {detail.httpStatus}</p>}
        {detail.exitCode !== undefined && <p>Browser exit code: {detail.exitCode}</p>}
        {detail.labelCount !== undefined && <p>Flight labels received: {detail.labelCount}</p>}
        {detail.parsedCount !== undefined && <p>Labels parsed: {detail.parsedCount}</p>}
        {detail.airlineMatchCount !== undefined && <>
          <p>Options matching each detail (counts may refer to different flights):</p>
          <p>Airlines: {detail.airlineMatchCount} · Departure: {detail.departureMatchCount} · Arrival: {detail.arrivalMatchCount}
            {" · "}Duration: {detail.durationMatchCount} · Stops: {detail.stopsMatchCount}</p>
        </>}
        {detail.matchCount !== undefined && <p>Matching flights: {detail.matchCount}</p>}
      </> : <p>This search has no detailed diagnostics. Retry to capture the failed step.</p>}
      <p><strong>Search reference:</strong> <code>{run._id}</code></p>
    </details>
  </div>;
}
