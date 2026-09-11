import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import type { FormEvent } from "react";
import { recordActivity } from "./idleTimer";

export function AuthForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("flow", flow);
    setPending(true);
    setError("");
    try {
      await signIn("password", data);
      recordActivity();
    } catch {
      setError(flow === "signIn"
        ? "Unable to sign in. Check your email and password, or try again shortly."
        : "Unable to create your account. Check your details, or sign in if you already have an account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel" id="signin" aria-labelledby="auth-title">
      <p className="eyebrow">Your plans, in one place</p>
      <h2 id="auth-title">{flow === "signIn" ? "Sign in to your trips" : "Create your account"}</h2>
      <form className="trip-form" onSubmit={submit}>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Password<input name="password" type="password" required minLength={flow === "signUp" ? 12 : undefined}
          maxLength={128} autoComplete={flow === "signIn" ? "current-password" : "new-password"} /></label>
        {flow === "signUp" && <p className="field-hint">Use 12–128 characters.</p>}
        {error && <p className="search-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={pending}>
          {pending ? "Please wait…" : flow === "signIn" ? "Sign in" : "Create account"}
        </button>
        <button className="text-button" type="button" disabled={pending} onClick={() => {
          setFlow(flow === "signIn" ? "signUp" : "signIn"); setError("");
        }}>{flow === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      </form>
    </section>
  );
}
