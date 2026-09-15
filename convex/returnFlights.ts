import { ConvexError } from "convex/values";
import { flightFailure, sanitizeFlightDiagnostic } from "./flightDiagnostics";
import type { Infer } from "convex/values";
import { flightSearchUrl } from "./flightSearch";
import type { FlightRequest, flightOption } from "./flightSearch";

type Option = Infer<typeof flightOption>;
const unavailable = () => flightFailure("browser_result", "invalid_response");

export function returnBrowserCode(request: FlightRequest, outbound: Option) {
  const searchRequest = { ...request,
    origin: request.originType === "city" ? outbound.originAirport ?? request.origin : request.origin,
    destination: request.destinationType === "city" ? outbound.destinationAirport ?? request.destination : request.destination,
    originType: "airport" as const, destinationType: "airport" as const,
  };
  const input = JSON.stringify({ url: flightSearchUrl(searchRequest), outbound, departureDate: request.departureDate, returnDate: request.returnDate });
  return `await (async () => {
const input = ${input};
const parseLabel = ${parseLabel.toString()};
const outboundOptionChecks = ${outboundOptionChecks.toString()};
let stage = 'navigation';
let output;
try {
await page.goto(input.url, {timeout: 30000});
stage = 'outbound_list';
await page.getByRole('link', {name:/Select flight$/}).first().waitFor({timeout:15000});
const snapshot = await page.locator('body').ariaSnapshot();
const initial = snapshot.split('\\n').filter(line => /Change ticket type|Change seating class|passenger, change number|Where from|Where to|Track prices|Currency/.test(line)).join('\\n');
stage = 'page_dates';
if (!initial.includes('departing '+input.departureDate+' and returning '+input.returnDate)) throw new Error('date_mismatch');
stage = 'outbound_match';
const labels = await page.getByRole('link', {name:/Select flight$/}).evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')));
const checked = labels.filter(label => typeof label === 'string').map(label => ({label, checks: outboundOptionChecks(parseLabel(label), input.outbound, input.departureDate)}));
const matches = checked.filter(item => Object.values(item.checks).every(Boolean)).map(item => item.label);
if (matches.length !== 1) {
output = {browserFailure: true, stage, reason: matches.length ? 'outbound_ambiguous' : 'outbound_missing', labelCount: labels.length, matchCount: matches.length,
  airlineMatchCount: checked.filter(item => item.checks.airline).length,
  departureMatchCount: checked.filter(item => item.checks.departure).length,
  arrivalMatchCount: checked.filter(item => item.checks.arrival).length,
  durationMatchCount: checked.filter(item => item.checks.duration).length,
  stopsMatchCount: checked.filter(item => item.checks.stops).length};
throw new Error('match_failed');
}
stage = 'outbound_select';
await page.getByRole('link', {name:matches[0],exact:true}).press('Enter',{timeout:10000});
await page.getByRole('button', {name:'Change departing flight',exact:true}).waitFor({timeout:15000});
stage = 'return_list';
const selected = parseLabel(matches[0]);
const returnDate = new Date(input.returnDate+'T00:00:00Z').toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
let returnLabels = [];
for (let attempt = 0; attempt < 2 && !returnLabels.length; attempt++) {
  try {
    await page.getByRole('link', {name:/Select flight$/}).first().waitFor({timeout:15000});
    for (let poll = 0; poll < 10 && !returnLabels.length; poll++) {
      const candidates = await page.getByRole('link', {name:/Select flight$/}).evaluateAll(elements => elements.map(e=>e.getAttribute('aria-label')?.split(' Layover')[0]));
      returnLabels = candidates.filter(label => {
        const parsed = typeof label === 'string' ? parseLabel(label) : null;
        return parsed && selected && parsed.from === selected.to && parsed.to === selected.from && parsed.departureDate === returnDate;
      }).slice(0, 10);
      if (!returnLabels.length) await new Promise(resolve => setTimeout(resolve,500));
    }
  } catch (error) { if (error?.name !== 'TimeoutError') throw error; }
}
if (!returnLabels.length) {
  output = {browserFailure:true, stage, reason:'timeout', labelCount:0};
} else {
  output = {initial, selectedLabel:matches[0], url:page.url(), labels:returnLabels};
}
} catch (error) {
output ??= {browserFailure: true, stage, reason: error?.message === 'date_mismatch' ? 'date_mismatch' : error?.name === 'TimeoutError' ? 'timeout' : 'browser_failed'};
}
const serialized = JSON.stringify(output);
await page.evaluate(value => { globalThis.__tripWeaverReturnOutput = value; }, serialized).catch(() => {});
return serialized;
})().then(output => { console.log("TRIP_WEAVER_RETURN:" + output); return output; })`;
}

