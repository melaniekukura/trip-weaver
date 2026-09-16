export type FlightSegment = { flightNumber: string; origin: string; destination: string; departure: string; arrival: string };

export function parseGoogleFlightSegments(snapshot: string, date: string): FlightSegment[] {
  const pattern = /(\d{1,2}:\d{2} [AP]M)(?:\+(\d{1,2}))?\s*·[^\n]*?\(([A-Z]{3})\)\s+Travel time:[^\n]*?(\d{1,2}:\d{2} [AP]M)(?:\+(\d{1,2}))?\s*·[^\n]*?\(([A-Z]{3})\)[^\n]*?·\s*([A-Z0-9]{2})\s+(\d{1,4})\b/g;
  const result: FlightSegment[] = [];
  for (const match of snapshot.matchAll(pattern)) {
    const timestamp = (clock: string, offset: string | undefined) => {
      const parts = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(clock)!;
      if (+parts[1] < 1 || +parts[1] > 12 || +parts[2] > 59 || +(offset ?? 0) > 7) return "";
      const day = new Date(`${date}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + +(offset ?? 0));
      if (!Number.isFinite(day.getTime())) return "";
      const hour = +parts[1] % 12 + (parts[3] === "PM" ? 12 : 0);
      return `${day.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:${parts[2]}`;
    };
    const departure = timestamp(match[1], match[2]);
    const arrival = timestamp(match[4], match[5]);
    if (!departure || !arrival) return [];
    result.push({ flightNumber: `${match[7]} ${match[8]}`, origin: match[3], destination: match[6], departure, arrival });
  }
  if (result.length > 6 || result.some((segment, index) => index > 0 && result[index - 1].destination !== segment.origin)) return [];
  return result;
}
