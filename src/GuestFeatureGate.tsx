import type { ReactNode } from "react";

export function GuestFeatureGate({ children, onSignIn }: { children: ReactNode; onSignIn: () => void }) {
  return <div className="guest-feature-gate">
    <div className="guest-feature-preview" inert>{children}</div>
    <div className="guest-feature-message">
      <strong>Sign in for more features</strong>
      <button className="secondary-button" type="button" onClick={onSignIn}>Sign in or create an account</button>
    </div>
  </div>;
}
