import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useState } from "react";
import type { ReactNode } from "react";

import { AuthForm } from "./AuthForm";
import { Trips } from "./Trips";
import { IdleSession } from "./IdleSession";


type IconProps = { children: ReactNode; size?: number };

function Icon({ children, size = 24 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

function RouteIcon() {
  return (
    <Icon size={22}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M7.8 7.3c2 1.4 1.4 3.7 3.5 4.3 1.8.5 3.2-1.2 4.5-.2 1.2.9.9 3 .9 4.3" />
    </Icon>
  );
}

const destinationCards = [
  { name: "Kyoto to Osaka", detail: "6 stops · 9 days", icon: "mountain" },
  { name: "Porto to Seville", detail: "4 stops · 7 days", icon: "arch" },
  { name: "Athens to Naxos", detail: "3 stops · 5 days", icon: "sailboat" },
];

function DestinationIcon({ name }: { name: string }) {
  if (name === "mountain") {
    return (
      <Icon size={34}>
        <path d="m3 19 6.5-11 3.1 5 2.4-4 6 10H3Z" />
        <path d="m7.9 10.7 1.7 1.6 1.2-1.3" />
      </Icon>
    );
  }

  if (name === "arch") {
    return (
      <Icon size={34}>
        <path d="M5 20V9h14v11M3 20h18M4 9l8-5 8 5M9 20v-5a3 3 0 0 1 6 0v5M8 9v2M12 8v3M16 9v2" />
      </Icon>
    );
  }

  return (
    <Icon size={34}>
      <path d="M4 18h16c-1.3 2-3.2 3-6 3H9c-2.3 0-4-1-5-3ZM12 4v14M12 5l6 10h-6M11 7 6 15h5" />
    </Icon>
  );
}

const steps = [
  {
    title: "Add your stops",
    description: "Drop in cities, flights, and stays as you find them.",
    icon: (
      <Icon size={28}>
        <path d="M12 21s6-5 6-11a6 6 0 1 0-12 0c0 6 6 11 6 11Z" />
        <path d="M12 7v6M9 10h6" />
      </Icon>
    ),
  },
  {
    title: "Let it weave together",
    description: "Timings, transfers, and gaps sort themselves out.",
    icon: (
      <Icon size={28}>
        <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
        <circle cx="8" cy="7" r="2" />
        <circle cx="16" cy="17" r="2" />
      </Icon>
    ),
  },
  {
    title: "Travel with it",
    description: "One itinerary, shareable and always up to date.",
    icon: (
      <Icon size={28}>
        <path d="M7 8h10a2 2 0 0 1 2 2v9H5v-9a2 2 0 0 1 2-2ZM9 8V6a3 3 0 0 1 6 0v2M9 12v3M15 12v3M7 21v-2M17 21v-2" />
      </Icon>
    ),
  },
];

function SignedInApp() {
  const { signOut } = useAuthActions();
  const [signOutError, setSignOutError] = useState(false);
  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Trip-Weaver home">
          <RouteIcon />
          <span>Trip-Weaver</span>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#destinations">Destinations</a>
          <a href="#how-it-works">Itineraries</a>
          <a href="#destinations">Inspiration</a>
          <a href="#about">About</a>
        </nav>
        <div className="account-actions">
          <button className="sign-out" onClick={() => {
            setSignOutError(false);
            void signOut().catch(() => setSignOutError(true));
          }}>Sign out</button>
          <a className="primary-link" href="#my-trips">My trips</a>
        </div>
      </header>

      <main id="top">
        {signOutError && <p className="search-feedback search-error" role="alert">Unable to sign out. Please try again.</p>}
        <Trips />
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Trip planning, woven together</p>
          <h1 id="hero-title">Trip-Weaver</h1>
          <p className="hero-copy">
            Pull every flight, stay, and stop into one itinerary that holds
            together, thread by thread.
          </p>

          <a className="primary-link" href="#my-trips">Choose a trip to find flights</a>
        </section>

        <section className="destinations" id="destinations" aria-labelledby="destinations-title">
          <div className="section-heading">
            <h2 id="destinations-title">Where the threads lead</h2>
            <p>Popular routes travellers are weaving right now</p>
          </div>
          <div className="destination-grid">
            {destinationCards.map((card) => (
              <article className="destination-card" key={card.name}>
                <div className="destination-visual">
                  <DestinationIcon name={card.icon} />
                </div>
                <div className="destination-details">
                  <h3>{card.name}</h3>
                  <p>{card.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="how-it-works" id="how-it-works" aria-labelledby="steps-title">
          <h2 id="steps-title">Three steps, one itinerary</h2>
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step" key={step.title}>
                {step.icon}
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer id="about">
        <span>Trip-Weaver</span>
        <nav aria-label="Footer navigation">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#contact">Contact</a>
        </nav>
      </footer>
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
