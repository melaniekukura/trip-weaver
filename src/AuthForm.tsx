import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import type { FormEvent } from "react";
import { recordActivity } from "./idleTimer";

export function AuthForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp" | "forgotPassword" | "resetPassword">("signIn");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("flow", flow);
    setPending(true);
    setError("");
    try {
      const result = await signIn("password", data);
      if (result.signingIn) recordActivity();
      else setVerificationEmail(String(data.get("email") ?? "").trim().toLowerCase());
    } catch {
      setError(flow === "signIn"
        ? "Unable to sign in. Check your email and password, or try again shortly."
        : "Unable to create your account. Check your details, or sign in if you already have an account.");
    } finally {
      setPending(false);
    }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    setPending(true); setError(""); setNotice("");
    try {
      await signIn("password", { flow: "reset", email });
    } catch {
      // The next screen stays generic so account membership is not disclosed.
    } finally {
      setResetEmail(email);
      setFlow("resetPassword");
      setNotice("If an account exists for this email, a six-digit reset code was sent.");
      setPending(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get("newPassword") ?? "");
    if (newPassword !== String(data.get("confirmPassword") ?? "")) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true); setError(""); setNotice("");
    try {
      await signIn("password", { flow: "reset-verification", email: resetEmail,
        code: String(data.get("code") ?? ""), newPassword });
      recordActivity();
    } catch {
      setError("That reset code is invalid or expired. Check the code and try again.");
    } finally { setPending(false); }
  }

  async function resendReset() {
    setPending(true); setError(""); setNotice("");
    try {
      await signIn("password", { flow: "reset", email: resetEmail });
      setNotice("If an account exists for this email, a new reset code was sent.");
    } catch {
      setNotice("If an account exists for this email, a new reset code was sent.");
    } finally { setPending(false); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("flow", "email-verification");
    data.set("email", verificationEmail);
    setPending(true); setError(""); setNotice("");
    try {
      await signIn("password", data);
      recordActivity();
    } catch {
      setError("That verification code is invalid or expired. Check the code and try again.");
    } finally { setPending(false); }
  }

  async function resend() {
    setPending(true); setError(""); setNotice("");
    try {
      await signIn("password", { flow: "email-verification", email: verificationEmail });
      setNotice("A new verification code was sent.");
    } catch {
      setError("Unable to send another code right now. Please try again shortly.");
    } finally { setPending(false); }
  }

  if (verificationEmail) return <section className="auth-panel" id="signin" aria-labelledby="auth-title">
    <p className="eyebrow">Check your inbox</p>
    <h2 id="auth-title">Verify your email</h2>
    <p>Enter the six-digit code sent to <strong>{verificationEmail}</strong>.</p>
    <form className="trip-form" onSubmit={verify}>
      <label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></label>
      {error && <p className="search-error" role="alert">{error}</p>}
      {notice && <p className="field-hint" role="status">{notice}</p>}
      <button className="primary-button" disabled={pending}>{pending ? "Verifying…" : "Verify email"}</button>
      <button className="text-button" type="button" disabled={pending} onClick={() => void resend()}>Send a new code</button>
      <button className="text-button" type="button" disabled={pending} onClick={() => {
        setVerificationEmail(""); setError(""); setNotice("");
      }}>Use a different account</button>
    </form>
  </section>;

  if (flow === "forgotPassword") return <section className="auth-panel" id="signin" aria-labelledby="auth-title">
    <p className="eyebrow">Account recovery</p>
    <h2 id="auth-title">Reset your password</h2>
    <p>Enter your account email to receive a six-digit reset code.</p>
    <form className="trip-form" onSubmit={requestReset}>
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} autoFocus /></label>
      {error && <p className="search-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending}>{pending ? "Sending…" : "Send reset code"}</button>
      <button className="text-button" type="button" disabled={pending} onClick={() => {
        setFlow("signIn"); setError(""); setNotice("");
      }}>Back to sign in</button>
    </form>
  </section>;

  if (flow === "resetPassword") return <section className="auth-panel" id="signin" aria-labelledby="auth-title">
    <p className="eyebrow">Check your inbox</p>
    <h2 id="auth-title">Choose a new password</h2>
    <p>Enter the six-digit code sent to <strong>{resetEmail}</strong>.</p>
    <form className="trip-form" onSubmit={resetPassword}>
      <label>Reset code<input name="code" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></label>
      <label>New password<input name="newPassword" type="password" autoComplete="new-password"
        minLength={12} maxLength={128} required /></label>
      <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password"
        minLength={12} maxLength={128} required /></label>
      <p className="field-hint">Use 12–128 characters.</p>
      {error && <p className="search-error" role="alert">{error}</p>}
      {notice && <p className="field-hint" role="status">{notice}</p>}
      <button className="primary-button" disabled={pending}>{pending ? "Resetting…" : "Reset password"}</button>
      <button className="text-button" type="button" disabled={pending} onClick={() => void resendReset()}>Send a new code</button>
      <button className="text-button" type="button" disabled={pending} onClick={() => {
        setFlow("forgotPassword"); setResetEmail(""); setError(""); setNotice("");
      }}>Use a different email</button>
    </form>
  </section>;

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
        {flow === "signIn" && <button className="text-button" type="button" disabled={pending} onClick={() => {
          setFlow("forgotPassword"); setError(""); setNotice("");
        }}>Forgot password?</button>}
        <button className="text-button" type="button" disabled={pending} onClick={() => {
          setFlow(flow === "signIn" ? "signUp" : "signIn"); setError(""); setNotice("");
        }}>{flow === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      </form>
    </section>
  );
}
