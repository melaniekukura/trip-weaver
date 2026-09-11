import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, startIdleTimer } from "./idleTimer";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

function setup(initial: number | null = null) {
  let stored = initial;
  const onExpire = vi.fn();
  const onWarning = vi.fn();
  const timer = startIdleTimer({ read: () => stored, write: (value) => { stored = value; }, onExpire, onWarning });
  return { timer, onExpire, onWarning, otherTabActivity: () => { stored = Date.now(); }, read: () => stored };
}

test("warns before expiry and signs out exactly once at the deadline", () => {
  const { onWarning, onExpire } = setup();
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  expect(onWarning).toHaveBeenLastCalledWith(IDLE_WARNING_MS / 1000);
  expect(onExpire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(IDLE_WARNING_MS);
  expect(onExpire).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
  expect(onExpire).toHaveBeenCalledTimes(1);
});

test("activity dismisses the warning and extends the deadline", () => {
  const { timer, onExpire, onWarning } = setup();
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  timer.activity();
  expect(onWarning).toHaveBeenLastCalledWith(0);
  vi.advanceTimersByTime(IDLE_WARNING_MS);
  expect(onExpire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  expect(onExpire).toHaveBeenCalledOnce();
});

test("reload preserves the previous activity deadline", () => {
  const { onExpire } = setup(Date.now() - IDLE_TIMEOUT_MS + 5000);
  vi.advanceTimersByTime(5000);
  expect(onExpire).toHaveBeenCalledOnce();
});

test("an already expired session cannot be revived by activity on resume", () => {
  const { timer, onExpire } = setup();
  vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS + 1000);
  timer.activity();
  expect(onExpire).toHaveBeenCalledOnce();
  timer.check();
  expect(onExpire).toHaveBeenCalledOnce();
});

test("another tab's activity extends the shared deadline", () => {
  const { timer, otherTabActivity, onExpire, onWarning } = setup();
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  otherTabActivity();
  timer.check();
  expect(onWarning).toHaveBeenLastCalledWith(0);
  vi.advanceTimersByTime(IDLE_WARNING_MS);
  expect(onExpire).not.toHaveBeenCalled();
});

test("cleanup stops timers and prevents callbacks after unmount", () => {
  const { timer, onExpire } = setup();
  timer.stop();
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2);
  timer.activity();
  expect(onExpire).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("expired persisted activity immediately triggers logout", () => {
  const { onExpire } = setup(Date.now() - IDLE_TIMEOUT_MS);
  expect(onExpire).toHaveBeenCalledOnce();
});
