import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

function maskedEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "your account email";
  return `${name.slice(0, 1)}${"•".repeat(Math.min(5, Math.max(2, name.length - 1)))}@${domain}`;
}

function message(error: unknown) {
  return error instanceof ConvexError && typeof error.data === "object" && error.data !== null &&
    "message" in error.data && typeof error.data.message === "string"
    ? error.data.message : "Unable to email this itinerary. Please try again.";
}

export function ItineraryEmailAction({ tripId, onSaveTrip }: {
  tripId: Id<"trips">;
  onSaveTrip: () => Promise<Id<"trips"> | null>;
}) {
  const latest = useQuery(api.itineraryEmails.latest, { tripId });
  const account = useQuery(api.itineraryEmails.account);
  const request = useMutation(api.itineraryEmails.request);
  const retry = useMutation(api.itineraryEmails.retry);
  const requestId = useRef<string | null>(null);
  const recipientInput = useRef<HTMLInputElement>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const recipientValue = recipient ?? account?.email ?? "";
  const currentRecipient = recipientValue.trim().toLowerCase();
  const latestMatchesRecipient = latest?.recipient.toLowerCase() === currentRecipient;
  const busy = pending || latest?.status === "queued" || latest?.status === "sending";
  const addressFailed = latestMatchesRecipient && (latest?.status === "bounced" || latest?.status === "rejected");
  const unverified = account !== undefined && !account.verified;

  async function send() {
    if (busy || !recipientInput.current?.reportValidity()) return;
    setPending(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const savedId = await onSaveTrip();
      if (!savedId) return;
      await request({ tripId: savedId, requestId: requestId.current, recipient: recipientValue });
      requestId.current = null;
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  }

  async function retryDelivery() {
    if (!latest || latest.status !== "failed" || pending) return;
    setPending(true); setError("");
    try { await retry({ deliveryId: latest._id }); }
    catch (cause) { setError(message(cause)); }
    finally { setPending(false); }
  }

  return <div className="itinerary-email-action">
    <div className="itinerary-email-copy">
      <strong>Email a saved snapshot</strong>
      {unverified && <p className="itinerary-email-status is-failed" role="status">Sign out and sign back in to verify your account email before sending to any recipient.</p>}
      {latest && <p className={`itinerary-email-status is-${latest.status}`} role="status">
        {latest.status === "queued" && "Email queued…"}
        {latest.status === "sending" && "Sending itinerary…"}
        {latest.status === "sent" && `Sent to ${maskedEmail(latest.recipient)}.`}
        {latest.status === "delivered" && `Delivered to ${maskedEmail(latest.recipient)}.`}
        {latest.status === "failed" && (latest.error || "Delivery failed.")}
        {latest.status === "bounced" && (latest.error || "The recipient's mail server bounced this email.")}
        {latest.status === "rejected" && (latest.error || "AgentMail rejected this email.")}
      </p>}
      {error && <p className="search-error" role="alert">{error}</p>}
    </div>
    <div className="itinerary-email-controls">
      <label>Recipient email
        <input ref={recipientInput} type="email" required maxLength={254} autoComplete="email"
          value={recipientValue} onChange={(event) => {
            setRecipient(event.target.value); requestId.current = null; setError("");
          }} />
      </label>
      <div className="button-row">
        {latestMatchesRecipient && latest?.status === "failed" && latest.attempts < 3 &&
          <button type="button" className="secondary-button" disabled={pending} onClick={() => void retryDelivery()}>Try again</button>}
        <button type="button" className="primary-button" disabled={busy || addressFailed || unverified} onClick={() => void send()}>
          {busy ? "Sending…" : unverified ? "Verification required" : addressFailed ? "Delivery unavailable" : ["sent", "delivered"].includes(latest?.status ?? "") ? "Email updated itinerary" : "Email my itinerary"}
        </button>
      </div>
    </div>
  </div>;
}
