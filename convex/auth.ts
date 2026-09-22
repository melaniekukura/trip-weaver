import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { passwordResetEmail, passwordResetIdempotencyKey, sendAgentMail, verificationEmail,
  verificationIdempotencyKey } from "./agentmailClient";

function sixDigitToken() {
  const number = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(number).padStart(6, "0");
}

const agentMailVerification = Email({
  id: "agentmail-verification",
  name: "AgentMail verification",
  maxAge: 15 * 60,
  generateVerificationToken: async () => sixDigitToken(),
  async sendVerificationRequest({ identifier, token }) {
    await sendAgentMail({ ...verificationEmail(identifier, token),
      idempotencyKey: verificationIdempotencyKey(identifier, token), labels: ["trip-weaver", "verification"] });
  },
});

const agentMailPasswordReset = Email({
  id: "agentmail-password-reset",
  name: "AgentMail password reset",
  maxAge: 15 * 60,
  generateVerificationToken: async () => sixDigitToken(),
  async sendVerificationRequest({ identifier, token }) {
    await sendAgentMail({ ...passwordResetEmail(identifier, token),
      idempotencyKey: passwordResetIdempotencyKey(identifier, token), labels: ["trip-weaver", "password-reset"] });
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    verify: agentMailVerification,
    reset: agentMailPasswordReset,
    profile(params) {
      const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ConvexError("Enter a valid email address.");
      }
      return { email };
    },
    validatePasswordRequirements(password) {
      if (typeof password !== "string" || password.length < 12 || password.length > 128) {
        throw new ConvexError("Use a password between 12 and 128 characters.");
      }
    },
  })],
});
