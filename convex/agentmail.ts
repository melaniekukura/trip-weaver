import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { sendAgentMail } from "./agentmailClient";
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
      const content = itineraryEmailContent(delivery.snapshot);
      const sent = await sendAgentMail({ recipient: delivery.recipient, ...content,
        idempotencyKey: `trip-weaver-${delivery._id}`, labels: ["trip-weaver", "itinerary"] });
      await ctx.runMutation(internal.itineraryEmails.finish, { deliveryId,
        result: { status: "sent", messageId: sent.messageId, threadId: sent.threadId } });
    } catch (error) {
      await ctx.runMutation(internal.itineraryEmails.finish, { deliveryId,
        result: { status: "failed", error: errorMessage(error) } });
    }
    return null;
  },
});
