import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

type EventType = "message.sent" | "message.delivered" | "message.bounced" | "message.rejected";

export function eventDetails(value: unknown) {
  if (!value || typeof value !== "object" || !("event_id" in value) || typeof value.event_id !== "string" ||
      !("event_type" in value) || !["message.sent", "message.delivered", "message.bounced", "message.rejected"].includes(String(value.event_type))) return null;
  const eventType = String(value.event_type) as EventType;
  const key = eventType === "message.sent" ? "send" : eventType === "message.delivered" ? "delivery" :
    eventType === "message.bounced" ? "bounce" : "reject";
  if (!(key in value)) return null;
  const detail = value[key as keyof typeof value];
  if (!detail || typeof detail !== "object" || !("message_id" in detail) || typeof detail.message_id !== "string") return null;
  const timestamp = "timestamp" in detail && typeof detail.timestamp === "string" ? Date.parse(detail.timestamp) : NaN;
  const error = eventType === "message.bounced"
    ? ["type", "sub_type"].flatMap(field => field in detail && typeof detail[field as keyof typeof detail] === "string"
      ? [String(detail[field as keyof typeof detail])] : []).join(": ")
    : eventType === "message.rejected" && "reason" in detail && typeof detail.reason === "string" ? detail.reason : undefined;
  return { eventId: value.event_id, eventType, messageId: detail.message_id,
    ...(Number.isFinite(timestamp) ? { occurredAt: timestamp } : {}), ...(error ? { error } : {}) };
}

export const handle = httpAction(async (ctx, request) => {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Webhook is not configured.", { status: 503 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_100_000) return new Response("Payload is too large.", { status: 413 });
  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };
  try { new Webhook(secret).verify(payload, headers); }
  catch { return new Response("Invalid signature.", { status: 400 }); }
  let parsed: unknown;
  try { parsed = JSON.parse(payload); }
  catch { return new Response("Invalid payload.", { status: 400 }); }
  const event = eventDetails(parsed);
  if (!event) return new Response(null, { status: 204 });
  await ctx.runMutation(internal.itineraryEmails.recordWebhook, event);
  return new Response(null, { status: 204 });
});
