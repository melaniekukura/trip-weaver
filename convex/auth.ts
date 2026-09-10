import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
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
