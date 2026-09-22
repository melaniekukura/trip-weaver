import type { ReactNode } from "react";
import cyanLogo from "../references/logo-icon/TW-cyan.png";

export function AppShell({ label, navigation, accountActions, children }: {
  label: string;
  navigation?: ReactNode;
  accountActions: ReactNode;
  children: ReactNode;
}) {
  return <div className="site-shell">
    <a className="skip-link" href="#page-content" onClick={(event) => {
      event.preventDefault();
      document.getElementById("page-content")?.focus();
    }}>Skip to content</a>
    <header className="topbar">
      <a className="brand" href="#/" aria-label="Trip-Weaver home">
        <img className="brand-logo" src={cyanLogo} alt="" width="32" height="31" />
        <span>Trip-Weaver</span>
      </a>
      {navigation}
      <div className="account-actions">{accountActions}</div>
    </header>
    <main id="page-content" className="page-content" tabIndex={-1} aria-label={label}>{children}</main>
  </div>;
}
