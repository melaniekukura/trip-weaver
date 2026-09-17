type SendMessage = {
  recipient: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  labels?: string[];
};

export async function sendAgentMail(message: SendMessage) {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
  if (!apiKey || !inboxId) throw new Error("AgentMail is not configured for this deployment.");
  const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey },
    body: JSON.stringify({ to: [message.recipient], subject: message.subject, text: message.text,
      html: message.html, ...(message.labels ? { labels: message.labels } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`AgentMail rejected the request (${response.status}).`);
  if (!body || typeof body !== "object" || !("message_id" in body) || typeof body.message_id !== "string" ||
      !("thread_id" in body) || typeof body.thread_id !== "string") throw new Error("AgentMail returned an invalid response.");
  return { messageId: body.message_id, threadId: body.thread_id };
}

export function verificationEmail(recipient: string, token: string) {
  const safeToken = token.replace(/[^0-9]/g, "");
  return {
    recipient,
    subject: "Verify your Trip-Weaver email",
    text: `Your Trip-Weaver verification code is ${safeToken}. It expires in 15 minutes. If you did not request this code, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#F7F7F7;color:#292929;font-family:Arial,sans-serif"><main style="max-width:560px;margin:auto;padding:32px 20px"><div style="height:6px;background:#16CBC4"></div><section style="padding:24px;background:white"><p style="color:#251F47;font-weight:700">TRIP-WEAVER</p><h1>Verify your email</h1><p>Enter this code to finish signing in:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#251F47">${safeToken}</p><p>This code expires in 15 minutes. If you did not request it, you can ignore this email.</p></section></main></body></html>`,
  };
}

export function verificationIdempotencyKey(recipient: string, token: string) {
  let hash = 2166136261;
  for (const character of recipient) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `trip-weaver-verify-${(hash >>> 0).toString(16)}-${token}`;
}
