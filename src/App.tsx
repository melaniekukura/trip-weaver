import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState } from "react";
import { AuthForm } from "./AuthForm";
import { AppShell } from "./AppShell";
import { IdleSession } from "./IdleSession";
import { HomePage } from "./pages/HomePage";
import { tripIdFromPath } from "./tripRoutes";
import { TripBudgetPage } from "./pages/TripBudgetPage";
import { TripPlannerPage } from "./pages/TripPlannerPage";
import { TripsPage } from "./pages/TripsPage";
import { BudgetPage } from "./pages/BudgetPage";
import { ProfilePage } from "./pages/ProfilePage";
import { getFirecrawlSessionId } from "./firecrawlSession";

const pages = {
  "/": { title: "Home", component: HomePage },
  "/trips": { title: "Trips", component: TripsPage },
  "/budget": { title: "Budget", component: BudgetPage },
  "/profile": { title: "Profile", component: ProfilePage },
};

type PagePath = keyof typeof pages;
const creditUsage = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function currentPath(hash: string): string {
  const path = hash.slice(1);
  if (path === "/about") return "/profile";
  return Object.hasOwn(pages, path) || tripIdFromPath(path) ? path : "/";
}

function useHashLocation() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    function navigate() { setHash(window.location.hash); }
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  return hash;
}

function SignedInApp() {
  const { signOut } = useAuthActions();
  const firecrawlBudget = useQuery(api.firecrawl.budget, { sessionId: getFirecrawlSessionId() });
  const [showFirecrawlBudget, setShowFirecrawlBudget] = useState(true);
  const [signOutError, setSignOutError] = useState(false);
  const path = currentPath(useHashLocation());
  const tripId = tripIdFromPath(path);
  const budgetWorkflow = !!tripId && path.endsWith("/budget");
  const tripSection = budgetWorkflow ? "/budget" : "/trips";
  const page = pages[tripId ? tripSection : path as PagePath];
  const Page = page.component;

  useEffect(() => {
    if (window.localStorage?.getItem("trip-weaver-show-firecrawl-budget") === "false") setShowFirecrawlBudget(false);
  }, []);

  useEffect(() => {
    document.title = tripId ? `${budgetWorkflow ? "Budget" : "Plan My Trip"} | Trip-Weaver` : page.title === "Home" ? "Trip-Weaver" : `${page.title} | Trip-Weaver`;
    document.getElementById("page-content")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page, path, tripId, budgetWorkflow]);

  const navigation = <nav className="desktop-nav" aria-label="Primary navigation">
    {(Object.keys(pages) as PagePath[]).filter((route) => route !== "/").map((route) => (
      <a key={route} href={`#${route}`} aria-current={path === route || (tripId && route === tripSection) ? "page" : undefined}>
        {pages[route].title}
      </a>
    ))}
  </nav>;
  const accountActions = <>
    {showFirecrawlBudget && <div className={`firecrawl-budget${firecrawlBudget && (firecrawlBudget.sessionRemaining === 0 || firecrawlBudget.projectRemaining === 0) ? " is-exhausted" : firecrawlBudget && (firecrawlBudget.sessionRemaining <= 100 || firecrawlBudget.projectRemaining <= 2500) ? " is-low" : ""}`} title="Credits reported by completed Firecrawl requests">
      {firecrawlBudget ? `Firecrawl · session ${creditUsage.format(firecrawlBudget.sessionUsed)} used · project ${creditUsage.format(firecrawlBudget.projectUsed)} used` : "Firecrawl usage loading…"}
    </div>}
    <button className="budget-toggle" type="button" aria-pressed={showFirecrawlBudget} onClick={() => {
      const next = !showFirecrawlBudget;
      setShowFirecrawlBudget(next);
      window.localStorage?.setItem("trip-weaver-show-firecrawl-budget", String(next));
    }}>{showFirecrawlBudget ? "Hide usage" : "Show usage"}</button>
    <button className="sign-out" onClick={() => {
      setSignOutError(false);
      void signOut().catch(() => setSignOutError(true));
    }}>Sign out</button>
  </>;
  return <AppShell label={page.title} navigation={navigation} accountActions={accountActions}>
    {signOutError && <p className="search-feedback search-error" role="alert">Unable to sign out. Please try again.</p>}
    {tripId ? budgetWorkflow ? <TripBudgetPage key={path} tripId={tripId} /> : <TripPlannerPage key={path} tripId={tripId} /> : <Page />}
  </AppShell>;
}

function GuestApp() {
  const signingIn = useHashLocation() === "#signin";

  function showSignIn() {
    window.location.hash = "signin";
  }

  return <AppShell label={signingIn ? "Sign in" : "Home"}
    accountActions={<button className="sign-out" type="button" onClick={showSignIn}>Sign in</button>}>
    {signingIn ? <AuthForm /> : <HomePage onSignInRequired={showSignIn} />}
  </AppShell>;
}

export default function App() {
  const { isAuthenticated } = useConvexAuth();
  return isAuthenticated ? <IdleSession><SignedInApp /></IdleSession> : <GuestApp />;
}
