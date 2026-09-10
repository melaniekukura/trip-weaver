export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const IDLE_WARNING_MS = 2 * 60 * 1000;
export const ACTIVITY_KEY = `trip-weaver:last-activity:${import.meta.env.VITE_CONVEX_URL}`;

export function readActivity(): number | null {
  try {
    const value = localStorage.getItem(ACTIVITY_KEY);
    const timestamp = value === null ? NaN : Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now() ? timestamp : null;
  } catch { return null; }
}

export function recordActivity(timestamp = Date.now()) {
  try { localStorage.setItem(ACTIVITY_KEY, String(timestamp)); }
  catch { /* The timer still works in this tab when storage is unavailable. */ }
}

export function startIdleTimer(options: {
  read: () => number | null;
  write: (timestamp: number) => void;
  onWarning: (seconds: number) => void;
  onExpire: () => void;
}) {
  let lastActivity = options.read() ?? Date.now();
  let stopped = false;
  let warning = -1;
  let lastWritten = lastActivity;
  options.write(lastActivity);

  function showWarning(seconds: number) {
    if (warning !== seconds) { warning = seconds; options.onWarning(seconds); }
  }

  function check() {
    if (stopped) return;
    lastActivity = Math.max(lastActivity, options.read() ?? lastActivity);
    const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivity);
    if (remaining <= 0) {
      stopped = true;
      clearInterval(interval);
      options.onExpire();
      return;
    }
    showWarning(remaining <= IDLE_WARNING_MS ? Math.ceil(remaining / 1000) : 0);
  }

  function activity() {
    check();
    if (stopped) return;
    lastActivity = Date.now();
    if (lastActivity - lastWritten >= 1000) {
      options.write(lastActivity);
      lastWritten = lastActivity;
    }
    showWarning(0);
  }

  const interval = setInterval(check, 1000);
  check();
  return { check, activity, stop: () => { stopped = true; clearInterval(interval); } };
}