function parseLabel(label: string, roundTrip = true) {
  if (roundTrip && !label.includes("US dollars round trip total.")) return null;
  const match = label.replace(/\s+/g, " ").match(/^From ([\d,]+(?:\.\d{2})?) US dollars(?: round trip total)?\. (Nonstop|\d+ stops?) flight with (.+?)\. (?:Operated by .+?\. )?Leaves (.+?) at (\d{1,2}:\d{2} [AP]M) on ([A-Za-z]+, [A-Za-z]+ \d{1,2}) and arrives at (.+?) at (\d{1,2}:\d{2} [AP]M) on ([A-Za-z]+, [A-Za-z]+ \d{1,2})\. Total duration (\d+ hr(?: \d+ min)?|\d+ min)\./);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, stops: match[2], airline: match[3], from: match[4], departureTime: match[5], departureDate: match[6], to: match[7], arrivalTime: match[8], arrivalDate: match[9], duration: match[10] };
}

export function outboundLabelChecks(label: string, outbound: Option, departureDate: string) {
  return outboundOptionChecks(parseLabel(label), outbound, departureDate);
}

function outboundOptionChecks(parsed: ReturnType<typeof parseLabel>, outbound: Option, departureDate: string) {
  const selectedAirlines = parsed?.airline.split(/operated by/i)[0].toLowerCase().replace(/\s+/g, " ").trim()
    .split(/\s*(?:,|&|\band\b)\s*/).filter(Boolean).sort().join("|");
  const savedAirlines = outbound.airline.split(/operated by/i)[0].toLowerCase().replace(/\s+/g, " ").trim()
    .split(/\s*(?:,|&|\band\b)\s*/).filter(Boolean).sort().join("|");
  const dateParts = parsed?.arrivalDate.replace(",", "").split(" ");
  const arrival = parsed && dateParts ? `${parsed.arrivalTime} on ${dateParts[0].slice(0, 3)}, ${dateParts[1].slice(0, 3)} ${dateParts[2]}` : "";
  const expectedDate = new Date(`${departureDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
  return {
    airline: !!parsed && selectedAirlines === savedAirlines,
    departure: !!parsed && parsed.departureDate === expectedDate && parsed.departureTime === outbound.departure.split(" on ")[0].replace(/\s+/g, " ").trim(),
    arrival: !!parsed && arrival === outbound.arrival.replace(/\s+/g, " ").trim(),
    duration: !!parsed && parsed.duration === outbound.duration.replace(/\s+/g, " ").trim(),
    stops: !!parsed && parsed.stops === outbound.stops,
  };
}

function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
function shortDate(date: string) {
  const [weekday, month, day] = date.replace(",", "").split(" ");
  return `${weekday.slice(0, 3)}, ${month.slice(0, 3)} ${day}`;
}

export function parseReturnResults(value: unknown, request: FlightRequest, outbound: Option) {
  if (value && typeof value === "object" && "browserFailure" in value && value.browserFailure === true) {
    throw new ConvexError({ code: "FLIGHTS_UNAVAILABLE", diagnostic: sanitizeFlightDiagnostic(value, "browser_execute") });
  }
  if (!value || typeof value !== "object" || !("initial" in value) || !("selectedLabel" in value) || !("labels" in value) || !("url" in value)) return unavailable();
  const { initial, selectedLabel, labels, url } = value;
  if (request.tripType !== "round-trip" || !request.returnDate || typeof initial !== "string" || typeof selectedLabel !== "string" ||
    typeof url !== "string" || !Array.isArray(labels) || labels.length > 200 ||
    !initial.includes(`departing ${request.departureDate} and returning ${request.returnDate}`) ||
    !initial.includes('Change ticket type. Round trip') || !/Change seating class\. Economy(?: \(include Basic\))?"/.test(initial) ||
    !initial.includes('1 passenger, change number of passengers.') || !initial.includes('Currency USD') ||
    !initial.split('\n').some(line => line.includes('Where from?') && line.includes(` ${request.originType === "city" ? outbound.originAirport ?? request.origin : request.origin}\"`)) ||
    !initial.split('\n').some(line => line.includes('Where to?') && line.includes(` ${request.destinationType === "city" ? outbound.destinationAirport ?? request.destination : request.destination}\"`))) return flightFailure("return_context", "context_mismatch");
  let source: URL;
  try { source = new URL(url); } catch { return flightFailure("return_context", "url_mismatch"); }
  if (source.origin !== "https://www.google.com" || source.pathname !== "/travel/flights/search" || !source.searchParams.has("tfs")) return flightFailure("return_context", "url_mismatch");
  const selected = parseLabel(selectedLabel);
  if (!selected) return flightFailure("selected_outbound", "label_unrecognized");
  if (!Object.values(outboundLabelChecks(selectedLabel, outbound, request.departureDate)).every(Boolean)) {
    return flightFailure("selected_outbound", "selection_mismatch");
  }
  const flights: Option[] = [];
  let parsedCount = 0;
  for (const label of labels) {
    if (typeof label !== "string") continue;
    const parsed = parseLabel(label);
    if (parsed) parsedCount++;
    if (!parsed || parsed.from !== selected.to || parsed.to !== selected.from || parsed.departureDate !== longDate(request.returnDate)) continue;
    const flight = { airline: parsed.airline, departure: `${parsed.departureTime} on ${shortDate(parsed.departureDate)}`,
      arrival: `${parsed.arrivalTime} on ${shortDate(parsed.arrivalDate)}`, duration: parsed.duration, stops: parsed.stops, amount: parsed.amount, currency: "USD" as const };
    if (!flights.some(item => JSON.stringify(item) === JSON.stringify(flight))) flights.push(flight);
  }
  if (!flights.length) return flightFailure("return_parse", !labels.length ? "no_labels" : !parsedCount ? "no_parseable_labels" : "no_matching_returns",
    { labelCount: labels.length, parsedCount, matchCount: 0 });
  return { flights: flights.slice(0, 5), sourceUrl: source.href };
}


