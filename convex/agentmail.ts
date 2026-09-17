import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { itineraryEmailContent } from "./itineraryEmailContent";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") return "AgentMail timed out. Try again.";
  return error instanceof Error ? error.message : "AgentMail could not send this itinerary.";
}

export const sendItinerary = internalAction({
  args: { deliveryId: v.id("emailDeliveries") },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const delivery: Doc<"emailDeliveries"> | null = await ctx.runMutation(internal.itineraryEmails.claim, { deliveryId });
    if (!delivery) return null;
    try {
      const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
      const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
      if (!apiKey || !inboxId) throw new Error("AgentMail is not configured for this deployment.");
      const content = itineraryEmailContent(delivery.snapshot);
      const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
          "Idempotency-Key": `trip-weaver-${delivery._id}` },
        body: JSON.stringify({ to: [delivery.recipient], subject: content.subject, text: content.text, html: content.html,
          labels: ["trip-weaver", "itinerary"] }),
        signal: AbortSignal.timeout(30_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`AgentMail rejected the request (${response.status}).`);
      if (!body || typeof body !== "object" || !("message_id" in body) || typeof body.message_id !== "string" ||
          !("thread_id" in body) || typeof body.thread_id !== "string") throw new Error("AgentMail returned an invalid response.");
      await ctx.runMutation(internal.itineraryEmails.finish, { deliveryId,
        result: { status: "sent", messageId: body.message_id, threadId: body.thread_id } });
    } catch (error) {
      await ctx.runMutation(internal.itineraryEmails.finish, { deliveryId,
        result: { status: "failed", error: errorMessage(error) } });
    }
    return null;
  },
});
