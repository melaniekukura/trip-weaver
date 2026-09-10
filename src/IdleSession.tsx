import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ACTIVITY_KEY, readActivity, recordActivity, startIdleTimer } from "./idleTimer";

export function IdleSession({ children }: { children: ReactNode }) {
  const { signOut } = useAuthActions();
  const [seconds, setSeconds] = useState(0);
  const [expired, setExpired] = useState(false);
  const [failed, setFailed] = useState(false);
  const staySignedIn = useRef<() => void>(() => {});

  useEffect(() => {
    const timer = startIdleTimer({
      read: readActivity,
      write: recordActivity,
      onWarning: setSeconds,
      onExpire: () => {
        setExpired(true);
        void signOut().catch(() => setFailed(true));
      },
    });
    staySignedIn.current = timer.activity;
    const onActivity = () => { if (document.visibilityState === "visible") timer.activity(); };
    const onStorage = (event: StorageEvent) => { if (event.key === ACTIVITY_KEY) timer.check(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, onActivity, { passive: true });
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", timer.check);
    document.addEventListener("visibilitychange", timer.check);
    return () => {
      timer.stop();
      for (const event of events) window.removeEventListener(event, onActivity);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", timer.check);
      document.removeEventListener("visibilitychange", timer.check);
    };
  }, [signOut]);

  if (expired) return (
    <main className="auth-panel">
      <h1>Session expired</h1>
      <p role="status">Your session expired due to inactivity. Signing you out…</p>
      {failed && <button className="primary-button" onClick={() => {
        setFailed(false); void signOut().catch(() => setFailed(true));
      }}>Retry sign-out</button>}
    </main>
  );

  return <>
    {seconds > 0 && <aside className="session-warning" aria-label="Session timeout warning">
      <div><strong role="alert">You’ll be signed out soon due to inactivity.</strong>
        <p>Time remaining: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}. Save any unfinished changes.</p></div>
      <button className="primary-button" onClick={() => staySignedIn.current()}>Stay signed in</button>
    </aside>}
    {children}
  </>;
}
