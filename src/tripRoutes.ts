export function tripPlannerPath(tripId: string): string {
  return `/trips/${encodeURIComponent(tripId)}`;
}

export function tripIdFromPath(path: string): string | null {
  const match = /^\/trips\/([^/]+)$/.exec(path);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}
