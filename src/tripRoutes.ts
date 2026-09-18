export function tripPlannerPath(tripId: string, tab?: "budget"): string {
  return `/trips/${encodeURIComponent(tripId)}${tab ? `/${tab}` : ""}`;
}

export function tripIdFromPath(path: string): string | null {
  const match = /^\/trips\/([^/]+)(?:\/budget)?$/.exec(path);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}
