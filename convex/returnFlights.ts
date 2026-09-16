import { parseGoogleFlightSegments } from "./flightSegments";
import { airlineNames } from "./airlineNames";
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
const airlineNames = ${airlineNames.toString()};
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
const checked = labels.filter(label => typeof label === 'string').map(label => ({label, checks: outboundOptionChecks(parseLabel(label), input.outbound, input.departureDate, airlineNames)}));
const matches = checked.filter(item => Object.values(item.checks).every(Boolean)).map(item => item.label);
if (matches.length !== 1) {
output = {browserFailure: true, stage, reason: matches.length ? 'outbound_ambiguous' : 'outbound_missing', labelCount: labels.length, matchCount: matches.length,
  selectedAirline: input.outbound.airline,
  airlineCandidates: checked.slice(0, 20).map(item => ({airline: parseLabel(item.label)?.airline ?? '(unparsed label)',
    otherDetailsMatch: item.checks.departure && item.checks.arrival && item.checks.duration && item.checks.stops})),
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
  return outboundOptionChecks(parseLabel(label), outbound, departureDate, airlineNames);
}

function outboundOptionChecks(parsed: ReturnType<typeof parseLabel>, outbound: Option, departureDate: string, normalize: (value: string) => string[]) {
  const selectedAirlines = normalize(parsed?.airline ?? "");
  const savedAirlines = normalize(outbound.airline);
  const dateParts = parsed?.arrivalDate.replace(",", "").split(" ");
  const arrival = parsed && dateParts ? `${parsed.arrivalTime} on ${dateParts[0].slice(0, 3)}, ${dateParts[1].slice(0, 3)} ${dateParts[2]}` : "";
  const expectedDate = new Date(`${departureDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
  return {
    airline: !!parsed && selectedAirlines.length > 0 && selectedAirlines.every(name => savedAirlines.includes(name)),
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


export function parseBookingChoice(label: string) {
  const match = label.replace(/\s+/g, " ").trim().match(/^Continue to book with (.+?)(?:, (.+?))? for ([\d,]+(?:\.\d{1,2})?) US dollars?\.?$/i);
  if (!match) return null;
  const amount = Number(match[3].replaceAll(",", ""));
  return Number.isFinite(amount) && amount > 0 ? { label, provider: match[1].trim(), amount } : null;
}

export function bookingBrowserCode(url: string, flight: Option, date: string, roundTrip = true, googleOptions?: { flight: Option; date: string }) {
  const input = JSON.stringify({ url, flight, date, roundTrip, googleOptions });
  return `await (async () => {
let stage = "navigation";
try {
// Embedded functions may reference the bundler’s name-preservation helper.
const __name = value => value;
const input = ${input};
const airlineNames = ${airlineNames.toString()};
const parseLabel = ${parseLabel.toString()};
const outboundOptionChecks = ${outboundOptionChecks.toString()};
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const response = await page.goto(input.url, {timeout:15000, waitUntil:'domcontentloaded'});
    const status = response?.status();
    if (status >= 400) return JSON.stringify({browserFailure:true, stage, reason:'http_error', httpStatus:status});
    break;
  } catch (error) {
    const transient = error?.name === 'TimeoutError' || /net::ERR_(?:ABORTED|CONNECTION_RESET|CONNECTION_CLOSED|NETWORK_CHANGED|TIMED_OUT|HTTP2_PROTOCOL_ERROR)\\b/.test(error?.message ?? '');
    if (attempt || !transient) throw error;
  }
}
stage = 'booking_list';
await page.getByRole('link', {name:/Select flight$/}).first().waitFor({timeout:15000});
stage = "booking_match";
const labels = await page.getByRole('link', {name:/Select flight$/}).evaluateAll(elements => elements.map(e => e.getAttribute('aria-label')));
const matches = labels.filter(label => typeof label === 'string' && Object.values(outboundOptionChecks(parseLabel(label, input.roundTrip), input.flight, input.date, airlineNames)).every(Boolean));
if (matches.length !== 1) return JSON.stringify({browserFailure:true, stage, reason:'selection_unavailable', labelCount:labels.length, matchCount:matches.length});
await page.getByRole('link', {name:matches[0],exact:true}).press('Enter',{timeout:10000});
stage = 'booking_options';
await page.getByText('Booking options', {exact:true}).waitFor({timeout:15000});
if (input.googleOptions) {
  const url = page.url();
  const parseSegments = ${parseGoogleFlightSegments.toString()};
  const readSegments = async (direction, flight, date) => {
    try {
      const details = page.getByRole('button', {name:new RegExp('^Flight details\\. ' + direction + ' flight')});
      if (await details.count() !== 1) return [];
      if (await details.getAttribute('aria-expanded') !== 'true') await details.click({timeout:3000});
      const parsed = parseSegments(await details.locator('xpath=ancestor::li[1]').ariaSnapshot({timeout:3000}), date);
      const expected = flight.stops === 'Nonstop' ? 1 : Number.parseInt(flight.stops,10) + 1;
      return parsed.length === expected && parsed[0]?.origin === flight.originAirport && parsed.at(-1)?.destination === flight.destinationAirport ? parsed : [];
    } catch { return []; }
  };
  const outgoingSegments = await readSegments('Departing', input.googleOptions.flight, input.googleOptions.date);
  const returnSegments = input.roundTrip ? await readSegments('Returning', input.flight, input.date) : [];
  return JSON.stringify({url, provider:'Google Flights', outgoingSegments, returnSegments});
}

const airlines = airlineNames(input.flight.airline);
const parseBookingChoice = ${parseBookingChoice.toString()};
const expanded = new Set();
let choices = [];
let providerLabels = [];
let parsedCount = 0;
const isAirline = provider => {
  const names = airlineNames(provider);
  return names.length > 0 && names.every(name => airlines.includes(name));
};
for (let attempt = 0; attempt < 5 && !choices.length; attempt++) {
  const moreOptions = page.getByRole('button', {name:/^\\d+ more booking options$/});
  if (await moreOptions.count() === 1) await moreOptions.click({timeout:5000});
  const expanders = await page.getByRole('button', {name:/^View fare options on /}).evaluateAll(elements=>elements.map(e=>e.getAttribute('aria-label') || e.textContent?.trim()));
  for (const label of expanders) {
    const provider = label?.replace(/^View fare options on /, '').trim();
    if (provider && isAirline(provider) && !expanded.has(label)) {
      await page.getByRole('button', {name:label,exact:true}).click({timeout:10000});
      expanded.add(label);
    }
  }
  const candidates = [];
  for (const role of ['button', 'link']) {
    const labels = await page.getByRole(role, {name:/^Continue to book with /}).evaluateAll(elements=>elements.map(e=>e.getAttribute('aria-label') || e.textContent?.trim()));
    for (const label of labels) if (typeof label === 'string') candidates.push({label, role});
  }
  providerLabels = [...new Set([...expanders, ...candidates.map(item=>item.label)].filter(label=>typeof label === 'string'))].slice(0,20);
  const parsed = candidates.map(item => { const choice = parseBookingChoice(item.label); return choice && {...choice, role:item.role}; }).filter(Boolean);
  parsedCount = parsed.length;
  choices = parsed.filter(item => isAirline(item.provider)).sort((a,b)=>a.amount-b.amount);
  if (!choices.length && attempt < 4) await new Promise(resolve=>setTimeout(resolve,500));
}
if (!choices.length) {
  let itinerarySegments = [];
  if (!input.roundTrip) {
    try {
    const parseSegments = ${parseGoogleFlightSegments.toString()};
    const details = page.getByRole('button', {name:/^Flight details\\. Departing flight/});
    if (await details.count() === 1) {
      if (await details.getAttribute('aria-expanded') !== 'true') await details.click({timeout:5000});
      const snapshot = await details.locator('xpath=ancestor::li[1]').ariaSnapshot({timeout:5000});
      const parsed = parseSegments(snapshot, input.date);
      const expected = input.flight.stops === 'Nonstop' ? 1 : Number.parseInt(input.flight.stops,10) + 1;
      if (parsed.length === expected && parsed[0]?.origin === input.flight.originAirport && parsed.at(-1)?.destination === input.flight.destinationAirport) itinerarySegments = parsed;
    }
    } catch { /* Preserve the original booking diagnostic if details are unavailable. */ }
  }
  return JSON.stringify({browserFailure:true, stage, reason:'airline_option_unavailable', itinerarySegments,
    selectedAirline:input.flight.airline, bookingProviderLabels:providerLabels, labelCount:providerLabels.length, parsedCount, matchCount:0});
}
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
await page.getByRole(choice.role,{name:choice.label,exact:true}).click();
for (let attempt=0; attempt<100 && !handoff; attempt++) await new Promise(resolve=>setTimeout(resolve,100));
if (!handoff || handoff.method !== 'GET') return JSON.stringify({browserFailure:true, stage, reason:'direct_link_unavailable'});
return JSON.stringify({url:handoff.url, provider:choice.provider, amount:choice.amount, airlineHost:host});
} catch (error) {
const networkCode = /\\bnet::(ERR_[A-Z_]+)\\b/.exec(error?.message ?? '')?.[1];
const reason = error?.name === 'TimeoutError' ? 'timeout' : networkCode ? 'network_error'
  : ['ReferenceError','SyntaxError','TypeError'].includes(error?.name) ? 'script_error'
  : /Target page, context or browser has been closed/.test(error?.message ?? '') ? 'browser_closed' : 'browser_failed';
return JSON.stringify({browserFailure:true, stage, reason, networkCode});
}
})().then(async output => {
  try { await page.evaluate(value => { globalThis.__tripWeaverBookingOutput = value; }, output); } catch {}
  console.log('TRIP_WEAVER_BOOKING:' + output); return output;
})`;
}