export function bookingBrowserCode(url: string, flight: Option, date: string, roundTrip = true) {
  const input = JSON.stringify({ url, flight, date, roundTrip });
  return `await (async () => {
let stage = "navigation";
try {
const input = ${input};
const parseLabel = ${parseLabel.toString()};
const outboundOptionChecks = ${outboundOptionChecks.toString()};
await page.goto(input.url, {timeout: 30000});
await page.getByRole('link', {name:/Select flight$/}).first().waitFor({timeout:15000});
stage = "booking_match";
const labels = await page.getByRole('link', {name:/Select flight$/}).evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')));
const matches = labels.filter(label => typeof label === 'string' && Object.values(outboundOptionChecks(parseLabel(label, input.roundTrip), input.flight, input.date)).every(Boolean));
if (matches.length !== 1) return JSON.stringify({browserFailure:true, stage, reason:'selection_unavailable', labelCount:labels.length, matchCount:matches.length});
await page.getByRole('link', {name:matches[0],exact:true}).press('Enter',{timeout:10000});
stage = 'booking_options';
await page.getByText('Booking options', {exact:true}).waitFor({timeout:15000});
const airlines = input.flight.airline.split(/operated by/i)[0].toLowerCase().split(/\\s*(?:,|&|\\band\\b)\\s*/).map(name=>name.trim());
const expanders = await page.getByRole('button', {name:/^View fare options on /}).evaluateAll(elements=>elements.map(e=>e.getAttribute('aria-label')));
for (const label of expanders) {
  const provider = label?.replace(/^View fare options on /, '').trim();
  if (provider && airlines.includes(provider.toLowerCase())) {
    await page.getByRole('button', {name:label,exact:true}).click({timeout:10000});
    await page.getByRole('button', {name:'Hide fare options on '+provider,exact:true}).waitFor({timeout:10000});
  }
}
const buttons = await page.getByRole('button', {name:/^Continue to book with /}).evaluateAll(elements=>elements.map(e=>e.getAttribute('aria-label')));
const choices = buttons.map(label => {const match=label?.match(/^Continue to book with (.+?), (.+) for ([\\d,]+(?:\\.\\d+)?) US dollars$/); return match && {label, provider:match[1], amount:Number(match[3].replaceAll(',',''))};}).filter(item=>item && airlines.includes(item.provider.toLowerCase())).sort((a,b)=>a.amount-b.amount);
if (!choices.length) return JSON.stringify({browserFailure:true, stage, reason:'airline_option_unavailable'});
const choice = choices[0];
stage = 'booking_policy';
const policy = await page.getByRole('link', {name:choice.provider+' bag policy (opens in new tab)', exact:true}).getAttribute('href');
const policyUrl = new URL(policy, 'https://www.google.com');
const airlineUrl = new URL(policyUrl.hostname === 'www.google.com' ? policyUrl.searchParams.get('url') : policyUrl.href);
const host = airlineUrl.hostname.replace(/^www\\./,'');
stage = 'booking_handoff';
let handoff;
page.context().on('request', request => {
  const url = new URL(request.url());
  if (!handoff && request.isNavigationRequest() && url.protocol === 'https:' && (url.hostname === host || url.hostname.endsWith('.'+host))) handoff = {url:url.href, method:request.method()};
});
await page.getByRole('button',{name:choice.label,exact:true}).click();
for (let attempt=0; attempt<100 && !handoff; attempt++) await new Promise(resolve=>setTimeout(resolve,100));
if (!handoff || handoff.method !== 'GET') return JSON.stringify({browserFailure:true, stage, reason:'direct_link_unavailable'});
return JSON.stringify({url:handoff.url, provider:choice.provider, amount:choice.amount, airlineHost:host});
} catch (error) {
return JSON.stringify({browserFailure:true, stage, reason:error?.name === 'TimeoutError' ? 'timeout' : 'browser_failed'});
}
})().then(output => { console.log('TRIP_WEAVER_BOOKING:' + output); return output; })`;
}
