import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useEffect, useState } from "react";
import { AuthForm } from "./AuthForm";
import { IdleSession } from "./IdleSession";
import { RouteIcon } from "./Icons";
import { HomePage } from "./pages/HomePage";
import { tripIdFromPath } from "./tripRoutes";
import { TripPlannerPage } from "./pages/TripPlannerPage";
import { TripsPage } from "./pages/TripsPage";
import { FlightTrackerPage } from "./pages/FlightTrackerPage";
import { InterestsPage } from "./pages/InterestsPage";
import { AboutPage } from "./pages/AboutPage";

const pages = {
  "/": { title: "Home", component: HomePage },
  "/trips": { title: "Trips", component: TripsPage },
  "/flight-tracker": { title: "Flight Tracker", component: FlightTrackerPage },
  "/interests": { title: "Interests", component: InterestsPage },
  "/about": { title: "About", component: AboutPage },
};

type PagePath = keyof typeof pages;

function currentPath(): string {
  const path = window.location.hash.slice(1);
  return Object.hasOwn(pages, path) || tripIdFromPath(path) ? path : "/";
}

function SignedInApp() {
  const { signOut } = useAuthActions();
  const [signOutError, setSignOutError] = useState(false);
  const [path, setPath] = useState(currentPath);
  const tripId = tripIdFromPath(path);
  const page = pages[tripId ? "/trips" : path as PagePath];
  const Page = page.component;

  useEffect(() => {
    function navigate() {
      setPath(currentPath());
    }
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  useEffect(() => {
    document.title = tripId ? "Plan My Trip | Trip-Weaver" : page.title === "Home" ? "Trip-Weaver" : `${page.title} | Trip-Weaver`;
    document.getElementById("page-content")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page, path, tripId]);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#page-content" onClick={(event) => {
        event.preventDefault();
        document.getElementById("page-content")?.focus();
      }}>Skip to content</a>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Trip-Weaver home">
          <RouteIcon />
          <span>Trip-Weaver</span>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {(Object.keys(pages) as PagePath[]).filter((route) => route !== "/").map((route) => (
            <a key={route} href={`#${route}`} aria-current={path === route || (tripId && route === "/trips") ? "page" : undefined}>
              {pages[route].title}
            </a>
          ))}
        </nav>
        <div className="account-actions">
          <button className="sign-out" onClick={() => {
            setSignOutError(false);
            void signOut().catch(() => setSignOutError(true));
          }}>Sign out</button>
        </div>
      </header>
      <main id="page-content" className="page-content" tabIndex={-1} aria-label={page.title}>
        {signOutError && <p className="search-feedback search-error" role="alert">Unable to sign out. Please try again.</p>}
        {tripId ? <TripPlannerPage key={tripId} tripId={tripId} /> : <Page />}
      </main>
    </div>
  );
}

function LoginScreen({ loading = false }: { loading?: boolean }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#signin" aria-label="Trip-Weaver home">
          <RouteIcon />
          <span>Trip-Weaver</span>
        </a>
      </header>
      <main>
        {loading ? <p className="auth-panel" role="status">Loading your account…</p> : <AuthForm />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading><LoginScreen loading /></AuthLoading>
      <Unauthenticated><LoginScreen /></Unauthenticated>
      <Authenticated><IdleSession><SignedInApp /></IdleSession></Authenticated>
    </>
  );
}
