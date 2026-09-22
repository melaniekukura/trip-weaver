import type { Infer } from "convex/values";
import { itineraryEmailSnapshot } from "./emailSchema";

export type ItineraryEmailSnapshot = Infer<typeof itineraryEmailSnapshot>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function safeUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function money(snapshot: ItineraryEmailSnapshot) {
  if (snapshot.budget === null) return "Not set";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: snapshot.currency }).format(snapshot.budget);
  } catch {
    return `${snapshot.budget.toFixed(2)} ${snapshot.currency}`;
  }
}

export function itineraryEmailContent(snapshot: ItineraryEmailSnapshot) {
  const subject = `${snapshot.name} itinerary | Trip-Weaver`;
  const route = `${snapshot.origin} → ${snapshot.destinations.join(" → ")}`;
  const itemText = snapshot.items.length ? snapshot.items.map(item => [
    `${item.date ?? "Date not set"}${item.time ? ` at ${item.time}` : ""} — ${item.title}`,
    item.location,
    item.detail,
    item.reference ? `Booking reference: ${item.reference}` : undefined,
    item.notes,
    safeUrl(item.url),
  ].filter(Boolean).join("\n")).join("\n\n") : "No transportation, lodging, or activities have been scheduled yet.";
  const text = [snapshot.name, route, `${snapshot.startDate} through ${snapshot.endDate}`,
    `${snapshot.travelers} traveler${snapshot.travelers === 1 ? "" : "s"} · Budget: ${money(snapshot)}`,
    snapshot.accessibility ? `Accessibility notes: ${snapshot.accessibility}` : undefined,
    "", "ITINERARY", itemText, "", "Sent by Trip-Weaver."].filter(value => value !== undefined).join("\n");
  const items = snapshot.items.length ? snapshot.items.map(item => {
    const url = safeUrl(item.url);
    const title = url ? `<a href="${escapeHtml(url)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
    const color = item.kind === "transportation" ? "#16CBC4" : item.kind === "lodging" ? "#C3C3C3" : "#251F47";
    return `<li style="margin:0 0 16px;padding:16px;border-left:4px solid ${color};background:#F7F7F7">` +
      `<strong>${escapeHtml(item.date ?? "Date not set")}${item.time ? ` · ${escapeHtml(item.time)}` : ""}</strong>` +
      `<h3 style="margin:6px 0;color:#292929">${title}</h3><p style="margin:4px 0;color:#251F47">${escapeHtml(item.location)}</p>` +
      `${item.detail ? `<p style="margin:4px 0">${escapeHtml(item.detail)}</p>` : ""}` +
      `${item.reference ? `<p style="margin:4px 0"><strong>Booking reference:</strong> ${escapeHtml(item.reference)}</p>` : ""}` +
      `${item.notes ? `<p style="margin:8px 0 0">${escapeHtml(item.notes)}</p>` : ""}</li>`;
  }).join("") : "<p>No transportation, lodging, or activities have been scheduled yet.</p>";
  const html = `<!doctype html><html><body style="margin:0;background:#F7F7F7;color:#292929;font-family:Arial,sans-serif"><main style="max-width:680px;margin:auto;padding:32px 20px"><div style="height:6px;background:#16CBC4"></div><section style="padding:24px;background:white"><p style="color:#251F47;font-weight:700">TRIP-WEAVER</p><h1>${escapeHtml(snapshot.name)}</h1><p><strong>${escapeHtml(route)}</strong><br>${escapeHtml(snapshot.startDate)} through ${escapeHtml(snapshot.endDate)}</p><p>${snapshot.travelers} traveler${snapshot.travelers === 1 ? "" : "s"} · Budget: ${escapeHtml(money(snapshot))}</p>${snapshot.accessibility ? `<p><strong>Accessibility notes:</strong> ${escapeHtml(snapshot.accessibility)}</p>` : ""}<h2 style="margin-top:28px;color:#251F47">Your itinerary</h2><ul style="list-style:none;padding:0">${items}</ul><p style="margin-top:28px;color:#666">Sent by Trip-Weaver.</p></section></main></body></html>`;
  return { subject, text, html };
}
