import { expect, test } from "vitest";
import { passwordResetEmail, passwordResetIdempotencyKey } from "./agentmailClient";

test("password reset email contains a sanitized expiring code", () => {
  const email = passwordResetEmail("traveler@example.com", "12a34-56");
  expect(email).toMatchObject({
    recipient: "traveler@example.com",
    subject: "Reset your Trip-Weaver password",
  });
  expect(email.text).toContain("123456");
  expect(email.text).toContain("15 minutes");
  expect(email.html).toContain("123456");
  expect(email.html).not.toContain("12a34-56");
});

test("password reset requests have a stable reset-specific idempotency key", () => {
  const first = passwordResetIdempotencyKey("traveler@example.com", "123456");
  expect(first).toBe(passwordResetIdempotencyKey("traveler@example.com", "123456"));
  expect(first).toMatch(/^trip-weaver-reset-/);
});
