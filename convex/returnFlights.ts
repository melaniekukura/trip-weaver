import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";
import { flightSearchUrl } from "./flightSearch";
import type { FlightRequest, flightOption } from "./flightSearch";

type Option = Infer<typeof flightOption>;
const unavailable = (): never => { throw new ConvexError({ code: "FLIGHTS_UNAVAILABLE", message: "Matching return flights could not be verified. Try again or open Google Flights." }); };

export function returnBrowserCode(request: FlightRequest, outbound: Option) {
  const input = JSON.stringify({ url: flightSearchUrl(request), outbound, departureDate: request.departureDate, returnDate: request.returnDate });
  return `const input = ${input};
await page.goto(input.url, {timeout: 30000});
await page.getByRole('link', {name:/Select flight$/}).first().waitFor({timeout:15000});
const initial = await page.locator('body').ariaSnapshot();
if (!initial.includes('departing '+input.departureDate+' and returning '+input.returnDate)) throw new Error('Date mismatch');
const labels = await page.getByRole('link', {name:/Select flight$/}).evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')));
const matches = labels.filter(label => label && label.includes('flight with '+input.outbound.airline.split('Operated')[0].trim()+'.') && label.includes(' at '+input.outbound.departure.split(' on ')[0]+' on ') && label.includes(' at '+input.outbound.arrival.split(' on ')[0]+' on ') && label.includes('Total duration '+input.outbound.duration+'.'));
if (matches.length !== 1) throw new Error('Outbound unavailable or ambiguous');
await page.getByRole('link', {name:matches[0],exact:true}).press('Enter',{timeout:10000});
await page.getByRole('button', {name:'Change departing flight',exact:true}).waitFor({timeout:15000});
await page.getByRole('heading', {name:'Top returning flights',exact:true}).waitFor({timeout:15000});
await page.getByRole('link', {name:/Select flight$/}).first().waitFor({timeout:15000});
JSON.stringify({initial, selectedLabel:matches[0], url:page.url(), labels:await page.getByRole('link',{name:/Select flight$/}).evaluateAll(elements => elements.map(e=>e.getAttribute('aria-label')))})`;
}

function parseLabel(label: string) {
  const match = label.replace(/\s+/g, " ").match(/^From ([\d,]+(?:\.\d{2})?) US dollars round trip total\. (Nonstop|\d+ stops?) flight with (.+?)\. (?:Operated by .+?\. )?Leaves (.+?) at (\d{1,2}:\d{2} [AP]M) on ([A-Za-z]+, [A-Za-z]+ \d{1,2}) and arrives at (.+?) at (\d{1,2}:\d{2} [AP]M) on ([A-Za-z]+, [A-Za-z]+ \d{1,2})\. Total duration (\d+ hr(?: \d+ min)?|\d+ min)\./);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, stops: match[2], airline: match[3], from: match[4], departureTime: match[5], departureDate: match[6], to: match[7], arrivalTime: match[8], arrivalDate: match[9], duration: match[10] };
}

function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
function shortDate(date: string) {
  const [weekday, month, day] = date.replace(",", "").split(" ");
  return `${weekday.slice(0, 3)}, ${month.slice(0, 3)} ${day}`;
}

export function parseReturnResults(value: unknown, request: FlightRequest, outbound: Option) {
  if (!value || typeof value !== "object" || !("initial" in value) || !("selectedLabel" in value) || !("labels" in value) || !("url" in value)) return unavailable();
  const { initial, selectedLabel, labels, url } = value;
  if (request.tripType !== "round-trip" || !request.returnDate || typeof initial !== "string" || typeof selectedLabel !== "string" ||
    typeof url !== "string" || !Array.isArray(labels) || labels.length > 200 ||
    !initial.includes(`departing ${request.departureDate} and returning ${request.returnDate}`) ||
    !initial.includes('Change ticket type. Round trip') || !initial.includes('Change seating class. Economy (include Basic)') ||
    !initial.includes('1 passenger, change number of passengers.') || !initial.includes('Currency USD') ||
    !initial.split('\n').some(line => line.includes('Where from?') && line.includes(` ${request.origin}\"`)) ||
    !initial.split('\n').some(line => line.includes('Where to?') && line.includes(` ${request.destination}\"`))) return unavailable();
  const source = new URL(url);
  if (source.origin !== "https://www.google.com" || source.pathname !== "/travel/flights/search" || !source.searchParams.has("tfs")) return unavailable();
  const selected = parseLabel(selectedLabel);
  if (!selected || selected.departureDate !== longDate(request.departureDate) || selected.departureTime !== outbound.departure.split(" on ")[0] ||
    selected.arrivalTime !== outbound.arrival.split(" on ")[0] || shortDate(selected.arrivalDate) !== outbound.arrival.split(" on ")[1] ||
    selected.duration !== outbound.duration || selected.stops !== outbound.stops || selected.airline !== outbound.airline.split("Operated")[0].trim()) return unavailable();
  const flights: Option[] = [];
  for (const label of labels) {
    if (typeof label !== "string") continue;
    const parsed = parseLabel(label);
    if (!parsed || parsed.from !== selected.to || parsed.to !== selected.from || parsed.departureDate !== longDate(request.returnDate)) continue;
    const flight = { airline: parsed.airline, departure: `${parsed.departureTime} on ${shortDate(parsed.departureDate)}`,
      arrival: `${parsed.arrivalTime} on ${shortDate(parsed.arrivalDate)}`, duration: parsed.duration, stops: parsed.stops, amount: parsed.amount, currency: "USD" as const };
    if (!flights.some(item => JSON.stringify(item) === JSON.stringify(flight))) flights.push(flight);
  }
  if (!flights.length) return unavailable();
  return { flights: flights.slice(0, 5), sourceUrl: source.href };
}
